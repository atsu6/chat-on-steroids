/* Venice MAIN -> ISOLATED -> service worker. No work starts on installation. */
(() => {
  'use strict';
  const ORIGIN = 'https://venice.ai';
  if (location.origin !== ORIGIN) return;
  void chrome.runtime.sendMessage({type:'cos-venice-bridge', id:crypto.randomUUID(), op:'localDocument'}).catch(() => {});
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== ORIGIN) return;
    const request = event.data?.__cosVeniceBridge;
    if (!request || typeof request.id !== 'string' || !request.id || typeof request.op !== 'string') return;
    let reply;
    try {
      reply = await chrome.runtime.sendMessage({
        type: 'cos-venice-bridge', id: request.id, op: request.op, args: request.args
      });
      if (!reply || typeof reply.ok !== 'boolean') throw new Error('Venice background returned no valid reply');
    } catch (error) {
      reply = {ok: false, error: error.message};
    }
    window.postMessage({__cosVeniceBridgeReply: {...reply, id: request.id}}, ORIGIN);
  });
})();
