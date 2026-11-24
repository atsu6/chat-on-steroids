// Optional render check. Shipped MAIN/ISOLATED code and real i18n, entirely synthetic replies.
// Every browser request is fulfilled locally or aborted; no Venice transmission or real commands.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {stripTypeScriptTypes} = require('node:module');
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const {worker} = require('./venice-bridge-harness.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/venice-exec');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const cleanups = [];
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 1000}, colorScheme: 'light', serviceWorkers: 'block'});
    const page = await context.newPage(), app = await context.newPage(), errors = [];
    for (const tab of [page, app]) tab.on('pageerror', error => errors.push(error.message));
    const pending = {id: 'synthetic-exec-approval', sessionId: 'local-session', sessionTitle: 'Synthetic exec owner', project: null,
      tab: {id: 1, url: 'https://venice.ai/chat/synthetic'}, instructionSummary: 'Synthetic command output; no Venice transmission', tools: ['core/read'], roots: []};
    let grantFinish, execFinish, callId, executions = 0, modelTurns = 0, polls = 0, revoked = false;
    const snapshot = () => ({callId, processId: 1234, exitCode: null, running: true, stdout:
      'src/example.ts:12: updated\nline two: <img src=x onerror=alert(1)>\n' + 'long output '.repeat(40) + '\nnext line\n',
      stderr: 'warning: synthetic stderr\nsecond diagnostic\n', truncated: true, omittedBytes: 1024});
    const h = worker({after: fn => cleanups.push(fn)}, {localTransport: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === '/venice/grant/request') {
        const reply = new Promise(resolve => { grantFinish = resolve; });
        await app.evaluate(value => window.publishSyntheticApproval([value]), pending); return await reply;
      }
      if (url.startsWith('/venice/grant/')) { if (executions && url.endsWith('/revoke')) revoked = true; return {ok: true, data: {revoked: true}}; }
      if (body.output) { assert.equal(body.request.callId, callId); polls++; return {ok: true, data: {output: snapshot()}}; }
      callId = body.request.callId; executions++; await new Promise(resolve => { execFinish = resolve; });
      return {ok: true, data: {callId, state: 'completed', result: {content: [{type: 'text', text: 'Synthetic process yielded'}], structuredContent: snapshot()}}};
    }});
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url === 'https://venice.ai/synthetic-exec') return route.fulfill({contentType: 'text/html; charset=utf-8', body:
        '<!doctype html><html lang="ja"><title>Exec render check</title><style>body{margin:0;background:#f4f4f5;font:16px system-ui}textarea,button{background:magenta!important;font-size:40px!important}</style><main style="padding:48px"><h1>Chat On Venice</h1><p>合成確認 · 外部通信なし</p></main></html>'});
      if (url === 'https://local.test/approval') return route.fulfill({contentType: 'text/html; charset=utf-8', body:
        read('src/renderer/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, '')});
      if (url === 'https://venice.ai/synthetic-rpc') return route.fulfill({contentType: 'application/json', body: JSON.stringify(await h.send(route.request().postDataJSON()))});
      return route.abort();
    });
    await app.goto('https://local.test/approval'); await app.addStyleTag({path: path.join(root, 'src/renderer/styles.css')});
    const bundle = await esbuild.build({entryPoints: [path.join(root, 'src/renderer/i18n.ts')], bundle: true, write: false, format: 'iife', globalName: 'approvalLanguage'});
    await app.addScriptTag({content: bundle.outputFiles[0].text});
    await app.exposeFunction('answerSyntheticApproval', async (id, allow, write, shell) => {
      assert.equal(id, pending.id); assert.equal(allow, true); assert.equal(write, false); assert.equal(shell, true);
      grantFinish({ok: true, data: {runId: 'synthetic-shell-run'}}); await app.evaluate(() => window.publishSyntheticApproval([])); return {ok: true};
    });
    await app.evaluate(value => {
      approvalLanguage.initLanguage(); approvalLanguage.setLanguage('ja');
      window.api = { onVeniceGrantPending: fn => { window.publishSyntheticApproval = fn; }, veniceGrantPending: async () => ({ok: true, data: []}),
        veniceGrantPick: async () => ({ok: true, data: [{...value, roots: ['/synthetic/root']}]}),
        veniceGrantAnswer: (id, allow, write = false, shell = false) => window.answerSyntheticApproval(id, allow, write, shell) };
    }, pending);
    const chat = read('src/renderer/chat.ts'), start = chat.indexOf('export function initVeniceGrantDialog()');
    const code = stripTypeScriptTypes(chat.slice(start, chat.indexOf('export function initChat(', start)).replace('export function', 'function'));
    await app.addScriptTag({content: 'const api=window.api;' + code + ';initVeniceGrantDialog();'});
    await page.goto('https://venice.ai/synthetic-exec');
    await page.exposeFunction('syntheticModelTurn', () => {
      modelTurns++; return JSON.stringify(modelTurns === 1 ? {action: 'tool', name: 'core/exec_command', args: {cmd: 'echo synthetic', yield_time_ms: 250}} : {action: 'done', summary: '合成出力確認が完了しました。'});
    });
    await page.evaluate(() => { window.__cosVeniceSend = {sendViaUi: () => window.syntheticModelTurn()}; });
    await page.addScriptTag({path: path.join(root, 'extension/venice-agent.js')});
    const cdp = await context.newCDPSession(page), {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'exec-render-check'});
    const catalog = JSON.parse(read('extension/_locales/ja/messages.json'));
    const injection = await cdp.send('Runtime.evaluate', {contextId: executionContextId, expression:
      `const catalog=${JSON.stringify(catalog)}; const chrome={i18n:{getMessage:key=>catalog[key]?.message??''},runtime:{sendMessage:async message=>(await fetch('https://venice.ai/synthetic-rpc',{method:'POST',body:JSON.stringify(message)})).json()}};\n` + read('extension/venice-bridge.js') + '\n' + read('extension/venice-panel.js')});
    assert.equal(injection.exceptionDetails, undefined);
    const panel = page.locator('#cos-venice-panel'); await panel.locator('#state').filter({hasText: '待機中'}).waitFor();
    await panel.getByLabel('指示', {exact: true}).fill('コマンドの出力を確認する（合成確認）'); await panel.getByRole('button', {name: '実行', exact: true}).click();
    await app.locator('#veniceGrantDialog').waitFor(); assert.equal(modelTurns, 0);
    for (const id of ['veniceGrantWrite', 'veniceGrantShell']) assert.equal(await app.locator('#' + id).isChecked(), false);
    assert.equal(await app.locator('#veniceGrantAllow').isDisabled(), true);
    await app.locator('#veniceGrantPick').click(); await app.getByLabel('コマンドの実行も許可する', {exact: true}).check();
    assert.equal(await app.locator('#veniceGrantWrite').isChecked(), false);
    assert.equal(await app.locator('#veniceGrantShellWarning').textContent(), 'あなたの権限でコマンドを実行できます。選択したフォルダー内に隔離されず、その外のファイルやネットワークにもアクセスできます。');
    await app.screenshot({path: path.join(output, 'shell-approval-ja.png')});
    await app.evaluate(() => approvalLanguage.setLanguage('de')); await app.setViewportSize({width: 390, height: 844});
    assert.equal(await app.getByLabel('Auch das Ausführen von Befehlen erlauben', {exact: true}).count(), 1);
    assert.equal(await app.locator('#veniceGrantShell').isChecked(), true);
    await app.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    assert.equal(await app.locator('dialog[open]').count(), 1);
    const approvalBounds = await app.locator('#veniceGrantDialog').boundingBox();
    assert.ok(approvalBounds.x >= 0 && approvalBounds.x + approvalBounds.width <= 390 && approvalBounds.y >= 0 && approvalBounds.y + approvalBounds.height <= 844);
    await app.screenshot({path: path.join(output, 'shell-approval-de-mobile.png')});
    await app.locator('#veniceGrantAllow').click();
    await panel.locator('.exec-output [data-stream=stdout]').waitFor(); assert.equal(executions, 1); assert.equal(modelTurns, 1);
    assert.match(await panel.locator('[data-stream=stdout]').textContent(), /line two: <img/); assert.equal(await panel.locator('img').count(), 0);
    assert.equal(await panel.locator('[data-stream=stderr]').textContent(), snapshot().stderr);
    assert.match(await panel.locator('.exec-notice').textContent(), /省略/);
    assert.equal(await panel.locator('[data-stream=stdout]').evaluate(node => getComputedStyle(node).whiteSpace), 'pre');
    assert.equal(await panel.locator('[data-stream=stdout]').evaluate(node => node.scrollWidth > node.clientWidth), true);
    await panel.locator('[data-stream=stdout]').focus(); await page.keyboard.press('ArrowRight');
    await page.screenshot({path: path.join(output, 'exec-output-desktop.png')});
    await page.setViewportSize({width: 390, height: 844}); await page.emulateMedia({colorScheme: 'dark'});
    const bounds = await panel.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({path: path.join(output, 'exec-output-mobile-dark.png')});
    await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    assert.deepEqual(await page.evaluate(async () => (await axe.run(document.getElementById('cos-venice-panel'))).violations.map(item => item.id)), []);
    execFinish(); await panel.locator('#state').filter({hasText: '完了'}).waitFor();
    const before = polls; await page.waitForTimeout(600); assert.ok(polls > before); // A yielded command continues to stream after the model finishes.
    await panel.getByRole('button', {name: '停止', exact: true}).click(); await panel.locator('#state').filter({hasText: '失効済み'}).waitFor();
    assert.equal(revoked, true); assert.equal(executions, 1); assert.equal(modelTurns, 2); assert.deepEqual(errors, []);
    console.log('Passed: separate default-OFF shell consent, verbatim warning, ja/de i18n, MAIN/ISOLATED streaming, stdout/stderr, safe text, horizontal scroll, truncation, yielded process, Stop/revoke, desktop/mobile, axe; zero external sends.');
    console.log('Screenshots: ' + output);
  } finally { for (const close of cleanups) close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
