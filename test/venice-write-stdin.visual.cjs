// Optional render check of shipped MAIN/ISOLATED code. All requests stay synthetic/local.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const {worker} = require('./venice-bridge-harness.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/venice-write-stdin');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const cleanups = [];
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, serviceWorkers: 'block'});
    const page = await context.newPage(), errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    let execId, finished = false, turns = 0;
    const snapshot = () => ({callId: execId, processId: 1234, running: !finished, exitCode: finished ? 0 : null,
      stdout: finished ? 'ready\nreceived:hello <img src=x>\n' + 'long-line-'.repeat(70) + '\nexit\n' : 'ready\n',
      stderr: finished ? 'diagnostic\nsecond line\n' : '', truncated: false, omittedBytes: 0});
    const h = worker({after: fn => cleanups.push(fn)}, {localTransport: async (url, init) => {
      const body = JSON.parse(init.body);
      if (url === '/venice/grant/request') return {ok: true, data: {runId: 'synthetic-stdin-run'}};
      if (url.startsWith('/venice/grant/')) return {ok: true, data: {revoked: true}};
      const req = body.request;
      if (body.output) return {ok: true, data: {output: snapshot()}};
      calls.push(req);
      if (req.tool === 'exec_command') execId = req.callId;
      else { assert.equal(req.tool, 'write_stdin'); assert.equal(req.args.session_id, 1234); finished = Boolean(req.args.chars); }
      return {ok: true, data: {callId: req.callId, state: 'completed', result: {content: [{type: 'text', text: 'synthetic continuation'}], structuredContent: snapshot()}}};
    }});
    await context.route('**/*', async route => {
      if (route.request().url() === 'https://venice.ai/synthetic-stdin') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Local continuation check</title><body><h1>Synthetic process continuation</h1></body></html>'});
      if (route.request().url() === 'https://venice.ai/synthetic-rpc') return route.fulfill({contentType: 'application/json', body: JSON.stringify(await h.send(route.request().postDataJSON()))});
      return route.abort();
    });
    await page.goto('https://venice.ai/synthetic-stdin');
    const actions = [
      {action: 'tool', name: 'core/exec_command', args: {cmd: 'synthetic interactive', stdin_open: true}},
      {action: 'tool', name: 'core/write_stdin', args: {session_id: 1234}},
      {action: 'tool', name: 'core/write_stdin', args: {session_id: 1234, chars: 'hello\nexit\n'}},
      {action: 'done', summary: 'Synthetic continuation complete'}
    ];
    await page.exposeFunction('syntheticModelTurn', () => JSON.stringify(actions[turns++]));
    await page.evaluate(() => { window.__cosVeniceSend = {sendViaUi: () => window.syntheticModelTurn()}; });
    await page.addScriptTag({path: path.join(root, 'extension/venice-agent.js')});
    const cdp = await context.newCDPSession(page), {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'stdin-render-check'});
    const catalog = JSON.parse(read('extension/_locales/en/messages.json'));
    const injection = await cdp.send('Runtime.evaluate', {contextId: executionContextId, expression:
      `const catalog=${JSON.stringify(catalog)};const chrome={i18n:{getMessage:key=>catalog[key]?.message??''},runtime:{sendMessage:async message=>(await fetch('https://venice.ai/synthetic-rpc',{method:'POST',body:JSON.stringify(message)})).json()}};\n` + read('extension/venice-bridge.js') + '\n' + read('extension/venice-panel.js')});
    assert.equal(injection.exceptionDetails, undefined);
    const panel = page.locator('#cos-venice-panel');
    await panel.locator('#state').filter({hasText: '待機中'}).waitFor();
    await panel.locator('#instruction').fill('Check an interactive process, poll it, then send input');
    await panel.locator('#run').click(); await panel.locator('#state').filter({hasText: '完了'}).waitFor();
    assert.deepEqual(calls.map(req => req.tool), ['exec_command', 'write_stdin', 'write_stdin']);
    assert.equal(await panel.locator('.exec-output').count(), 1);
    assert.equal(await panel.locator('[data-stream=stdout]').textContent(), snapshot().stdout);
    assert.equal(await panel.locator('[data-stream=stderr]').textContent(), snapshot().stderr);
    assert.match(await panel.locator('.exec-title').textContent(), /exitCode:0/);
    assert.equal(await panel.locator('img').count(), 0);
    const pre = panel.locator('[data-stream=stdout]');
    assert.equal(await pre.evaluate(node => getComputedStyle(node).whiteSpace), 'pre');
    assert.equal(await pre.evaluate(node => node.scrollWidth > node.clientWidth), true);
    await pre.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    assert.equal(await pre.evaluate(node => node.scrollLeft > 0), true);
    await pre.evaluate(node => { node.scrollLeft = 0; });
    await panel.locator('#steps').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({path: path.join(output, 'continuation-desktop.png')});
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 844);
    await page.screenshot({path: path.join(output, 'continuation-mobile.png')});
    assert.deepEqual(errors, []);
    await panel.locator('#stop').click();
    console.log(JSON.stringify({turns, tools: calls.map(req => req.tool), processRows: 1, safeText: true, horizontalScroll: true, pageErrors: errors, externalRequests: 0}, null, 2));
  } finally { for (const close of cleanups) close(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
