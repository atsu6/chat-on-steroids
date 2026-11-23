const CONTRACT = `あなたは現在のタブのDOMを操作するエージェントです。必ず次のどちらか1つだけを出力してください。前後に地の文を書かないこと。
{"action":"tool","name":"<name>","args":{...}}
{"action":"done","summary":"<完了報告>"}
利用可能なツール:
now() -> 現在時刻のISO文字列
query({selector}) -> 件数と最大20件の番号・tagName・id・クラス先頭・テキスト先頭40文字
read_text({selector?}) -> 指定要素（省略時body）のinnerText、空白を畳んで最大2000文字
click_selector({selector}) -> 最初の一致要素へスクロールしてclick。okはclickイベント発生の確認で、処理完了の確認ではない
scroll({dy}) -> window.scrollBy(0, dy)後のscrollY`;

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
  async function runTurn(instruction, toolResult) {
    let raw = await sendViaUi(buildTurn(instruction, toolResult));
    let parsed = parseAction(raw);
    if (parsed === null) {
      raw = await sendViaUi(buildTurn(instruction, 'JSONのみで再出力してください。'));
      parsed = parseAction(raw);
    }
    if (parsed === null) throw new Error('エージェントの応答を JSON として解析できませんでした。');
    const {action, name, args, summary} = parsed;
    return {action, name, args, summary, raw};
  }

  async function runTask(instruction, options = {}) {
    const requested = options.maxSteps ?? 10;
    if (!Number.isInteger(requested) || requested < 1) {
      throw new TypeError('maxSteps must be a positive integer');
    }
    const maxSteps = Math.min(requested, 40);
    const steps = [];
    let previous, lastAction;
    for (let i = 0; i < maxSteps; i++) {
      lastAction = await runTurn(instruction, previous);
      if (lastAction.action === 'done') {
        steps.push({name: 'done', ok: true});
        return {summary: lastAction.summary, steps};
      }
      try {
        previous = await executeTool(lastAction.name, lastAction.args);
      } catch (error) {
        previous = {ok: false, error: error.message};
      }
      steps.push({name: lastAction.name, ok: previous.ok});
    }
    const error = new Error(`runTask exceeded maxSteps: steps=${steps.length}, lastAction=${JSON.stringify(lastAction)}`);
    Object.assign(error, {stepCount: steps.length, lastAction, steps});
    throw error;
  }

  return {runTurn, runTask};
}

const compactText = text => text.replace(/\s+/g, ' ').trim();
function requireSelector(selector) {
  if (typeof selector !== 'string' || !selector.trim()) throw new TypeError('selector must be a non-empty string');
  return selector;
}

const TOOL_REGISTRY = Object.freeze({
  now: () => new Date().toISOString(),
  query: ({selector} = {}) => {
    const nodes = document.querySelectorAll(requireSelector(selector));
    return {count: nodes.length, matches: Array.from(nodes).slice(0, 20).map((element, i) => ({
      index: i + 1, tagName: element.tagName, id: element.id,
      className: (element.getAttribute('class') ?? '').slice(0, 80),
      text: compactText(element.textContent ?? '').slice(0, 40)
    }))};
  },
  read_text: ({selector} = {}) => {
    const element = selector === undefined ? document.body : document.querySelector(requireSelector(selector));
    if (!element) throw new Error('Element not found');
    return compactText(element.innerText).slice(0, 2000);
  },
  click_selector: ({selector} = {}) => {
    const element = document.querySelector(requireSelector(selector));
    if (!element) throw new Error('Element not found');
    if (element.matches(':disabled') || element.closest('[inert]') || typeof element.click !== 'function') {
      throw new Error('Element cannot be clicked');
    }
    element.scrollIntoView({block: 'center', inline: 'nearest'});
    if (!element.isConnected) throw new Error('Element was detached before click');
    let clicked = false;
    const onClick = () => { clicked = true; };
    element.addEventListener('click', onClick, {capture: true});
    try {
      element.click();
    } finally {
      element.removeEventListener('click', onClick, {capture: true});
    }
    if (!clicked) throw new Error('No click event was observed');
    return {clicked: true};
  },
  scroll: ({dy} = {}) => {
    if (typeof dy !== 'number' || !Number.isFinite(dy)) throw new TypeError('dy must be a finite number');
    window.scrollBy(0, dy);
    return window.scrollY;
  },
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
    runTurn: __agent.runTurn, runTask: __agent.runTask, executeTool, TOOL_REGISTRY, buildTurn, parseAction
  });
}
