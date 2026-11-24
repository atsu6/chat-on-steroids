// Optional render check. Actual renderer/i18n + CSS; only two Russian entries are removed
// in the synthetic bundle to represent new copy not translated beyond ja/en. No external traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const output = path.join(root, 'outputs/venice-i18n');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const context = await browser.newContext({viewport: {width: 1280, height: 1000}, serviceWorkers: 'block'});
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => route.request().url() === 'https://local.test/i18n'
      ? route.fulfill({contentType: 'text/html; charset=utf-8', body: read('src/renderer/index.html')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, '')}) : route.abort());
    await page.goto('https://local.test/i18n'); await page.addStyleTag({content: read('src/renderer/styles.css')});
    const missing = [
      'Also allow running commands', 'コマンドの実行も許可する',
      'Venice can run commands with your permissions. Commands are not isolated within the selected folders and can also access files and the network outside those folders.',
      'あなたの権限でコマンドを実行できます。選択したフォルダー内に隔離されず、その外のファイルやネットワークにもアクセスできます。'
    ];
    const bundle = await esbuild.build({entryPoints: [path.join(root, 'src/renderer/i18n.ts')], bundle: true, write: false, format: 'iife', globalName: 'language',
      plugins: [{name: 'synthetic-incomplete-optional-catalog', setup(build) {
        build.onLoad({filter: /locales\/ru\.json$/}, args => {
          const data = JSON.parse(fs.readFileSync(args.path, 'utf8')); for (const key of missing) delete data[key];
          return {contents: JSON.stringify(data), loader: 'json'};
        });
      }}]});
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    await page.evaluate(() => {
      language.initLanguage(); language.setLanguage('ja');
      document.getElementById('chatInput').value = 'Draft $& <img src=x> /資料';
      document.getElementById('veniceGrantDialog').showModal();
      document.getElementById('veniceGrantShell').checked = true;
    });
    assert.match(await page.locator('#veniceGrantShellWarning').textContent(), /あなたの権限で/);
    await page.screenshot({path: path.join(output, 'ja-approval.png')});
    await page.evaluate(() => language.setLanguage('ru'));
    assert.equal(await page.locator('#veniceGrantShell').isChecked(), true);
    assert.equal(await page.locator('#veniceGrantTitle').textContent(), JSON.parse(read('src/renderer/locales/ru.json'))['Allow Venice to read files?']);
    assert.equal(await page.locator('#veniceGrantShellWarning').textContent(), missing[2]);
    assert.equal(await page.evaluate(() => language.t('コマンドの実行も許可する')), missing[0]);
    await page.screenshot({path: path.join(output, 'ru-english-fallback.png')});
    await page.evaluate(() => language.setLanguage('en'));
    assert.equal(await page.locator('#veniceGrantTitle').textContent(), 'Allow Venice to read files?');
    assert.equal(await page.locator('#veniceGrantShellWarning').textContent(), missing[2]);
    assert.equal(await page.evaluate(() => language.t('not_in_either_catalog')), 'not_in_either_catalog');
    assert.equal(await page.locator('#chatInput').inputValue(), 'Draft $& <img src=x> /資料');
    assert.equal(await page.locator('#veniceGrantDialog img').count(), 0);
    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const bounds = await page.locator('#veniceGrantDialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({path: path.join(output, 'en-mobile-approval.png')});
    assert.deepEqual(errors, []);
    console.log('Passed: actual ja/en dialog, incomplete Russian catalog uses English, existing Russian translations preserved, key fallback, checked state/draft retained, desktop/mobile, no external traffic.');
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
