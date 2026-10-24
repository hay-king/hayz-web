import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { downloads } from '../public/js/downloads.js';
import { withHarness } from './helpers.mjs';

const root = path.resolve(import.meta.dirname, '..');
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;

function filesUnder(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full));
    else found.push(full);
  }
  return found;
}

test('다운로드 링크와 화면 파일은 비어 있는 자리표시다', () => {
  assert.equal(downloads.mac.href, '');
  assert.equal(downloads.windows.href, '');
  assert.equal(downloads.web.href, '');
  assert.equal(downloads.pwa.href, '');
  assert.equal(downloads.pwa.status, '예정');
  const tokens = readFileSync(path.join(root, 'public/css/tokens.css'), 'utf8');
  assert.match(tokens, /--brand:/);
  assert.match(readFileSync(path.join(root, 'public/assets/logo-placeholder.svg'), 'utf8'), /자리표시/);
  for (const name of ['messenger', 'bongs', 'work', 'mail', 'office', 'market']) {
    assert.match(readFileSync(path.join(root, 'public/assets/captures', `${name}.svg`), 'utf8'), /화면 자리표시/);
  }
});

test('공개 파일에 이모지, 인라인 스타일, prompt, 클라이언트 비밀이 없다', () => {
  const bannedId = ['170908678734', 'q0q2dmrhg5qcjv4dcbtcl2bgmk7u74nm'].join('-');
  const targets = [
    ...filesUnder(path.join(root, 'public')),
    ...filesUnder(path.join(root, 'src')),
  ];
  for (const file of targets) {
    if (file.endsWith('.webp')) continue;
    const text = readFileSync(file, 'utf8');
    assert.equal(emoji.test(text), false, file);
    assert.equal(text.includes('window.prompt'), false, file);
    assert.equal(text.includes('innerHTML'), false, file);
    assert.equal(text.includes(bannedId), false, file);
    assert.equal(text.includes('GOCSPX-'), false, file);
    if (file.endsWith('.html') || file.endsWith('.svg') || file.endsWith('.js') || file.endsWith('.mjs')) {
      assert.equal(text.includes('style='), false, file);
    }
  }
  const docs = ['README.md', '구글로그인설계.md', '메뉴구조.md', '.env.example'];
  for (const name of docs) {
    const text = readFileSync(path.join(root, name), 'utf8');
    assert.equal(text.includes(bannedId), false, name);
    assert.equal(text.includes('GOCSPX-'), false, name);
  }
});

test('홈, 요금, FAQ, 약관이 열리고 관리자 페이지는 막혀 있다', async () => {
  await withHarness({ config: { termsVersion: '2099-01-01', privacyVersion: '2099-01-02' } }, async (harness) => {
    const home = await fetch(`${harness.base}/`);
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    for (const word of ['메신저', 'BONGS', '업무앱', '메일', '사무실 공유', '마켓', 'Mac', 'Windows', 'PWA', '링크 미정']) {
      assert.equal(html.includes(word), true, word);
    }
    assert.equal(html.includes('style='), false);
    const pricing = await (await fetch(`${harness.base}/pricing`)).text();
    assert.match(pricing, /가격 미정/);
    assert.equal(/\d+\s*원/.test(pricing), false);
    assert.equal(pricing.includes('₩'), false);
    const faq = await (await fetch(`${harness.base}/faq`)).text();
    assert.match(faq, /메일함 권한/);
    assert.match(faq, /고객 지원 채널은 아직/);
    const terms = await (await fetch(`${harness.base}/legal/terms`)).text();
    assert.match(terms, /자리표시/);
    assert.match(terms, /2099-01-01/);
    assert.equal(terms.includes('__TERMS_VERSION__'), false);
    const privacy = await (await fetch(`${harness.base}/legal/privacy`)).text();
    assert.match(privacy, /2099-01-02/);
    const leaked = await fetch(`${harness.base}/%2e%2e/package.json`);
    assert.equal(leaked.status, 404);
    assert.equal((await leaked.text()).includes('"private"'), false);
    const health = await fetch(`${harness.base}/health`);
    assert.equal(health.status, 200);
  });
});
