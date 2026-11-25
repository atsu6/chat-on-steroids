const CONTRACT = `あなたは作業用タブのDOMを操作するエージェントです。Veniceのタブは脳として残し、操作しません。必ず次のどちらか1つだけを出力してください。前後に地の文を書かないこと。
{"action":"tool","name":"<name>","args":{...}}
{"action":"done","summary":"<完了報告>"}
利用可能なツール:
core/read({paths, start_line?, end_line?, max_bytes?}) -> appで許可したroot内のファイルを読む。appのgrantが必要
core/find({query, path?, mode?, include?, exclude?, case_sensitive?, regex?, max_results?}) -> read権限とcore/findを含むappのgrantが必要。許可root内を検索。既定content・200件（最大500）。matchesのpath/line/textとtruncatedを返す。バイナリは除外
core/apply_patch({patch}) -> appで書き込みを別途許可したroot内だけを変更。*** Begin Patch / *** Add File: path / +行 / *** Update File: path / *** Move to: path / @@ / -旧行 / +新行 / *** Delete File: path / *** End Patch 形式。shell実行はできない
core/exec_command({cmd, workdir?, yield_time_ms?, shell?, login?, stdin_open?}) -> 独立したshell許可が必要。cwdは許可root内。既定10秒・最大30秒で待ち、processId・exitCode・stdout/stderr出力を返す。出力は64KiBまで。stdin_open:trueを明示した場合だけ入力を開く（既定false）。同時3本まで。Stopでrunのプロセスを終了
core/write_stdin({session_id, chars?, yield_time_ms?}) -> 同じrunが起動したprocessIdをsession_idに指定。shell許可が必要。chars省略/空文字は出力poll、非空文字はstdin_open:trueのプロセスへ入力。既定10秒・最大30秒。累積stdout/stderrと終了状態を返す。同じcallIdの再取得は入力を繰り返さない。閉じたstdinには送らない
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
  const cleanNul = text => text.replace(/\0/g, ' ');
  let turn = cleanNul(CONTRACT + '\n---\n指示: ' + instruction);
  if (toolResult !== undefined) {
    turn += '\n前のツール結果: ' + JSON.stringify(toolResult, (_key, value) => typeof value === 'string' ? cleanNul(value) : value);
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
      raw = await sendViaUi(buildTurn(instruction, toolResult) + '\n今すぐ実行してください。JSONのみで再出力してください。');
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
    if (options.onHistoryStep !== undefined && typeof options.onHistoryStep !== 'function') throw new TypeError('onHistoryStep must be a function');
    if (options.onFindResult !== undefined && typeof options.onFindResult !== 'function') throw new TypeError('onFindResult must be a function');
    if (options.onExecOutput !== undefined && typeof options.onExecOutput !== 'function') throw new TypeError('onExecOutput must be a function');
    if (options.onPatchPreview !== undefined && typeof options.onPatchPreview !== 'function') throw new TypeError('onPatchPreview must be a function');
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
    const report = async (name, ok, value, args) => {
      steps.push({name, ok});
      if (name !== 'done') await options.onHistoryStep?.({index: steps.length, name, ok, args, result: value});
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
          await report('done', true, lastAction.summary);
          return {summary: lastAction.summary, steps};
        }
        try {
          const index = steps.length + 1;
          previous = await executeTool(lastAction.name, lastAction.args, {onExecOutput: options.onExecOutput && (output => options.onExecOutput({index, output})), onPatchPreview: options.onPatchPreview && (async diff => {
            await options.onPatchPreview({index: steps.length + 1, diff}); checkRunning();
          })});
          if (lastAction.name === 'core/find' && previous.ok && previous.result?.structuredContent) options.onFindResult?.({index, result: previous.result.structuredContent});
        } catch (error) {
          previous = {ok: false, error: error.message};
        }
        await report(lastAction.name, previous.ok, previous.ok ? previous.result : previous.error, lastAction.args);
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
    const timer = setTimeout(() => finish({ok: false, error: `Venice bridge timed out: op=${op}`}), (op === 'requestGrant' ? 130_000 : 45_000));
    window.addEventListener('message', onMessage);
    try {
      window.postMessage({__cosVeniceBridge: {id, op, args}}, 'https://venice.ai');
    } catch (error) {
      finish({ok: false, error: error.message});
    }
  });
}

// A transport retry reuses the callId. An unknown outcome never starts another effect.
const execObservers = new Set();
function stopExecObservers() { for (const observer of execObservers) observer.cancelled = true; execObservers.clear(); }

async function callLocalTool(tool, args = {}, beforeApply, onExecOutput) {
  const request = {callId: crypto.randomUUID(), surface: 'core', tool, args};
  if (tool === 'apply_patch' && beforeApply) {
    const preview = await callVeniceBridge('previewPatch', request);
    if (typeof preview?.diff !== 'string') throw new Error('Invalid patch preview');
    await beforeApply(preview.diff);
  }
  let settled = false, latest = null;
  const observer = {cancelled: false};
  if (tool === 'exec_command' && onExecOutput) {
    execObservers.add(observer);
    void (async () => {
      try {
        while (!observer.cancelled) {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (observer.cancelled) break;
          const reply = await callVeniceBridge('execOutput', request);
          if (observer.cancelled) break;
          if (reply?.output) { latest = reply.output; onExecOutput(latest); }
          if (settled && !latest?.running) break;
        }
      } catch (error) { if (!observer.cancelled) onExecOutput({callId: request.callId, observationError: error.message}); }
      finally { execObservers.delete(observer); }
    })();
  }
  try { for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try { response = await callVeniceBridge('localTool', request); }
    catch (error) { if (attempt === 0) continue; throw new Error(`${error.message} (callId=${request.callId})`); }
    if (!response || response.callId !== request.callId) throw new Error('Invalid local tool response');
    if (response.state === 'pending' && attempt === 0) continue;
    if (response.state !== 'completed' || response.error) {
      throw new Error(`${response.error || response.state || 'unknown'} (callId=${request.callId})`);
    }
    if (response.result?.isError) throw new Error(response.result.content?.filter(part => part.type === 'text').map(part => part.text).join('\n') || `Local ${tool} failed`);
    if (['exec_command', 'write_stdin'].includes(tool) && response.result?.structuredContent) {
      latest = response.result.structuredContent; onExecOutput?.(latest);
    }
    return response.result;
  } } finally { settled = true; }
}

const TOOL_REGISTRY = Object.freeze({
  'core/read': args => callLocalTool('read', args),
  'core/find': args => callLocalTool('find', args),
  'core/apply_patch': (args, beforeApply) => callLocalTool('apply_patch', args, beforeApply),
  'core/exec_command': (args, _beforeApply, onOutput) => callLocalTool('exec_command', args, undefined, onOutput),
  'core/write_stdin': (args, _beforeApply, onOutput) => callLocalTool('write_stdin', args, undefined, onOutput),
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

async function executeTool(name, args, options = {}) {
  if (!Object.hasOwn(TOOL_REGISTRY, name)) throw new Error('未登録のツール: ' + name);
  try {
    return {ok: true, result: await TOOL_REGISTRY[name](args, options.onPatchPreview, options.onExecOutput)};
  } catch (error) {
    return {ok: false, error: error.message};
  }
}

if (location.origin === 'https://venice.ai' && !window.__cosVeniceAgent) {
  const __agent = createAgent(text => window.__cosVeniceSend.sendViaUi(text));
  window.__cosVeniceAgent = Object.freeze({
    runTurn: __agent.runTurn, runTask: __agent.runTask, stopTask: __agent.stopTask, executeTool, TOOL_REGISTRY, buildTurn, parseAction,
    localIdentity: () => callVeniceBridge('localIdentity'),
    setLocalRun: runId => callVeniceBridge('setLocalRun', {runId}),
    requestGrant: instructionSummary => callVeniceBridge('requestGrant', {instructionSummary}),
    revokeLocal: () => { stopExecObservers(); return callVeniceBridge('revokeLocal'); }
  });
  const origin = 'https://venice.ai';
  let panelTask = null, retainedGrant = null;
  const postPanel = (id, event, payload = {}) => window.postMessage({
    type: 'cos-venice-panel-event', id, event, ...payload
  }, origin);
  const historyText = value => {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return {text: text.slice(0, 64000), truncated: text.length > 64000};
  };
  const recordHistory = async event => {
    // A lost acknowledgement retries the same history key; it never repeats the tool.
    const once = async () => {
      const reply = await callVeniceBridge('runEvent', {event});
      if (reply?.recorded !== true) throw new Error('VENICE_HISTORY_SAVE_FAILED');
      return reply;
    };
    try { return await once(); }
    catch { return await once(); }
  };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== origin || event.data?.type !== 'cos-venice-panel-request') return;
    const message = event.data;
    if (message.op === 'ready') { postPanel(null, 'ready'); return; }
    if (typeof message.id !== 'string' || !message.id) return;
    if (message.op === 'patchPreviewRendered') {
      if (typeof message.previewId === 'string' && message.id === panelTask?.id && message.previewId === panelTask?.preview?.id) panelTask.preview.resolve();
      return;
    }
    if (message.op === 'stop') {
      if (message.id !== panelTask?.id && message.id !== retainedGrant?.id) return;
      if (panelTask) { panelTask.cancelled = true; panelTask.preview?.reject(new Error('Patch preview stopped')); window.__cosVeniceAgent.stopTask(); }
      stopExecObservers();
      postPanel(message.id, 'stopping');
      void callVeniceBridge('revokeLocal').then(() => postPanel(message.id, 'revoked'),
        error => postPanel(message.id, 'error', {error:error.message}));
      return;
    }
    if (message.op !== 'run') return;
    if (panelTask) { postPanel(message.id, 'error', {error: 'タスクは既に実行中です。'}); return; }
    if (typeof message.instruction !== 'string' || !message.instruction.trim()) {
      postPanel(message.id, 'error', {error: '指示を入力してください。'}); return;
    }
    const state = {id:message.id, cancelled:false};
    panelTask = state;
    postPanel(message.id, 'awaiting');
    void (async () => {
      stopExecObservers();
      const grant = await callVeniceBridge('requestGrant', {instructionSummary:message.instruction.slice(0,1000), instruction:message.instruction});
      if (state.cancelled) { await callVeniceBridge('revokeLocal'); throw Object.assign(new Error('タスクを停止しました。'),{code:'VENICE_TASK_STOPPED'}); }
      retainedGrant = {id:message.id,runId:grant.runId};
      postPanel(message.id, 'granted', {runId:grant.runId});
      postPanel(message.id, 'started');
      return window.__cosVeniceAgent.runTask(message.instruction, {
        maxSteps: message.maxSteps,
        onStep: (step, preview) => postPanel(message.id, 'step', {step, preview}),
        onHistoryStep: async step => {
          if (state.cancelled) return;
          // Successful Core calls already have canonical app-recorded arguments/results.
          if (step.ok && step.name.startsWith('core/')) return;
          const args = historyText(step.args), result = historyText(step.result);
          await recordHistory({type: 'step', index: step.index, name: step.name, ok: step.ok,
            args: args.text, result: result.text, truncated: args.truncated || result.truncated});
        },
        onFindResult: result => postPanel(message.id, 'find-result', result),
        onExecOutput: event => { if (!state.cancelled) postPanel(message.id, 'exec-output', event); },
        onPatchPreview: preview => new Promise((resolve, reject) => {
          const id = crypto.randomUUID();
          const finish = error => { clearTimeout(timer); state.preview = null; if (error) reject(error); else resolve(); };
          const timer = setTimeout(() => finish(new Error('Patch preview was not displayed')), 5_000);
          state.preview = {id, resolve: () => finish(), reject: finish};
          postPanel(message.id, 'patch-preview', {...preview, previewId: id});
        })
      });
    })().then(async result => {
      if (state.cancelled) { postPanel(message.id, 'stopped'); return; }
      const summary = historyText(result.summary);
      await recordHistory({type: 'completed', message: summary.text, truncated: summary.truncated});
      postPanel(message.id, 'done', {summary:result.summary});
    }, async error => {
      if (!state.cancelled && retainedGrant?.id === state.id) {
        const failure = historyText(error.message);
        await recordHistory({type: 'failed', message: failure.text, truncated: failure.truncated});
      }
      postPanel(message.id, state.cancelled || error.code === 'VENICE_TASK_STOPPED' ? 'stopped' : 'error', {error:error.message});
    }).catch(error => postPanel(message.id, state.cancelled ? 'stopped' : 'error', {error:error.message})).finally(() => { if (panelTask === state) panelTask = null; });
  });
  postPanel(null, 'ready');
}
