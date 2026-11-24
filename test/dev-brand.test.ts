import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { load as loadYaml } from 'js-yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAIN_TEXTS } from '../src/shared/main-texts.js';

const name = 'Chat On Venice (dev)';
const native = vi.hoisted(() => ({
  app: { isPackaged: false, setAboutPanelOptions: vi.fn(), setName: vi.fn(), getVersion: () => '2.1.55', getAppPath: () => '/app' },
  Menu: { getApplicationMenu: vi.fn(), buildFromTemplate: vi.fn((items: unknown[]) => ({ items })), setApplicationMenu: vi.fn() }
}));
vi.mock('electron', () => native);
const read = (file: string) => readFileSync(file, 'utf8');
let dom: JSDOM;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.app.isPackaged = false;
  dom = new JSDOM(read('src/renderer/index.html'), { url: 'https://local.test/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement'] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
});
afterEach(() => { vi.unstubAllGlobals(); dom.window.close(); });

it.each(['en', 'ja', 'de'] as const)('binds both main-selected names through %s localization', async language => {
  const i18n = await import('../src/renderer/i18n.js');
  const { applyAppBrand } = await import('../src/renderer/app-brand.js');
  i18n.initLanguage();
  expect(dom.window.document.title).toBe('');
  for (const displayName of ['Chat On Venice (dev)', 'Chat On Venice'] as const) {
    applyAppBrand(displayName);
    i18n.setLanguage(language);
    expect(dom.window.document.title).toBe(displayName);
    expect(dom.window.document.querySelector('.sidebar-brand strong')?.textContent).toBe(displayName);
    expect(dom.window.document.querySelector('.chat-head .title')?.textContent).toContain(displayName);
    const texts = await import('../src/renderer/main-texts.js');
    expect(texts.mainTexts()[displayName]).toBe(displayName);
  }
});

it('registers dev/prod display names in the native contract and both required catalogs', () => {
  for (const key of ['Chat On Venice (dev)', 'Chat On Venice'] as const) {
    expect(MAIN_TEXTS).toContain(key);
    for (const language of ['en', 'ja']) {
      expect(JSON.parse(read(`src/renderer/locales/${language}.json`))[key]).toBe(key);
    }
  }
});

it('preserves all twelve upstream locales and 2.1.55 keys without spreading dev names', () => {
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

it.each([false, true])('main selects the packaged=%s name for native About, window and IPC', async packaged => {
  native.app.isPackaged = packaged;
  const otherMenu = { label: 'File' }, quit = { role: 'quit' };
  native.Menu.getApplicationMenu.mockReturnValue({ items: [{ label: 'Electron', submenu: { items: [{ role: 'about' }, quit] } }, otherMenu] });
  const { appBrand, refreshNativeBrand } = await import('../src/main/app-brand.js');
  const displayName = packaged ? 'Chat On Venice' : name;
  expect(appBrand).toEqual({ development: !packaged, displayName });
  const window = { isDestroyed: () => false, setTitle: vi.fn() };
  refreshNativeBrand(window as never);
  expect(native.app.setAboutPanelOptions).toHaveBeenCalledWith({ applicationName: displayName, applicationVersion: '2.1.55',
    ...(!packaged ? {iconPath: '/app/artwork/app-icon-source.png'} : {}) });
  expect(window.setTitle).toHaveBeenCalledWith(displayName);
  expect(native.app.setName).not.toHaveBeenCalled();
  if (!packaged && process.platform === 'darwin') {
    expect(native.Menu.setApplicationMenu).toHaveBeenCalledWith({ items: [
      { label: 'Electron', submenu: { items: [{ role: 'about', label: 'About Chat On Venice (dev)' }, quit] } }, otherMenu
    ] });
  } else expect(native.Menu.setApplicationMenu).not.toHaveBeenCalled();
  const source = read('src/main/index.ts');
  expect(source).toContain('title: mainText(appBrand.displayName)');
  expect(source).toContain('tray.setToolTip(mainText(appBrand.displayName))');
  expect(read('src/main/ipc.ts')).toContain('displayName: appBrand.displayName');
  expect(read('src/renderer/main.ts')).toContain('if (next.displayName) applyAppBrand(next.displayName)');
  expect(source).toContain('onMainTextsChange(() => refreshNativeBrand(window))');
});

it('logs real before/after userData and the native tooltip getter capability', () => {
  const source = read('src/main/index.ts');
  expect(source.indexOf('branding: userData before=')).toBeLessThan(source.indexOf('  refreshNativeBrand(window);'));
  expect(source.indexOf('branding: userData after=')).toBeGreaterThan(source.indexOf('  refreshNativeBrand(window);'));
  expect(source).toContain("unchanged=${userData === app.getPath('userData')}");
  expect(source).toContain("JSON.stringify(getToolTip.call(tray)) : 'unavailable'");
  expect(source).toContain('configured=${JSON.stringify(mainText(appBrand.displayName))}');
});

it('loads the generated dedicated macOS tray file and marks the NativeImage as a template', () => {
  const source = read('src/main/index.ts');
  const image = { setTemplateImage: vi.fn() };
  const createFromPath = vi.fn(() => image);
  const trayFunction = source.slice(source.indexOf('function trayIcon('), source.indexOf('\nfunction refreshTray('));
  const script = transformSync(trayFunction, { loader: 'ts' }).code;
  expect(vm.runInNewContext(`${script}\ntrayIcon(false)`, {
    appBrand: { development: true }, process: { platform: 'darwin' }, path,
    app: { getAppPath: () => '/checkout' }, nativeImage: { createFromPath }
  })).toBe(image);
  expect(createFromPath).toHaveBeenCalledWith('/checkout/artwork/trayTemplate.png');
  expect(image.setTemplateImage).toHaveBeenCalledWith(true);
  expect(source).toContain('tray = new Tray(initialTrayImage, ...trayGuidArgsForPlatform())');
  expect(source).toContain('template=${initialTrayImage.isTemplateImage()}');
});

it('keeps profile/package identities independent of display branding', () => {
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.name).toBe('chat-on-steroids');
  expect(pkg.productName).toBeUndefined();
  const builder = loadYaml(read('electron-builder.yml')) as Record<string, unknown>;
  expect(builder.appId).toBe('com.chatonsteroids.app');
  expect(builder.productName).toBe('Chat On Steroids');
  const source = ['src/main/app-brand.ts', 'src/main/index.ts'].map(read).join('\n').replace(/\/\/[^\n]*/g, '');
  expect(source).not.toMatch(/app\.setName\s*\(|app\.setPath\s*\(|app\.name\s*=/);
  expect(read('src/renderer/index.html')).not.toContain('(dev)');
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
