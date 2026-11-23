import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { stripTypeScriptTypes } from 'node:module';
import { expect, it, vi } from 'vitest';
const source = readFileSync('src/renderer/chat.ts','utf8');
const start = source.indexOf('export function initVeniceGrantDialog()');
const code = stripTypeScriptTypes(source.slice(start,source.indexOf('export function initChat(',start)).replace('export function','function'));
const html = readFileSync('src/renderer/index.html','utf8').match(/<dialog class="plugin-dialog" id="veniceGrantDialog"[\s\S]*?<\/dialog>/)![0];
it('renders exact approval copy, app-owned identity and selected paths safely; no folder means no approval', async () => {
  const dom = new JSDOM(html,{runScripts:'outside-only'}), w = dom.window;
  const dialog = w.document.querySelector('dialog')!;
  dialog.showModal = () => dialog.setAttribute('open',''); dialog.close = () => dialog.removeAttribute('open');
  let publish!: (rows: unknown[])=>void;
  const pending = {id:'synthetic',sessionId:'app-session',sessionTitle:'App <b>owner</b>',project:{id:'p',name:'Local project'},tab:{id:7,url:'https://venice.ai/chat/synthetic'},instructionSummary:'<img src=x>',tools:['core/read'],roots:[]};
  const api = {onVeniceGrantPending:(fn:typeof publish)=>{publish=fn;},veniceGrantPending:async()=>({ok:true,data:[]}),
    veniceGrantPick:vi.fn(async()=>({ok:true,data:[{...pending,roots:['/private/tmp/<picked>']}]})),veniceGrantAnswer:vi.fn(async()=>({ok:true}))};
  (w as unknown as {api:unknown}).api=api; w.eval('const api=window.api;'+code+';initVeniceGrantDialog();');
  await Promise.resolve(); publish([pending]);
  const button=w.document.getElementById('veniceGrantAllow') as HTMLButtonElement;
  expect(button.disabled).toBe(true); button.click(); expect(api.veniceGrantAnswer).not.toHaveBeenCalled();
  expect(w.document.getElementById('veniceGrantTitle')!.textContent).toBe('Veniceによるファイルの読み取りを許可しますか？');
  expect(w.document.getElementById('veniceGrantDescription')!.textContent).toBe('このrunでは、選択したフォルダー内のファイル内容を読み取り、Veniceへ送信できます。');
  expect(w.document.querySelectorAll('img,b')).toHaveLength(0);
  expect(w.document.activeElement?.id).toBe('veniceGrantDeny');
  w.document.getElementById('veniceGrantPick')!.click(); await new Promise(resolve=>setImmediate(resolve));
  expect(button.disabled).toBe(false); expect(w.document.getElementById('veniceGrantRoots')!.textContent).toBe('/private/tmp/<picked>');
  button.click(); await Promise.resolve(); expect(api.veniceGrantAnswer).toHaveBeenCalledWith('synthetic',true);
  publish([]); expect(dialog.open).toBe(false); dom.window.close();
});
it('Escape refuses instead of silently closing the pending approval', async()=>{
  const dom = new JSDOM(html,{runScripts:'outside-only'}), w=dom.window;
  const dialog=w.document.querySelector('dialog')!; dialog.showModal=()=>dialog.setAttribute('open',''); dialog.close=()=>dialog.removeAttribute('open');
  let publish!:(rows:unknown[])=>void; const answer=vi.fn(async()=>({ok:true}));
  (w as unknown as {api:unknown}).api={onVeniceGrantPending:(fn:typeof publish)=>{publish=fn;},veniceGrantPending:async()=>({ok:true,data:[]}),veniceGrantAnswer:answer};
  w.eval('const api=window.api;'+code+';initVeniceGrantDialog();'); await Promise.resolve();
  publish([{id:'pending',sessionTitle:'App',sessionId:'s',project:null,tab:{id:7,url:'https://venice.ai/'},instructionSummary:'test',roots:[]}]);
  dialog.dispatchEvent(new w.Event('cancel',{cancelable:true})); await Promise.resolve(); expect(answer).toHaveBeenCalledWith('pending',false); dom.window.close();
});
