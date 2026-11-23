/* Manual, document-local fetch reconnaissance. No sends, retries or protocol parsing. */
(() => {
  'use strict';
  if (location.origin !== 'https://venice.ai' || window.__cosVeniceRecon) return;

  const MAX_REQUESTS = 8;
  const MAX_BODY_BYTES = 1024 * 1024;
  const MAX_CHUNKS = 2048;
  const REDACTED = '[REDACTED]';
  const sensitive = /authorization|cookie|session|token|secret|password|api[-_]?key|signature/i;
  let installed = false;
  let session = null;

  function remember(value, owner) {
    if (value) owner.secrets.add(value);
  }
  function headersOf(headers, owner) {
    const result = {};
    new Headers(headers).forEach((value, key) => {
      if (sensitive.test(key)) {
        remember(value, owner);
        // Also remove a Bearer credential if a response echoes only the token.
        if (/authorization/i.test(key)) remember(value.replace(/^\S+\s+/, ''), owner);
        if (/cookie/i.test(key)) {
          const pairs = key === 'set-cookie' ? [value.split(';')[0]] : value.split(';');
          for (const pair of pairs) remember(pair.slice(pair.indexOf('=') + 1).trim(), owner);
        }
        result[key] = REDACTED;
      } else result[key] = value;
    });
    return result;
  }
  function safeURL(value, owner) {
    const url = new URL(value, location.href);
    remember(url.username, owner); remember(url.password, owner);
    url.username = ''; url.password = ''; url.hash = '';
    for (const [key, value] of [...url.searchParams]) {
      if (!sensitive.test(key)) continue;
      remember(value, owner);
      url.searchParams.set(key, REDACTED);
    }
    return url.href;
  }
  function redact(text, owner) {
    // Text substitution only: JSON/SSE contents are not interpreted.
    let result = text.replace(
      /("[^"\n]*(?:authorization|cookie|session|token|secret|password|api[-_]?key)[^"\n]*"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"'
    ).replace(/^(\s*(?:authorization|proxy-authorization|cookie|set-cookie)\s*:)\s*.*$/gim, '$1 [REDACTED]');
    for (const secret of owner.secrets) result = result.split(secret).join(REDACTED);
    return result;
  }
  const emptyBody = () => ({ text: '', bytesCaptured: 0, chunks: [], complete: false, limitation: '' });
  function textBody(value) {
    const bytes = new TextEncoder().encode(value);
    return {
      text: new TextDecoder().decode(bytes.subarray(0, MAX_BODY_BYTES)),
      bytesCaptured: Math.min(bytes.length, MAX_BODY_BYTES), chunks: [],
      complete: bytes.length <= MAX_BODY_BYTES,
      limitation: bytes.length > MAX_BODY_BYTES ? 'body-byte-limit' : ''
    };
  }
  async function readBody(stream, body, owner) {
    if (!stream) { body.complete = true; return; }
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    owner.readers.add(reader);
    try {
      while (owner.recording) {
        const { done, value } = await reader.read();
        if (!owner.recording) break;
        if (done) { body.complete = true; break; }
        const bytes = value.subarray(0, MAX_BODY_BYTES - body.bytesCaptured);
        body.text += decoder.decode(bytes, { stream: true });
        body.bytesCaptured += bytes.length;
        body.chunks.push({ afterStartMs: Date.now() - owner.startedMs, byteLength: bytes.length });
        if (bytes.length < value.length || body.bytesCaptured >= MAX_BODY_BYTES || body.chunks.length >= MAX_CHUNKS) {
          body.limitation = body.chunks.length >= MAX_CHUNKS ? 'body-chunk-limit' : 'body-byte-limit';
          void reader.cancel().catch(() => {});
          break;
        }
      }
      if (owner.recording) body.text += decoder.decode();
    } catch {
      if (owner.recording) body.limitation = 'body-read-failed';
    } finally {
      owner.readers.delete(reader);
      reader.releaseLock();
    }
  }
  function requestBody(input, init, owner) {
    const body = emptyBody();
    try {
      if (init?.body != null) {
        const value = init.body;
        if (typeof value === 'string' || value instanceof URLSearchParams) return textBody(String(value));
        // Do not consume a caller-owned stream or invent FormData wire boundaries.
        body.limitation = 'non-text-init-body-not-read';
      } else if (input instanceof Request) {
        void readBody(input.clone().body, body, owner);
      } else body.complete = true;
    } catch { body.limitation = 'request-body-not-readable'; }
    return body;
  }
  function newRecord(owner, request, body) {
    if (!owner.recording || owner.records.length >= MAX_REQUESTS) return null;
    const record = { number: owner.records.length + 1, observedAt: new Date().toISOString(),
      request: { ...request, body }, response: null, networkError: '' };
    owner.records.push(record);
    return record;
  }
  function install() {
    if (installed || typeof window.fetch !== 'function') return;
    const downstream = window.fetch;
    window.fetch = function (...args) {
      const owner = session;
      let request = null, record = null;
      if (owner?.recording && owner.records.length < MAX_REQUESTS) {
        try {
          const [input, init] = args;
          const rawURL = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const url = new URL(rawURL, location.href);
          if (url.protocol === 'https:' && (url.hostname === 'venice.ai' || url.hostname.endsWith('.venice.ai'))) {
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            request = { url: safeURL(url.href, owner), method,
              headers: headersOf(init?.headers ?? input?.headers, owner),
              credentials: init?.credentials ?? input?.credentials ?? 'same-origin' };
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) record = newRecord(owner, request, requestBody(input, init, owner));
          }
        } catch { /* An unreadable request never changes native fetch behavior. */ }
      }
      const result = Reflect.apply(downstream, this, args);
      if (request) void result.then(response => {
        if (!owner.recording) return;
        try {
          // Read-only requests are retained only when the observed response is SSE.
          if (!record && request.method === 'GET' && response.headers.get('content-type')?.includes('text/event-stream')) {
            record = newRecord(owner, request, { ...emptyBody(), complete: true });
          }
          if (!record) return;
          record.response = { url: response.url ? safeURL(response.url, owner) : '', status: response.status,
            headers: headersOf(response.headers, owner), body: emptyBody() };
          void readBody(response.clone().body, record.response.body, owner);
        } catch { if (record) record.networkError = 'response-not-readable'; }
      }, () => { if (owner.recording && record) record.networkError = 'fetch-rejected'; });
      return result; // Preserve the exact native promise and original response body.
    };
    installed = true;
  }
  function status() {
    return { installed, recording: Boolean(session?.recording), requests: session?.records.length ?? 0,
      readingBodies: session?.readers.size ?? 0, limitReached: session?.records.length === MAX_REQUESTS };
  }
  function progress() {
    const last = session?.records.at(-1);
    return { recording: Boolean(session?.recording), requests: session?.records.length ?? 0,
      lastNumber: last?.number ?? 0, lastBodyComplete: last?.response?.body?.complete === true,
      lastStatus: last?.response?.status ?? null };
  }
  function start() {
    if (!installed) throw new Error('usage.js の Venice トレースが未注入です。ページを再読み込みしてください。');
    if (session?.recording) throw new Error('既に記録中です。先に save() または stop() を実行してください。');
    session = { startedMs: Date.now(), recording: true, records: [], readers: new Set(), secrets: new Set() };
    return status();
  }
  function stop() {
    if (!session) return status();
    session.recording = false;
    for (const reader of session.readers) void reader.cancel().catch(() => {});
    for (const record of session.records) {
      for (const body of [record.request.body, record.response?.body]) {
        if (body && !body.complete && !body.limitation) body.limitation = 'stopped-before-body-complete';
      }
    }
    return status();
  }
  function save() {
    if (!session) throw new Error('先に start() を実行してください。');
    stop();
    const filename = `venice-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const capture = {
      format: 'cos-venice-recon-v1', capturedAt: new Date().toISOString(),
      transport: 'fetch', bodyEncoding: 'UTF-8',
      unobservable: ['browser-added Cookie header (including HttpOnly session cookies)',
        'Set-Cookie header', 'XMLHttpRequest', 'WebSocket', 'EventSource'],
      limits: { requests: MAX_REQUESTS, bytesPerBody: MAX_BODY_BYTES, chunksPerBody: MAX_CHUNKS },
      limitReached: session.records.length === MAX_REQUESTS,
      records: session.records
    };
    // Sanitize string values before JSON escaping, including echoed credentials in bodies.
    const json = JSON.stringify(capture, (_key, value) => typeof value === 'string' ? redact(value, session) : value, 2);
    const blobURL = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = blobURL; link.download = filename;
    document.documentElement.appendChild(link);
    link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(blobURL), 60_000);
    return { filename, requests: session.records.length, savedBy: 'browser-download' };
  }
  window.__cosVeniceRecon = Object.freeze({ install, start, stop, save, status, progress });
})();
