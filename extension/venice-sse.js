/* Offline parser for the captured Venice SSE format. Never sends or reads browser state. */
(() => {
  'use strict';

  const FAILURE_EVENTS = new Set([
    'error', 'response.error', 'response.failed', 'response.incomplete', 'response.cancelled'
  ]);

  function parse(raw) {
    if (typeof raw !== 'string') throw new TypeError('SSE input must be a string');
    const frames = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n\n');
    // The last element is either empty or an unterminated frame; neither is a complete event.
    frames.pop();
    let text = '', reasoning = '', ok = false, termination = 'eof', malformedJsonEvents = 0;

    for (const frame of frames) {
      let event = '';
      const lines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''));
      }
      if (!lines.length) continue; // Includes : keepalive comments.
      const data = lines.join('\n');
      if (data.trim() === '[DONE]') {
        termination = 'done_without_completed';
        break;
      }

      let payload;
      try { payload = JSON.parse(data); }
      catch { malformedJsonEvents++; continue; }

      if (event === 'response.completed') {
        ok = true;
        termination = event;
        break;
      }
      if (FAILURE_EVENTS.has(event)) {
        termination = event;
        break;
      }
      if (event !== 'response.output_text.delta' && event !== 'output_text.delta') continue;
      if (!payload || typeof payload.delta !== 'string') continue;
      if (payload.output_index === 1) text += payload.delta;
      else if (payload.output_index === 0) reasoning += payload.delta;
    }

    return { text, reasoning, ok, termination, malformedJsonEvents };
  }

  globalThis.__cosVeniceSse = Object.freeze({ parse });
})();
