import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { load as loadYaml } from 'js-yaml';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { APP_DISPLAY_NAME } from '../src/shared/app-brand-name.js';
import { MAIN_TEXTS } from '../src/shared/main-texts.js';

const name = `${APP_DISPLAY_NAME} (dev)` as const;
const about = `About ${APP_DISPLAY_NAME} (dev)` as const;
const native = vi.hoisted(() => ({
  app: { isPackaged: false, setAboutPanelOptions: vi.fn(), setName: vi.fn(), getVersion: () => '2.1.55', getAppPath: () => '/app' },
  Menu: { getApplicationMenu: vi.fn(), buildFromTemplate: vi.fn((items: unknown[]) => ({ items })), setApplicationMenu: vi.fn() }
}));
vi.mock('electron', () => native);
const read = (file: string) => readFileSync(file, 'utf8');
let dom: JSDOM;
const resourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.app.isPackaged = false;
  vi.stubEnv('COS_DEV_BRAND', '');
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: '/resources' });
  dom = new JSDOM(read('src/renderer/index.html'), { url: 'https://local.test/' });
  for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement'] as const) {
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  }
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs(); dom.window.close();
  if (resourcesPathDescriptor) Object.defineProperty(process, 'resourcesPath', resourcesPathDescriptor);
  else Reflect.deleteProperty(process, 'resourcesPath');
});

it.each(['en', 'ja', 'de', 'es', 'fr', 'ko', 'pt-BR', 'pt-PT', 'ru', 'tr', 'vi', 'zh-CN', 'zh-TW'] as const)('binds both main-selected names through %s localization', async language => {
  const i18n = await import('../src/renderer/i18n.js');
  const { applyAppBrand } = await import('../src/renderer/app-brand.js');
  i18n.initLanguage();
  expect(dom.window.document.title).toBe('');
  for (const displayName of [name, APP_DISPLAY_NAME] as const) {
    applyAppBrand(displayName);
    i18n.setLanguage(language);
    expect(dom.window.document.title).toBe(displayName);
    expect(dom.window.document.querySelector('.sidebar-brand strong')?.textContent).toBe(displayName);
    expect(dom.window.document.querySelector('.chat-head .title')?.textContent).toContain(displayName);
    const texts = await import('../src/renderer/main-texts.js');
    expect(texts.mainTexts()[displayName]).toBe(displayName);
    expect(texts.mainTexts()[about]).toBe(language === 'ja' ? `${name}について` : about);
  }
});

it('registers dev/prod display names in the native contract and both required catalogs', () => {
  for (const key of [name, APP_DISPLAY_NAME] as const) {
    expect(MAIN_TEXTS).toContain(key);
    for (const language of ['en', 'ja']) {
      expect(JSON.parse(read(`src/renderer/locales/${language}.json`))[key]).toBe(key);
    }
  }
});

it.each([
  { packaged: false, override: '', development: true },
  { packaged: true, override: '', development: false },
  { packaged: true, override: '1', development: true },
  { packaged: true, override: '0', development: false }
])('main selects packaged=$packaged override=$override for native About, window and IPC', async ({ packaged, override, development }) => {
  native.app.isPackaged = packaged;
  vi.stubEnv('COS_DEV_BRAND', override);
  const otherMenu = { label: 'File' }, quit = { role: 'quit' };
  native.Menu.getApplicationMenu.mockReturnValue({ items: [{ label: 'Electron', submenu: { items: [{ role: 'about' }, quit] } }, otherMenu] });
  const { appBrand, appBrandAssetPath, refreshNativeBrand } = await import('../src/main/app-brand.js');
  const displayName = development ? name : APP_DISPLAY_NAME;
  expect(appBrand).toEqual({ development, displayName });
  expect(appBrandAssetPath('icons/trayTemplate.png')).toBe(path.join(packaged ? '/resources' : '/app/build', 'icons/trayTemplate.png'));
  const window = { isDestroyed: () => false, setTitle: vi.fn() };
  refreshNativeBrand(window as never);
  expect(native.app.setAboutPanelOptions).toHaveBeenCalledWith({ applicationName: displayName, applicationVersion: '2.1.55',
    ...(development ? {iconPath: path.join(packaged ? '/resources' : '/app/build', 'runtime-icon.png')} : {}) });
  expect(window.setTitle).toHaveBeenCalledWith(displayName);
  expect(native.app.setName).not.toHaveBeenCalled();
  if (development && process.platform === 'darwin') {
    expect(native.Menu.setApplicationMenu).toHaveBeenCalledWith({ items: [
      { label: 'Electron', submenu: { items: [{ role: 'about', label: about }, quit] } }, otherMenu
    ] });
  } else expect(native.Menu.setApplicationMenu).not.toHaveBeenCalled();
  const source = read('src/main/index.ts');
  expect(source).toContain('title: mainText(appBrand.displayName)');
  expect(source).toContain('tray.setToolTip(mainText(appBrand.displayName))');
  expect(read('src/main/ipc.ts')).toContain('displayName: appBrand.displayName');
  expect(read('src/renderer/main.ts')).toContain('if (next.displayName) applyAppBrand(next.displayName)');
  expect(source).toContain('onMainTextsChange(() => refreshNativeBrand(window))');
});

it('keeps userData and configured-tooltip evidence in a single opt-in diagnostic', () => {
  const source = read('src/main/index.ts');
  expect(source.match(/logInfo\(`branding:/g)).toHaveLength(1);
  expect(source).toContain("userDataBefore: userData, userDataAfter: app.getPath('userData')");
  expect(source).toContain('configuredTooltip: mainText(appBrand.displayName)');
  expect(source).not.toContain('getToolTip');
  expect(source.indexOf('  refreshNativeBrand(window);')).toBeLessThan(source.indexOf('branding: tray diagnostics='));
});

it('loads the generated dedicated macOS tray file and marks the NativeImage as a template', () => {
  const source = read('src/main/index.ts');
  const image = { setTemplateImage: vi.fn(), addRepresentation: vi.fn() };
  const createFromBuffer = vi.fn(() => image);
  const one = Buffer.from('one'), two = Buffer.from('two');
  const readFileSync = vi.fn((file: string) => file.endsWith('@2x.png') ? two : one);
  const trayFunction = source.slice(source.indexOf('function trayIcon('), source.indexOf('\nfunction refreshTray('));
  const script = transformSync(trayFunction, { loader: 'ts' }).code;
  expect(vm.runInNewContext(`${script}\ntrayIcon(false)`, {
    appBrand: { development: true }, process: { platform: 'darwin' }, path,
    appBrandAssetPath: (name: string) => path.join('/checkout/build', name), readFileSync, nativeImage: { createFromBuffer }
  })).toBe(image);
  expect(readFileSync.mock.calls.map(([file]) => file)).toEqual(['trayTemplate.png', 'trayTemplate@2x.png'].map(file => path.join('/checkout/build/icons', file)));
  expect(createFromBuffer).toHaveBeenCalledWith(one, { scaleFactor: 1 });
  expect(image.addRepresentation).toHaveBeenCalledWith({ scaleFactor: 2, dataURL: `data:image/png;base64,${two.toString('base64')}` });
  expect(image.setTemplateImage).toHaveBeenCalledWith(true);
  expect(source).toContain('tray = new Tray(initialTrayImage, ...trayGuidArgsForPlatform())');
  expect(source).toContain('template: initialTrayImage.isTemplateImage()');
});

it('packages the canonical tray assets and prepares them for the existing dev entry point', () => {
  const builder = loadYaml(read('electron-builder.yml')) as { extraResources: unknown[] };
  expect(builder.extraResources).toContainEqual({ from: 'build/icons', to: 'icons', filter: ['trayTemplate.png', 'trayTemplate@2x.png'] });
  expect(builder.extraResources).toContainEqual({ from: 'build/runtime-icon.png', to: 'runtime-icon.png' });
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.scripts.predev).toBe('npm run icon');
  expect(pkg.scripts.prebuild).toBe('npm run icon');
  expect(read('scripts/package.mjs')).toContain("run(node, ['scripts/make-icon.mjs'])");
});

it.each([false, true])('reports actual native image and tray state (empty/destroyed=%s)', empty => {
  const source = read('src/main/index.ts');
  const startup = source.slice(source.indexOf('  const initialTrayImage = trayIcon(false);'), source.indexOf('  onStatusChange(refreshTray);'));
  const logs: string[] = [];
  const file = '/resources/icons/trayTemplate.png';
  const createFromPath = vi.fn(() => ({ isEmpty: () => !empty }));
  class NativeTray {
    on() {}
    isDestroyed() { return empty; }
  }
  vm.runInNewContext(transformSync(`let tray;\n${startup}`, { loader: 'ts' }).code, {
    appBrand: { development: true, displayName: name }, brandDiagnosticsEnabled: true, userData: '/profile',
    process: { platform: 'darwin', resourcesPath: '/resources' },
    app: { isPackaged: true, isReady: () => true, getAppPath: () => '/resources/app.asar', getPath: () => '/profile' },
    appBrandAssetPath: () => file, existsSync: (path: string) => path === file,
    trayIcon: () => ({ isEmpty: () => empty, isTemplateImage: () => true, getSize: () => ({ width: 16, height: 16 }) }),
    Tray: NativeTray, nativeImage: { createFromPath }, trayGuidArgsForPlatform: () => [],
    windowActivation: { request: () => {} }, refreshTray: () => {}, mainText: (text: string) => text,
    logInfo: (line: string) => logs.push(line)
  });
  const prefix = 'branding: tray diagnostics=';
  expect(JSON.parse(logs.find(line => line.startsWith(prefix))!.slice(prefix.length))).toEqual({
    userDataBefore: '/profile', userDataAfter: '/profile',
    imagePath: file, exists: true, fromPathEmpty: !empty, imageEmpty: empty, template: true,
    imageSize: { width: 16, height: 16 }, trayCreated: true, trayDestroyed: empty,
    ready: true, packaged: true, resourcesPath: '/resources', appPath: '/resources/app.asar', configuredTooltip: name
  });
  expect(logs).toHaveLength(1);
  expect(createFromPath).toHaveBeenCalledWith(file);
});

it.each([
  { development: false, flag: '', enabled: false },
  { development: false, flag: '1', enabled: false },
  { development: true, flag: '', enabled: false },
  { development: true, flag: '0', enabled: false },
  { development: true, flag: '1', enabled: true }
])('gates native diagnostics for development=$development flag=$flag', ({ development, flag, enabled }) => {
  const source = read('src/main/index.ts');
  const declaration = source.match(/^const brandDiagnosticsEnabled = .*;$/m)![0];
  const actual = vm.runInNewContext(`${declaration}\nbrandDiagnosticsEnabled`, {
    appBrand: { development }, process: { env: { COS_TRAY_DIAGNOSTICS: flag } }
  });
  expect(actual).toBe(enabled);
  if (enabled) return;
  const startup = source.slice(source.indexOf('  const initialTrayImage = trayIcon(false);'), source.indexOf('  onStatusChange(refreshTray);'));
  const createFromPath = vi.fn(), logInfo = vi.fn();
  vm.runInNewContext(transformSync(`let tray;\n${startup}`, { loader: 'ts' }).code, {
    brandDiagnosticsEnabled: actual, process: { platform: 'darwin' },
    trayIcon: () => ({}), Tray: class { on() {} }, trayGuidArgsForPlatform: () => [],
    windowActivation: { request: () => {} }, refreshTray: () => {},
    nativeImage: { createFromPath }, logInfo
  });
  expect(logInfo).not.toHaveBeenCalled();
  expect(createFromPath).not.toHaveBeenCalled();
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
    expect(mark.querySelector(selector)?.getAttribute('transform')).toBe(svg.querySelector(selector)?.getAttribute('transform'));
  }
  expect(svg.querySelector('path')?.getAttribute('transform')).toBe('translate(-2 -1)');
  expect(svg.querySelector('rect')?.getAttribute('fill')).toBe('#123e42');
  expect(svg.querySelector('path')?.getAttribute('fill')).toBe('#ffffff');
  expect(read('scripts/make-icon.mjs')).toContain('const INK = [18, 62, 66]');
  expect(read('scripts/make-icon.mjs')).toContain('const PAPER = [255, 255, 255]');
});
