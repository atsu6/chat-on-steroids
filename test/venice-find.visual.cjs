// Real shipped renderer, MAIN and ISOLATED code; all model/bridge replies are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const {chromium} = require('playwright'), esbuild = require('esbuild');
const {worker} = require('./venice-bridge-harness.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/venice-find');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const cleanups = [];
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 1000}, colorScheme: 'light', serviceWorkers: 'block'});
    const page = await context.newPage(), app = await context.newPage(), errors = [];
    for (const tab of [page, app]) tab.on('pageerror', error => errors.push(error.message));
    const pending = {id: 'synthetic-find-approval', sessionId: 'local-session', sessionTitle: 'Synthetic search owner', project: null,
      tab: {id: 1, url: 'https://venice.ai/chat/synthetic'}, instructionSummary: 'Synthetic search, no Venice transmission', tools: ['core/read', 'core/find'], roots: []};
    const result = {matches: [{path: '/synthetic/source.txt', line: 2, text: 'needle\0<img src=x> ' + 'long line '.repeat(30)},
      {path: '/synthetic/notes.txt', line: 7, text: 'needle second line'}], count: 2, limit: 2, truncated: true, stoppedBecause: ['limit'], binaryPolicy: 'skip'};
    let grantFinish, executions = 0, turns = 0;
    const h = worker({after: fn => cleanups.push(fn)}, {localTransport: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === '/venice/grant/request') {
        assert.deepEqual(body.tools, ['core/read', 'core/find']);
        const reply = new Promise(resolve => { grantFinish = resolve; }); await app.evaluate(value => window.publishSyntheticApproval([value]), pending); return reply;
      }
      if (url.startsWith('/venice/grant/')) return {ok: true, data: {revoked: true}};
      assert.equal(body.request.tool, 'find'); executions++;
      return {ok: true, data: {callId: body.request.callId, state: 'completed', result: {content: [{type: 'text', text: '2 matches'}], structuredContent: result}}};
    }});
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === 'https://venice.ai/synthetic-find') return route.fulfill({contentType: 'text/html; charset=utf-8', body:
        '<!doctype html><html lang="ja"><title>Find render check</title><style>body{margin:0;background:#f4f4f5;font:16px system-ui}button,textarea{background:magenta!important;font-size:40px!important}</style><main style="padding:48px"><h1>Chat On Venice</h1><p>合成検索確認 · 外部送信なし</p></main></html>'});
      if (url === 'https://local.test/approval') return route.fulfill({contentType: 'text/html; charset=utf-8', body: read('src/renderer/index.html')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, '')});
      if (url === 'https://venice.ai/synthetic-rpc') return route.fulfill({contentType: 'application/json', body: JSON.stringify(await h.send(route.request().postDataJSON()))});
      return route.abort();
    });
    await app.goto('https://local.test/approval'); await app.addStyleTag({content: read('src/renderer/styles.css')});
    const bundle = await esbuild.build({entryPoints: [path.join(root, 'src/renderer/i18n.ts')], bundle: true, write: false, format: 'iife', globalName: 'language'});
    await app.addScriptTag({content: bundle.outputFiles[0].text});
    await app.exposeFunction('approveSyntheticFind', async (id, allow, write, shell) => {
      assert.equal(id, pending.id); assert.equal(allow, true); assert.equal(write, false); assert.equal(shell, false);
      grantFinish({ok: true, data: {runId: 'synthetic-find-run'}}); await app.evaluate(() => window.publishSyntheticApproval([])); return {ok: true};
    });
    await app.evaluate(value => {
      language.initLanguage(); language.setLanguage('ja');
      window.api = {onVeniceGrantPending: fn => { window.publishSyntheticApproval = fn; }, veniceGrantPending: async () => ({ok: true, data: []}),
        veniceGrantPick: async () => ({ok: true, data: [{...value, roots: ['/synthetic/root']}]}),
        veniceGrantAnswer: (id, allow, write = false, shell = false) => window.approveSyntheticFind(id, allow, write, shell)};
    }, pending);
    const chat = read('src/renderer/chat.ts'), start = chat.indexOf('export function initVeniceGrantDialog()');
    await app.addScriptTag({content: 'const api=window.api;' + stripTypeScriptTypes(chat.slice(start, chat.indexOf('export function initChat(', start)).replace('export function', 'function')) + ';initVeniceGrantDialog();'});
    await page.goto('https://venice.ai/synthetic-find');
    await page.exposeFunction('syntheticModelTurn', () => JSON.stringify(++turns === 1 ? {action: 'tool', name: 'core/find', args: {query: 'needle', path: '/synthetic'}} : {action: 'done', summary: '合成検索が完了しました。'}));
    await page.evaluate(() => { window.__cosVeniceSend = {sendViaUi: () => window.syntheticModelTurn()}; });
    await page.addScriptTag({path: path.join(root, 'extension/venice-agent.js')});
    const cdp = await context.newCDPSession(page), {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'find-render-check'});
    const catalog = JSON.parse(read('extension/_locales/ja/messages.json'));
    const injection = await cdp.send('Runtime.evaluate', {contextId: executionContextId, expression:
      `const catalog=${JSON.stringify(catalog)}; const chrome={i18n:{getMessage:key=>catalog[key]?.message??''},runtime:{sendMessage:async message=>(await fetch('https://venice.ai/synthetic-rpc',{method:'POST',body:JSON.stringify(message)})).json()}};\n` + read('extension/venice-bridge.js') + '\n' + read('extension/venice-panel.js')});
    assert.equal(injection.exceptionDetails, undefined);
    const panel = page.locator('#cos-venice-panel'); await panel.locator('#state').filter({hasText: '待機中'}).waitFor();
    await panel.getByLabel('指示', {exact: true}).fill('ファイル内のneedleを検索する（合成確認）'); await panel.getByRole('button', {name: '実行', exact: true}).click();
    await app.locator('#veniceGrantDialog').waitFor(); assert.equal(turns, 0);
    assert.equal(await app.locator('#veniceGrantFindTools').isVisible(), true); assert.equal(await app.locator('#veniceGrantReadTools').isVisible(), false);
    assert.equal(await app.locator('#veniceGrantAllow').isDisabled(), true); await app.locator('#veniceGrantPick').click();
    for (const id of ['veniceGrantWrite', 'veniceGrantShell']) assert.equal(await app.locator('#' + id).isChecked(), false);
    await app.screenshot({path: path.join(output, 'find-approval-ja.png')});
    await app.evaluate(() => language.setLanguage('en')); assert.equal(await app.locator('#veniceGrantFindTools').textContent(), 'File reading and search (core/read, core/find)');
    await app.locator('#veniceGrantAllow').click(); await panel.locator('#state').filter({hasText: '完了'}).waitFor();
    const pre = panel.locator('.find-output pre');
    assert.equal(executions, 1); assert.equal(turns, 2); assert.equal(await pre.textContent(), result.matches.map(hit => `${hit.path}:${hit.line}: ${hit.text}`).join('\n').replace(/\0/g, ' '));
    assert.equal(await panel.locator('img').count(), 0); assert.match(await panel.locator('.find-notice').textContent(), /打ち切り/);
    assert.equal(await pre.evaluate(node => getComputedStyle(node).whiteSpace), 'pre'); assert.equal(await pre.evaluate(node => node.scrollWidth > node.clientWidth), true);
    await page.screenshot({path: path.join(output, 'find-results-desktop.png')});
    await page.setViewportSize({width: 390, height: 844}); await page.emulateMedia({colorScheme: 'dark'}); await pre.focus(); await page.keyboard.press('ArrowRight');
    const bounds = await panel.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({path: path.join(output, 'find-results-mobile-dark.png')});
    await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    assert.deepEqual(await page.evaluate(async () => (await axe.run(document.getElementById('cos-venice-panel'))).violations.map(item => item.id)), []);
    assert.deepEqual(errors, []);
    console.log('Passed: read+find approval, write/shell OFF, ja/en scope labels, MAIN/ISOLATED bridge, path/line/snippet, NUL removal, safe text, truncation, horizontal scroll, desktop/mobile and axe; zero real Venice sends.');
    console.log('Screenshots: ' + output);
  } finally { for (const close of cleanups) close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
