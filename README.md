# hayz-web

HAYZ 홈페이지와 웹 가입 서버입니다. 데스크톱·모바일·웹 3개 진입점 중 웹용입니다.

앱 이름 HAYZ, AI 봇 이름 BONGS (마스코트 캐릭터는 토덕이).

## 구성
- `index.html` · `css/` · `js/` · `assets/` — 홈페이지
- `account.html` · `js/account.js` — 가입 후 내 계정(사무실 이름, 로그아웃, 회원 탈퇴)
- `server.mjs` — 정적 파일 + 구글 계정 가입·로그인(OAuth 2.0 승인 코드 흐름). 외부 패키지 없음, Node 22.13 이상(`node:sqlite`)
- 서버 없이 정적 사이트로만 열리면 가입 창 대신 데스크탑 앱 다운로드를 안내합니다.

## 실행 · 시험
```bash
npm test
GOOGLE_CLIENT_SECRET=... npm start   # http://localhost:3000
```

## 클라우드타입 배포 (Node 서비스)
1. 서비스 템플릿: **Node.js** (버전 22 이상), 시작 명령 `npm start`, 포트 `3000`
2. 환경변수
   - `GOOGLE_CLIENT_SECRET` — 구글 클라우드 콘솔의 클라이언트 보안 비밀번호 (**저장소에 절대 넣지 않음**)
   - `APP_BASE_URL` — 예: `https://web-hayz-web-mvkqr08w872db702.sel3.cloudtype.app`
   - `HAYZ_DB` — 회원 DB 경로. 재배포해도 남도록 **영구 볼륨** 경로로 지정 (예: `/data/hayz.db`)
   - (선택) `GOOGLE_CLIENT_ID` — 기본값은 HAYZ 공개 클라이언트 ID
3. 구글 클라우드 콘솔 → OAuth 클라이언트 → **승인된 리디렉션 URI**에 `${APP_BASE_URL}/auth/google/callback` 추가

## 저장하는 정보
구글 계정의 고유 번호(sub) · 이메일 · 이름, 사용자가 적은 사무실 이름, 가입·로그인 시각. 구글 토큰은 저장하지 않습니다. 탈퇴하면 바로 지웁니다.
