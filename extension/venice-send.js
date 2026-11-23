/* UI input sender; the legacy fixture-based fetch sender remains unused. */
(() => {
  'use strict';
  if (location.origin !== 'https://venice.ai' || window.__cosVeniceSend) return;

  const TEMPLATE = {
    "clientTools": [
      {
        "description": "Asks the user to approve spending credits on paid usage. Venice calls this itself; never call it.",
        "inputSchema": {
          "properties": {},
          "type": "object"
        },
        "name": "approve_paid_usage"
      },
      {
        "description": "Edit a video from the conversation and produce a new video. Provide the source video's media_id and an     ordered list of operations. Supported operations: trim (keep a time range), add_audio (add or replace the     audio track using another media_id, optionally mixing), concat (append other clips), set_volume (scale or     mute the existing audio; 0 mutes), speed (change playback speed), and resize (change dimensions). The edited     video is rendered before the tool returns, and the result includes the media_id of the finished video, which     you can pass as source_media_id to run further edits on the result. If an edit fails, do not retry     automatically. Instead, inform the user that the edit failed and explain the reason. Only retry if the user     explicitly asks.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "operations": {
              "description": "Ordered list of edit operations applied to the source video.",
              "minItems": 1,
              "type": "array",
              "items": {
                "oneOf": [
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "trim"
                      },
                      "end_seconds": {
                        "description": "End of the kept range, in seconds.",
                        "type": "number",
                        "minimum": 0
                      },
                      "start_seconds": {
                        "description": "Start of the kept range, in seconds.",
                        "type": "number",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "end_seconds",
                      "op",
                      "start_seconds"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "add_audio"
                      },
                      "source_media_id": {
                        "description": "media_id of the audio (or video) providing the new audio.",
                        "type": "string",
                        "minLength": 1
                      },
                      "mode": {
                        "description": "'replace' swaps the video's audio for the new track; 'mix' overlays it. Defaults to 'replace'.",
                        "type": "string",
                        "enum": [
                          "mix",
                          "replace"
                        ]
                      },
                      "volume": {
                        "description": "Volume multiplier for the added audio (1 = unchanged).",
                        "type": "number",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "op",
                      "source_media_id"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "concat"
                      },
                      "source_media_ids": {
                        "description": "media_ids of clips to append after the source video, in order.",
                        "minItems": 1,
                        "type": "array",
                        "items": {
                          "type": "string",
                          "minLength": 1
                        }
                      }
                    },
                    "required": [
                      "op",
                      "source_media_ids"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "set_volume"
                      },
                      "factor": {
                        "description": "Volume multiplier applied to the existing audio (0 = mute).",
                        "type": "number",
                        "minimum": 0
                      }
                    },
                    "required": [
                      "factor",
                      "op"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "speed"
                      },
                      "factor": {
                        "description": "Playback speed multiplier (>1 speeds up, <1 slows down).",
                        "type": "number",
                        "exclusiveMinimum": 0
                      }
                    },
                    "required": [
                      "factor",
                      "op"
                    ],
                    "additionalProperties": false
                  },
                  {
                    "type": "object",
                    "properties": {
                      "op": {
                        "type": "string",
                        "const": "resize"
                      },
                      "height": {
                        "description": "Target height in pixels.",
                        "type": "integer",
                        "exclusiveMinimum": 0,
                        "maximum": 9007199254740991
                      },
                      "width": {
                        "description": "Target width in pixels.",
                        "type": "integer",
                        "exclusiveMinimum": 0,
                        "maximum": 9007199254740991
                      },
                      "fit": {
                        "description": "Fit algorithm. Defaults to 'contain'.",
                        "type": "string",
                        "enum": [
                          "contain",
                          "cover",
                          "fill"
                        ]
                      }
                    },
                    "required": [
                      "height",
                      "op",
                      "width"
                    ],
                    "additionalProperties": false
                  }
                ]
              }
            },
            "source_media_id": {
              "description": "media_id of the source video to edit.",
              "type": "string",
              "minLength": 1
            }
          },
          "required": [
            "operations",
            "source_media_id"
          ],
          "additionalProperties": false
        },
        "name": "edit_video"
      }
    ],
    "input": {
      "messages": []
    }
  };
  const CAPTURED_URL = "https://outerface.venice.ai/api/inference/chat/agents/venice?agentModelId=deepseek-v4-1-flash&allowPaidImages=true&paidImagesMode=allow";

  // 403 のため未使用。UI sender からは呼ばず、自動再試行もしない。
  function sendTurn(messages, model) {
    if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
    if (typeof model !== 'string' || !model.trim()) throw new TypeError('model must be a non-empty string');
    const url = new URL(CAPTURED_URL);
    url.searchParams.set('agentModelId', model);
    const body = structuredClone(TEMPLATE);
    body.input.messages = messages;
    return window.fetch(url.href, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const sendButton = () => document.querySelector('button[aria-label*="送信"], button[type="submit"]');
  const buttonDisabled = button => button.disabled || button.matches(':disabled');
  function pressEnter(textarea) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      textarea.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, charCode: type === 'keypress' ? 13 : 0,
        which: 13, bubbles: true, cancelable: true, composed: true, isComposing: false
      }));
    }
  }

  let sending = false;
  async function sendViaUi(text) {
    if (typeof text !== 'string' || !text.trim()) throw new TypeError('text must be a non-empty string');
    if (sending) throw new Error('UI送信は既に実行中です。');
    const recon = window.__cosVeniceRecon;
    const parser = window.__cosVeniceSse;
    if (!recon || !parser) throw new Error('Venice の記録器または SSE パーサが未注入です。');
    const textarea = document.querySelector('textarea[aria-label="チャットメッセージ入力"]');
    if (!textarea) throw new Error('チャットメッセージ入力の TEXTAREA が見つかりません。');
    if (!recon.status().recording) recon.start();
    const baseline = recon.chatProgress().lastChatNumber;
    const bodies = new Map();
    const unfollow = recon.follow((chunk, number) => {
      if (number > baseline) bodies.set(number, (bodies.get(number) ?? '') + chunk);
    });
    sending = true;
    try {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, text);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await nextFrame();
      await nextFrame();
      await sleep(50);
      if (!textarea.value.trim()) throw new Error('待機後の TEXTAREA が空のため送信を停止しました。');
      const button = sendButton();
      if (button && !buttonDisabled(button)) {
        await sleep(100);
        if (button.isConnected && !buttonDisabled(button)) button.click();
        else pressEnter(textarea);
      } else {
        pressEnter(textarea);
      }
      const sentAt = Date.now();
      const deadline = sentAt + 90_000;
      let nudged = false;
      for (;;) {
        await sleep(500);
        const last = recon.chatProgress();
        if (Date.now() <= deadline && last.lastChatNumber > baseline && last.lastChatBodyComplete) {
          const parsed = parser.parse(bodies.get(last.lastChatNumber) ?? '');
          if (!parsed.ok) {
            throw new Error(`Venice SSE が正常終了しませんでした: record=${last.lastChatNumber}, status=${last.lastChatStatus}, termination=${parsed.termination}`);
          }
          return parsed.text;
        }
        if (Date.now() >= deadline) {
          const currentButton = sendButton();
          const diagnostics = {
            textareaLength: textarea.value.length,
            buttonFound: Boolean(currentButton),
            buttonDisabled: currentButton ? buttonDisabled(currentButton) : null
          };
          const error = new Error(`Venice UI送信が90秒でタイムアウトしました: baseline=${baseline}, chatProgress=${JSON.stringify(last)}, textarea.value.length=${diagnostics.textareaLength}, buttonFound=${diagnostics.buttonFound}, buttonDisabled=${diagnostics.buttonDisabled}`);
          error.baseline = baseline;
          error.chatProgress = last;
          Object.assign(error, diagnostics);
          throw error;
        }
        if (!nudged && Date.now() - sentAt >= 2_000 && last.lastChatNumber === baseline) {
          nudged = true;
          pressEnter(textarea);
        }
      }
    } finally {
      unfollow();
      sending = false;
    }
  }

  window.__cosVeniceSend = Object.freeze({ sendTurn, sendViaUi });
})();
