# 공룡3 모듈화 2차

기준은 상위 `85_공룡3_모듈화/설계.md`와 이번 2차 요청이다. `modular`의 `7b40669` 위에서 구현했으며 **로컬 검증만 했고 배포·push하지 않았다.** `master`, `board-expand`, `dino3-board`, 수업 데이터·D1·비밀번호는 변경하거나 검증에 사용하지 않았다.

## 구현

- `modules/entry.js`: `/api/game`의 slot/route 모드, 20,000자 제한, 서버 소유 함수 계약, Haiku 5.5·reasoning off·max_tokens 4000. 응답 SSE와 usage는 그대로 전달한다. mode 없는 구형 요청은 1차 코드와 동등하다. 빌드 소스 복원 대신 AI 게이트웨이 구간만 직접 편집하고 오래된 소스맵 연결을 제거했다. 상세는 [server-phase2.md](server-phase2.md).
- `assets/practice/modular/ai.js`, `chat.js`, `index.html`: 기존 선택지의 request 문장을 그대로 사용해 hero/background/obstacle/item을 생성한다. 4·5·7·8은 로컬 설정이다. 다시 그리기는 같은 칸과 이전 소스를 보낸다. 9단계는 한 번의 라우터 응답에서 칸 한 개 또는 speed/lives/sound만 변경한다. 지원 불가 안내는 설계의 문장 그대로다.
- `modular/safety.js`, `vendor/acorn.js`: Acorn 8.17.0(MIT) AST 화이트리스트. 정확한 함수 1개·이름·인자·6,000자 제한, 지역 변수와 그리기 API만 허용한다. 전역 접근·대입·동적 속성·재귀·비동기·while/do를 거절한다. for는 숫자 리터럴 상한 200 이하와 단조 증가만 허용하고 중첩 및 실행량도 제한한다. 캔버스 도구는 변환·clip·상태 스택을 노출하지 않는다.
- 실행 검사는 Worker 준비 1,500ms, 그리기 300ms 제한으로 여러 시간과 모든 캐릭터 자세/장애물 종류를 그린다. 알파 32 이상 픽셀이 4개 이상이고 면적의 1%(선물 2%) 이상이어야 한다. 캐릭터는 여백 64px에 그려 15%를 넘는 영역 밖 그림도 거절한다(숙이기 잘림 방지). Worker/OffscreenCanvas가 없거나 CSP가 Worker를 막으면 정적 실행량·호출 수·좌표 제한 아래 별도 캔버스로 검사한다. 빈 그림도 거절하며 코드 생성 자체가 CSP에 막히면 안전하게 실패한다.
- `modular/project.js`: 실행 검사 승인 후에만 `withSlot`으로 교체하고 빌드에서 AST를 재검사한다. 함수는 단일 HTML에 직접 합성하며 메타데이터를 eval하지 않는다. 내보낸 파일은 파서나 네트워크가 필요 없다. 저장 성공 후 미리보기를 교체하므로 취소·검사 실패·저장 실패 때 이전 게임이 남는다.
- `modular/engine.js`: 매 프레임 칸 호출에 try/catch와 상태 복원, 3회 연속 예외 때 해당 칸만 기본으로 대체한다. 검증된 obstacleStyle의 크기와 rect/round 충돌을 같은 배율로 처리한다. 픽셀 캐릭터와 구형 전체 HTML 경로도 유지한다.

칸 검사 실패는 같은 칸을 한 번만 재요청한다. 라우터가 돌려준 그림이 실패하면 재라우팅하지 않고 해당 칸만 한 번 재요청한다. 잘못된 라우터 JSON·설정이나 unsupported는 즉시 이전 게임을 유지한다. 학생 화면의 단계·선택지·문구·버튼·배치는 유지했다.

## 로컬 재현

```powershell
node scripts/modular-server-test.cjs
node scripts/modular-safety-test.cjs
node scripts/modular-project-test.cjs
node scripts/modular-engine-test.cjs
node scripts/modular-phase2-test.cjs
```

서버 31 + 안전 141 + 프로젝트 35 + 엔진 53 + 통합 48 = **308개 통과**. 통합 검사는 가상 수업과 모의 SSE만 사용하며 외부 요청을 차단한다. 초기 학생 UI를 `7b40669`와 비교했고 PC 1280×900·태블릿 1024×768/768×1024의 1~9, 다시 그리기·실패 보존·이어하기·구형 편집·크게 보기·키보드/터치·file:// 실행을 확인했다. `scripts/modular-test.cjs`는 AI가 없던 1차 통합 검사의 역사로 보존한다. 2차에는 새 통합 스크립트를 쓴다.

실제 AI용 별도 로컬 설정은 `scripts/wrangler-modular-local.json`이다. 수업/게시판 D1과 운영 account_id가 없고 로컬 rate limiter 저장만 사용한다. 원래 wrangler.json은 그대로다. 프로젝트에 패키지 파일이 없어 기존 설치 버전과 같은 Wrangler 4.152.0을 `npm install --no-save --package-lock=false wrangler@4.152.0`으로 로컬 node_modules에 설치했다. 이 버전의 실행기가 지원하는 마지막 날짜가 2026-10-26이어서 **로컬 설정만** 그 날짜를 사용한다. 운영의 2026-11-01 런타임 검증은 하지 않았다.

```powershell
$env:SHERPA_OPENROUTER_KEY = [Environment]::GetEnvironmentVariable('2_AI_Sherpa(moduco_openrouter)','User')
node scripts/serve-modular-ai.cjs
# 별도 터미널: 유료 검증이며 기존 기록의 실제 모델 시도(취소 포함) 25회에서 멈춘다.
$env:DINO3_LIVE_AI = '1'
node scripts/modular-live-ai-test.cjs
```

키는 프로세스 환경에서 `secrets.required`로 선택해 넘긴다. 키 파일·명령 인자·로그에 값을 쓰지 않는다. `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`는 이 Wrangler 버전에서 필요한 process secret 로딩도 막아 제거했다. 초기 로컬 503 4회는 모델에 도달하지 않았다.

## 실제 AI 기록과 남은 확인

실제 생성 24회(취소된 사과 1회 포함), 입력 66,511/출력 18,161 토큰, 비용 **$0.0157316**. 요청된 14개 사례와 추가 별 1개는 최종 성공했다. 바닷가와 무지개는 1회 재요청 후 성공했다. 별은 금지된 배열 변경 코드로 2회 거절·이전 칸 유지가 확인되어, 서버 및 재요청 안내를 구체화한 뒤 1회 추가 호출로 성공했다. 안전 허용 범위를 넓히지는 않았다. 확대 검수에서 초기 캐릭터의 숙이기 잘림을 발견해 hero의 자세별 영역 밖 픽셀 검사와 생성 안내를 추가했다. 재생성한 고양이·로봇·다시 그린 로봇의 모든 자세에서 영역 밖 픽셀이 0%이며 실제 HTML file:// 조작 검사 8항목도 통과했다.

초기 9회는 Playwright의 SSE 본문 조회가 실패해 원본 usage.cost를 받지 못했다. 해당 키와 시간 구간의 generation ID를 조회하고 단건 메타데이터의 native 입력/출력 토큰·total_cost로 복구했다. SSE를 수집한 15회는 usage.cost 원값을 기록했다. 중단된 사과의 브라우저 전체 시간은 없으며 서버 generation_time만 있다. 이 차이를 `2차결과.md`와 원시 JSON에 표시했다. 이후 계측은 브라우저 fetch 응답 복제본을 사용한다.

결과·호출별 표·이미지는 `85_공룡3_모듈화/2차결과.md`, `2차캡처/`에 있다. 실제 태블릿 하드웨어·스피커 청취·운영 접속/배포는 하지 않았다. 확률적인 생성이므로 앞으로도 그림이 거절될 수 있으며 그 경우 이전 칸이 유지된다. 최종 그림에도 일반 자세의 몸통 공백, 고양이 형태를 이어받은 로봇 등 미술 표현의 한계는 있다. 수정 전 그림과 검사 결과도 수정전- 접두사로 보존했다. `비용비교.md` 갱신은 3차 범위로 남긴다.

참고: [Wrangler 로컬 환경변수](https://developers.cloudflare.com/workers/local-development/environment-variables/), [OpenRouter Analytics](https://openrouter.ai/docs/api/api-reference/analytics/query-analytics-data), [Generation 메타데이터](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation).
