// Real renderer shell and i18n, local assets only; never starts Electron or contacts Venice.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright'), esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/dev-brand');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1024, height: 1024}, serviceWorkers: 'block'});
    if (process.argv.includes('--rasterize-icon')) {
      await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style>${read('artwork/app-icon-source.svg')}`);
      await page.screenshot({path: path.join(root, 'artwork/app-icon-source.png'), omitBackground: true});
      console.log('Rasterized app-icon-source.svg to the existing RGBA source PNG.');
      return;
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'https://local.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({contentType: 'text/html', body: read('src/renderer/index.html')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/g, '')});
      const file = url.pathname.startsWith('/@phosphor-icons/')
        ? path.join(root, 'node_modules/@phosphor-icons/web/src', url.pathname.slice('/@phosphor-icons/web/'.length))
        : path.join(root, 'src/renderer', url.pathname);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({path: file});
    });
    await page.goto('https://local.test/');
    const bundle = await esbuild.build({entryPoints: [path.join(root, 'src/renderer/i18n.ts')], bundle: true, write: false, format: 'iife', globalName: 'language'});
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    await page.evaluate(() => language.initLanguage());
    await page.evaluate(() => document.fonts.ready);
    for (const width of [1280, 800]) {
      await page.setViewportSize({width, height: 900});
      for (const locale of ['en', 'ja']) {
        await page.evaluate(locale => language.setLanguage(locale), locale);
        assert.equal(await page.title(), 'Chat On Venice (dev)');
        const brand = page.locator('.sidebar-brand strong');
        assert.equal(await brand.innerText(), 'Chat On Venice (dev)');
        assert.equal(await brand.evaluate(node => node.scrollWidth <= node.clientWidth), true, 'brand text must not clip');
        const search = await page.locator('#searchChatsButton').boundingBox();
        const sidebar = await page.locator('.sidebar').boundingBox();
        assert(search.x + search.width <= sidebar.x + sidebar.width, 'search button must remain inside sidebar');
        await page.screenshot({path: path.join(output, `shell-${width}-${locale}.png`)});
      }
    }
    await page.setViewportSize({width: 720, height: 340});
    await page.setContent(`<style>body{margin:32px;background:#eee;display:flex;gap:28px;align-items:center;font:14px system-ui}img{image-rendering:auto}</style>` +
      [256, 128, 48, 32, 16].map(size => `<figure style="margin:0;text-align:center"><img width="${size}" height="${size}" src="data:image/png;base64,${fs.readFileSync(path.join(root, size === 256 ? 'build/icon-preview.png' : `extension/icons/icon${size}.png`)).toString('base64')}"><figcaption>${size}px</figcaption></figure>`).join(''));
    await page.screenshot({path: path.join(output, 'icon-sizes.png')});
    assert.deepEqual(errors, []);
    console.log('Shell branding: en/ja, 1280/800px, no clipping or page errors; rendered 256/128/48/32/16px icons.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
