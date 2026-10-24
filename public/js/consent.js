import { messageFor } from './auth-notice.js';
import { boot } from './boot.js';

boot();

const form = document.getElementById('consent-form');
const error = document.getElementById('form-error');
const who = document.getElementById('pending-who');

function fail(code) {
  error.textContent = messageFor(code);
  error.hidden = false;
}

const pendingResponse = await fetch('/api/auth/pending', {
  headers: { accept: 'application/json' },
  credentials: 'same-origin',
});

if (!pendingResponse.ok) {
  fail('consent');
  form.querySelector('button').disabled = true;
} else {
  const pending = await pendingResponse.json();
  who.textContent = pending.name ? `${pending.name} (${pending.email})` : pending.email;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const response = await fetch('/api/auth/consent', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-csrf-token': pending.csrfToken,
      },
      body: JSON.stringify({
        agreeTerms: form.elements.agreeTerms.checked,
        agreePrivacy: form.elements.agreePrivacy.checked,
      }),
    });
    if (response.ok) {
      location.href = '/me';
      return;
    }
    const body = await response.json().catch(() => ({}));
    fail(body.error);
  });
}
