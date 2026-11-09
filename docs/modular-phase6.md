# 공룡3 6차 자유 고치기

기준은 `556020b`와 태그 `2026-11-10-0157버전`이다. 확정 설계는 작업 루트 `85_공룡3_모듈화/설계_6차_자유고치기.md`, 최종 증거·배포 결과는 같은 폴더의 `6차결과.md`, `6차캡처/`에 보관한다.

- 2·3·6단계 결과에 기존 흰 버튼 모양의 다른 배경·장애물·선물 고르기를 추가했다. 재선택만으로 현재 게임을 바꾸지 않는다.
- 9단계는 기존 칸 라우터부터 실행한다. unsupported 또는 칸 처리 실패이면 현재 `buildGameHtml` 결과를 전체 수정한다. 사용자가 멈춘 요청은 자동 재시도하지 않는다.
- 실제 시험에서 `점점 빨라지게`를 고정 배율 1.8로 해석한 응답을 발견했다. 라우터가 점진·시간·조건부 요청에 고정 설정을 반환하면 지원 불가로 검사하여 통수정한다. 단순 속도·목숨·소리 설정은 기존 경로를 유지한다.
- 전체 수정된 모듈 작품은 `sherpa-free-project` 실행 데이터로 전환한다. 다시 모듈 칸으로 편집하지 못하며 앞 단계의 선택·결과 버튼을 잠근다.
- 구형 전체 HTML 경로의 이미지 토큰 및 버튼 복원을 재사용한다. 네이티브 엔진에는 기존 능력 주입기를 중복 적용하지 않고, 네이티브 능력·숙이기·특수·부모 메시지 연결을 보존·검사한다. 실행 스크립트는 acorn으로 구문 검사한다.
- 완료 시 기존 classroomWorkClient의 POST/PATCH·소유권·expectedRevision 흐름으로 자동 게시한다. 자유 고치기는 전체 HTML만 수정하고 성공 후 같은 글을 갱신한다. 게시 실패는 다시 올리기로 재시도하며 게임 생성 성공을 되돌리지는 않는다.
- 성공한 자유 고치기만 10회에서 차감한다. 기존 v1 로컬 이어하기 외피에 자유 모드·횟수·선택 요약을 추가한다. 여러 탭은 room 단위 Web Lock으로 생성부터 저장·자동 게시까지 직렬화하고 최신 횟수를 확인한다.
- `/api/game`의 `mode:'title'`은 `{mode,summary}`만 받고 2,000자 이하 요약 텍스트를 사용한다. HTML·코드펜스·추가 필드는 거절하며 출력 상한은 60토큰이다. 한국어 15자 이하·이모지 없는 제목을 검증하고 실패하면 `나의 ○○ 게임`을 쓴다. 수동 저장의 제목 칸은 편집 가능하고 늦게 도착한 AI 응답은 학생 입력을 덮지 않는다.
- 네이티브 전체 수정의 HTML은 사용자 참고자료로 전송한다. 구형 `gameRequest` 메시지 형식은 유지한다. 실제 시험에서 이전 assistant 이력 형식의 거절 응답 2건을 확인한 뒤 좁은 네이티브 분기만 보완했다.
- `board-expand@55be3e2`를 modular에 병합했다. 충돌은 없었고 기존 게시물 iframe을 유지하는 확대·축소 흐름을 사용한다.

새 검사는 다음과 같다. 모의 검사는 외부 AI·실제 수업 DB를 호출하지 않는다.

```powershell
node scripts/modular-phase6-title-test.cjs
node scripts/modular-phase6-full-server-test.cjs
node scripts/modular-phase6-board-server-test.cjs
node scripts/modular-phase6-route-test.cjs
node scripts/modular-phase6-test.cjs
```

실제 AI 검사는 DB 바인딩 없는 `serve-modular-ai.cjs` 로컬 서버와 `modular-phase6-live-ai-test.cjs`를 사용한다. `DINO3_LIVE_AI=1` 명시가 필요하고 누적 원장을 기준으로 로컬 15회, 운영 1회를 넘는 호출을 차단한다. 성공 기록만 집계하지 않고 실패 응답·토큰·비용·시간도 남긴다. 이미 수신한 동일 요청의 날기·가속 라우터 응답은 검증 재개 때 원장에 표시하고 재사용했다. 스트림이 중단된 8번 요청의 usage는 알 수 없으며 합계에 0으로 넣지 않는다. 실제 생성 HTML의 기능은 `modular-phase6-live-replay-test.cjs`로 별도 재생 검사한다. 회귀 검사의 2·3차 전용 파일은 이후 단계로 대체되어 현재 기준에서도 실패하는 경우가 있으므로 최종 결과에 현행 대체 검사와 기준 재현 증거를 구분한다.

운영 `wrangler.json`·DB 스키마·비밀번호는 바꾸지 않는다. 배포는 사용자 지정 명령 `npx --no-install wrangler deploy --config wrangler.json --keep-vars`를 dino3에서 실행한다. `modular-phase6-deploy-verify.cjs --before`는 기존 운영을 확인하고, 배포 뒤 버전 UUID를 인자로 주면 변경 정적 자산·Worker의 SHA-256 완전 일치, `/api/health`·`/lesson` 200, 해당 버전 100%, 보호 브랜치·설정 유지를 검사한다.
