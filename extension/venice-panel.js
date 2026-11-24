/* Document-local controls. ISOLATED never accesses the MAIN agent object directly. */
(() => {
  'use strict';
  const ORIGIN = 'https://venice.ai';
  if (location.origin !== ORIGIN) return;
  let ready = false, activeId = null, lastId = null, runId = null, stopping = false, revoked = false, ui;
  const post = (op, extra = {}) => window.postMessage({type: 'cos-venice-panel-request', op, ...extra}, ORIGIN);
  function sync() {
    if (!ui) return;
    ui.run.disabled = !ready || Boolean(activeId) || !ui.instruction.value.trim();
    ui.stop.disabled = (!activeId && (!runId || revoked)) || stopping;
    ui.instruction.disabled = Boolean(activeId);
    ui.maxSteps.disabled = Boolean(activeId);
  }
  function message(text) {
    ui.message.textContent = text;
    ui.message.hidden = !text;
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== ORIGIN || event.data?.type !== 'cos-venice-panel-event') return;
    const data = event.data;
    if (data.event === 'ready') {
      ready = true;
      if (ui && !activeId) { ui.state.textContent = '待機中'; message(''); }
      sync(); return;
    }
    if (!ui || data.id !== (activeId ?? lastId)) return;
    if (data.event === 'awaiting') ui.state.textContent = 'アプリの承認待ち';
    if (data.event === 'granted' && typeof data.runId === 'string') { runId = data.runId; ui.state.dataset.runId = runId; }
    if (data.event === 'revoked') { revoked = true; if (!activeId) stopping = false; ui.state.textContent = activeId ? '停止待ち' : '失効済み'; message('このrunの許可を失効させました。'); sync(); return; }
    if (data.event === 'started') ui.state.textContent = '実行中';
    if (data.event === 'stopping') {
      stopping = true;
      ui.state.textContent = '停止待ち';
      message('現在の処理が終わるのを待っています。');
    }
    if (data.event === 'step') {
      const step = data.step;
      if (!step || !Number.isInteger(step.index) || step.index < 1 || step.index > 40 ||
          typeof step.name !== 'string' || typeof step.ok !== 'boolean') return;
      const row = document.createElement('li');
      row.dataset.ok = String(step.ok);
      const preview = typeof data.preview === 'string' ? data.preview.replace(/\s+/g, ' ').slice(0, 60) : '';
      row.textContent = `${String(step.index).padStart(2, '0')} / ${step.name} / ok:${step.ok} / ${preview}`;
      row.title = row.textContent;
      ui.steps.appendChild(row);
      ui.steps.scrollTop = ui.steps.scrollHeight;
      if (!stopping) ui.state.textContent = `実行中 · ${step.index}`;
    }
    if (['done', 'stopped', 'error'].includes(data.event)) {
      ui.state.textContent = {done: '完了', stopped: '停止', error: 'エラー'}[data.event];
      ui.state.dataset.error = String(data.event === 'error');
      if (data.event === 'error' && !runId) { const row = document.createElement('li'); row.dataset.ok = 'false'; row.textContent = `承認/実行エラー / ${data.error ?? '拒否されました。'}`; ui.steps.appendChild(row); }
      message(String(data.event === 'done' ? data.summary ?? '' : data.error ?? '処理を終了しました。'));
      activeId = null;
      stopping = false;
    }
    sync();
  });
  function mount() {
    if (document.getElementById('cos-venice-panel')) return;
    const host = document.createElement('div');
    host.id = 'cos-venice-panel';
    const shadow = host.attachShadow({mode: 'open'});
    const style = document.createElement('style');
    style.textContent = `
        :host { all:initial; position:fixed; z-index:2147483647; right:16px; bottom:16px; width:360px; max-width:calc(100vw - 24px); color-scheme:light;
          --vp-bg:#f4f4f5; --vp-field:#fff; --vp-ink:#171717; --vp-muted:#5d5d5d; --vp-line:#d0d0d1; --vp-accent:#486f9d; --vp-on-accent:#fff; --vp-red:#b43b3b; --vp-green:#1f7146;
          font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',sans-serif; color:var(--vp-ink); }
        * { box-sizing:border-box; } [hidden] { display:none !important; }
        section { background:var(--vp-bg); border:1px solid var(--vp-line); border-radius:12px; box-shadow:0 8px 32px #0002; overflow:hidden; }
        header { display:flex; align-items:center; gap:12px; padding:12px 14px; }
        strong { font-size:14px; font-weight:650; } #state { color:var(--vp-muted); font-size:12px; margin-left:auto; white-space:nowrap; }
        #state[data-error=true] { color:var(--vp-red); }
        button,input,textarea { font:inherit; color:inherit; } button { min-height:36px; border:1px solid var(--vp-line); border-radius:7px; padding:6px 12px; background:var(--vp-field); cursor:pointer; }
        button:disabled { opacity:.45; cursor:default; } button:active:not(:disabled) { transform:translateY(1px); }
        :is(button,input,textarea,ol):focus-visible { outline:2px solid var(--vp-accent); outline-offset:2px; }
        #toggle { font-size:12px; padding:4px 8px; } #body { padding:0 14px 14px; max-height:calc(100dvh - 96px); overflow:auto; }
        label { display:block; font-size:13px; font-weight:550; margin-bottom:6px; }
        textarea { display:block; width:100%; min-height:88px; max-height:180px; resize:vertical; padding:10px; border:1px solid var(--vp-line); border-radius:8px; background:var(--vp-field); }
        .controls { display:flex; align-items:end; gap:8px; margin-top:12px; } .limit { margin-right:auto; } .limit label { font-size:12px; font-weight:400; color:var(--vp-muted); }
        input { width:76px; height:36px; padding:5px 8px; border:1px solid var(--vp-line); border-radius:7px; background:var(--vp-field); }
        #run { background:var(--vp-accent); color:var(--vp-on-accent); border-color:var(--vp-accent); } #stop:not(:disabled) { color:var(--vp-red); }
        ol { list-style:none; padding:0; margin:12px 0 0; max-height:160px; overflow:auto; border-top:1px solid var(--vp-line); }
        ol:empty { display:none; } li { padding:7px 0; font:13px/1.6 ui-monospace,'SF Mono',monospace; white-space:nowrap; min-width:max-content; }
        li[data-ok=false] { color:var(--vp-red); } li[data-ok=true] { color:var(--vp-green); }
        #message { white-space:pre-wrap; overflow-wrap:anywhere; font-size:13px; max-height:140px; overflow:auto; margin:12px 0 0; }
        :host([data-collapsed]) { width:280px; }
        @media (prefers-color-scheme:dark) { :host { color-scheme:dark; --vp-bg:#181818; --vp-field:#262626; --vp-ink:#fff; --vp-muted:#aeaeae; --vp-line:#3f3f3f; --vp-accent:#b0cbed; --vp-on-accent:#000; --vp-red:#dd6a6a; --vp-green:#75bb97; } }
        @media (max-width:480px) { :host { right:12px; bottom:12px; } button { min-height:44px; } input { height:44px; } }
    `;
    const element = (tag, attributes, ...children) => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
      node.append(...children);
      return node;
    };
    const section = element('section', {'aria-label': 'Chat On Venice 操作パネル'},
      element('header', {},
        element('strong', {}, 'Chat On Venice'),
        element('span', {id: 'state'}, '接続待ち'),
        element('button', {id: 'toggle', type: 'button', 'aria-expanded': 'true', 'aria-controls': 'body'}, '畳む')),
      element('div', {id: 'body'},
        element('form', {},
          element('label', {for: 'instruction'}, '指示'),
          element('textarea', {id: 'instruction', rows: '3', required: '', placeholder: '例：ページを開いて見出しを調べる'}),
          element('div', {class: 'controls'},
            element('div', {class: 'limit'},
              element('label', {for: 'maxSteps'}, '最大ステップ数'),
              element('input', {id: 'maxSteps', type: 'number', min: '1', max: '40', step: '1', value: '10', required: ''})),
            element('button', {id: 'run', type: 'submit', disabled: ''}, '実行'),
            element('button', {id: 'stop', type: 'button', disabled: ''}, '停止'))),
        element('div', {role: 'log', 'aria-label': '実行ステップ', 'aria-live': 'polite'},
          element('ol', {id: 'steps', tabindex: '0', 'aria-label': '実行ステップ一覧'})),
        element('p', {id: 'message', role: 'status'}, 'エージェントに接続しています…')));
    shadow.replaceChildren(style, section);
    document.body.appendChild(host);
    ui = Object.fromEntries(['instruction', 'maxSteps', 'run', 'stop', 'steps', 'state', 'message'].map(id => [id, shadow.getElementById(id)]));
    shadow.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      if (activeId || !ready || !ui.instruction.value.trim() || !event.target.reportValidity()) return;
      activeId = crypto.randomUUID();
      lastId = activeId; runId = null; revoked = false; delete ui.state.dataset.runId;
      stopping = false;
      ui.steps.replaceChildren();
      ui.state.textContent = 'アプリの承認待ち';
      ui.state.dataset.error = 'false';
      message('');
      sync();
      post('run', {id: activeId, instruction: ui.instruction.value, maxSteps: ui.maxSteps.valueAsNumber});
    });
    ui.instruction.addEventListener('input', sync);
    ui.stop.addEventListener('click', () => {
      if ((!activeId && !runId) || stopping) return;
      stopping = true;
      ui.state.textContent = '停止要求中';
      message('停止を要求しています…');
      sync(); post('stop', {id: activeId ?? lastId});
    });
    shadow.getElementById('toggle').addEventListener('click', event => {
      const collapsed = host.toggleAttribute('data-collapsed');
      shadow.getElementById('body').hidden = collapsed;
      event.currentTarget.textContent = collapsed ? '開く' : '畳む';
      event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    });
    if (ready) { ui.state.textContent = '待機中'; message(''); }
    sync(); post('ready');
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, {once: true});
})();
