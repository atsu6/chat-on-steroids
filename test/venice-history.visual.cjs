// Run twice with Electron: --seed then --restore. Real store/preload/renderer, isolated synthetic data.
const {app, BrowserWindow, ipcMain, session} = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/venice-history');
fs.mkdirSync(output, {recursive: true});
const restoring = process.argv.includes('--restore'), manifestFile = path.join(output, 'runtime-check.json');
const manifest = restoring ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {userData: fs.mkdtempSync(path.join(output, 'runtime-'))};
app.setPath('userData', manifest.userData);
app.whenReady().then(async () => {
  const bundle = path.join(output, 'history-runtime.cjs');
  require('esbuild').buildSync({stdin: {contents: `
    export {initConfigPath, defaultConfig, getConfig} from './src/main/config.ts';
    export {initSessionStore, createSession, getSession, readEvents, flushSessions} from './src/main/session/store.ts';
    export {initDurableStore} from './src/main/durable.ts';
    export {recordVeniceRun, recordToolCall} from './src/main/session/recorder.ts';
  `, resolveDir: root}, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent'});
  const backend = require(bundle);
  backend.initConfigPath(manifest.userData); backend.initSessionStore(manifest.userData); backend.initDurableStore(manifest.userData);
  if (!restoring) {
    manifest.sessionId = (await backend.createSession({title: 'Venice task history'})).id;
    const a = randomUUID(), b = randomUUID();
    await backend.recordVeniceRun(manifest.sessionId, a, {type: 'started', message: 'Inspect the project heading, read README.md, and report the result.'});
    await backend.recordVeniceRun(manifest.sessionId, a, {type: 'step', index: 1, name: 'query', ok: true, args: '{"selector":"h1"}', result: 'Heading: <img src=x>\nMarkup is shown as text.', truncated: false});
    await backend.recordToolCall({hostAdmitted: {runId: a, sessionId: manifest.sessionId, callId: randomUUID()}, tool: 'read',
      args: {paths: ['/synthetic/README.md']}, content: [{type: 'text', text: 'Synthetic README content.'}], outcome: 'ok', durationMs: 1, startedAt: Date.now()});
    await backend.recordVeniceRun(manifest.sessionId, a, {type: 'completed', message: 'The heading and README were inspected.'});
    await backend.recordVeniceRun(manifest.sessionId, b, {type: 'started', message: 'Inspect the settings button.'});
    await backend.recordVeniceRun(manifest.sessionId, b, {type: 'step', index: 1, name: 'query', ok: false, args: '{"selector":"#missing"}', result: 'No matching element.', truncated: false});
    manifest.unfinishedRun = b;
    await backend.flushSessions();
    manifest.events = (await backend.readEvents(manifest.sessionId)).length;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  }
  if (restoring) await backend.recordVeniceRun(manifest.sessionId, manifest.unfinishedRun, {type: 'interrupted', message: ''});
  const expectedEvents = manifest.events + (restoring ? 1 : 0), historyRows = restoring ? 6 : 5;
  const events = await backend.readEvents(manifest.sessionId), summary = await backend.getSession(manifest.sessionId);
  assert.equal(events.length, expectedEvents);
  const config = backend.defaultConfig();
  config.ui = {...config.ui, theme: 'light', autoConnect: false, lastSeenVersion: '2.1.55', language: restoring ? 'ja' : 'en'};
  const state = {config, displayName: 'Chat On Venice (dev)', hasApiKey: false, hasGoalKey: false, resolvedBinary: null,
    status: {state: 'disconnected', surfaces: []}, bridge: {running: false, paired: false, present: false},
    update: {current: '2.1.55', latest: null, stage: 'idle'}};
  const arrays = new Set(['log:get', 'projects:list', 'sessions:outbox', 'sessions:pausedHelpers', 'sessions:runningTools']);
  const preload = path.join(root, 'out/preload/index.js');
  const channels = new Set([...fs.readFileSync(preload, 'utf8').matchAll(/\bcall\(\s*["']([^"']+)["']/g)].map(x => x[1]));
  let writes = 0;
  const requests = [];
  for (const channel of channels) ipcMain.handle(channel, () => {
    requests.push(channel);
    let data = null;
    if (channel === 'state:get') data = state;
    else if (arrays.has(channel)) data = [];
    else if (channel === 'sessions:list') data = {sessions: [summary], total: 1, nextCursor: null, activeId: null, pressure: [], blocked: []};
    else if (channel === 'sessions:events') data = {summary, events, total: events.length, nextFrom: events.at(-1).seq + 1};
    else if (channel === 'swarm:get') data = {running: false, agents: [], pendingReports: 0};
    else if (channel === 'chatModels:get') data = {state: 'unknown', models: []};
    else if (channel === 'sessions:send') writes++;
    return {ok: true, data};
  });
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({cancel: /^https?:/.test(details.url)}));
  const errors = [];
  const win = new BrowserWindow({show: true, width: 1180, height: 1000,
    webPreferences: {preload, sandbox: true, contextIsolation: true, nodeIntegration: false}});
  win.webContents.on('console-message', details => {if (details.level === 'error') errors.push(details.message);});
  await win.loadFile(path.join(root, 'out/renderer/index.html'));
  const js = code => win.webContents.executeJavaScript(code);
  const until = async code => {const end = Date.now() + 15000; while (Date.now() < end) {if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 50));} throw new Error('Timeout: ' + code);};
  await until(`document.querySelector('.sidebar-brand strong')`);
  await js(`(() => {const back=document.getElementById('backToChat');if(back?.checkVisibility())back.click()})()`);
  try { await until(`document.querySelector('#sessionList [data-id]')`); }
  catch (error) {
    fs.writeFileSync(path.join(output, 'visual-diagnostic.json'), JSON.stringify({requests, errors, body: await js('document.body.innerText'), summary}, null, 2));
    throw error;
  }
  await js(`document.querySelector('#sessionList [data-id]').click()`);
  try { await until(`document.querySelectorAll('#timeline [data-venice-run]').length === ${historyRows}`); }
  catch (error) {
    fs.writeFileSync(path.join(output, 'visual-diagnostic.json'), JSON.stringify({requests, errors, body: await js('document.body.innerText'), summary}, null, 2));
    throw error;
  }
  await js(`(() => {const select=document.getElementById('uiLanguage');select.value=${JSON.stringify(restoring ? 'ja' : 'en')};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const heading = await js(`document.querySelector('#timeline [data-venice-run] summary b').textContent`);
  assert.equal(heading, restoring ? 'Veniceタスク開始' : 'Venice task started');
  if (restoring) {
    assert.deepEqual(summary.veniceRuns, []);
    assert.equal(await js(`document.querySelector('#timeline').textContent.includes('Working…')`), false);
    assert.equal(await js(`document.querySelector('#timeline').textContent.includes('作業中')`), false);
  }
  assert.equal(await js(`document.querySelector('#timeline img') === null`), true);
  assert.equal(await js(`document.querySelector('#timeline').textContent.includes('<img src=x>')`), true);
  await js(`document.querySelectorAll('#timeline [data-venice-run] summary').forEach(node => node.click())`);
  // Expand the page report for inspection; showing history must not send any input.
  await js(`document.querySelectorAll('#timeline [data-venice-run]').forEach(node => node.open = true)`);
  await js('document.fonts.ready');
  await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.equal(writes, 0); assert.deepEqual(errors, []);
  assert.equal((await backend.readEvents(manifest.sessionId)).length, expectedEvents);
  const stage = restoring ? 'restored-ja' : 'recorded-en';
  fs.writeFileSync(path.join(output, stage + '.png'), (await win.webContents.capturePage()).toPNG());
  console.log(JSON.stringify({stage, historyRows, events: events.length, inputWrites: writes, errors, restoredFromDisk: restoring}));
  win.destroy(); await backend.flushSessions(); app.quit();
}).catch(error => {console.error(error); app.exit(1);});
