# Venice adapter boundary

- `sendViaUi(text)`
- `onChunk(cb)`
- `onDone(cb)`
- `setModel(id)`
- `isAlive()`

## 送信実装の現状（2026-11-24）

`extension/venice-send.js` に `sendViaUi(text)` が存在する。
空でない文字列を受け取り、UI入力と応答の取得・SSE解析を経て、本文文字列を返す非同期関数。
送信中の重複呼び出し、依存や入力欄の不足、タイムアウト、SSEの異常終端は例外になる。
モデル指定の引数はなく、旧 `sendTurn(messages, model)` の置き換えに伴い戻り値も
Response ではなく本文文字列になっている。

入力欄は `form textarea[aria-label="チャットメッセージ入力"]` に限定する。
値の設定とinputイベントの後、requestAnimationFrameを2回と50ms待ち、入力値が空なら停止する。
続けて `form [aria-label="メッセージを送信"]` を100ms間隔・最大3000msで確認し、
出現してdisabledでなくなった時点でクリックする。フォーム外や汎用submitボタンは使わない。
期限内に有効なボタンが得られなければEnterへフォールバックする。
Enterの3イベントは `composed: true` / `isComposing: false` を指定する。
送信トリガ後に500ms間隔でchatProgressを確認し、2秒経ってもrecord番号が基準値のままの場合だけ、
Enterをもう1回送る（nudgeは最大1回）。新しいrecordの本文が未完了でも、番号が進んでいればnudgeしない。
このnudge条件は従来どおり、初回がボタンクリックの場合にも適用する。
応答待ちの上限90秒は初回の送信トリガ後から数える。
タイムアウト例外は従来の `baseline` / `chatProgress` に加え、`textareaLength`、
`buttonFound`、`buttonDisabled` を持ち、メッセージにも含める。ボタンなしのdisabled状態はnull。
診断に入力本文そのものは含めない。

2026-11-23のユーザー報告では、UI経由の1ターンでHTTP 200と本文「黄色い自転車」を取得した。
これは本タスクでの再送・独立検証の結果ではなく、captureファイル名とrecord番号は未提供。
詳細は `docs/venice-findings.md` の「2026-11-23 追記 — UI送信成功のユーザー報告」を参照。

旧 `sendTurn(messages, model)` は「403 のため未使用」のコメント付きで残っている。
fetch再現の403の原因、§12(d)の解釈、attestationと認証ヘッダの要否は未確認のまま。

作業ツリーには別ファイル `extension/venice-send-ui.js` も存在するが、現在のmanifestには登録されていない。
エージェントは `extension/venice-send.js` の `__cosVeniceSend.sendViaUi` を使う。

他の4つは境界の宣言のみ。コールバックのペイロード、完了判定、モデル選択の実装は（空欄・不明）。

## 脳タブの操作パネル

拡張機能とVeniceタブを再読み込みすると、ページ右下に「Chat On Venice」が表示される。
指示を入力し、最大ステップ数（既定10、1〜40）を指定して「実行」を押す。
コンソールを開く必要はない。読み込みだけではタスクを開始しない。

完了したステップは、連番 / ツール名 / ok / 結果の先頭60文字を1行ずつ表示する。
長い行はログ内で横スクロールできる。doneでは最終summary、失敗時はエラーを表示する。
実行中は指示と上限の編集・再実行を無効にし、「停止」を有効にする。
停止は「停止要求中」→ MAINの受付後に「停止待ち」→「停止」と表示する。
送信やツールの実行中に止めた場合、その処理は中断せず、完了を待って次の処理へ進む前に止める。
「畳む / 開く」は実行状態を保ったまま表示だけを切り替える。

`venice-panel.js` はVenice限定の ISOLATED / document_startで登録し、bodyの準備後に
Shadow DOM内へ描画する。ページ側のChakra等のスタイルをパネルへ取り込まない。
パネルとMAINは `window.postMessage` で通信し、両側で同じwindowとVenice originを確認する。
固定typeは `cos-venice-panel-request`（ready / run / stop）と `cos-venice-panel-event`。
実行ごとのidで進捗と停止を対応付け、MAINが `window.__cosVeniceAgent.runTask` を呼ぶ。
別のidの停止要求は受け付けない。同一Veniceページ内のJavaScriptを隔離する認証境界ではない。

合成ページの表示: [PC・ライト](screenshots/venice-panel-desktop.png) / [モバイル・ダーク](screenshots/venice-panel-mobile.png)。

## DOMツールとタスク実行（ローカル合成検証済み）

`extension/venice-agent.js` はVenice用MAIN / document_startで読み込まれ、
`window.__cosVeniceAgent` に `runTurn`、`runTask`、`stopTask`、`executeTool` を公開する。
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
- `fill` / `{selector, value}`: 最初の一致要素へスクロールし、プロトタイプのvalue setterで文字列を設定する。
  続けてbubbles付きのinput / changeを送り、`{filled: true}` を返す。空文字でクリアできる。
  要素なし・value setterなし・文字列以外の値は `ok: false`。
- `press` / `{selector, key}`: 最初の一致要素に、指定keyの合成keydown / keypress / keyupを順番に送る。
  イベントはbubbles / composed付き、isComposing=false。`{pressed: true, key}` を返す。
  keyはEnter等の空でない文字列。文字列の入力にはfillを使う。
- `wait` / `{ms}`: 作業タブで指定時間待つ。0以上の有限の数値を受け取り、10000超は10000へ制限する。
  `{ms: 適用した待機指定値}` を返す。このmsは実際の経過時間ではない。
- `activate` / `{}`: 既存のbackground操作で作業タブをアクティブ化し、`{tabId}` を返す。

DOMツールの前に `tab_open` を実行する。作業タブがない場合はすべて
`{ok: false, error: '作業タブがありません。先に tab_open(url) を実行してください。'}` を返す。
別のタブやVeniceタブへフォールバックしない。

`runTask(instruction, {maxSteps?, onStep?})` は毎ステップ、同じ指示と直前のツール結果で
`runTurn` を呼ぶ。既定10ステップ、40超の指定は40に制限する。
正の整数以外は送信前に例外になる。
`tool` は `executeTool` の結果を次へ渡し、失敗・未登録名も `ok: false` の結果として渡す。
`done` は即座に `{summary, steps}` を返す。
`steps` は各モデルステップの `{name, ok}` で、終了ステップも `{name: 'done', ok: true}` として含む。
上限内に `done` がなければ、件数と最後のactionを含む例外を投げる。
例外の `stepCount`、`lastAction`、`steps` から経過も参照できる。

任意の `onStep` はtool / doneの各完了時に同期的に呼ぶ。第1引数は1始まりの `{index, name, ok}`、
第2引数は結果（doneではsummary）の空白を畳んだ先頭60文字。既存の `{summary, steps}` と
steps内の `{name, ok}` は変更しない。
`stopTask()` は実行フラグをfalseにし、タスクがあればtrue、なければfalseを返す。
停止受付後は新しい送信・JSON再出力・ツール実行へ進まない。実行中の処理は中断しない。
停止はcodeが `VENICE_TASK_STOPPED` の例外で通知し、`steps` / `stepCount` に完了済みの経過を持つ。
同じエージェントでrunTaskを重複実行すると例外になる。終了・停止・失敗後は再実行できる。

2026-11-23のユーザー実行報告では、runTaskのtab_open・作業タブのquery / read_textが動作し、
h1不在の報告からdoneに至った（stepsは4件、tab_openはok=true）。詳細はfindingsの成功記録を参照。
2026-11-24にはtab_open → fill → press → wait → read_text → doneの6ステップすべてok=trueで完走し、
Enterで遷移しないことの正しい診断とh1の実テキスト報告、記録器修正の有効性もユーザーから報告された。
新しい操作パネルは合成ページ・合成モデル応答で検証している。

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
- `eval` / `{name, args}`: background内の固定関数表にあるquery / read_text / click_selector /
  scroll / fill / press / waitだけを
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
node --check extension/venice-panel.js
node --check test/venice-agent.test.cjs
node --check test/venice-bridge-harness.cjs
node --check test/venice-bridge.test.cjs
node --check test/venice-input.test.cjs
node --check test/venice-panel.test.cjs
node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-input.test.cjs test/venice-panel.test.cjs test/venice-ui-send.test.cjs docs/venice-recon.test.cjs
# 任意の画面確認。ホストに既存のPlaywrightとGoogle Chromeがある環境で実行する。
# ページ通信はローカル応答/遮断に置き換え、実Veniceへは送信しない。
node test/venice-panel.visual.cjs
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
