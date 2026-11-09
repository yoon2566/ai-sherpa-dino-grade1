# 공룡3 모듈화 1차

기준: 프로젝트 상위의 `85_공룡3_모듈화/설계.md`(2026-11-09). 로컬 구현이며 배포하지 않는다.

- `assets/practice/modular/project.js`: `{formatVersion:2, engineVersion:'1.0.0', config, slots, assets}` 생성·검사·복원과 `buildGameHtml(project)`. 엔진 소스와 shell을 한 번 읽고, 이후 변경은 동기적으로 단일 HTML을 만든다. 메타데이터 JSON은 HTML 탈출 문자를 이스케이프하며 완성 HTML은 UTF-8 1,500,000바이트 이하로 제한한다.
- `shell.html`, `defaults.js`, `engine.js`: 실행 HTML 외피, 기본 그림 함수 4개, 고정 게임 엔진. atlas는 엔진 내부 data URL이다. 그림 함수에 게임 상태 원본을 넘기지 않고 엔진이 좌표 변환·클리핑·충돌·입력·HUD를 소유한다. 픽셀은 `slots.hero.mode='pixel'`, `assets.pixel`의 256자리 팔레트 데이터로 표현하며 색칠된 픽셀을 충돌에 사용한다.
- `chat.js`: 신규 작품만 새 구조를 사용한다. 4·5·7·8단계는 설정 변경, 6단계는 기본 선물 활성화와 이름 설정, 다른 AI 칸·자유 요청은 이번 단계에서 현재 그림 유지로 통과한다. 픽셀 편집기는 기존 것을 재사용한다. 미리보기는 저장 성공 후 교체한다.
- 저장·게시·내려받기는 모두 합성된 HTML이다. `game-sharing.js`의 로컬 이어하기 v1 외피와 게시 API·소유권 처리는 그대로다. 메타데이터 없는 구형 HTML은 원문 재생 및 기존 전체 HTML 편집 경로를 유지한다. 지원하지 않는 메타데이터 버전은 원문을 보존하고 편집을 차단한다.

`original-game.html`, `lesson-data.json.game`, `grade1-pixel.js`, `grade1-abilities.js`는 구형 호환용으로 그대로 남긴다. `modules/entry.js`, 소스맵, Wrangler 설정을 수정하거나 서버를 재빌드하지 않는다. 별도 엔진 빌드 명령 없이 브라우저의 `buildGameHtml`이 합성한다.

## 로컬 확인

`node scripts/serve-modular.cjs` → `http://127.0.0.1:19185/practice/index.html?course=1`. 이 서버는 정적 파일만 제공하며 `/api/`를 거부한다. `DINO3_PORT`로 포트를 바꿀 수 있다.

검증 명령은 `node scripts/modular-project-test.cjs`, `node scripts/modular-engine-test.cjs`, `node scripts/modular-test.cjs`다. 기존 프로젝트의 `70_검수/node_modules/playwright`를 재사용한다. 통합 검사는 합성 수업 코드와 로컬 모의 API만 사용하고 외부 요청을 차단한다. 결과·캡처는 `85_공룡3_모듈화/1차캡처`에 쓴다. 테스트 전용 엔진 제어는 `window.__SHERPA_TEST__ === true`일 때만 노출되며 일반 미리보기·내려받기에는 켜지지 않는다.

PC·태블릿 크기와 터치는 Chromium에서 재현한다. 실제 태블릿 하드웨어, 스피커 청취, 운영 게시 API 검증은 이 로컬 검사에 포함되지 않는다. 브라우저 직접 조작 도구는 Windows URL 확인 오류로 중단되어 해당 도구를 통한 수동 조작 확인은 하지 않았다.

## 2차에 남긴 범위

서버 slot/route 모드, AI 그림 함수 교체, AST·Worker 실행 검사, 재요청, 자유 요청 라우터는 연결하지 않았다. 1차 빌더는 임의 칸 코드를 거부한다. 실제 AI 호출·비용 측정은 후속 단계다.
