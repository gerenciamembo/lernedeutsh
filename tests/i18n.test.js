import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupTestEnvironment } from './helpers/fake-dom.js';

const modulePath = path.resolve('client/main.js');

async function importFreshModule() {
  const url = `${pathToFileURL(modulePath).href}?t=${Math.random()}`;
  return import(url);
}

let env;

test.beforeEach(async () => {
  env = setupTestEnvironment();
  global.window = env.window;
  global.document = env.document;
  global.localStorage = env.localStorage;
  global.window.__LERNDEUTSH_TEST__ = true;
  global.FormData = class {
    constructor(form) {
      this.form = form;
    }
  };
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ decks: [] })
  });
});

test.afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.localStorage;
  delete global.FormData;
  delete global.fetch;
  env = null;
});

test('applyLanguage updates aria attributes without errors', async () => {
  const mod = await importFreshModule();
  assert.doesNotThrow(() => mod.applyLanguage('en'));
  const closeButton = document.getElementById('close-deck-form');
  assert.equal(closeButton.getAttribute('aria-label'), 'Close');
  const nameInput = document.getElementById('deck-form-name');
  assert.equal(nameInput.getAttribute('placeholder'), 'E.g. Basic vocabulary');
});

test('applyLanguage updates toggle text and persists language preference', async () => {
  const mod = await importFreshModule();
  mod.applyLanguage('en');
  assert.equal(localStorage.getItem(mod.LANGUAGE_STORAGE_KEY), 'en');
  const toggle = document.getElementById('language-toggle');
  assert.equal(toggle.textContent, '🇺🇸');
  assert.ok(toggle.getAttribute('aria-label').includes('Spanish'));
  mod.applyLanguage('es');
  assert.equal(localStorage.getItem(mod.LANGUAGE_STORAGE_KEY), 'es');
  assert.equal(toggle.textContent, '🇪🇸');
  assert.ok(toggle.getAttribute('aria-label').includes('inglés'));
});

test('init respects stored theme preference', async () => {
  const mod = await importFreshModule();
  localStorage.setItem(mod.THEME_STORAGE_KEY, 'light');
  await mod.init();
  assert.equal(document.documentElement.dataset.theme, 'light');
});

test('init surfaces deck loading errors with translated message', async () => {
  const mod = await importFreshModule();
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: 'server down' })
  });
  await mod.init();
  const grid = document.getElementById('deck-grid');
  assert.equal(grid.textContent, mod.translate('deck.loadError', { message: 'server down' }));
});
