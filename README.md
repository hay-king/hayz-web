# HAYZ 웹

HAYZ는 AI 메신저입니다. AI 봇 이름은 BONGS이고, 마스코트는 토덕이입니다.

이 저장소는 소개 홈페이지와 구글 로그인, 회원·관리자 기능을 한 Node 서버로 제공합니다. 인증·회원·관리자 코드는 `src/auth`, `src/users`, `src/admin`에 모여 있어서 나중에 `hayz-api`로 옮길 수 있습니다. 화면은 `public`, 저장은 `src/db`만 거칩니다.

## 기능

- 홈: 소개, 메신저·BONGS AI·업무앱·메일·사무실 공유·마켓, Mac·Windows·웹·휴대폰 PWA 다운로드. 휴대폰·태블릿·PC 너비에 맞춰 바뀝니다.
- 요금(`/pricing`)과 FAQ(`/faq`). 가격은 아직 정해지지 않은 자리표시입니다.
- 구글 로그인: 서버로 돌아오는 OAuth 2.0 Authorization Code, PKCE(`S256`), `state` 검사. 범위는 `openid email profile`만이며 Gmail 권한은 요청하지 않습니다.
- 처음 로그인은 이용약관·개인정보 처리방침 동의 후 회원이 만들어집니다. 동의 시각과 문서 버전을 저장합니다. 이후 로그인은 동의 화면 없이 이어집니다.
- 세션 쿠키 `hayz_sid`는 HMAC으로 서명되고 `HttpOnly`, `SameSite=Lax`입니다. `PUBLIC_BASE_URL`이 `https://`이면 `Secure`를 붙입니다. 유휴 만료와 절대 만료가 따로 있습니다.
- 내 정보(`/me`): 프로필, 로그아웃, 이메일 확인 후 탈퇴. 탈퇴하면 계정이 비활성화되고 이메일·이름·사진·구글 식별자가 삭제됩니다.
- 관리자(`/admin`): `ADMIN_EMAILS`에 있는 이메일로 가입·로그인하면 관리자입니다. 회원 검색·상세·정지/해제·역할 변경, 전체 회원·오늘 가입·최근 로그인·기간별 가입 추이. 권한 검사와 CSRF 검사는 서버에서 합니다. 마지막 관리자는 정지하거나 일반 회원으로 바꿀 수 없습니다.

후기나 이용자 수처럼 확인되지 않은 숫자는 넣지 않습니다.

## 로컬 실행

기존 저장소에는 시작 스크립트가 없었고, 로그인 설계의 서버 포트만 4320이었습니다. 그 포트를 기본값으로 유지합니다. 클라우드타입이 `PORT`를 넣으면 그 값을 사용하고, `0.0.0.0`에 붙습니다.

```bash
npm start
```

`npm start`는 `node src/server.mjs`입니다. 개발 주소는 `PUBLIC_BASE_URL`과 같아야 합니다. 기본 예는 `http://localhost:4320`입니다.

Node.js 22 이상이 필요합니다. 회원 저장은 Node 내장 SQLite(`node:sqlite`)를 씁니다.

```bash
npm test
```

## 환경변수

값은 `.env`나 클라우드타입 환경변수에만 둡니다. 저장소와 프론트 코드에는 넣지 않습니다. 이름은 `.env.example`에만 있습니다.

| 이름 | 설명 |
| --- | --- |
| `PORT` | 수신 포트. 없으면 `4320`. |
| `PUBLIC_BASE_URL` | 브라우저에 보이는 주소. 끝 슬래시 없이. 예: `http://localhost:4320` |
| `GOOGLE_CLIENT_ID` | 구글 OAuth 웹 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | 구글 OAuth 클라이언트 시크릿 |
| `SESSION_SECRET` | 쿠키 서명 키. 32자 이상 |
| `ADMIN_EMAILS` | 관리자 이메일. 쉼표로 구분. 로그인할 때 역할을 관리자로 올립니다. |
| `DATA_DIR` | SQLite 디렉터리. 기본 `./data`. 재배포 뒤에도 남는 디스크에 둡니다. |
| `SESSION_IDLE_SECONDS` | 유휴 만료. 기본 `7200`(2시간) |
| `SESSION_ABSOLUTE_SECONDS` | 절대 만료. 기본 `604800`(7일) |
| `TERMS_VERSION` | 이용약관 버전. 기본 `2026-10-24` |
| `PRIVACY_VERSION` | 개인정보 처리방침 버전. 기본 `2026-10-24` |
| `TRUST_PROXY` | `true`일 때만 `X-Forwarded-For`로 로그인 횟수를 나눕니다. |

콜백 주소는 따로 받지 않고 `PUBLIC_BASE_URL`에 `/auth/google/callback`을 붙입니다.

헬스 체크는 `GET /health`입니다.

## 구글 클라우드 콘솔

OAuth 클라이언트 유형은 웹 애플리케이션입니다. 동의 화면 범위는 `openid`, `email`, `profile`만 두고 Gmail API는 추가하지 않습니다.

승인된 리디렉션 URI는 아래 형식 그대로 등록합니다.

```text
{PUBLIC_BASE_URL}/auth/google/callback
```

로컬:

```text
http://localhost:4320/auth/google/callback
```

클라우드타입 `hayz-web` 현재 호스트를 쓰는 경우:

```text
https://web-hayz-web-mvkqr08w872db702.sel3.cloudtype.app/auth/google/callback
```

`PUBLIC_BASE_URL`을 바꾸면 콘솔의 URI도 같은 문자열로 바꿔야 합니다. 자바스크립트 원본에 클라이언트 시크릿이나 세션 키를 넣지 않습니다.

## 데이터베이스와 백업

SQLite 파일은 `$DATA_DIR/hayz.sqlite`입니다. SQL은 `src/db/index.mjs` 안에만 있습니다. Postgres로 옮길 때는 이 모듈의 함수 이름과 인자만 맞추면 됩니다.

실행 중 백업:

```bash
DATA_DIR=/data npm run backup
```

`VACUUM INTO`로 `$DATA_DIR/backups/hayz-시각.sqlite` 사본을 만듭니다. 서버를 멈추고 복사할 때는 `hayz.sqlite`와 같이 있는 `hayz.sqlite-wal`, `hayz.sqlite-shm`을 함께 복사합니다. WAL만 빠지면 최근 변경이 빠질 수 있습니다.

클라우드타입에서는 `DATA_DIR`과 같은 경로에 볼륨을 마운트합니다. 예: 환경변수 `DATA_DIR=/data`, 볼륨 마운트 `/data`. 볼륨이 없으면 재배포할 때 회원과 세션이 사라집니다.

## 클라우드타입 hayz-web

이 서비스는 더 이상 정적 파일만이 아닙니다. 시작 명령은 `npm start`, 포트는 플랫폼이 주는 `PORT`(없으면 4320)입니다. 런타임은 Node.js 22입니다.

환경변수는 위 표대로 넣고, `PUBLIC_BASE_URL`은 `https://`로 시작해야 세션 쿠키에 `Secure`가 붙습니다. `DATA_DIR` 볼륨을 연결한 뒤 배포합니다.

## 자리표시

최종 값이 없어서 아래만 바꾸면 됩니다.

| 자리 | 파일 |
| --- | --- |
| 로고 | `public/assets/logo-placeholder.svg` |
| 색상 | `public/css/tokens.css`의 변수 |
| 다운로드 주소 | `public/js/downloads.js`의 `href`. 비어 있으면 "링크 미정" |
| 앱 화면 | `public/assets/captures/`의 `messenger.svg`, `bongs.svg`, `work.svg`, `mail.svg`, `office.svg`, `market.svg` |
| 요금 | `public/pricing.html`의 "가격 미정" |
| 이용약관 본문 | `public/legal/terms.html` |
| 개인정보 처리방침 본문 | `public/legal/privacy.html` |
| 고객 지원 연락처 | 아직 없음. FAQ에 채널이 없다고만 적혀 있습니다. |

약관 버전을 올릴 때는 본문과 `TERMS_VERSION`, `PRIVACY_VERSION`을 함께 바꿉니다.

## 나중에 hayz-api로 나눌 때

`src/server.mjs`와 `src/app.mjs`가 정적 파일과 API를 한 프로세스에 붙입니다. API를 분리할 때는 `src/auth`, `src/users`, `src/admin`, `src/db`와 `src/config.mjs`, `src/http.mjs`, `src/security.mjs`, `src/profile.mjs`, `src/time.mjs`를 옮기고, 웹 서버는 `public`과 `src/web`만 남기면 됩니다.
