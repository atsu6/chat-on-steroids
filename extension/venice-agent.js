const CONTRACT = `あなたは作業用タブのDOMを操作するエージェントです。Veniceのタブは脳として残し、操作しません。必ず次のどちらか1つだけを出力してください。前後に地の文を書かないこと。
{"action":"tool","name":"<name>","args":{...}}
{"action":"done","summary":"<完了報告>"}
利用可能なツール:
now() -> 現在時刻のISO文字列
tab_open({url}) -> 作業用タブを作成または指定URLへ遷移してURLを返す。DOMツールの前に実行する
query({selector}) -> 件数と最大20件の番号・tagName・id・クラス先頭・テキスト先頭40文字
read_text({selector?}) -> 指定要素（省略時body）のinnerText、空白を畳んで最大2000文字
click_selector({selector}) -> 最初の一致要素へスクロールしてclick。okはclickイベント発生の確認で、処理完了の確認ではない
scroll({dy}) -> window.scrollBy(0, dy)後のscrollY
fill({selector, value}) -> 作業タブの要素へ文字列を設定し、input/changeを送る
press({selector, key}) -> 作業タブの要素へkeydown/keypress/keyupを送る（例: Enter）
wait({ms}) -> 作業タブで指定ms待つ。上限10000ms
activate() -> 作業タブをアクティブにする`;

function buildTurn(instruction, toolResult) {
  let turn = CONTRACT + '\n---\n指示: ' + instruction;
  if (toolResult !== undefined) {
    turn += '\n前のツール結果: ' + JSON.stringify(toolResult);
  }
  return turn;
}

function parseAction(text) {
  try {
    const action = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (action.action !== 'tool' && action.action !== 'done') return null;
    if (action.action === 'tool' && typeof action.name !== 'string') return null;
    return action;
  } catch {
    return null;
  }
}

// Inject the UI transport; importing this module never sends a turn.
function createAgent(sendViaUi) {
  let taskState = null;
  function stopTask() {
    if (!taskState) return false;
    taskState.running = false;
    return true;
  }
  async function runTurn(instruction, toolResult, beforeRetry = () => {}) {
    let raw = await sendViaUi(buildTurn(instruction, toolResult));
    let parsed = parseAction(raw);
    if (parsed === null) {
      beforeRetry();
      raw = await sendViaUi(buildTurn(instruction, 'JSONのみで再出力してください。'));
      parsed = parseAction(raw);
    }
    if (parsed === null) throw new Error('エージェントの応答を JSON として解析できませんでした。');
    const {action, name, args, summary} = parsed;
    return {action, name, args, summary, raw};
  }

  async function runTask(instruction, options = {}) {
    const requested = options.maxSteps ?? 10;
    if (!Number.isInteger(requested) || requested < 1) throw new TypeError('maxSteps must be a positive integer');
    if (options.onStep !== undefined && typeof options.onStep !== 'function') throw new TypeError('onStep must be a function');
    if (taskState) throw new Error('タスクは既に実行中です。');
    const maxSteps = Math.min(requested, 40), steps = [];
    const state = {running: true};
    taskState = state;
    const checkRunning = () => {
      if (state.running) return;
      const error = new Error('タスクを停止しました。');
      Object.assign(error, {code: 'VENICE_TASK_STOPPED', steps: steps.slice(), stepCount: steps.length});
      throw error;
    };
    const report = (name, ok, value) => {
      steps.push({name, ok});
      const preview = (typeof value === 'string' ? value : JSON.stringify(value) ?? '').replace(/\s+/g, ' ').slice(0, 60);
      options.onStep?.({index: steps.length, name, ok}, preview);
    };
    let previous, lastAction;
    try {
      for (let i = 0; i < maxSteps; i++) {
        checkRunning();
        lastAction = await runTurn(instruction, previous, checkRunning);
        // Let an in-flight send finish, but do not begin its tool after a stop request.
        checkRunning();
        if (lastAction.action === 'done') {
          report('done', true, lastAction.summary);
          return {summary: lastAction.summary, steps};
        }
        try {
          previous = await executeTool(lastAction.name, lastAction.args);
        } catch (error) {
          previous = {ok: false, error: error.message};
        }
        report(lastAction.name, previous.ok, previous.ok ? previous.result : previous.error);
      }
      checkRunning();
      const error = new Error(`runTask exceeded maxSteps: steps=${steps.length}, lastAction=${JSON.stringify(lastAction)}`);
      Object.assign(error, {stepCount: steps.length, lastAction, steps});
      throw error;
    } finally {
      taskState = null;
    }
  }

  return {runTurn, runTask, stopTask};
}

// MAIN has no Chrome APIs. Only the Venice ISOLATED bridge can forward this request.
function callVeniceBridge(op, args = {}) {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (reply) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (reply.ok) resolve(reply.result);
      else reject(new Error(reply.error || 'Venice bridge failed'));
    };
    const onMessage = event => {
      if (event.source !== window || event.origin !== 'https://venice.ai') return;
      const reply = event.data?.__cosVeniceBridgeReply;
      if (reply?.id !== id || typeof reply.ok !== 'boolean') return;
      finish(reply);
    };
    const timer = setTimeout(() => finish({ok: false, error: `Venice bridge timed out: op=${op}`}), 45_000);
    window.addEventListener('message', onMessage);
    try {
      window.postMessage({__cosVeniceBridge: {id, op, args}}, 'https://venice.ai');
    } catch (error) {
      finish({ok: false, error: error.message});
    }
  });
}

const TOOL_REGISTRY = Object.freeze({
  now: () => new Date().toISOString(),
  tab_open: async ({url} = {}) => (await callVeniceBridge('ensureTab', {url})).url,
  query: (args = {}) => callVeniceBridge('eval', {name: 'query', args}),
  read_text: (args = {}) => callVeniceBridge('eval', {name: 'read_text', args}),
  click_selector: (args = {}) => callVeniceBridge('eval', {name: 'click_selector', args}),
  scroll: (args = {}) => callVeniceBridge('eval', {name: 'scroll', args}),
  fill: (args = {}) => callVeniceBridge('eval', {name: 'fill', args}),
  press: (args = {}) => callVeniceBridge('eval', {name: 'press', args}),
  wait: (args = {}) => callVeniceBridge('eval', {name: 'wait', args}),
  activate: () => callVeniceBridge('activate'),
});

async function executeTool(name, args) {
  if (!Object.hasOwn(TOOL_REGISTRY, name)) throw new Error('未登録のツール: ' + name);
  try {
    return {ok: true, result: await TOOL_REGISTRY[name](args)};
  } catch (error) {
    return {ok: false, error: error.message};
  }
}

if (location.origin === 'https://venice.ai' && !window.__cosVeniceAgent) {
  const __agent = createAgent(text => window.__cosVeniceSend.sendViaUi(text));
  window.__cosVeniceAgent = Object.freeze({
    runTurn: __agent.runTurn, runTask: __agent.runTask, stopTask: __agent.stopTask, executeTool, TOOL_REGISTRY, buildTurn, parseAction
  });
  const origin = 'https://venice.ai';
  let panelRunId = null;
  const postPanel = (id, event, payload = {}) => window.postMessage({
    type: 'cos-venice-panel-event', id, event, ...payload
  }, origin);
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== origin || event.data?.type !== 'cos-venice-panel-request') return;
    const message = event.data;
    if (message.op === 'ready') { postPanel(null, 'ready'); return; }
    if (typeof message.id !== 'string' || !message.id) return;
    if (message.op === 'stop') {
      if (message.id === panelRunId && window.__cosVeniceAgent.stopTask()) postPanel(message.id, 'stopping');
      return;
    }
    if (message.op !== 'run') return;
    if (panelRunId) { postPanel(message.id, 'error', {error: 'タスクは既に実行中です。'}); return; }
    if (typeof message.instruction !== 'string' || !message.instruction.trim()) {
      postPanel(message.id, 'error', {error: '指示を入力してください。'}); return;
    }
    panelRunId = message.id;
    postPanel(message.id, 'started');
    window.__cosVeniceAgent.runTask(message.instruction, {
      maxSteps: message.maxSteps,
      onStep: (step, preview) => postPanel(message.id, 'step', {step, preview})
    }).then(result => postPanel(message.id, 'done', {summary: result.summary}), error => {
      postPanel(message.id, error.code === 'VENICE_TASK_STOPPED' ? 'stopped' : 'error', {error: error.message});
    }).finally(() => { panelRunId = null; });
  });
  postPanel(null, 'ready');
}
