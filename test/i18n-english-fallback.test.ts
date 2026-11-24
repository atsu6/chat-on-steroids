import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import english from '../src/renderer/locales/en.json';
import japanese from '../src/renderer/locales/ja.json';

let dom: JSDOM | undefined;
afterEach(() => {
  vi.doUnmock('../src/renderer/locales/en.json'); vi.doUnmock('../src/renderer/locales/ja.json');
  vi.unstubAllGlobals(); dom?.window.close(); dom = undefined; vi.resetModules();
});

async function renderer() {
  vi.resetModules();
  vi.doMock('../src/renderer/locales/en.json', () => ({ default: { ...english,
    future_label: 'English label {0}', future_count: '{0} things', 'future_count|one': '{0} thing' } }));
  vi.doMock('../src/renderer/locales/ja.json', () => ({ default: { ...japanese, future_label: '日本語ラベル {0}' } }));
  dom = new JSDOM('<select id="uiLanguage"><option value="en">English</option><option value="ja">日本語</option><option value="ru">Русский</option></select>', { url: 'https://local.test/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement'] as const) vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  return import('../src/renderer/i18n.js');
}

it('uses the selected catalog, then English, then the key, without changing arguments or authored text', async () => {
  const { t, ui, setLanguage } = await renderer(); const argument = '$& <img src=x> /資料';
  const node = document.createElement('div'); document.body.append(node); ui(node, 'textContent', () => t('future_label', [argument]));
  expect(node.textContent).toBe(`English label ${argument}`);
  setLanguage('ja'); expect(node.textContent).toBe(`日本語ラベル ${argument}`);
  setLanguage('ru'); expect(node.textContent).toBe(`English label ${argument}`);
  expect(t('missing_key {0}', [argument])).toBe(`missing_key ${argument}`);
  expect(t('  Unknown   source  ')).toBe('  Unknown   source  ');
  node.textContent = 'User title'; setLanguage('ja'); expect(node.textContent).toBe('User title');
  expect(document.querySelector('img')).toBeNull();
});

it('uses English plural rules for missing translations, including Russian 21 and Japanese 1', async () => {
  const { tn, setLanguage } = await renderer();
  for (const language of ['ru', 'ja', 'en'] as const) {
    setLanguage(language);
    expect(tn('future singular', 'future_count', 1)).toBe('1 thing');
    expect(tn('future singular', 'future_count', 21)).toBe('21 things');
    expect(tn('future singular', 'future_count', NaN)).toBe('NaN things');
  }
});

it('keeps every existing Japanese source alias registered in ja and translated into English', () => {
  const ja: Record<string, string> = japanese, en: Record<string, string> = english;
  const aliases = Object.keys(ja).filter(key => /[\u3040-\u30ff\u4e00-\u9fff]/u.test(key));
  expect(aliases.length).toBeGreaterThan(0);
  for (const key of aliases) {
    expect(ja[key]).toBe(key); expect(en[key]).toBeTruthy(); expect(en[key]).not.toMatch(/[\u3040-\u30ff\u4e00-\u9fff]/u);
    expect(ja[en[key]!]).toBe(key); expect(en[en[key]!]).toBe(en[key]);
  }
});

const extensionSource = readFileSync('extension/i18n.js', 'utf8');
async function extension(protocol: string, options: { noApp?: boolean; missingEnglish?: boolean; appLanguage?: string; missingLocale?: boolean } = {}) {
  const en = { future_label: { message: 'English $WHO$ / $1', placeholders: { who: { content: '$1' } } },
    future_count: { message: '$1 things' }, future_count__one: { message: '$1 thing' }, old_label: { message: 'Old English' } };
  const catalogs: Record<string, unknown> = { en, ru: { old_label: { message: 'Существующий перевод' } }, ja: { future_label: { message: '日本語 $1' } } };
  const listeners: Array<(changes: unknown, area: string) => void> = [];
  const messages = (language: string) => (options.missingEnglish && language === 'en') || (options.missingLocale && language === options.appLanguage) ? null : catalogs[language];
  const context: any = { setTimeout, clearTimeout, location: { protocol }, CustomEvent: class {},
    fetch: async (url: string) => ({ ok: Boolean(messages(url.split('/')[1]!)), json: async () => messages(url.split('/')[1]!) }),
    chrome: { i18n: { getMessage: () => 'Chrome German', getUILanguage: () => 'de' },
      runtime: { getURL: (file: string) => file, sendMessage: async (request: any) => request.current ? { ok: false } : { ok: true, messages: messages(request.language) } },
      storage: { local: { get: async () => options.noApp ? {} : { appLanguage: options.appLanguage ?? 'ru' } }, onChanged: { addListener: (fn: any) => listeners.push(fn) } } } };
  context.globalThis = context; vm.runInNewContext(extensionSource, context); await context.CLF_I18N.ready;
  const change = async (language: string) => { for (const listener of listeners) listener({ appLanguage: { newValue: language } }, 'local'); await new Promise(resolve => setTimeout(resolve, 0)); };
  return { api: context.CLF_I18N, change };
}

it.each(['chrome-extension:', 'https:'])('falls back per extension key to English, not Chrome, in %s', async protocol => {
  const { api, change } = await extension(protocol);
  expect(api.t('old_label')).toBe('Существующий перевод');
  expect(api.t('future_label', undefined, ['<img src=x>'])).toBe('English <img src=x> / <img src=x>');
  expect(api.t('missing_key')).toBe('missing_key');
  expect(api.t('missing_key', 'Legacy English $1', ['literal'])).toBe('Legacy English literal');
  expect(api.tn('future_count', 21, '$1 thing', '$1 things')).toBe('21 things');
  await change('ja'); expect(api.t('future_label', undefined, '値')).toBe('日本語 値');
  expect(api.tn('future_count', 1, '$1 thing', '$1 things')).toBe('1 thing');
});

it('keeps Chrome language before pairing and the key when both extension catalogs lack it', async () => {
  const browser = await extension('chrome-extension:', { noApp: true }); expect(browser.api.t('old_label')).toBe('Chrome German');
  const missing = await extension('chrome-extension:', { missingEnglish: true }); expect(missing.api.t('future_label')).toBe('future_label');
});


it.each(['chrome-extension:', 'https:'])('uses English plurals for a missing whole extension catalog in %s', async protocol => {
  const missing = await extension(protocol, { appLanguage: 'ja', missingLocale: true });
  expect(missing.api.t('old_label')).toBe('Old English');
  expect(missing.api.tn('future_count', 1, '$1 thing', '$1 things')).toBe('1 thing');
  const englishMissing = await extension(protocol, { appLanguage: 'en', missingEnglish: true });
  expect(englishMissing.api.t('future_label')).toBe('future_label');
});

it('preserves all twelve upstream locales and 2.1.55 keys without spreading dev names', () => {
  const read = (file: string) => readFileSync(file, 'utf8');
  const name = 'Chat On Venice (dev)';
  const upstreamLocales = ['de', 'es', 'fr', 'ja', 'ko', 'pt-BR', 'pt-PT', 'ru', 'tr', 'vi', 'zh-CN', 'zh-TW'];
  for (const locale of [...upstreamLocales, 'en']) {
    const catalog = JSON.parse(read(`src/renderer/locales/${locale}.json`));
    for (const key of ['Restore turn', 'Undo in Review', 'Manage installed Skills', 'Free space per chat', 'Safer after a crash']) {
      expect(Object.hasOwn(catalog, key), `${locale}: ${key}`).toBe(true);
      expect(catalog[key].trim()).not.toBe('');
    }
    if (locale !== 'en' && locale !== 'ja') {
      expect(Object.hasOwn(catalog, name)).toBe(false);
      expect(Object.hasOwn(catalog, 'Chat On Venice')).toBe(false);
    }
  }
});
