/* Fixture #2 body, with only input.messages and agentModelId supplied by the caller. */
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

  window.__cosVeniceSend = Object.freeze({ sendTurn });
})();
