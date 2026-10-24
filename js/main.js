// HAYZ 홈페이지 — 토덕이 테마. 주황 #ff5b21은 버튼·라벨 보조색
document.getElementById('year').textContent = new Date().getFullYear();

// 다운로드: 최신 릴리스 버전 · 날짜를 GitHub에서 읽어 표시(실패하면 HTML에 적힌 버전 그대로)
fetch('https://api.github.com/repos/hay-king/hayz-web/releases/latest', { headers: { accept: 'application/vnd.github+json' } })
  .then(r => (r.ok ? r.json() : null))
  .then(rel => {
    if (!rel || !rel.tag_name) return;
    document.getElementById('appVersion').textContent = rel.tag_name;
    if (rel.published_at) document.getElementById('appDate').textContent = ' (' + new Date(rel.published_at).toLocaleDateString('ko-KR') + ')';
  })
  .catch(() => {});

// 앱 미리보기 사이드바
const route = document.getElementById('appRoute');
document.querySelectorAll('.app-side a').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('.app-side a').forEach(x => x.classList.toggle('on', x === a));
  route.textContent = a.dataset.route;
}));

// 모바일 메뉴(햄버거): 열고 닫기, 링크를 누르면 닫힘
const nav = document.getElementById('siteNav');
const navBtn = document.querySelector('.nav-toggle');
const setNav = (open) => { nav.classList.toggle('open', open); navBtn.setAttribute('aria-expanded', String(open)); navBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기'); };
navBtn.addEventListener('click', () => setNav(!nav.classList.contains('open')));
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setNav(false)));

// 웹 로그인 준비 여부: 웹용 HAYZ 서버(구글 로그인 콜백)가 열리기 전에는 false — 로그인 창 대신 데스크탑 앱 안내
const WEB_LOGIN_READY = false;

// 로그인 모달 + 구글 로그인 (OAuth 2.0 승인 코드 흐름, GIS initCodeClient redirect 모드)
// 백엔드 주소: 로컬 개발은 localhost:4320. 클라우드타입 배포 시 이 값과 GCP 승인 원본·리디렉션 URI를 함께 바꿉니다.
const BACKEND_BASE = 'http://localhost:4320';
const REDIRECT_URI = BACKEND_BASE + '/auth/google/callback';
const modal = document.getElementById('login');
const CLIENT_ID = document.querySelector('meta[name="google-client-id"]').content;
const gMsg = document.getElementById('gFallback');
const say = (t) => { gMsg.textContent = t; gMsg.hidden = !t; };

async function backendAlive() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
    await fetch(BACKEND_BASE + '/auth/health', { mode: 'no-cors', signal: ctl.signal });
    clearTimeout(t); return true;
  } catch { return false; }
}
function newState() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  const st = Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  // 백엔드 콜백에서 쿠키값과 state 쿼리를 대조(CSRF 방지). 10분 만료
  document.cookie = `hayz_oauth_state=${st}; Path=/; Max-Age=600; SameSite=Lax` + (location.protocol === 'https:' ? '; Secure' : '');
  sessionStorage.setItem('hayz_oauth_state', st);
  return st;
}
async function startGoogleLogin() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) return say('구글 로그인 스크립트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  if (!(await backendAlive())) return say('로그인 서버(' + BACKEND_BASE + ')가 실행 중이 아닙니다. 서버를 켠 뒤 다시 시도해 주세요.');
  say('');
  google.accounts.oauth2.initCodeClient({
    client_id: CLIENT_ID,
    scope: 'openid email profile',
    ux_mode: 'redirect',
    redirect_uri: REDIRECT_URI,   // 구글이 ?code=&state= 를 붙여 백엔드 콜백으로 바로 보냄
    state: newState(),
    select_account: true
  }).requestCode();
}
const openLogin = (e) => {
  e && e.preventDefault();
  if (!WEB_LOGIN_READY) {
    document.getElementById('gLogin').hidden = true;
    document.getElementById('loginDownload').hidden = false;
    document.getElementById('loginLead').textContent = '웹 버전은 준비 중입니다. 지금은 맥 · 윈도우 데스크탑 앱으로 시작할 수 있습니다.';
  }
  modal.hidden = false;
};
document.getElementById('loginDownload').addEventListener('click', () => { modal.hidden = true; });
const closeLogin = () => { modal.hidden = true; if (location.hash === '#login') history.replaceState(null, '', ' '); };
document.getElementById('gLogin').addEventListener('click', startGoogleLogin);
document.querySelectorAll('[data-open-login]').forEach(b => b.addEventListener('click', openLogin));
document.querySelector('[data-close-login]').addEventListener('click', closeLogin);
modal.addEventListener('click', e => { if (e.target === modal) closeLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
// 백엔드가 실패 시 /#login?error=... 로 돌려보내면 안내
const err = new URLSearchParams(location.hash.split('?')[1] || '').get('error');
if (location.hash.startsWith('#login')) { openLogin(); if (err) say('로그인에 실패했습니다 (' + err + '). 다시 시도해 주세요.'); }
