# Venice adapter boundary

- `sendTurn(messages, model)`
- `onChunk(cb)`
- `onDone(cb)`
- `setModel(id)`
- `isAlive()`

`sendTurn` のみ `extension/venice-send.js` に実装した。
実通信の検証は HTTP 403 とプログラム利用禁止の警告で停止中。HTTP 200 は未確認。
Venice ページの MAIN 文脈で読み込むと `window.__cosVeniceSend.sendTurn(messages, model)` が使える。
messages は fixture の `input.messages` と同じ配列形式、model はURLの `agentModelId` に入れる文字列。
戻り値は fetch の Promise で、元の Response をそのまま返す。401等のHTTPエラーもパース・再試行しない。
認証情報の生成・取得や認証ヘッダの追加は行わない。標準 Content-Type は `application/json`。

他の4つは境界の宣言のみ。コールバックのペイロード、完了判定、モデル選択の実装は（空欄・不明）。

## 取得済みSSEのオフライン解析

`extension/venice-sse.js` はブラウザやネットワークへアクセスしない純粋な文字列パーサ。
読み込んだ文脈で `__cosVeniceSse.parse(rawText)` が使える。

戻り値は `{ text, reasoning, ok, termination, malformedJsonEvents }`。
`text` は output_index 1、`reasoning` は0のdeltaだけを連結する。他のindexは無視する。
空行で完結したイベントの `event:` と `data:` を読み、複数のdata行は改行でまとめる。
壊れたJSONイベントは数えて捨て、その次を処理する。

`response.completed` が正常終了で `ok: true`。
それ以前の `[DONE]` は `done_without_completed`、未完了EOFは `eof`、
失敗・中止・不完全・errorイベントはその名前を `termination` に返し、すべて `ok: false`。
終端後のデータや、空行で閉じていない最後のフレームは採用しない。

```sh
cd /Users/atsu/chat-on-venice
node --check extension/venice-sse.js
node --test docs/venice-sse.test.cjs
# 元のローカルcaptureが必要。実測ファイルはGitへ追加しない。
node --test docs/venice-sse-fixture.test.cjs
```
