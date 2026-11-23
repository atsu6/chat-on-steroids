// Optional local render check: uses the host's installed Playwright and Chrome, not a new project dependency.
// All browser requests are fulfilled locally or aborted. No Venice connection or model send is made.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}, colorScheme: 'light', serviceWorkers: 'block'});
    const routed = [];
    await context.route('**/*', route => {
      routed.push(route.request().url());
      if (route.request().url() === 'https://venice.ai/synthetic-panel') return route.fulfill({
        contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ja"><title>Venice panel synthetic check</title>
        <style>body{margin:0;background:#f4f4f5;color:#171717;font:16px/1.7 system-ui,sans-serif}main{padding:64px;max-width:760px}p{color:#5d5d5d}button,textarea,input{font-size:48px!important;background:magenta!important}*{box-sizing:border-box}</style>
        <main><p>合成ページ · 通信なし</p><h1>Chat On Venice</h1><p>既存ページのスタイルに影響されず、操作パネルから指示と実行状況を確認します。</p></main></html>`
      });
      return route.abort();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://venice.ai/synthetic-panel');
    await page.evaluate(() => {
      window.syntheticSends = 0;
      window.__cosVeniceSend = {async sendViaUi() {
        const n = ++window.syntheticSends;
        await new Promise(resolve => setTimeout(resolve, 150));
        return JSON.stringify(n < 3 ? {action: 'tool', name: 'now', args: {}} : {
          action: 'done', summary: '合成テストが完了しました。3ステップの結果を確認できます。'
        });
      }};
    });
    await page.addScriptTag({path: path.join(root, 'extension/venice-agent.js')});
    const cdp = await context.newCDPSession(page);
    const {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName: 'venice-panel-synthetic'});
    const injection = await cdp.send('Runtime.evaluate', {contextId: executionContextId,
      expression: fs.readFileSync(path.join(root, 'extension/venice-panel.js'), 'utf8')});
    assert.equal(injection.exceptionDetails, undefined);
    const isolated = await cdp.send('Runtime.evaluate', {contextId: executionContextId, expression: 'typeof window.__cosVeniceAgent'});
    assert.equal(isolated.result.value, 'undefined'); // The UI truly cannot read MAIN's object.
    const panel = page.locator('#cos-venice-panel');
    await panel.locator('#state').filter({hasText: '待機中'}).waitFor();
    await panel.getByLabel('指示', {exact: true}).fill('現在時刻を確認して、結果を短くまとめる');
    await panel.getByRole('button', {name: '実行', exact: true}).click();
    await panel.locator('#state').filter({hasText: '完了'}).waitFor();
    assert.equal(await panel.locator('li').count(), 3);
    assert.equal(await page.evaluate(() => window.syntheticSends), 3);
    assert.equal(await panel.locator('#instruction').evaluate(el => getComputedStyle(el).fontSize), '14px');
    assert.notEqual(await panel.locator('#instruction').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 0, 255)');
    const screenshots = path.join(root, 'docs/screenshots');
    await page.screenshot({path: path.join(screenshots, 'venice-panel-desktop.png')});
    await page.addScriptTag({path: require.resolve('axe-core/axe.min.js')});
    const accessibility = await page.evaluate(async () => (await axe.run(document.getElementById('cos-venice-panel'))).violations.map(v => ({id: v.id, impact: v.impact})));
    assert.deepEqual(accessibility, []);
    await page.setViewportSize({width: 390, height: 844});
    await page.emulateMedia({colorScheme: 'dark'});
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: path.join(screenshots, 'venice-panel-mobile.png')});
    const toggle = panel.getByRole('button', {name: '畳む', exact: true});
    await toggle.focus(); await page.keyboard.press('Enter');
    assert.equal(await panel.locator('#body').isVisible(), false);
    await panel.getByRole('button', {name: '開く', exact: true}).click();
    await page.evaluate(() => {
      window.__cosVeniceSend.sendViaUi = () => {
        window.syntheticSends++;
        return new Promise(resolve => { window.releaseSyntheticTurn = resolve; });
      };
    });
    await panel.getByRole('button', {name: '実行', exact: true}).click();
    await page.waitForFunction(() => typeof window.releaseSyntheticTurn === 'function');
    await panel.getByRole('button', {name: '停止', exact: true}).click();
    await panel.locator('#state').filter({hasText: '停止待ち'}).waitFor();
    assert.equal(await panel.getByRole('button', {name: '実行', exact: true}).isDisabled(), true);
    await page.evaluate(() => window.releaseSyntheticTurn(JSON.stringify({action: 'tool', name: 'now', args: {}})));
    await panel.locator('#state').filter({hasText: /^停止$/}).waitFor();
    assert.equal(await page.evaluate(() => window.syntheticSends), 4);
    assert.equal(await panel.locator('li').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(routed, ['https://venice.ai/synthetic-panel']);
    console.log('Passed: separate MAIN/ISOLATED worlds; run/progress/stop/collapse; hostile page CSS; 1280px/light and 390px/dark; axe; zero network forwarding.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
