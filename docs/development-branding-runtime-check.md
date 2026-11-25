# 実Electronでdev表示名を再確認する

フォークのdevビルドを、検証用stateで開き、nativeウィンドウタイトル・rendererのtitle・可視ヘッダを確認する。名前をfixture側で合成せず、実mainのapp-brandモジュールの値をビルド済みpreload／rendererへ渡す。

## 前提

- 対象は`codex/venice-foundation-and-branding`の2.1.55ベース。作業ルートは`/Users/atsu/chat-on-venice`。
- Node 22.23.5／Voltaと、lockfileに対応する依存関係が導入済みであること。新規checkoutで依存関係がなければ最初に`volta run --node 22.23.5 npm ci`を実行する。
- macOSのGUIセッションで実行する。通常のCoSや開発アプリの終了・再起動、Veniceへの送信は不要。
- 下のソースは、f8a37860の画面検証で成功した手動harnessの保存版。アプリやテストのソースを変更する手順ではない。

## 実行

`outputs/`はGit対象外なので、別のcheckoutではこの文書からharnessを復元する。次のブロックを作業ルートで実行する。

```sh
cd /Users/atsu/chat-on-venice
volta run --node 22.23.5 npm run build
python3 - <<'PY'
from pathlib import Path
text = Path('docs/development-branding-runtime-check.md').read_text()
source = text.split('<!-- electron-title-source:start -->\n' + '```javascript\n', 1)[1].split('\n' + '```\n<!-- electron-title-source:end -->', 1)[0]
output = Path('outputs/dev-name-state-verification')
output.mkdir(parents=True, exist_ok=True)
(output / 'electron-title.cjs').write_text(source + '\n')
PY
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron outputs/dev-name-state-verification/electron-title.cjs
```

約20秒後に検証用ウィンドウだけが閉じる。userDataは`outputs/dev-name-state-verification/electron-runtime`へ隔離し、HTTP(S)を遮断する。実際のプロジェクト・チャット・アカウントを入力しない。

## 成功の判定と成果物

- 終了コード0。nativeWindowTitle／rendererTitle／headerがすべてdev表示名になり、errorsが空配列になる。基底名はdev接尾辞なし、developmentはtrue、isPackagedはfalse。
- 画面を描画し、チャットへ戻って可視ヘッダを確認した後、`electron-title.png`と`electron-title.json`を同じ出力先へ保存する。nativeタイトルはJSON、実renderer画面はPNGで確認できる。
- 名前・描画・APIのassertが失敗した場合は終了コード1。assertを緩めず、ログとビルド対象を確認する。これは手動の実Electron確認で、npm test／CIの自動収集対象ではない。

## 保存したharnessソース

<!-- electron-title-source:start -->
```javascript
const {app, BrowserWindow, ipcMain, session} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const output = __dirname;
app.setPath('userData', path.join(output, 'electron-runtime'));
app.whenReady().then(async () => {
  const {buildSync} = require('esbuild');
  const bundle = path.join(output, 'real-main-brand.cjs');
  buildSync({stdin: {contents: "export {appBrand} from './src/main/app-brand.ts'; export {mainText, setMainTextTranslations} from './src/main/main-texts.ts'; export {APP_DISPLAY_NAME} from './src/shared/app-brand-name.ts';", resolveDir: root}, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external'});
  const brand = require(bundle);
  assert.equal(app.isPackaged, false);
  assert.equal(brand.APP_DISPLAY_NAME, 'Chat On Venice');
  assert.equal(brand.appBrand.development, true);
  assert.equal(brand.appBrand.displayName, 'Chat On Venice (dev)');
  const config = require(path.join(root, 'scripts/fixtures/app-defaults.cjs')).defaultConfig();
  config.ui = {...config.ui, theme: 'dark', autoConnect: false, lastSeenVersion: '2.1.55'};
  const state = {config, displayName: brand.appBrand.displayName, hasApiKey: false, hasGoalKey: false, resolvedBinary: null,
    status: {state: 'disconnected', surfaces: []}, bridge: {running: false, paired: false, present: false},
    update: {current: '2.1.55', latest: null, stage: 'idle'}};
  const arrays = new Set(['log:get', 'projects:list', 'sessions:outbox', 'sessions:pausedHelpers', 'sessions:runningTools']);
  const preload = path.join(root, 'out/preload/index.js');
  const channels = new Set([...fs.readFileSync(preload, 'utf8').matchAll(/\bcall\(\s*["']([^"']+)["']/g)].map(x => x[1]));
  for (const channel of channels) ipcMain.handle(channel, (_event, payload) => {
    let data = null;
    if (channel === 'state:get') data = state;
    else if (arrays.has(channel)) data = [];
    else if (channel === 'sessions:list') data = {sessions: [], total: 0, nextCursor: null, activeId: null, pressure: [], blocked: []};
    else if (channel === 'swarm:get') data = {running: false, agents: [], pendingReports: 0};
    else if (channel === 'chatModels:get') data = {state: 'unknown', models: []};
    else if (channel === 'ui:mainTexts') brand.setMainTextTranslations(payload);
    return {ok: true, data};
  });
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({cancel: /^https?:/.test(details.url)}));
  const errors = [];
  const win = new BrowserWindow({show: true, width: 1180, height: 820, title: brand.mainText(brand.appBrand.displayName),
    backgroundColor: '#171719', webPreferences: {preload, sandbox: true, contextIsolation: true, nodeIntegration: false}});
  win.webContents.on('console-message', details => {if (details.level === 'error') errors.push(details.message);});
  await win.loadFile(path.join(root, 'out/renderer/index.html'));
  const js = code => win.webContents.executeJavaScript(code);
  const until = async code => {const end = Date.now() + 15000; while (Date.now() < end) {if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 50));} throw new Error('Timeout: ' + code);};
  await until(`document.title === 'Chat On Venice (dev)' && document.querySelector('.sidebar-brand strong').textContent === document.title`);
  await until(`!document.querySelector('.projects-list')?.textContent.includes('Loading projects') && document.getAnimations().every(animation => animation.playState === 'finished')`);
  await js(`(() => {const back = document.getElementById('backToChat'); if (back.checkVisibility()) back.click();})()`);
  await until(`document.querySelector('.sidebar-brand strong').checkVisibility() && document.getAnimations().every(animation => animation.playState === 'finished')`);
  await js('document.fonts.ready');
  await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const result = {baseName: brand.APP_DISPLAY_NAME, development: brand.appBrand.development, isPackaged: app.isPackaged,
    composedName: brand.appBrand.displayName, nativeWindowTitle: win.getTitle(), rendererTitle: await js('document.title'),
    header: await js("document.querySelector('.sidebar-brand strong').textContent"), visible: win.isVisible(), errors,
    renderer: path.join(root, 'out/renderer/index.html'), preload, userData: app.getPath('userData'),
    scope: 'Real Electron BrowserWindow, real main branding module and built preload/renderer; isolated synthetic state and external network blocked'};
  assert.equal(result.nativeWindowTitle, 'Chat On Venice (dev)');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'electron-title.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'electron-title.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify(result));
  // Leave the verified native window visible briefly; do not start the development app or bridge.
  setTimeout(() => {win.destroy(); app.quit();}, 20000);
}).catch(error => {console.error(error); app.exit(1);});
```
<!-- electron-title-source:end -->
