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

作業ツリーには別ファイル `extension/venice-send-ui.js` も存在するが、現在のmanifestには登録されていない。
エージェントは `extension/venice-send.js` の `__cosVeniceSend.sendViaUi` を使う。

他の4つは境界の宣言のみ。コールバックのペイロード、完了判定、モデル選択の実装は（空欄・不明）。

## DOMツールとタスク実行（ローカル合成検証済み）

`extension/venice-agent.js` はVenice用MAIN / document_startで読み込まれ、
`window.__cosVeniceAgent` に `runTurn`、`runTask`、`executeTool` を公開する。
読み込みだけでは送信もタスク実行もしない。

`executeTool(name, args)` は成功時 `{ok: true, result}`、登録済みツールの失敗時は
`{ok: false, error}` を返す。未登録名の直接呼び出しは従来どおり例外になる。
各ツールの引数はJSONオブジェクト。MAINからChrome APIは呼ばず、DOM操作は専用の作業タブへ転送する。
これらのDOMツールがVenice脳タブを直接参照・操作する経路は残さない。

- `now` / `{}`: 現在時刻のISO文字列。既存の戻り値を維持する。
- `tab_open` / `{url}`: 作業タブを作成し、既にあればそのタブを指定URLへ遷移させる。
  HTTP(S)の絶対URLのみ受け付け、読み込み後のURLを返す。リダイレクト先もこの戻り値に反映する。
- `query` / `{selector}`: `querySelectorAll` の総件数 `count` と最大20件の `matches`。
  各行は1始まりの `index`、`tagName`、`id`、`className` の先頭80文字、
  空白を畳んだ `textContent` の先頭40文字を持つ。
- `read_text` / `{selector?}`: 最初の一致要素（省略時body）の `innerText`。
  空白を畳んで最大2000文字。見つからなければ `ok: false`。
- `click_selector` / `{selector}`: 最初の一致要素を `scrollIntoView` して `click()`。
  clickイベントを観測できれば `ok: true` / `result: {clicked: true}`。
  対象なし、disabled、inert、切断済み、イベント未発生は `ok: false`。
  クリック先のアプリ処理・通信の成功までは意味しない。
- `scroll` / `{dy}`: 有限の数値を受け取り、`window.scrollBy(0, dy)` 後の `scrollY` を返す。

DOMツールの前に `tab_open` を実行する。作業タブがない場合はすべて
`{ok: false, error: '作業タブがありません。先に tab_open(url) を実行してください。'}` を返す。
別のタブやVeniceタブへフォールバックしない。

`runTask(instruction, {maxSteps?})` は毎ステップ、同じ指示と直前のツール結果で
`runTurn` を呼ぶ。既定10ステップ、40超の指定は40に制限する。
正の整数以外は送信前に例外になる。
`tool` は `executeTool` の結果を次へ渡し、失敗・未登録名も `ok: false` の結果として渡す。
`done` は即座に `{summary, steps}` を返す。
`steps` は各モデルステップの `{name, ok}` で、終了ステップも `{name: 'done', ok: true}` として含む。
上限内に `done` がなければ、件数と最後のactionを含む例外を投げる。
例外の `stepCount`、`lastAction`、`steps` から経過も参照できる。

検証は合成DOM・合成モデル応答のみ。実Veniceでのタスクループは実行していない。

## MAINから作業タブへのブリッジ

`venice-bridge.js` は `https://venice.ai/*` のみに ISOLATED / document_start で登録する。
経路は `venice-agent.js`（MAIN）→ window message → `venice-bridge.js`（ISOLATED）→
`chrome.runtime.sendMessage` → `background.js` のVenice専用分岐。
既存のChatGPTメッセージ処理は変更しない。

要求は `{__cosVeniceBridge: {id, op, args}}`、応答は
`{__cosVeniceBridgeReply: {id, ok, result?, error?}}`。
ISOLATEDは同じwindow・originが `https://venice.ai` の要求だけを、固定type
`cos-venice-bridge` で転送する。backgroundでも拡張ID、送信元URL/origin、トップフレーム、
脳タブの現在URLを検査する。idは応答の対応付けであり、認証情報ではない。
同じVeniceページ内のJavaScriptもこのブリッジを呼べる。

backgroundは脳タブごとに1つの作業タブを所有し、IDを
`chrome.storage.session` の `cosVeniceWorkTab:<brainTabId>` に保存する。
要求は既存の `serializeTab` で脳タブごとに直列化する。worker再起動後も保存IDを再利用する。

- `ensureTab` / `{url}`: 未作成なら `tabs.create({url, active: false})`。
  既存なら `tabs.update(tabId, {url})`。読み込み完了を最大30秒待ち、
  `{ok: true, result: {tabId, url}}` を返す。Veniceタブは遷移させない。
- `eval` / `{name, args}`: background内の固定関数表にあるDOM 4ツールだけを
  `scripting.executeScript` で作業タブのトップフレーム・ISOLATEDに実行する。
  任意コードや関数名の式評価は受け付けない。戻り値はDOMツールの `{ok, result?, error?}`。
- `activate`: 作業タブへ `tabs.update(tabId, {active: true})`。
- `close`: 作業タブを閉じ、保存したIDを削除する。

ensureTab以外は作業タブがないと失敗する。手動で閉じたIDは次の要求で削除し、
明示的なensureTabだけが再作成する。Chrome APIの拒否をタブ不在と扱って再作成しない。
MAINは45秒で応答待ちを打ち切り、イベントリスナーを解除する。自動再実行はしない。
タイムアウトは操作の取消を意味しないため、再試行前にタブの状態を確認する。

```sh
cd /Users/atsu/chat-on-venice
node --check extension/background.js
node --check extension/venice-bridge.js
node --check extension/venice-agent.js
node --check test/venice-agent.test.cjs
node --check test/venice-bridge-harness.cjs
node --check test/venice-bridge.test.cjs
node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-ui-send.test.cjs
```

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
