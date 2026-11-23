# Venice adapter boundary

- `sendViaUi(text)`
- `onChunk(cb)`
- `onDone(cb)`
- `setModel(id)`
- `isAlive()`

## 送信実装の現状（2026-11-23）

`extension/venice-send.js` に `sendViaUi(text)` が存在する。
空でない文字列を受け取り、UI入力と応答の取得・SSE解析を経て、本文文字列を返す非同期関数。
送信中の重複呼び出し、依存や入力欄の不足、タイムアウト、SSEの異常終端は例外になる。
モデル指定の引数はなく、旧 `sendTurn(messages, model)` の置き換えに伴い戻り値も
Response ではなく本文文字列になっている。

2026-11-23のユーザー報告では、UI経由の1ターンでHTTP 200と本文「黄色い自転車」を取得した。
これは本タスクでの再送・独立検証の結果ではなく、captureファイル名とrecord番号は未提供。
詳細は `docs/venice-findings.md` の「2026-11-23 追記 — UI送信成功のユーザー報告」を参照。

旧 `sendTurn(messages, model)` は「403 のため未使用」のコメント付きで残っている。
fetch再現の403の原因、§12(d)の解釈、attestationと認証ヘッダの要否は未確認のまま。

作業ツリーには別ファイル `extension/venice-send-ui.js` とそのmanifest登録も存在する。
今回の文書更新では削除・登録変更を行っておらず、実装の一本化は未完了。

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
