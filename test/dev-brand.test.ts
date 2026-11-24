import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAIN_TEXTS } from '../src/shared/main-texts.js';

const name = 'Chat On Venice (dev)';
const read = (file: string) => readFileSync(file, 'utf8');
let dom: JSDOM;
beforeEach(() => {
  vi.resetModules();
  dom = new JSDOM(read('src/renderer/index.html'), { url: 'https://local.test/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement'] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
});
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });

it.each(['en', 'ja', 'de'] as const)('keeps the window and header name visible through %s localization', async language => {
  const i18n = await import('../src/renderer/i18n.js');
  i18n.initLanguage();
  i18n.setLanguage(language);
  expect(dom.window.document.title).toBe(name);
  expect(dom.window.document.querySelector('.sidebar-brand strong')?.textContent).toBe(name);
  expect(dom.window.document.querySelector('.chat-head .title')?.textContent).toContain(name);
  const texts = await import('../src/renderer/main-texts.js');
  expect(texts.mainTexts()[name]).toBe(name);
});

it('registers the display name in the native text contract and both required catalogs', () => {
  expect(MAIN_TEXTS).toContain(name);
  for (const language of ['en', 'ja']) {
    expect(JSON.parse(read(`src/renderer/locales/${language}.json`))[name]).toBe(name);
  }
});

it('uses the native i18n name for the initial window, tray, About and language refresh', () => {
  const source = read('src/main/index.ts');
  expect(source).toContain(`title: mainText('${name}')`);
  expect(source).toContain("tray.setToolTip(`${mainText('Chat On Venice (dev)')} — ${label}`)");
  expect(source).toContain(`const applicationName = mainText('${name}')`);
  expect(source).toContain('app.setAboutPanelOptions({ applicationName })');
  expect(source).toContain('window.setTitle(applicationName)');
  expect(source).toContain('onMainTextsChange(refreshNativeBrand)');
  expect(source).toContain("app.dock?.setIcon(path.join(app.getAppPath(), 'artwork', 'app-icon-source.png'))");
  expect(source).not.toMatch(/app\.setName\s*\(/);
});

it('keeps the SVG and renderer ferro silhouette and palette in sync', () => {
  const svg = new JSDOM(read('artwork/app-icon-source.svg'), { contentType: 'image/svg+xml' }).window.document;
  const mark = dom.window.document.querySelector('#i-mark')!;
  expect(mark.querySelector('path')?.getAttribute('d')).toBe(svg.querySelector('path')?.getAttribute('d'));
  for (const selector of ['rect', 'path']) {
    expect(mark.querySelector(selector)?.getAttribute('fill')).toBe(svg.querySelector(selector)?.getAttribute('fill'));
  }
  expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#123e42');
  expect(svg.querySelector('path')?.getAttribute('fill')).toBe('#ffffff');
  expect(read('scripts/make-icon.mjs')).toContain('const INK = [18, 62, 66]');
  expect(read('scripts/make-icon.mjs')).toContain('const PAPER = [255, 255, 255]');
});
