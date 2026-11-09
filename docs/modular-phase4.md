# 공룡3 4차: 코드 밑그림과 손보기

기준은 `85_공룡3_모듈화/설계_4차_코드밑그림.md`이며 `modular@d4e0663` 위에 구현했다. 배포 전 되돌리기 태그 `2026-11-09-3차운영`은 d4e0663을 가리킨다. 운영 배포 ID와 최종 증거는 저장소 밖 `85_공룡3_모듈화/4차결과.md`에 기록한다.

## 판단

**손보기 유지.** 지정된 실제 AI 12개를 코드로 생성하고 한 장으로 모아 직접 확인했다. 고양이·로봇·토끼·외계인·개구리·바위·상자·버섯·사과·하트·딸기 11개는 인식 가능하다. 판다는 검은 사각 배경으로 대상을 즉시 인식하기 어려워 제외했다. 일부 캐릭터는 정면이고 토끼는 눈 표현이 부족하다. 형식 검사 통과를 미술 품질 전체 통과로 간주하지 않는다.

수업 iframe의 768×1024에서 한 칸 9.9801px, 터치 드래그와 붓·지우개·한 번 긋기 되돌리기를 확인했다. 10/12 이상 인식과 태블릿 붓 조작 조건을 모두 충족한다. 화면 크기·터치는 Chromium 재현이며 실제 태블릿 하드웨어 검증은 아니다.

## 구현

- AI는 2차의 drawHero/drawObstacle/drawItem 코드 칸과 AST·Worker 안전장치를 사용한다. 새 캐릭터 선택과 미확인 새 선택의 재생성에는 이전 캐릭터 코드를 보내지 않는다. 재시도·재생성은 boolean으로 전달하여 원문 길이를 늘리지 않는다.
- `code-bitmap.js`: stand 44×47, 장애물 44×47 바닥 정렬, 선물 24×24 변환. 가까운 색을 최대 12색으로 합치고 상하좌우 연결 4칸 미만 조각을 제거한다. 이후 캐릭터/장애물 면적 25%, 선물 20%, 최대 덩어리 80%를 검사한다. 실패는 1회 재요청 뒤 쉬운 안내로 종료한다.
- 편집기는 기존 모양에 가는/중간/굵은 붓을 추가했다. 기본은 3×3이며 지우개도 같은 크기다. AI 색 앞에 기본색을 합쳐 편집 팔레트는 최대 21색이다. 기존 16×16 그림은 원래 크기로 재편집할 수 있고 신규 직접 그리기는 빈 44×47이다.
- 확인 후 pixel 모드로 저장하되 안전 검사한 원본 코드를 메타데이터에 보존한다. pixel 모드에서는 해당 코드를 실행하지 않는다. 9단계는 현재 칸 코드를 수정해 같은 창으로 열며, 코드가 없는 직접 그림은 안내 후 기존 그림을 편집한다.
- 가변 그림 크기를 엔진 렌더·충돌·숙이기·장애물 축소 바닥 정렬·선물 HUD에 반영한다. 2차 문자열 직접 그림, 3차 16×16, 메타데이터 없는 구형 HTML 호환 경로를 유지한다.
- 서버 계약은 [server-phase4.md](server-phase4.md)에 있다. 운영 wrangler.json, 모델, 키 설정, 수업·게시 API와 DB는 변경하지 않았다.

## 검증 재현

아래 검사는 외부 AI와 실제 수업/게시/DB 접근 없이 실행한다. 캡처 경로는 `MODULAR_CAPTURE_DIR`로 4차캡처를 지정한다.

```powershell
node scripts/modular-server-test.cjs
node scripts/modular-safety-test.cjs
node scripts/modular-pixel-test.cjs
node scripts/modular-project-test.cjs
node scripts/modular-engine-test.cjs
node scripts/modular-code-bitmap-test.cjs
node scripts/modular-phase4-editor-test.cjs
node scripts/modular-phase4-ai-test.cjs
node scripts/modular-phase4-test.cjs
```

서버 82 + 안전 141 + 픽셀 58 + 프로젝트 46 + 엔진 65 + 코드비트맵 38 + 편집기 33 + AI계약 12 + 통합 52 = **527개 통과**. 통합은 3화면 초기 UI를 d4e0663과 비교하고 1~9단계, 저장 실패/취소 보존, 재생성, file:// 다운로드, 로컬 이어하기, 2/3차·구형 호환을 확인한다. 독립 리뷰에서 발견한 2차 문자열 직접그림 저장 회귀는 수정 후 저장·재편집 검사를 추가했다.

실제 AI는 DB 바인딩 없는 `serve-modular-ai.cjs`로 검증했다. 호출 opt-in은 `DINO3_LIVE_AI=1`, 실행은 `node scripts/modular-phase4-live-ai-test.cjs`. 원시 ledger를 삭제하거나 초기화하지 않는다. 실제 호출은 전체 누적 40회 상한이고 운영 확인용 ledger는 별도 2회 상한이다. `DINO3_LIVE_CASES`로 필요한 사례만 추가 실행할 수 있다. 과거 3차 테스트는 당시 pixel 응답 계약의 기록으로 보존한다.

기준 12개 생성에는 자동 재요청 포함 15회, 입력 38,475 / 출력 12,960토큰, $0.0103275, 응답 합계 62.236초가 들었다. 추가 9단계 2건은 라우터+코드 수정 모두 실제 통과했다. 합계 19회, 입력 58,281 / 출력 14,838토큰, $0.0132471, 응답 합계 72.503초다. 비용은 원시 SSE usage.cost이며 아이의 편집 시간과 전체 시험 경과시간을 뜻하지 않는다.

`node scripts/modular-phase4-ai-report.cjs`는 원시 ledger를 바꾸지 않고 재렌더·비용 집계·12개 PNG/HTML을 만든다. 운영 후 `modular-phase4-deploy-verify.cjs`는 변경 asset와 Worker 소스 SHA-256, /api/health, /lesson을 읽기 전용으로 대조한다.
