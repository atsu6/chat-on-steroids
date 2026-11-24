// Optional host render check, like venice-panel.visual.cjs. All requests are fulfilled locally or aborted.
// Uses installed Playwright/Chrome, synthetic model replies and the shipped bridge; no Venice sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const {worker} = require('./venice-bridge-harness.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const output = path.join(root, 'outputs/venice-apply-patch');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const cleanups = [];
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, colorScheme: 'light', serviceWorkers: 'block'});
    const page = await context.newPage(), appPage = await context.newPage(), errors = [];
    for (const tab of [page, appPage]) tab.on('pageerror', error => errors.push(error.message));
    const diff = '--- "/synthetic/note.txt"\n+++ "/synthetic/note.txt"\n@@ -1,1 +1,30 @@\n-old\n' +
      Array.from({length: 30}, (_, n) => `+line ${n} <img src=x>`).join('\n');
    const pending = {id: 'synthetic-approval', sessionId: 'local-session', sessionTitle: 'Synthetic patch owner', project: null,
      tab: {id: 1, url: 'https://venice.ai/chat/synthetic'}, instructionSummary: 'Synthetic patch, no Venice transmission', tools: ['core/read'], roots: []};
    let grantFinish, applyFinish, observeApplication, applications = 0, modelTurns = 0;
    const applicationReady = new Promise(resolve => { observeApplication = resolve; });
    const h = worker({after: fn => cleanups.push(fn)}, {localTransport: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === '/venice/grant/request') {
        const reply = new Promise(resolve => { grantFinish = resolve; });
        await appPage.evaluate(value => window.publishSyntheticApproval([value]), pending);
        return await reply;
      }
      if (url.startsWith('/venice/grant/')) return {ok: true, data: {revoked: true}};
      if (body.preview) return {ok: true, data: {diff}};
      assert.equal(await page.locator('#cos-venice-panel .patch-preview details pre').textContent(), diff);
      assert.equal(await page.locator('#cos-venice-panel .patch-preview img').count(), 0);
      applications++; observeApplication();
      await new Promise(resolve => { applyFinish = resolve; });
      return {ok: true, data: {callId: body.request.callId, state: 'completed', result: {content: [{type: 'text', text: 'Synthetic patch applied'}]}}};
    }});
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === 'https://venice.ai/synthetic-patch') return route.fulfill({contentType: 'text/html; charset=utf-8', body:
        '<!doctype html><html lang="ja"><title>Patch preview check</title><style>body{margin:0;background:#f4f4f5;font:16px system-ui}textarea,button{background:magenta!important;font-size:40px!important}</style><main style="padding:48px"><h1>Chat On Venice</h1><p>合成確認 · 外部通信なし</p></main></html>'});
      if (url === 'https://local.test/approval') return route.fulfill({contentType: 'text/html; charset=utf-8', body:
        read('src/renderer/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, '')});
      if (url === 'https://venice.ai/synthetic-rpc') {
        const reply = await h.send(route.request().postDataJSON());
        return route.fulfill({contentType: 'application/json', body: JSON.stringify(reply)});
      }
      return route.abort();
    });
    await appPage.goto('https://local.test/approval');
    await appPage.addStyleTag({path: path.join(root, 'src/renderer/styles.css')});
    const bundle = await esbuild.build({entryPoints: [path.join(root, 'src/renderer/i18n.ts')], bundle: true, write: false, format: 'iife', globalName: 'approvalLanguage'});
    await appPage.addScriptTag({content: bundle.outputFiles[0].text});
    await appPage.exposeFunction('answerSyntheticApproval', async (id, allow, write) => {
      assert.equal(id, pending.id); assert.equal(allow, true); assert.equal(write, true);
      grantFinish({ok: true, data: {runId: 'synthetic-write-run'}});
      await appPage.evaluate(() => window.publishSyntheticApproval([]));
      return {ok: true};
    });
    await appPage.evaluate(value => {
      approvalLanguage.initLanguage(); approvalLanguage.setLanguage('ja');
      window.api = {
        onVeniceGrantPending: fn => { window.publishSyntheticApproval = fn; }, veniceGrantPending: async () => ({ok: true, data: []}),
        veniceGrantPick: async () => ({ok: true, data: [{...value, roots: ['/synthetic/root']}]}),
        veniceGrantAnswer: (id, allow, write = false) => window.answerSyntheticApproval(id, allow, write)
      };
    }, pending);
    const chat = read('src/renderer/chat.ts'), start = chat.indexOf('export function initVeniceGrantDialog()');
    const code = stripTypeScriptTypes(chat.slice(start, chat.indexOf('export function initChat(', start)).replace('export function', 'function'));
    await appPage.addScriptTag({content: 'const api=window.api;' + code + ';initVeniceGrantDialog();'});
    await page.goto('https://venice.ai/synthetic-patch');
    await page.exposeFunction('syntheticModelTurn', () => {
      modelTurns++;
      return JSON.stringify(modelTurns === 1 ? {action: 'tool', name: 'core/apply_patch', args: {patch: '*** Begin Patch\n*** Add File: /synthetic/note.txt\n+new\n*** End Patch'}} : {action: 'done', summary: '合成パッチ確認が完了しました。'});
    });
    await page.evaluate(() => { window.__cosVeniceSend = {sendViaUi: () => window.syntheticModelTurn()}; });
    await page.addScriptTag({path: path.join(root, 'extension/venice-agent.js')});
    const cdp = await context.newCDPSession(page), {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'patch-render-check'});
    const catalog = JSON.parse(read('extension/_locales/ja/messages.json'));
    const injection = await cdp.send('Runtime.evaluate', {contextId: executionContextId, expression:
      `const catalog=${JSON.stringify(catalog)}; const chrome={i18n:{getMessage:key=>catalog[key]?.message??''},runtime:{sendMessage:async message=>(await fetch('https://venice.ai/synthetic-rpc',{method:'POST',body:JSON.stringify(message)})).json()}};\n` +
      read('extension/venice-bridge.js') + '\n' + read('extension/venice-panel.js')});
    assert.equal(injection.exceptionDetails, undefined);
    const panel = page.locator('#cos-venice-panel');
    await panel.locator('#state').filter({hasText: '待機中'}).waitFor();
    await panel.getByLabel('指示', {exact: true}).fill('パッチ差分を表示して適用する（合成確認）');
    await panel.getByRole('button', {name: '実行', exact: true}).click();
    await appPage.locator('#veniceGrantDialog').waitFor();
    assert.equal(modelTurns, 0); assert.equal(await appPage.locator('#veniceGrantWrite').isChecked(), false);
    assert.equal(await appPage.locator('#veniceGrantAllow').isDisabled(), true);
    await appPage.locator('#veniceGrantPick').click();
    await appPage.getByLabel('書き込みも許可する', {exact: true}).check();
    await appPage.screenshot({path: path.join(output, 'write-approval-ja.png')});
    await appPage.evaluate(() => approvalLanguage.setLanguage('de'));
    assert.equal(await appPage.locator('#veniceGrantWrite').isChecked(), true);
    assert.equal(await appPage.getByLabel('Auch Schreiben erlauben', {exact: true}).count(), 1);
    await appPage.setViewportSize({width: 390, height: 844});
    await appPage.screenshot({path: path.join(output, 'write-approval-de-mobile.png')});
    await appPage.locator('#veniceGrantAllow').click();
    await page.waitForFunction(() => document.getElementById('cos-venice-panel').shadowRoot.querySelector('.patch-preview'));
    await applicationReady;
    assert.equal(applications, 1); assert.equal(modelTurns, 1);
    const details = panel.locator('.patch-preview details');
    assert.equal(await details.evaluate(node => node.open), false);
    assert.equal(await details.locator('pre').textContent(), diff);
    assert.equal(await panel.locator('.patch-preview > pre').evaluate(node => node.textContent.length < 1200), true);
    await page.screenshot({path: path.join(output, 'patch-preview-desktop.png')});
    await page.setViewportSize({width: 390, height: 844}); await page.emulateMedia({colorScheme: 'dark'});
    await details.locator('summary').click(); assert.equal(await details.evaluate(node => node.open), true);
    const bounds = await panel.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({path: path.join(output, 'patch-preview-mobile-expanded.png')});
    await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    assert.deepEqual(await page.evaluate(async () => (await axe.run(document.getElementById('cos-venice-panel'))).violations.map(item => item.id)), []);
    applyFinish(); await panel.locator('#state').filter({hasText: '完了'}).waitFor();
    assert.equal(applications, 1); assert.equal(modelTurns, 2); assert.deepEqual(errors, []);
    console.log('Passed: explicit write approval, read-only default, i18n ja/de, real MAIN/ISOLATED bridge, preview before apply, collapsed/full safe diff, desktop/mobile, axe, no network forwarding.');
    console.log('Screenshots: ' + output);
  } finally { for (const close of cleanups) close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
