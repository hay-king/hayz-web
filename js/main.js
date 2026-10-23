// 봉스(BONGS) 홈페이지 — 토덕이 테마. 주황 #ff5b21은 버튼·라벨 보조색
document.getElementById('year').textContent = new Date().getFullYear();

// 앱 미리보기 사이드바
const route = document.getElementById('appRoute');
document.querySelectorAll('.app-side a').forEach(a => a.addEventListener('click', () => {
  document.querySelectorAll('.app-side a').forEach(x => x.classList.toggle('on', x === a));
  route.textContent = a.dataset.route;
}));

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
const openLogin = (e) => { e && e.preventDefault(); modal.hidden = false; };
const closeLogin = () => { modal.hidden = true; if (location.hash === '#login') history.replaceState(null, '', ' '); };
document.getElementById('gLogin').addEventListener('click', startGoogleLogin);
document.querySelectorAll('[data-open-login]').forEach(b => b.addEventListener('click', openLogin));
document.querySelector('[data-close-login]').addEventListener('click', closeLogin);
modal.addEventListener('click', e => { if (e.target === modal) closeLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
// 백엔드가 실패 시 /#login?error=... 로 돌려보내면 안내
const err = new URLSearchParams(location.hash.split('?')[1] || '').get('error');
if (location.hash.startsWith('#login')) { openLogin(); if (err) say('로그인에 실패했습니다 (' + err + '). 다시 시도해 주세요.'); }
