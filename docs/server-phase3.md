# 3차 픽셀 밑그림 서버

> 2026-11-09 보완: 아래는 3차 당시 기록입니다. 현재 AI 밑그림의 자동 보정·39칸 기준과 검증 결과는 [보완 문서](modular-pixel-repair.md)를 따릅니다.

`modules/entry.js`의 AI 게이트웨이 구간만 직접 편집했다. 원본 소스맵과 수업·게시판 코드, 운영 설정은 변경하지 않았다. 이전 구현 방법은 [server-phase2.md](server-phase2.md)를 따른다.

## 요청 계약

```json
{"mode":"pixel","slot":"hero","request":"고양이로 그려 줘."}
```

- `slot`은 `hero`, `obstacle`, `item`만 허용한다. 배경은 기존 `mode:'slot'`을 사용한다.
- 새 선택에는 `current`를 생략한다. 서버도 모델 입력에 `current`를 넣지 않는다.
- 고치기 요청에는 `current:{palette,pixels}`를 보낸다. 편집기의 최대 12색을 손실 없이 전달하려고 **입력만** 팔레트 1~12색, 색 번호 `0123456789ab`를 허용한다. 색상은 `#rrggbb`로 정규화한다. 16줄×16글자, 팔레트에 존재하는 색 번호 또는 `.`인지 검사한다. 사용자가 손본 그림은 빈 칸·분리된 부분이 있을 수 있으므로 현재 그림에 생성 결과의 최소 면적·연결 검사는 적용하지 않는다.
- 생성 **출력**은 설계대로 팔레트 최대 8색, `0`~`7` 또는 `.`로 제한하도록 지시한다. JSON 형식·최소 39칸·캐릭터 연결 검사는 클라이언트에서 수행하고, 통과하지 않으면 1회만 다시 요청한다.
- 요청은 1~2,000자, 기존 공통 본문 제한은 20,000자/60,000바이트다. 선택 필드 `redraw`·`retry`는 boolean만 허용한다. 서버가 고정 안내를 별도 필드에 넣으므로 재생성을 반복해도 원래 요청문이 늘어나지 않는다. 그 밖의 입력은 거절한다.
- 모델은 기존 `anthropic/claude-haiku-5.5`, reasoning off, `max_tokens:1000`이다. SSE, usage, 키 전달, origin 검사, rate limiter, 오류 처리는 기존 공통 경로를 그대로 사용한다.

새 작품의 9단계 요청은 다음과 같다.

```json
{"mode":"route","artMode":"pixel","request":"캐릭터 색 파랗게","current":{},"config":{"speedMultiplier":1,"initialLives":1,"soundPreset":"default"}}
```

라우터는 캐릭터·장애물·선물일 때 `{"slot":"hero|obstacle|item","request":"수정 요청"}`를 반환하도록 지시받는다. 클라이언트가 해당 칸의 현재 픽셀 그림을 넣어 pixel 요청을 이어서 보낸다. 배경은 기존 `{slot:'background',code}`이며 설정과 unsupported 형식도 그대로다. 이 라우터의 current와 함수 계약에는 배경만 허용하여 다른 칸의 2차 코드를 모델에 보내지 않는다.

`artMode`가 없는 2차 route와 기존 slot, mode 없는 구형 전체 HTML 요청은 그대로 유지한다. SSE를 중간에 파싱하거나 생성 결과를 서버에서 실행하지 않는다.

## 실제 응답의 형식 보강

초기 실측에서 공백·15글자 행·18줄 등 잘못된 응답이 나왔다. pixel만 `response_format.type='json_schema'`, `strict:true`, `provider.require_parameters:true`를 추가했다. 기존 모델·키·SSE·1,000 출력 토큰은 유지한다. 스키마는 두 필드만 허용하고 색상 `^#[0-9a-f]{6}$`, 각 행 `^[.0-7]{16}$`를 제한한다.

Anthropic의 배열 길이 제한 지원 범위 때문에 `minItems:16`·`maxItems`는 넣지 않았다. 정확한 16줄·최대 8색·실제 존재하는 색 번호·면적·연결 검사는 여전히 클라이언트가 담당한다. 구조화 응답을 사용한 뒤에도 실제 하트 응답이 잘못된 팔레트 번호로 한 번 거절됐다. 검사나 재요청을 생략할 수 없다.

근거: [OpenRouter 구조화 응답과 스트리밍](https://openrouter.ai/docs/guides/features/structured-outputs), [Anthropic JSON Schema 지원 제한](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#json-schema-limitations). 이 스키마는 입력 내용이나 학생 작품을 바꾸는 교정기가 아니다. 잘못된 그림을 자동으로 자르거나 빈 칸으로 채우지 않는다.

## 검증

```powershell
node scripts/modular-server-test.cjs
```

외부 호출 없이 모의 upstream으로 **73개 통과**. 픽셀 3칸, 새 선택의 빈 문맥, 12색 현재 그림, 잘못된 형식·크기·색·인덱스, pixel 라우터 분리, 구조화 응답 스키마, 2,000자 요청의 재생성·재요청, origin/rate/error, 기존 2차 및 구형 요청의 동등성을 확인했다. 결과는 상위 `85_공룡3_모듈화/3차캡처/서버검증결과.json`에 저장한다. 실제 AI 출력 품질·비용·시간은 별도 3차 결과 문서의 실측을 따른다.
