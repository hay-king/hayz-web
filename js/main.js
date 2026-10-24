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

// 가입 · 로그인: 같은 주소의 HAYZ 웹 서버(server.mjs)가 구글 로그인을 처리합니다.
// 서버 없이 정적 파일로만 열렸거나 구글 키가 아직 없으면 로그인 대신 데스크탑 앱을 안내합니다.
const modal = document.getElementById('login');
const gMsg = document.getElementById('gFallback');
const say = (t) => { gMsg.textContent = t; gMsg.hidden = !t; };
const ERRORS = {
  denied: '구글 로그인을 취소했습니다.',
  state: '로그인 요청이 만료되었습니다. 다시 시도해 주세요.',
  exchange: '구글 계정 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  email: '이메일 인증이 끝난 구글 계정만 가입할 수 있습니다.',
  setup: '가입 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.'
};
let loginReady = false;
const authState = fetch('/auth/health', { credentials: 'same-origin' })
  .then(r => (r.ok ? r.json() : null))
  .then(async h => {
    loginReady = Boolean(h && h.login);
    if (!loginReady) return;
    const me = await fetch('/auth/me', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null);
    if (me && me.user) { // 이미 로그인: 머리말 단추를 내 계정으로
      const a = document.getElementById('navAccount');
      a.textContent = '내 계정'; a.href = '/account'; a.removeAttribute('data-open-login');
      a.removeEventListener('click', openLogin);
    }
  })
  .catch(() => {});

function openLogin(e) {
  e && e.preventDefault();
  const ready = loginReady;
  document.getElementById('gLogin').hidden = !ready;
  document.getElementById('gNote').hidden = !ready;
  document.getElementById('loginDownload').hidden = ready;
  document.getElementById('loginTitle').textContent = ready ? 'HAYZ 가입하기' : 'HAYZ 시작하기';
  document.getElementById('loginLead').textContent = ready
    ? '구글 계정 하나로 가입과 로그인을 함께 합니다.'
    : '웹 가입은 준비 중입니다. 지금은 맥 · 윈도우 데스크탑 앱으로 시작할 수 있습니다.';
  modal.hidden = false;
}
document.getElementById('loginDownload').addEventListener('click', () => { modal.hidden = true; });
const closeLogin = () => { modal.hidden = true; say(''); if (location.hash.startsWith('#login')) history.replaceState(null, '', location.pathname); };
document.querySelectorAll('[data-open-login]').forEach(b => b.addEventListener('click', openLogin));
document.querySelector('[data-close-login]').addEventListener('click', closeLogin);
modal.addEventListener('click', e => { if (e.target === modal) closeLogin(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
// 서버가 실패하면 /#login?error=... 로 돌려보냄
if (location.hash.startsWith('#login')) authState.then(() => {
  openLogin();
  const err = new URLSearchParams(location.hash.split('?')[1] || '').get('error');
  if (err) say(ERRORS[err] || '로그인에 실패했습니다. 다시 시도해 주세요.');
});
