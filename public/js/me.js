import { messageFor } from './auth-notice.js';
import { boot } from './boot.js';

boot();

const error = document.getElementById('form-error');
const response = await fetch('/api/me', {
  headers: { accept: 'application/json' },
  credentials: 'same-origin',
});

if (!response.ok) {
  location.href = '/?auth_error=login';
} else {
  const data = await response.json();
  const user = data.user;
  text('me-name', user.name || '이름 없음');
  text('me-email', user.email || '');
  text('me-created', user.createdAtLabel || '');
  text('me-login', user.lastLoginAtLabel || '');
  text('me-status', user.status === 'active' ? '활성' : user.status);
  text('me-consent', `${user.consentedAtLabel || ''} · 약관 ${user.termsVersion || ''} · 개인정보 ${user.privacyVersion || ''}`);
  const photo = document.getElementById('me-photo');
  if (user.picture && photo) {
    photo.src = user.picture;
    photo.alt = user.name ? `${user.name} 프로필 사진` : '프로필 사진';
    photo.hidden = false;
  }

  document.getElementById('logout').addEventListener('click', async () => {
    const result = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'x-csrf-token': data.csrfToken },
    });
    if (result.ok) location.href = '/';
    else showError('csrf');
  });

  document.getElementById('withdraw-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const form = event.currentTarget;
    const result = await fetch('/api/me/withdraw', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': data.csrfToken,
      },
      body: JSON.stringify({
        confirmEmail: form.elements.confirmEmail.value,
        understand: form.elements.understand.checked,
      }),
    });
    if (result.ok) {
      location.href = '/?withdrawn=1';
      return;
    }
    const body = await result.json().catch(() => ({}));
    showError(body.error);
  });
}

function text(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function showError(code) {
  error.textContent = messageFor(code);
  error.hidden = false;
}
