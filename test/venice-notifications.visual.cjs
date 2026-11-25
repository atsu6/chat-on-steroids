// Real Electron/store/preload/renderer with synthetic gateway events; no provider or phone traffic.
const { app, BrowserWindow, Notification, ipcMain, session } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'outputs/venice-notifications');
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(output, 'runtime-')));
app.whenReady().then(async () => {
  const bundle = path.join(output, 'notification-runtime.cjs');
  require('esbuild').buildSync({ stdin: { contents: `
    export {initConfigPath, defaultConfig, saveConfig} from './src/main/config.ts';
    export {initSessionStore, createSession, getSession, listSessions, readEvents, flushSessions} from './src/main/session/store.ts';
    export {recordVeniceRun} from './src/main/session/recorder.ts';
    export {VeniceToolGateway} from './src/main/venice-tool-gateway.ts';
    export {createVeniceNotifications, openVeniceNotification} from './src/main/venice-notifications.ts';
    export {setMainTextTranslations} from './src/main/main-texts.ts';
  `, resolveDir: root }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' });
  const backend = require(bundle), userData = app.getPath('userData');
  backend.initConfigPath(userData); backend.initSessionStore(userData);
  const config = backend.defaultConfig(); config.roots = [{ name: 'synthetic', path: userData }];
  config.ui = { ...config.ui, theme: 'light', autoConnect: false, lastSeenVersion: '2.1.55' }; await backend.saveConfig(config);
  const a = await backend.createSession({ title: 'Notification owner A' }), b = await backend.createSession({ title: 'Notification owner B' });
  const gateway = new backend.VeniceToolGateway({ load: async () => null, save: async () => {}, execute: async () => { throw new Error('No tool execution in this check'); },
    recordRun: (grant, event) => backend.recordVeniceRun(grant.sessionId, grant.runId, event) });
  const preload = path.join(root, 'out/preload/index.js'), channels = new Set([...fs.readFileSync(preload, 'utf8').matchAll(/\bcall\(\s*["']([^"']+)["']/g)].map(x => x[1]));
  const state = { config, displayName: 'Chat On Venice (dev)', hasApiKey: false, hasGoalKey: false, resolvedBinary: null,
    status: { state: 'disconnected', surfaces: [] }, bridge: { running: false, paired: false, present: false }, update: { current: '2.1.55', latest: null, stage: 'idle' } };
  const arrays = new Set(['log:get', 'projects:list', 'sessions:outbox', 'sessions:pausedHelpers', 'sessions:runningTools']);
  let writes = 0, answers = 0;
  for (const channel of channels) ipcMain.handle(channel, async (_event, ...args) => {
    let data = null;
    if (channel === 'state:get') data = state;
    else if (arrays.has(channel)) data = [];
    else if (channel === 'sessions:list') data = { sessions: await backend.listSessions(), total: 2, nextCursor: null, activeId: null, pressure: [], blocked: [] };
    else if (channel === 'sessions:events') { const { id } = args[0], events = await backend.readEvents(id); data = { summary: await backend.getSession(id), events, total: events.length, nextFrom: (events.at(-1)?.seq ?? 0) + 1 }; }
    else if (channel === 'swarm:get') data = { running: false, agents: [], pendingReports: 0 };
    else if (channel === 'chatModels:get') data = { state: 'unknown', models: [] };
    else if (channel === 'venice:grantPending') data = gateway.pendingApprovals();
    else if (channel === 'venice:grantAnswer') answers++;
    else if (channel === 'ui:mainTexts') backend.setMainTextTranslations(args[0]);
    else if (channel === 'sessions:send') writes++;
    return { ok: true, data };
  });
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({ cancel: /^https?:/.test(details.url) }));
  const win = new BrowserWindow({ show: true, width: 1180, height: 1000, webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const errors = [], native = [], notices = [], phone = [], opened = [];
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
  const notifier = backend.createVeniceNotifications({ session: backend.getSession, pending: () => gateway.pendingApprovals(), enabled: () => true,
    supported: () => true, focused: () => false, now: Date.now, sound: () => {}, phone: event => { phone.push(event); }, failed: () => errors.push('Notification delivery failed'),
    show: (title, body, click) => {
      const notice = new Notification({ title, body }); notice.on('click', click);
      notice.on('show', () => native.push({ title, body, event: 'show' })); notice.on('failed', (_event, error) => native.push({ event: 'failed', error }));
      notices.push({ notice, title, body }); if (process.argv.includes('--native') && Notification.isSupported()) notice.show();
    },
    open: (id, approvalId) => { opened.push({ id, approvalId }); backend.openVeniceNotification(win.webContents, id, approvalId, () => gateway.pendingApprovals()); }
  }); gateway.setNotifications(notifier);
  await win.loadFile(path.join(root, 'out/renderer/index.html'));
  const js = code => win.webContents.executeJavaScript(code);
  const until = async code => { const end = Date.now() + 15000; while (Date.now() < end) { if (await js(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error('Timeout: ' + code); };
  const capture = async name => {
    await js('document.fonts.ready'); await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  await until(`document.querySelector('.sidebar-brand strong')`);
  await js(`(() => {const back=document.getElementById('backToChat');if(back?.checkVisibility())back.click()})()`);
  await until(`document.querySelectorAll('#sessionList [data-id]').length === 2`);
  await js(`(() => {const s=document.getElementById('uiLanguage');s.value='en';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await js(`document.querySelector('#sessionList [data-id="${a.id}"]').click()`);
  await js(`document.querySelector('#workspaceSettings').click()`);
  await until(`document.querySelector('.app').dataset.screen === 'settings'`);
  const sender = { browserId: 'd'.repeat(32), tabId: 7, documentId: 'synthetic-notification' };
  const g = await gateway.grant(b.id, [userData], sender);
  await gateway.runEvent({ runId: g.runId, event: { type: 'completed', message: 'Synthetic completion' } }, sender);
  await notifier.drain(); assert.equal(notices.length, 1);
  assert.equal(notices[0].body, 'Venice task completed');
  // Synthetic native click, real IPC/preload/selection: OS delivery is reported separately below.
  notices[0].notice.emit('click');
  await until(`document.querySelector('.app').dataset.screen === 'chat' && document.querySelector('#sessionList [data-id="${b.id}"] [aria-current="true"]')`);
  await until(`document.querySelector('#timeline [data-venice-phase="completed"]') || document.querySelector('#timeline').textContent.includes('Synthetic completion')`);
  await capture('completed');
  let contextId = a.id;
  gateway.setApprovalUi({ context: async () => ({ sessionId: contextId, sessionTitle: contextId === a.id ? a.title : b.title, project: null }),
    notify: rows => win.webContents.send('venice:grantPending', rows) });
  const request = id => gateway.requestGrant({ requestId: randomUUID(), tools: ['core/read'], instructionSummary: `Synthetic approval ${id}` }, { ...sender, tabId: id }, 'https://venice.ai/chat/synthetic');
  const replyA = request(10); await new Promise(resolve => setImmediate(resolve)); contextId = b.id;
  const replyB = request(11); await new Promise(resolve => setImmediate(resolve)); await notifier.drain();
  assert.equal(notices.length, 3); const pendingB = gateway.pendingApprovals().find(row => row.sessionId === b.id);
  notices[2].notice.emit('click'); await until(`document.querySelector('#veniceGrantSession').textContent.includes(${JSON.stringify(b.id)})`);
  assert.equal(await js(`document.querySelector('#veniceGrantDialog').open`), true);
  assert.equal(await js(`document.querySelector('#veniceGrantWrite').checked || document.querySelector('#veniceGrantShell').checked`), false);
  await capture('approval-en');
  await js(`(() => {const s=document.getElementById('uiLanguage');s.value='ja';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const failed = await gateway.grant(a.id, [userData], sender);
  await gateway.runEvent({ runId: failed.runId, event: { type: 'failed', message: 'Synthetic failure' } }, sender); await notifier.drain();
  assert.equal(notices.at(-1).body, 'Veniceタスク失敗');
  await gateway.answerApproval(pendingB.id, false); await replyB; const before = opened.length;
  notices[2].notice.emit('click'); await new Promise(resolve => setImmediate(resolve)); assert.equal(opened.length, before);
  assert.equal(await js(`document.querySelector('#veniceGrantSession').textContent.includes(${JSON.stringify(a.id)})`), true);
  await capture('approval-ja');
  await gateway.answerApproval(gateway.pendingApprovals()[0].id, false); await replyA;
  assert.equal(writes, 0); assert.equal(answers, 0); assert.deepEqual(errors, []);
  const report = { notices: notices.map(({ title, body }) => ({ title, body })), opened, staleClickIgnored: true, inputWrites: writes, approvalWritesFromClick: answers,
    nativeSupported: Notification.isSupported(), nativeRequested: process.argv.includes('--native'), native, errors, phoneDestinationsStubbed: phone.length, networkBlocked: true };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
  // --inspect keeps only this isolated window/notices alive for an optional manual OS banner check.
  if (process.argv.includes('--inspect')) { console.log('Inspection ready. Close this test window to finish.'); await new Promise(resolve => win.once('closed', resolve)); }
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2));
  notices.forEach(({ notice }) => notice.close()); await gateway.stop(); if (!win.isDestroyed()) win.destroy(); await backend.flushSessions(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
