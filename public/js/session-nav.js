export async function refreshSessionNav() {
  const login = document.querySelector('[data-login]');
  const me = document.querySelector('[data-me]');
  const admin = document.querySelector('[data-admin]');
  if (!login && !me && !admin) return;
  try {
    const response = await fetch('/api/me', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) return;
    const data = await response.json();
    if (login) login.hidden = true;
    if (me) me.hidden = false;
    if (admin) admin.hidden = data.user?.role !== 'admin';
  } catch {
    // 공개 페이지는 세션 조회가 실패해도 그대로 보여 줍니다.
  }
}
