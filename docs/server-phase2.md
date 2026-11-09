# 공룡3 모듈화 2차 서버 변경

`modules/entry.js`의 `cloud/ai-gateway.mjs` 구간을 **직접 편집**했다. 저장소에는 원본 빌드 스크립트·package.json이 없고 Wrangler 설정은 `no_bundle:true`다. `entry.js.map`에는 이전 빌드의 원본 10개가 있으나 이를 복원·재번들하면 AI 게이트웨이 외 교실·게시판 코드까지 달라질 수 있어 복원하지 않았다. 소스맵 파일은 원본 증거로 보존하고, 변경한 entry.js 끝의 `sourceMappingURL` 연결만 제거했다. 따라서 이 소스맵은 현재 수정본의 줄 번호를 나타내지 않는다.

- `POST /api/game`에 `mode:'slot'`과 `mode:'route'`를 추가했다. 두 모드만 20,000자/60,000바이트 이하로 제한한다. 학생 요청은 1~2,000자, 이전 칸 소스는 칸당 6,000자 이하이며 전체 HTML 필드를 거절한다. 원래 mode가 없는 요청의 입력 검사·기존 SYSTEM·모델 요청·SSE 경로는 유지한다.
- slot 입력은 `{mode:'slot',slot,request,current,contract}`다. `slot`은 hero/background/obstacle/item, `current`는 소스 문자열이다. `contract`는 서버가 보유한 고정 계약을 사용하므로 클라이언트 값으로 허용 범위를 늘릴 수 없다.
- slot 응답은 함수 하나를 담은 javascript 코드펜스다. 장애물만 펜스 첫 줄의 `// obstacleStyle: {"sizeScale":1,"shape":"rect"}` JSON 주석으로 데이터 값을 함께 보낸다. 실행문·두 번째 함수가 아니다. 클라이언트가 이 데이터도 별도 검사한다.
- route 입력은 `{mode:'route',request,current,config}`이며 `current`는 칸 이름별 소스 문자열의 객체다. `config`에 speedMultiplier/initialLives/soundPreset만 허용한다. 응답은 `{slot,code,obstacleStyle?}` / `{config}` / `{unsupported:true}` 중 하나다. JSON 콘텐츠를 기존 SSE로 전달하며 안전한 칸 적용과 설정 범위 검사는 클라이언트에서도 수행한다.
- 새 모드에는 `anthropic/claude-haiku-5.5`, `reasoning:{enabled:false,exclude:true}`, `max_tokens:4000`을 사용한다. 기존 SSE를 그대로 전달하므로 OpenRouter의 usage, usage.cost, finish_reason도 보존한다. rate limiter·동일 출처 검사·오류 응답 처리는 그대로다.
- 서버는 생성 코드 자체를 실행하지 않는다. 생성 내용의 AST·실행 검사와 이전 칸 보존은 브라우저 안전장치가 담당한다. 고정 엔진, 게시판, 교실·DB API, 운영 설정은 수정하지 않았다.

로컬 모의 서버 검증: `node scripts/modular-server-test.cjs`. 실제 외부 호출 없이 4개 칸·라우터 계약, 크기·필드·범위 제한, SSE 사용량 보존, 오류 처리 및 `7b40669` 대비 구형 요청 동등성을 확인하고 `85_공룡3_모듈화/2차캡처/서버검증결과.json`에 기록한다.
