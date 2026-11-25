# Venice findings

## 2026-11-23 — ADR と手動 fetch 偵察の準備

### 分かったこと

- 作業場所は `/Users/atsu/chat-on-venice`。
  `venice-transport` から `codex/venice-web-recon` を作成した。commit / push は行っていない。
- ADR、作業範囲の `AGENTS.md`、5つのアダプタ境界、手動手順を作成した。
  既存の `AGENTS.md` は `docs/chat-on-steroids-agent-map.md` にそのまま保存した。
- manifest の `host_permissions` に `https://venice.ai/*` を追加した。
  元から `https://*/*` の許可もあるため、今回の追加は対象ホストの明記になる。
  Venice 限定の MAIN スクリプト登録を追加し、ChatGPT 用の3つの登録内容は変更していない。
- `usage.js` は Venice ホストの場合だけ `venice-recon.js` の記録器を設置して戻る。
  ChatGPT の既存トレース・パーサ本体、`content.js`、`chatgpt-dom.js`、`fiber.js`、`src/` は変更していない。
- `app-palette.js` はこのチェックアウトの追跡ファイル・作業ツリーには存在しなかった。
  既存 `usage.js` の manifest MAIN / document_start 注入方式を使用した。
- 手動の `start()` から `save()` / `stop()` まで、ページが元々行う fetch だけを観測する。
  宛先エンドポイントは未設定。Venice ドメインの書き込みと実測の SSE GET が記録候補になる。
  元の fetch は1回だけ呼び、その Promise をそのまま返す。再送・自動送信・意味パースはない。
- Authorization / 観測できた Cookie の値などを伏字化してからブラウザダウンロードする。
  保存ダイアログで `fixtures/` を選ぶ。ブラウザから絶対パスへの自動書き込みは行わない。
  実測 `venice-capture-*.json` は `fixtures/.gitignore` で Git 除外にした。
- ページ fetch ではブラウザ自動付与の Cookie と Set-Cookie は読めない。
  それらの値は取得・保存せず、不可視であることを出力へ記録する。
- 構文検査と `node --test docs/venice-recon.test.cjs` の10件が成功した。
  合成データで opt-in、元の Promise / 本文の保持、認証値の伏字、Request 複製、
  日本語UTF-8の分割、SSEの生フレーミング、対象外ホスト、取得上限、途中停止、
  セッション切替後の遅延応答、送信・再送が増えないことを確認した。
- 公式の [Pricing](https://venice.ai/pricing) と [ToS §12(d)](https://venice.ai/legal/tos) を確認した。
  Pro の100クレジットは $1相当で、プレミアムテキストモデルには別途クレジットが必要。
  Web UI 自動化の禁止は、1〜2秒の待機や1チャットへの制限では解除されない。ADR に確認注記を付けた。

### 不明なこと

- 送信先エンドポイントとメソッド: （空欄・不明）
- 履歴がサーバ保持かクライアント送信か: （空欄・不明）
- モデルIDの決定箇所: （空欄・不明）
- 認証が Cookie かヘッダか: （空欄・不明）
- SSE のチャンク形式: （空欄・不明）
- Venice の実通信・Chrome 上の拡張注入・ダウンロード完了はまだ検証していない。
  実測 fixture はまだない。XHR / WebSocket / EventSource を使うかどうかも不明。
- 既存 Vitest 群は `node_modules` がないため未実行。依存は追加・インストールしていない。
  `test/extension.test.ts` の既存テストは MAIN 登録の**全ホスト合計を2件**と固定している。
  今回は ChatGPT 2件を保ったまま Venice 1件を加え、全体が3件になるため、この既存アサーションとは不一致。
  `test/` は指定された編集範囲外なので変更していない。新しい合成テストでは ChatGPT 用登録の完全一致を確認した。

### 次に確認したいこと

1. 人間が `docs/venice-recon.md` の手順どおり操作し、2ターン分の実測 JSON を `fixtures/` へ保存する。
2. 人間が伏字と個人情報を確認し、モデル表示名・該当レコード番号とともに結果をこの文書へ追記する。
3. その記録を受け取った次のタスクで、5つの未確認項目を根拠付きで埋める。
   記録に送信がなければ、まず実際の transport / host を確認する。
4. 既存テストを実行する段階では、編集範囲の許可を得て MAIN 登録の固定アサーションを
   ChatGPT / Venice のホスト別境界を確認する形に更新する。

ここで停止する。アダプタ実装、実アカウントへの送信、API 呼び出しは行わない。

## 2026-11-23 — upstream 2.1.54 への同期

### 分かったこと

- `git fetch upstream` で確認した `upstream/main` は `f4c63cdd`、バージョンは 2.1.54。
  ローカル `main` を fast-forward し、`codex/venice-web-recon` をその上へ rebase した。
  同期前のブランチは `codex/venice-web-recon-before-upstream-2.1.54` に残した。
  依頼末尾の「push はしない」を優先し、手順3の `git push origin main` は実行していない。
- 衝突したのは `AGENTS.md` と `extension/usage.js`。
  `AGENTS.md` は upstream 全文を復元し、末尾に Venice 用の節だけを追加した。
  `usage.js` は upstream 全文に Venice ホスト分岐だけを再適用した。
  manifest も upstream を基準に Venice の host_permissions / content_scripts だけを再適用した。
- upstream の manifest は 2.1.35 → 2.1.54 へ更新され、ChatGPT 用の ISOLATED 登録へ
  `app-palette.js` が加わった。これは拡張UIの配色を CSS に反映する55行のスクリプト。
  ページ JS の注入ヘルパーではなく、MAIN へ移す必要はない。
- upstream の `usage.js` では observer version が 7 → 8 になった。
  会話ストリーム・他の backend SSE・WebSocket に現れるIDの位置を追う bounded 診断が追加された。
  診断はIDとフィールドの経路だけを通知し、呼び出し帰属の根拠とは分けている。
  同時読み取りが2本ある場合は古いものを解放し、新しい会話ストリームを観測するようになった。
- 利用制限の `wham/usage` は ChatGPT の共有枠ではなく Codex の枠として扱うようになった。
  システムヒントからの識別は Core に加えて Plugins も対象となり、完全な一覧を優先して
  不完全な後着一覧で既知の識別を消さないようになった。これらはすべて upstream のまま保持した。
- `docs/venice-recon.md` は拡張一覧のバージョン2.1.54確認と、現在の `app-palette.js` の構成を反映した。
  合成テストの ChatGPT 用登録の期待値にも `app-palette.js` を追加した。
  `venice-recon.js`、ADR、アダプタ境界、保存済みの旧設計資料、fixtures の管理ルールは維持した。
- 指定の `node --check extension/venice-recon.js`、`node --check extension/usage.js` が成功し、
  `node --test docs/venice-recon.test.cjs` は10件すべて成功した。

### 不明なこと

- 実際の Venice 送信、拡張の実ブラウザ注入、実測 JSON の保存はこの同期タスクでは実行していない。
  エンドポイント・履歴送信・モデルID・認証方式・SSE形式の5項目は引き続き空欄・不明。
- 依存未導入のため既存 Vitest 群は未実行。
  upstream の `test/extension.test.ts:118–119` は引き続き MAIN 登録を全ホスト合計2件に固定しており、
  Venice を加えた3件とは不一致。指定範囲外のテストは変更していない。

### 次に確認したいこと

1. 更新済みの `docs/venice-recon.md` に沿って、人間が拡張を再読み込みし、手動通信を記録する。
2. 実測結果を受け取った次のタスクで、5つの不明点を確認する。
   既存 Vitest 群を扱う場合は、先に編集範囲を確認して MAIN 登録のホスト別アサーションへ更新する。

同期と指定チェックで停止する。開発の追加、push、実アカウントへの送信は行わない。

## 2026-11-23 — 既存 MAIN 登録テストのホスト別更新

### 分かったこと

- 該当箇所は `test/extension.test.ts` の `extension release metadata` 内。
  テスト名を `scopes the two ChatGPT MAIN readers and one Venice MAIN trace to their own hosts` に変更した。
- MAIN 登録を全体3件とし、ChatGPT 用2件と Venice 用1件を個別に検査する。
  ChatGPT は `fiber.js` と `usage.js` がそれぞれ `chatgpt.com` / `chat.openai.com` のみ、
  Venice は `venice-recon.js` → `usage.js` が `venice.ai` のみで、各登録の `world: MAIN` も完全一致で確認する。
  その他の登録が ISOLATED のままで、これらの MAIN 用スクリプトを含まないことも確認する。
- lockfile の既存依存を `npm ci --ignore-scripts --no-audit --no-fund --offline` で導入した。
  package.json / package-lock.json は変更せず、依存追加・ライフサイクルスクリプト実行は行っていない。
- `npm test -- test/extension.test.ts` で該当ファイルだけ実行し、1ファイル・393件すべて成功した。
  以前記録した「MAIN 登録を2件に固定する不一致」はこの変更で解消した。
  アプリ・拡張の実装や manifest は変更していない。commit / push は行っていない。

### 不明なこと

- 他のテストファイルは今回実行していない。依存導入時に Node 24.8.0 と一部の jsdom 関連依存の
  engine 条件との差が警告されたが、今回の対象ファイルは実行・成功した。
- 実ブラウザ注入・Venice 実通信の検証は引き続き未実施。

### 次に確認したいこと

- `docs/venice-recon.md` に沿った人間の手動記録を受け取り、未確認の通信仕様を確認する。

## 2026-11-23 — Chrome 上の一貫偵察を送信前に中断

### 分かったこと

- 既存の `https://venice.ai/chat/agent` タブの Console（top 文脈）で status を実行した。
  最後に確認できた結果は `installed: true, recording: true, requests: 6, readingBodies: 0, limitReached: false`。
  前回開始した記録が残っていた。この6件は今回指定された2つのテスト文の送信記録ではない。
- 表示中のチャット入力欄は `TEXTAREA`、aria-label は `チャットメッセージ入力` と確認できた。
  今回は入力欄へのテスト文挿入・送信ボタンクリックを行っていない。
- 現行の `window.__cosVeniceRecon` の公開APIは `install / start / stop / save / status` のみ。
  `status()` は件数などを返すが、内部クロージャの `session.records` や最後の
  `response.body.complete` は公開していない。このため依頼の手順4の完了条件を参照できず、
  指示に従って送信前に中断した。`readingBodies: 0` だけで完了したとは扱わない。
- タブの再読み込みはしていない。既存記録を置き換える新しい `start()` も実行していない。
  記録を消さず停止するため `stop()` の実行を試みたが、Chrome 操作がタイムアウトし、
  接続の再取得もタイムアウトした。停止操作が成立したかは未確認で、上記statusは停止試行前の値。
- `save()` は実行していない。今回の保存ファイルはなく、JSON の取得・移動・伏字検査も未実施。
  commit / push はしていない。

### 知りたい項目5つ（今回の実測結果）

| 項目 | 結果 | 根拠ファイル名・number |
| --- | --- | --- |
| 送信先エンドポイントとメソッド | 不明。指定テスト文は送信していない | なし（未保存） |
| 履歴がサーバ保持かクライアント送信か | 不明 | なし（未保存） |
| モデルIDの決定箇所 | 不明。画面の表示名だけではIDの根拠にしない | なし（未保存） |
| 認証が Cookie かヘッダか | 不明。認証値の伏字も未検証 | なし（未保存） |
| SSE のチャンク形式 | 不明 | なし（未保存） |

### 不明なこと

- 今回の送信 transport は不明（送信していない）。既存6件の URL・method 一覧は未取得。
- 記録器の現在の recording 状態と、既存記録の内容は操作接続のタイムアウト後は再確認できていない。
- Authorization / Cookie の生値が保存ファイルに残るかどうかは未検証。

### 次に確認したいこと

- Codex 側で Chrome 操作接続を復旧して既存記録の状態と保存を確認する。タブを再読み込みしない。
- 再試行前に記録器の公開APIへ、本文や秘密を公開せず最後の record の番号・完了状態を読める
  最小の観測口を追加する。今回の指示は詰まった時点で停止するため、このコード変更は行っていない。

## 2026-11-23 — progress 観測口と2ターンの実測完了

### 分かったこと

- `venice-recon.js` に `progress()` を追加した。返すのは
  `{ recording, requests, lastNumber, lastBodyComplete, lastStatus }` の5つだけで、本文・URL・ヘッダ・秘密は返さない。
  record がなければ番号0・未完了false、レスポンス未観測ならステータスは `null`。
  構文検査と合成テスト12件が成功した。
- Chrome の既存タブへのブラウザ接続は今回の初回で取得できた。タブは再読み込みしていない。
  以前の記録は8件で記録中だったため `stop()` を実行し、`recording: false` を確認した。
  その後、停止済みの旧記録器を残して、タブ内の公開APIを progress 付きの記録器へ切り替えた。
  旧フックは停止状態で通過するだけになり、新しい記録器だけを `start()` した。
- `aria-label="チャットメッセージ入力"` の TEXTAREA に native value setter と bubbling input を使い、
  Enter の keydown / keypress / keyup で指定文を送信した。送信ボタンへのフォールバックは不要だった。
  1回目・2回目の質問と、それぞれへの「青い伞」という回答を実画面で確認した。
- 完了条件は500ms間隔・90秒上限のポーリング処理で評価した。確認を始めた時点では既に条件を満たしていた。
  1回目は `lastNumber: 2`、2回目は送信前の2を超えた `lastNumber: 4` を確認し、
  いずれも `lastBodyComplete: true`、`readingBodies: 0`、`lastStatus: 200` だった。
  1回目の完了確認後、2回目の送信まで1.5秒待った。
- 保存前の status は `installed: true, recording: true, requests: 4, readingBodies: 0, limitReached: false`。
  progress は `recording: true, requests: 4, lastNumber: 4, lastBodyComplete: true, lastStatus: 200`。
  `save()` 後は両方の `recording` が `false` になり、他の値は同じ。
- 保存ダイアログは出ず Downloads への保存が完了したため、次のファイルを `fixtures/` へ移動した。
  `fixtures/venice-capture-2026-11-23T13-15-07-891Z.json`（28,305 bytes）。
  4件すべて HTTP 200、response body は `complete: true`、取得制限・networkError はなかった。
  実測ファイルは既存ルールで Git 除外のままとし、ローカル証拠として保持する。

### 知りたい項目5つ（実測）

以下の number はすべて `venice-capture-2026-11-23T13-15-07-891Z.json` 内の値。

| 項目 | 分かったこと | 根拠 number |
| --- | --- | --- |
| 送信先エンドポイントとメソッド | `POST https://outerface.venice.ai/api/inference/chat/agents/venice`。クエリは `agentModelId=deepseek-v4-1-flash&allowPaidImages=true&paidImagesMode=allow` | 2, 3 |
| 履歴がサーバ保持かクライアント送信か | 少なくともクライアントが履歴を再送している。1回目の `input.messages` は1件、2回目は4件で、前の user、reasoning item、assistant「青い伞」、新しい user を含む。サーバ側に保持されるかは不明 | 2, 3 |
| モデルIDの決定箇所 | 送信時の指定箇所はURLの `agentModelId`。値は `deepseek-v4-1-flash`。画面の選択表示は `DeepSeek V4.1 Flash (1017)`。内部でこの値を決める関数や対応表は未調査 | 2, 3、同時の実画面 |
| 認証が Cookie かヘッダか | 不明。`credentials: include` は観測したが、チャット通信の記録された request headers は空。ブラウザ自動付与 Cookie は不可視で、Authorization 不使用とも断定できない。別途 token 発行通信は観測した | 1–4 |
| SSE のチャンク形式 | LFの空行区切り。`event: response.*` と `data: {JSON}`。JSONは `sequence_number` とイベント別フィールドを持つ。`: keepalive` コメントあり。`response.completed` の後に `data: [DONE]` で終わる | 2, 3 |

SSE の詳細: `response.created` → `response.in_progress` → `response.output_item.added` /
`response.content_part.added` → `response.output_text.delta` → 各 `*.done` → `response.completed` → `[DONE]`。
delta のキーは `sequence_number / response_id / item_id / output_index / content_index / delta`。
`output_index: 0` の item は `reasoning`、`output_index: 1` は `message`（role: assistant）で、
どちらも `output_text.delta` を使う。将来のアダプタは delta を全連結せず、item の種類を区別する必要がある。
記録内の response headers は空のため、Content-Type ヘッダの値はこの記録からは確認できない。

### request.url / method の全件

| number | method | request.url |
| --- | --- | --- |
| 1 | POST | `https://outerface.venice.ai/api/app/user/client_attestation/mint` |
| 2 | POST | `https://outerface.venice.ai/api/inference/chat/agents/venice?agentModelId=deepseek-v4-1-flash&allowPaidImages=true&paidImagesMode=allow` |
| 3 | POST | `https://outerface.venice.ai/api/inference/chat/agents/venice?agentModelId=deepseek-v4-1-flash&allowPaidImages=true&paidImagesMode=allow` |
| 4 | POST | `https://clerk.venice.ai/v1/client/sessions/{session-id}/tokens?__clerk_api_version=2026-11-18&_clerk_js_version=6.46.2` |

この表では session ID を伏せた。実測 JSON のURLパスには実値が残っている。
チャット送信そのものを fetch として記録できた（#2, #3）。WebSocket 等が使われていないことまでは判断しない。

### 認証値の確認と不明なこと

- 記録された Authorization / Cookie / Set-Cookie ヘッダは0件なので、これらの値が
  `[REDACTED]` に置換されたかは実通信では確認できない。見えないヘッダを取得したとは扱わない。
- #1 の response body の `token` と #4 の `jwt` は `[REDACTED]`。
  保存JSONの認証フィールド確認では未伏字の値は0件、JWT形式・Bearer形式の生値も見つからなかった。
  ただし上記の session ID はURLパスに残っているため、このファイルをそのまま公開・コミットしない。
- サーバの履歴保持、認証ヘッダの実態、UI内部のモデルID決定コード、Content-Type は不明。
  通信エンドポイント・履歴のクライアント再送・送信時モデルID・SSEフレーミングは実測できた。

### 次に確認したいこと

- アダプタ実装へ進む場合は、この実測を入力にする。認証方式などの不明点は不明のまま引き継ぐ。
  今回は再送、API直叩き、自動ループ、アダプタ本体には進まず、指定のコミットで停止する。

## 2026-11-23 — fixture #2 / #3 に基づく送信実装

### 分かったこと：本文の構造と共通・可変部分

根拠: `fixtures/venice-capture-2026-11-23T13-15-07-891Z.json` の #2 / #3。
#2 の `request.body.text` を JSON としてそのまま写す（整形のみ）。

```json
{
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
    "messages": [
      {
        "content": [
          {
            "annotations": [],
            "text": "この通信テストでは「青い伞」とだけ答えてください。",
            "type": "output_text"
          }
        ],
        "id": "G0QBYAX4DyU7-Y",
        "role": "user",
        "status": "completed",
        "type": "message"
      }
    ]
  }
}
```

- トップレベルのキーは `clientTools` と `input` の2つ。`input` のキーは `messages` だけ。#3 でも同じ。
- `clientTools` の2要素は #2 / #3 で全フィールドが同一。この観測範囲の固定テンプレートとして複製する。
  全モデル・全機能で固定かどうかは不明。ツール定義はデータとして送るだけで、こちらから実行しない。
- 可変部分は `input.messages`。#2 は1件、#3 は4件。#2 の user message は #3 の先頭にもそのまま入る。
  新しい user message は text と id が異なる。履歴には user / reasoning / assistant の形があるので、sender は正規化せず丸ごと渡す。
- URL の3つのクエリ値は #2 / #3 で同一。sender では依頼どおり `agentModelId` だけを model 引数で置換する。
  本文に model キーは追加しない。
- #2 / #3 の保存された `request.headers` は空。本文は JSON なので、今回の送信では標準ヘッダ
  `Content-Type: application/json` だけを明示する。これは本文から決めた送信方針であり、見えていない元通信のヘッダを復元した値ではない。
  Authorization と独自ヘッダは加えず、`credentials: include` を使う。401等が返っても認証値の追加や再試行はしない。

### 単発senderの実装と実通信の結果

- `extension/venice-send.js` に `window.__cosVeniceSend.sendTurn(messages, model)` を追加した。
  #2 の本文テンプレートを複製し、`input.messages` だけを引数で置換する。
  URLは #2 と同じで `agentModelId` だけを model 引数にする。
  fetch の Promise と元の Response をそのまま返し、応答のパース・自動再送・認証補完は行わない。
- 新しいsenderを manifest へ常時登録していない。既存の Venice タブへ Console 相当の MAIN 評価で読み込み、
  明示的な関数呼び出しで1回だけ送信した。タブの再読み込みはしていない。
- 送った `messages` は role: user の1件。#2 と同じ content / annotations / type / status の形を使い、
  text は `この通信テストでは「赤い椅子」とだけ答えてください。`。
  id は既存値を再利用せず、ローカルで新規に生成した14文字の不透明な値を使った。
  サーバ側のID生成・検証規則そのものは不明。
- **HTTP 200 ではなく HTTP 403** が返った。Response はsenderから返された時点で `bodyUsed: false`。
  Content-Type は `application/json; charset=utf-8`。エラー文は次のとおり。

  > Programmatic use of this API is forbidden by TOS. Continued attempted use will result in suspension of service.

  続きは Venice の programmatic API のドキュメントを参照するよう案内していた。
  追加送信、Authorization追加、独自ヘッダ追加、Content-Type変更による再試行は行っていない。
- この実測は `fixtures/venice-capture-2026-11-23T13-27-41-319Z.json` の **#1**。
  #1 の実際の送信本文を元の #2 と比較し、`input.messages` 以外が完全一致することを確認した。
  送信URLも元の #2 と同じ。記録されたヘッダは `content-type: application/json` のみで、
  `credentials: include`、本文は user 1件だった。
- 新しいcaptureは3件で、#1がチャット送信403、#2と#3は補助通信200。
  `progress().lastStatus: 200` は末尾の補助通信の値であり、チャットの成功を意味しない。
  `save()` 後は `recording: false, requests: 3, readingBodies: 0`、
  `lastNumber: 3, lastBodyComplete: true, lastStatus: 200`。追加captureも Git 除外のままローカル保持した。
- sender の合成テスト6件（401 / 403をそのまま返すことを含む）と構文検査が成功した。
  ローカルfixtureとの等価性確認も成功した。合成テストは private fixture なしで実行できる。

### 不明なこと

- HTTP 200 が返る条件は未確認。今回の拒否は401ではなく、明示的な403の規約警告だった。
  元fixtureの #2 / #3 の request.headers は空で、Authorizationを付ける根拠にはならない。
  今回の結果から Authorization の必要性や、追加すれば成功することは推測しない。
- 403の本文はJSONエラーで、SSEではなかった。この送信について先頭20行のSSEや
  `output_index: 0 / 1` の本文位置は検証できていない。
  元fixture #2 / #3での「0がreasoning、1がassistant message」という観測は前回分の結果として区別する。
- Content-Typeを明示しなかった場合や、別の認証条件での挙動は調べていない。再試行しない。

### 次に確認したいこと

- 実際の規約警告が出たので、ADRの再検討条件は成立した。private endpointのreplayは停止する。
  API移行など次の方針はユーザーの判断を待ち、このタスクでは移行・追加送信を行わない。
- 指定の `venice: replay sender` コミットで結果を記録して停止する。pushはしない。

## 2026-11-23 — 追加送信なしのリソース・Service Worker登録確認

### 分かったこと

- 既存の Venice タブの MAIN 文脈で読み取りだけを行った。タブは再読み込みしていない。
  JSチャンクの追加fetch、トークン取得、ヘッダ変更、inference endpointへの追加送信はしていない。
- `performance.getEntriesByType('resource')` の name をURLとして読み、pathname が `.js` で終わる
  リソースを列挙した。この実行時点では0件で、同一originの一覧も空だった。
  保持されたresource timingに対象がないという結果であり、ページがJSを使っていないことは意味しない。
- `navigator.serviceWorker.getRegistrations()` は実行可能で、登録は1件。
  scope は `https://venice.ai/`、active workerあり、waiting / installing はともにnull。
- 現在の `navigator.serviceWorker.controller` は次のとおり。

  ```json
  {
    "scriptURL": "https://venice.ai/pwa-install-sw.js",
    "state": "activated"
  }
  ```

- 記録器は `installed: true, recording: false, requests: 3, readingBodies: 0, limitReached: false`。
  この3件は前タスクで保存したcaptureのままで、今回の新しいチャット送信ではない。

### 不明なこと・未実施の範囲

- SW登録とcontrollerの存在だけでは、送信の中継やヘッダ付与をしているとは判断できない。
  SWソースの解析は行っていないので、その役割は不明。
- inference endpointを含むチャンクの特定、前後2000文字の転載、fetchのヘッダ組み立て、
  attestationの生成・取得経路、Authorization値の取得元は今回調べていない。
- 必要な追加ヘッダ名・値の出所は未確定。候補の列挙や推測での補完はしていない。
- 前回の403はプログラム利用禁止と継続時の利用停止を明示していた。
  その拒否を回避するための認証・attestation再現と、追加の単発送信は実施しない。
  今回の新しいHTTP 200 / 403やSSE先頭20行はない。

### 次に確認したいこと

- ADRの再検討条件が成立した状態を維持する。提供元の許可確認、または公式APIを使う方針の判断が必要。
  今回は読み取り結果の文書化とコミットで停止し、pushはしない。

## 2026-11-23 — タスクA: 送信なしのオフラインSSEパーサ

### 分かったこと

- `extension/venice-sse.js` に `__cosVeniceSse.parse(rawText)` を実装した。
  入力は取得済みの文字列だけで、fetch・ブラウザ状態・認証値へアクセスしない。
  戻り値は `{ text, reasoning, ok, termination, malformedJsonEvents }`。
- 空行で閉じたイベントから `event:` / `data:` を読み、複数data行は改行でまとめる。
  壊れたJSONイベントは数えて破棄し、次へ進む。CRLF、LF、コメント、先頭BOMに対応した。
- `response.output_text.delta`（または `output_text.delta`）の数値 index 1だけを text、0だけを reasoningへ連結する。
  その他のindex、文字列のindex、非文字列delta、`*.done` の全文は本文へ混ぜない。
- `response.completed` は正常終了。先行する `[DONE]` は `done_without_completed`、
  完了なしのEOFは `eof`、error / failed / incomplete / cancelled はそのイベント名で異常終了する。
  終端後のデータと、空行で閉じていない最後のフレームは採用しない。
- 元の `fixtures/venice-capture-2026-11-23T13-15-07-891Z.json` の **#2** を実際に読み、
  `text: "青い伞"`、`reasoning.length: 315`、`ok: true`、`termination: "response.completed"`、
  `malformedJsonEvents: 0` になることをテストで確認した。reasoningは本文へ混ざっていない。
- `node --check extension/venice-sse.js` と
  `node --test docs/venice-sse.test.cjs docs/venice-sse-fixture.test.cjs` が成功した。
  合成15件と実fixture1件の計16件。合成テストはprivate fixtureなしで実行でき、
  実fixtureテストだけが既存のローカルcaptureを必要とする。capture自体はGit除外のまま。

### 不明なこと・今回の範囲

- このAPIは保存済みSSE全文の解析用。ライブ受信やUI送信との結合は検証・実装していない。
- タスクBの `follow()` / `sendViaUi()` と、そのConsole送信は実施していない。
  `venice-recon.js`、`venice-send.js`、manifestは変更していない。今回の追加送信は0回。
  403の制限を実UI経由で通す自動送信へは進めない。

### 次に確認したいこと

- このパーサの追加検証は保存済みfixtureまたは合成データで行える。
  ライブ送信の方針とは分け、今回のタスクAだけをコミットして停止する。pushはしない。

## 2026-11-23 — UI送信基盤（実送信なし）

### 分かったこと

- 前提の実測は、実UIの2ターンが `POST /api/inference/chat/agents/venice` でHTTP 200
  （`venice-capture-2026-11-23T13-15-07-891Z.json` の record #2 / #3）、
  fetch再現はHTTP 403（`venice-capture-2026-11-23T13-27-41-319Z.json` の record #1）。
  今回、新しい実通信のrecordは取得していない。
- manifestのVenice用MAIN / document_start登録を
  `venice-recon.js` → `venice-sse.js` → `venice-send.js` → `usage.js` の順にした。
  傍受の設置は引き続き `usage.js` のVenice分岐が担当する。
- `follow(cb)` はチャットURLを含むPOSTのSSE応答から、到着ごとの生テキスト差分を
  `cb(text, recordNumber)` へ渡す。戻り値の関数で購読解除できる。再配信はしない。
  応答はcloneだけを読み、元fetchは1回だけ呼び、元のPromiseを返す。
- `chatProgress()` は `/inference/chat/` を含む最新recordの番号・本文読み取り完了・HTTP statusを返す。
  対象なしは `0 / false / null`。補助通信のHTTP 200をチャット成功に取り違えない。
  既存 `progress()` / `status()` の戻り値と意味は変えていない。
- `__cosVeniceSend.sendViaUi(text)` は記録を必要時に開始し、既存の最新チャット番号を基準値にする。
  対象TEXTAREAのnative setter、bubbling input、Enterのkeydown / keypress / keyupを使い、
  500ms間隔、最大90秒で新しいチャット本文の読み取り完了を待つ。
  同じrecordのSSEだけを既存パーサで解析し、正常終端ならtextを返す。
  タイムアウト例外はメッセージと `baseline` / `chatProgress` プロパティに基準値・最終進捗を持つ。
  終了時は購読を解除する。旧 `sendTurn` は「403 のため未使用」として残し、UI経路から呼ばない。
- `test/venice-ui-send.test.cjs` はjsdomのTEXTAREA、合成Response、仮想時計を使用する。
  native setterの使用、イベントの順序とbubbling、500ms待機、旧recordの除外、
  補助通信と未完了本文の区別、90秒の例外内容、異常SSE・401 / 403での停止、購読解除を確認した。
  実ブラウザやprivate fixtureには依存しない。
- 構文検査、合成テスト43件、既存fixtureのオフライン解析1件、既存拡張テスト393件が成功した。
  fixtureテストはファイル不在時にskipするようにした。実fixture自体は変更・コミットしない。

### 不明なこと

- 403の原因、§12(d)の解釈、UI送信の許可の可否、attestationと認証ヘッダの要否は未確認。
  未解明のまま引き継ぐ。今回、原因調査やヘッダ・attestationの補完は行っていない。
- 合成イベントが実Venice UIで送信を成立させるかは未確認。今回の検証はローカル合成DOMのみで、実送信は0回。
- サーバ側の履歴保持と実UIのContent-Typeの不明点も引き継ぐ。

### 次に確認したいこと

- 実UIでの検証に進む場合は、利用許可と実送信の実施範囲を先に確認する。
  今回は実装・ローカル検証・コミットまでで停止し、pushしない。

## 2026-11-23 追記 — UI送信成功のユーザー報告

### 分かったこと

- ユーザーから、`sendViaUi` で1ターン送信し、HTTP 200、本文「黄色い自転車」を取得したとの実測報告を受けた。
  送信はfetch再現ではなく、TEXTAREAへの値設定とEnterで行ったとの報告。
  本タスクでは再送していない。根拠は本タスクのユーザー報告で、新しいcaptureファイル名とrecord番号は未提供。
- fetch再現の `sendTurn` は403のため未使用。`extension/venice-send.js` にもその旨のコメントがある。
  先行するfetch再現の403は、`venice-capture-2026-11-23T13-27-41-319Z.json` のrecord #1として記録済み。
- `docs/venice-adapter-contract.md` を現存する `sendViaUi(text)` の説明へ更新した。
  旧 `sendTurn` のResponseではなく、解析後の本文文字列を返す非同期関数として区別した。
- 本タスクの変更は文書のみ。`extension/venice-send-ui.js` の削除、manifestの変更、送信実装の一本化は行っていない。
- `venice-recon.js`、`venice-sse.js`、`venice-send.js`、`venice-send-ui.js` の `node --check` が成功した。
  SSEのオフラインテストは合成15件と既存fixture1件の計16件が成功した。
  UI送信関数は実行せず、UI送信のテストは今回の確認に含めていない。

### 不明なこと

- 403の原因、§12(d)の解釈、attestationと認証ヘッダの要否は未確認のまま。
  今回調査せず、未解明のまま引き継ぐ。
- 新しい成功報告に対応するcaptureファイル名・record番号と、既存の2つのUI送信実装のどちらが実行されたかは未確認。

### 次に確認したいこと

- 既存の成功記録を独立検証する場合は、対応するcaptureファイル名・record番号が必要。
  今回はユーザー報告として記録し、追加送信・pushは行わない。

## 2026-11-23 — runTask と現在タブのDOMツール（実送信なし）

### 分かったこと

- `extension/venice-agent.js` の既存 `runTurn` / `now` に、`query`、`read_text`、
  `click_selector`、`scroll` と `runTask` を追加した。既存のVenice用manifest登録をコミット対象に含める。
  参照・操作先は現在のdocument/windowのみで、Chrome APIは使わない。
- queryは総件数と最大20件の番号付き要約、read_textはinnerTextの空白を畳んだ最大2000文字。
  click_selectorはスクロール後のclickイベント発生を確認する。対象なし・disabled等は `ok: false`。
  イベント発生はクリック先の処理成功とは区別する。scrollはscrollBy後のscrollYを返す。
- runTaskは同じ指示と直前のツール結果でrunTurnを繰り返し、doneで `{summary, steps}` を返す。
  stepsには終了を含む各ステップのnameとokを保持する。既定10、最大40ステップ。
  上限時は件数・最後のactionをメッセージと例外プロパティに残す。
- `node --check`（実装・新規テスト）と
  `node --test test/venice-agent.test.cjs test/venice-ui-send.test.cjs` が成功した（23件）。
  即done、連続tool、失敗結果の引渡し、既定/指定/40の上限、上限ちょうどのdone、
  DOMの件数・文字数制限、クリック失敗、スクロールを合成データで確認した。
  jsdomにinnerText/レイアウトがないため、innerTextとスクロールは合成値・スタブで検証した。
- 実送信は0回。新しいcaptureおよびrecord番号はない。上の根拠はローカル合成テストで、
  過去の実通信recordとは別の証拠である。

### 不明なこと

- 実Venice UIでの複数ステップ動作・レイアウトを伴うスクロールは未確認。
- private endpoint直叩きの403原因、§12(d)の解釈、attestationと認証ヘッダの要否、
  サーバ側の履歴保持、Content-Typeは未解明のまま引き継ぐ。今回の調査・再送対象に含めていない。

### 次に確認したいこと

- 実UIでの検証に進む場合は利用許可と送信範囲を先に確認する。
  今回は合成検証とローカルcommitまでとし、pushしない。

## 2026-11-23 — 作業タブとMAIN/ISOLATEDブリッジ（実送信なし）

### 分かったこと

- `venice-bridge.js` をVenice限定の ISOLATED / document_start に追加した。
  MAINからの `{__cosVeniceBridge: {id, op, args}}` を、同じwindowとVenice originであることを
  確認して固定type `cos-venice-bridge` でbackgroundへ転送し、対応するidで応答を返す。
- `background.js` はVenice用関数表とメッセージ分岐の追加のみ。既存ChatGPT処理は変更しない。
  `ensureTab` / `eval` / `activate` / `close` に対応し、作業タブのIDは脳タブごとの
  session storageキーに保存する。既存のserializeTabで要求を直列化する。
- `tab_open({url})` は作業タブを非アクティブで新規作成するか、既存タブを指定URLへ遷移させ、
  最大30秒で読み込み完了を待ってURLを返す。保存IDを使ったworker再起動後の再利用も合成検証した。
  Venice脳タブそのものを遷移・DOM操作の対象にはしない。
- DOM 4ツールはbackground内の固定関数表から、作業タブのトップフレーム・ISOLATEDへ
  executeScriptする。任意コードを受け取らず、成功値とDOM例外を注入先で明示的に返す。
  件数・文字数の制限とクリック判定は維持した。
- 作業タブがないと `ok: false` と「先に tab_open(url) を実行してください」を返す。
  自動で脳タブにフォールバックしない。手動閉鎖は次の要求で保存IDを掃除し、ensureTabだけが再作成する。
  Chrome APIの権限拒否はタブ不在と区別し、再試行・迂回をしない。
- 実装3ファイルと合成テスト/ヘルパー3ファイルの `node --check` が成功した。
  `node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-ui-send.test.cjs` は41件成功。
  MAINにChrome APIがない構成で、往復・送信元検査・誤id無視・タイムアウト・作成/再利用/閉鎖・
  worker復帰・連続要求・runTaskからの呼び出しを確認した。DOMは別の合成documentで実行する。
- 既存回帰テスト `test/extension.test.ts` と `test/cos-browser-extension-worker.test.ts` は
  初回400件成功、manifestの旧期待値1件が失敗した。前タスクで追加済みのvenice-agent登録を
  そのVenice期待値に反映し、該当1件の再実行が成功した。ChatGPT側の期待値は変更していない。
- 今回は実ブラウザ操作も実送信も0回。新しいcapture/record番号はない。
  上記の根拠はローカル合成テストであり、通信recordの追加取得ではない。

### 不明なこと

- 実Chromeでのworld間往復と作業タブ操作は未確認。合成テストはChrome APIを模し、
  注入関数を文字列化して別documentで再構築する。innerTextとスクロールは合成値・スタブを使う。
- private endpoint直叩きの403原因、§12(d)の解釈、attestationと認証ヘッダの要否、
  サーバ側の履歴保持、Content-Typeは未解明のまま引き継ぐ。今回の調査・再送対象ではない。

### 次に確認したいこと

- 実ブラウザでの確認時は拡張を再読み込みし、非機密の作業ページでブリッジの往復を確認する。
  今回は合成テストとローカルcommitまでとし、送信・pushは行わない。

## 2026-11-23 — sendViaUiの送信トリガとnudge（実送信なし）

### 分かったこと

- ユーザーから、長い複数行テキストでbaseline=7のまま90秒タイムアウトしたとの報告を受けた。
  対応するcaptureファイル名・record番号は未提供。今回、実UIで再現・再送はしていない。
- manifest登録済みの `extension/venice-send.js` を変更した。native setterとinputイベントの後、
  requestAnimationFrameを2回、さらに50ms待つ。待機後の値が空白のみまたは空なら例外で停止する。
- 有効な送信ボタンを見つけた場合はさらに100ms待ってclickする。ボタンなし・disabled時はEnter。
  100msの間に無効化・切断されたボタンもクリックせずEnterへ切り替える。
  Enterのkeydown / keypress / keyupはcomposed=true、isComposing=falseにした。
- 初回送信トリガ後から500ms間隔でchatProgressを確認する。2秒経ってもlastChatNumberが
  基準値と同じ場合だけEnterで1回nudgeする。新しいrecord番号があれば、本文が未完了でもnudgeしない。
  応答待ちの90秒は初回送信トリガ後から数え、入力反映・ボタン待機時間は含めない。
- タイムアウトのErrorは既存のbaseline / chatProgressを保ち、textareaLength / buttonFound /
  buttonDisabledを追加する。メッセージにも文字数・有無・disabled状態を記録し、入力本文は含めない。
  ボタンがない場合のbuttonDisabledはnull。診断はタイムアウト時点の状態を使う。
- `node --check extension/venice-send.js` と `node --check test/venice-ui-send.test.cjs` が成功。
  `node --test test/venice-ui-send.test.cjs` は16件成功した。2フレーム+50ms、ボタンの100ms、
  長い複数行文字列、両方のボタンセレクタ、disabled時のEnter、空値停止、nudgeの時刻と回数、
  タイムアウト診断を合成DOM・合成通信・仮想時計で確認した。
  既存のSSE異常終端、401/403停止、重複呼び出し、購読解除の検証も成功した。
- 実送信・実ブラウザ操作は0回。新しいcapture/record番号はない。
  この実装の根拠は上記合成テストであり、実通信の成功確認ではない。

### 不明なこと

- Reactの状態反映前にEnterが届くことが実際の原因か、および今回の待機で実UIの不送信が解消するかは未確認。
- 実ブラウザのrequestAnimationFrameの実行間隔とバックグラウンドタブでの待機時間は未検証。
- 既知のprivate endpointの403原因、規約解釈、認証等の不明点は未解明のまま引き継ぐ。

### 次に確認したいこと

- 実UIで検証する場合は送信範囲を確認し、長い複数行テキストでrecord番号が進むかを確認する。
  今回は合成検証とローカルcommitまでで停止し、送信・pushはしない。

## 2026-11-23 — runTask・作業タブの実行成功（ユーザー報告）

### 分かったこと

- ユーザーの実行報告により、runTaskがtab_openに成功し、作業タブのquery / read_textが動作した。
- モデルはh1が存在しないことを正しく報告し、doneに至った。
- 返り値のstepsは4件で、tab_openは `ok: true` だった。
- 根拠は2026-11-23の本チャットでのユーザー実行報告。今回の作業は成功結果の文書化のみで、
  コード変更・タスク再実行・追加送信は行っていない。

### 不明なこと

- この成功実行に対応するcaptureファイル名・record番号は未提供。

### 次に確認したいこと

- 今回の成功記録に伴う追加確認はなし。findingsの追記をローカルcommitし、送信・pushは行わない。

## 2026-11-24 — 入力・キー・待機・アクティブ化ツール（実送信なし）

### 分かったこと

- backgroundのVenice専用関数表と `venice-agent.js` にfill / press / waitを追加した。
  既存のISOLATEDブリッジ経由で作業タブに実行する。activateは既存backgroundのactivate操作へ接続した。
  CONTRACTは既存ツールを含め、1行1ツールを維持した。
- fillは対象をscrollIntoViewし、プロトタイプ上のvalue setterで文字列を設定してから、
  bubbles付きinput / changeを順に送る。input / textarea / selectと、空文字によるクリアを合成検証した。
  要素なし・value setterなしはok=false。入力した本文はツール結果に含めない。
- pressは指定要素に、keyを保ったkeydown / keypress / keyupを順に送る。
  bubbles / composed付き、isComposing=falseで、Enterには既存senderと同じcode / keyCode等も設定する。
- waitは作業タブのタイマーで待ち、0以上の有限数値を受け付ける。10000msを超える指定は10000msへ制限し、
  適用した待機指定値を `{ms}` で返す。activateは保存された作業タブだけをactive=trueにする。
  作業タブがない場合は4ツールとも既存の「先にtab_open」エラーを返す。
- 実装2ファイルと `test/venice-input.test.cjs` のnode --checkが成功した。
  `node --test test/venice-input.test.cjs test/venice-agent.test.cjs test/venice-bridge.test.cjs` は50件成功。
  値設定とイベント、キー送出、仮想タイマーでの待機と上限、activateの宛先、
  1行1ツールのCONTRACT、runTaskからの新ツール連続実行を確認した。
- 根拠はローカル合成テスト。今回の実送信・実ブラウザ操作は0回で、新しいcapture / record番号はない。

### 不明なこと

- 新しい入力・キーイベントが実際の対象ページでどう処理されるかは未検証。
  実ブラウザのタイマー抑制等による実待機時間も未検証。msは待機指定値であり実測値ではない。
- 既知のprivate endpointの403原因、規約解釈、認証等の不明点は未解明のまま引き継ぐ。

### 次に確認したいこと

- 実ブラウザで確認する際は、非機密の作業ページで入力値・イベント処理・アクティブ化を確認する。
  今回は合成検証とローカルcommitまでで停止し、送信・pushはしない。

## 2026-11-24 — 実測に合わせたフォーム内送信ボタンの出現待ち（実送信なし）

### 分かったこと

- ユーザー実測報告では、送信ボタンのaria-labelは「メッセージを送信」で、入力欄に文字がある場合だけ
  DOMに現れる。Reactは設定値を認識し、約300msでボタンが出現する。そのボタンのclick()でHTTP 200を
  得たとの報告を受けた。空欄時のボタン検索は見つからず、Enterも効かなかったとの報告。
  根拠は2026-11-24の本チャットでのユーザー実測報告。対応するcaptureファイル名・record番号は未提供。
- 登録済み `extension/venice-send.js` の入力欄を
  `form textarea[aria-label="チャットメッセージ入力"]` に限定した。
  native setter、bubbling input、2回のrAF＋50ms待機、空値チェックは維持する。
- 待機・空値チェック後、`form [aria-label="メッセージを送信"]` を100ms間隔・最大3000msで確認する。
  出現かつdisabledでないものをクリックし、汎用submitやフォーム外のボタンは使わない。
  有効なボタンが得られない場合だけ、3秒の期限後にEnterへフォールバックする。
- 初回トリガ後の500msポーリング、record番号が進まない場合の2秒後・最大1回のnudge、
  応答待ち90秒、文字数・ボタン有無・disabledのタイムアウト診断は維持した。
  従来どおり初回ボタンクリック後にも、record番号が基準値のままならnudge条件を適用する。
- 実装・テストのnode --checkが成功し、`node --test test/venice-ui-send.test.cjs` は20件成功。
  遅延出現、disabledから有効化、disabledのままの期限到達、フォーム外要素・汎用submitの除外、
  期限ちょうどと期限後の出現、Enterフォールバックと1回のnudgeを合成DOM・仮想時計で確認した。
  既存のSSE処理・401/403停止・空値停止・購読解除・タイムアウト診断の検証も成功した。
- 今回の実送信・実ブラウザ操作は0回。新しいcapture / record番号はない。
  上記のコード検証はローカル合成テストであり、ユーザーの実測報告と区別する。

### 不明なこと

- 修正後のsendViaUiが実UIで安定して送信できるかは未検証。
- 既知のprivate endpointの403原因、規約解釈、認証等の不明点は未解明のまま引き継ぐ。

### 次に確認したいこと

- 実UIで確認する際は、修正後のsenderがボタンの遅延出現を待ち、record番号が進むかを確認する。
  今回は合成検証とローカルcommitまでで停止し、送信・pushはしない。

## 2026-11-24 — 推論通信だけの記録と最新200件リングバッファ（実送信なし）

### 分かったこと

- ユーザー実測報告では、記録が8件の上限に達してlimitReached=trueになり、それ以降のチャット送信が
  記録されなかった。t.venice.aiの計測通信も記録枠を使っていたとの報告。
  根拠は本チャットのユーザー実測報告。対応するcaptureファイル名・record番号は未提供。
- venice-recon.jsの対象を、従来のVenice HTTPSホスト条件に加えて、パスに `/api/inference/` を含む通信に
  限定した。t.venice.ai / clerk.venice.aiも明示的に除外する。
  計測・認証・`/api/app/user/client_attestation/mint` 等は記録せず、本文も複製しない。
- MAX_REQUESTSを200にし、満杯で新しい記録を追加する場合は最古を破棄する。
  numberはsession.nextNumberで管理し、配列長とは独立して単調増加する。
  以前と同じく新しいstart()で番号は1から始まる。
- status()と保存JSONのlimitReachedを「直近のレコード追加で破棄が起きたか」に変更した。
  200件ちょうどではfalse、201件目からの破棄でtrue。対象外通信・状態参照・stop/saveで消費せず、
  新しいstart()でfalseに戻す。従来の「上限到達」の意味とは区別する。
- 既存のsummary追加差分を維持してコミットに含める。progress / chatProgress / summary / followの形は維持し、
  200件超の最新チャットも本文・record番号付きで通知する。元fetchは1回だけ呼び、元Promiseと元Responseを保つ。
- 実装と影響する2テストファイルのnode --checkが成功した。
  `docs/venice-recon.test.cjs` の18件と `test/venice-ui-send.test.cjs` の21件、計39件の合成検証が成功。
  対象外URL、205件追加後の最新200件と連番、limitReached、summaryの形、followとchatProgress、
  破棄済みの遅延レスポンス、満杯からのsendViaUiによる201件目の取得を確認した。
  既存の本文上限・伏字・SSE・停止・購読解除も検証した。テストの合成URLを新しい対象範囲へ合わせ、
  Venice用manifestの古い期待値を現在のMAIN/ISOLATED登録へ更新した。
- 今回の実送信・実ブラウザ操作は0回。新しいcapture / record番号はない。
  上記のコード検証はローカル合成テストであり、ユーザーの実測報告と区別する。

### 不明なこと

- 修正後の実UIで、長時間の連続使用による上限到達が解消するかは未検証。
- 既知のprivate endpointの403原因、規約解釈、認証等の不明点は未解明のまま引き継ぐ。

### 次に確認したいこと

- 実UIで確認する際は、200件を超えてもrequestsが200のままlastNumber / lastChatNumberが進むかを確認する。
  今回は合成検証とローカルcommitまでで停止し、送信・pushはしない。

## 2026-11-24 — 入力を含むrunTaskの6ステップ完走と記録器修正の成功（ユーザー報告）

### 分かったこと

- ユーザー実行報告により、runTaskが `tab_open → fill → press → wait → read_text → done` の
  6ステップをすべて `ok: true` で完走した。
- モデルはEnterで遷移しないことを正しく診断し、h1の実テキストを報告した。
- 記録上限の修正（推論通信のみを記録し、最新200件を保持）が有効に働いた。
- 根拠は2026-11-24の本チャットでのユーザー実行報告。今回の作業は成功結果の文書化のみで、
  コード変更・タスク再実行・追加送信は行っていない。

### 不明なこと

- この成功実行に対応するcaptureファイル名・record番号は未提供。

### 次に確認したいこと

- 今回の成功記録に伴う追加確認はなし。findingsの追記をローカルcommitし、送信・pushは行わない。

## 2026-11-24 — 脳タブのShadow DOM操作パネル（実Veniceへの送信なし）

### 分かったこと

- venice-panel.jsをVenice限定のISOLATED / document_startへ登録した。body準備後に右下へ表示し、
  指示・実行・最大ステップ数（既定10、上限40）・ステップログ・停止・畳む/開くをShadow DOM内に実装した。
  読み込みだけでは実行しない。Electron側と既存background処理は変更していない。
- 見た目は既存extension/popup.cssのグレー基調、青の操作色、ライト/ダークの役割を継承した。
  小さな作業用パネルとして日本語システムフォント、明確なフォーカス、モバイルの44px操作領域、
  横スクロールできる1行ログを採用した。方向は既存拡張を主参照とし、Refero同梱のフォーム/タイポグラフィ資料と
  Emilの操作フィードバック指針を補助にした。ページ側の強いCSSを入れた合成ページでも分離を確認した。
- MAINとISOLATED間は固定typeのpostMessageを使い、同じwindow・https://venice.aiのoriginを両側で検査する。
  MAINがwindow.__cosVeniceAgent.runTaskを呼ぶ。実行idで進捗・停止を対応付け、別idの停止は無視する。
- runTaskに任意のonStepを追加した。完了したtool / doneごとに第1引数 `{index, name, ok}`、
  第2引数で結果の先頭60文字を渡す。既存の戻り値とstepsの形は維持した。
  パネルは結果をtextContentで表示し、結果に含まれるHTMLは実行しない。
- stopTaskはフラグをfalseにし、次の処理の前で停止する。進行中の送信やツールは中断しない。
  送信中に停止した場合は応答を待ち、その応答のツールやJSON再出力を始めずに停止する。
  停止時はVENICE_TASK_STOPPEDと完了済みstepsを残し、再実行できる。
  パネルは停止要求の送出とMAINの受付を「停止要求中 / 停止待ち」で区別する。
- 変更した実装2ファイル、合成テスト/画面検証2ファイル、manifest検証を更新した既存テストの
  node --checkが成功した。対象の合成テストは計100件成功した。
  onStep全ステップ通知、停止後の次ターン抑止、送信/ツール完了待ち、JSON再出力抑止、再実行、
  進捗・上限エラー・折り畳み・送信元検査・document_startの初期化を確認した。
- 既存のホスト側PlaywrightとGoogle Chromeで合成ページを表示し、CDPでMAINと実際のISOLATED worldを分けた。
  ISOLATEDからMAINのagentがundefinedである構成でも、実行・進捗・停止・折り畳みが動作した。
  PC 1280px/ライト、モバイル390px/ダークを描画して目視確認し、横はみ出し・ページ例外なし。
  axe検査の指摘を修正して違反0件となった。再現用はtest/venice-panel.visual.cjs、画面は
  docs/screenshots/venice-panel-desktop.png / venice-panel-mobile.png。
- 実Veniceへの送信は0回。ヘッドレスChromeのページ要求はローカル応答または遮断に置き換え、
  モデル応答も合成値を使った。サインイン済みタブは操作していない。新しいcapture / record番号はない。
  上記の根拠は合成テストと合成ページの描画であり、実通信recordではない。

### 不明なこと

- 実Veniceページ上でのパネル表示と、パネルからの実モデル実行は未検証。
- 既知のprivate endpointの403原因、規約解釈、認証等の不明点は未解明のまま引き継ぐ。

### 次に確認したいこと

- 使用時は拡張機能とVeniceタブを再読み込みしてパネルを表示する。
  今回は合成検証・描画確認・ローカルcommitまでで停止し、実送信・pushはしない。

## 2026-11-24 — Electronの接続点とVenice統合計画（実装・送信なし）

### 分かったこと

- `/Users/atsu/chat-on-venice` の `pwd` と直近3 commitを確認した。調査開始HEADは `ffa8acac`。
- 保存版agent mapを参照し、現行AGENTS.md・ADRとsrc/nativeの実装を照合した。
  app 2.1.54 / bridge protocol 15。8765–8769等のbridgeはHTTP/JSONとwake-only WebSocketで、
  local toolを実行するMCP listenerとは別。pairingはloopbackの自動token発行で、OS操作の同意ではない。
- 現行Venice bridgeはMAIN→ISOLATED→background→作業タブまで。Electronへlocal toolを依頼するrouteはない。
  Coreはregistrar/kernel経由でread・apply_patch・UnifiedExecProcessManager・searchを呼ぶ。
  macOS Desktopはobserve/computerからcomputer/index.ts、Worker/N-API、SwiftのJSON dispatcherへ進む。
- `docs/venice-integration-plan.md` に8行のmap要約、通信と認証、tool関数/呼び出し元、native入口、A/B比較を作成した。
  A（拡張loop＋local tool RPC）を推奨し、app許可/正規callerの契約、readの縦接続、patch/shellへの拡張を最初の3ステップとした。
  code候補19対25、直接testとdocs込み26対34は、画像添付まで含めた設計見積りであり実測diffではない。
- 根拠は同設計書のソースパス/行番号。通信captureの追加はなく、対応するrecord番号はない。
  今回は文書2ファイルだけを作成・更新し、実装・アプリ起動・実送信・pushは行わない。

### 不明なこと

- 稼働listener・pairing・local tool RPCの実動作は今回未検証。新RPC自体は未実装。
- Venice chatの一意binding、画像添付UIのDOMと受付証拠、利用モデルのvision対応は未確認。
  現行sendViaUiはtext専用で、screenshotを返すだけではモデルに画像を見せられない。
- 既知の403原因、規約解釈、認証/attestation、provider側の履歴保持、Content-Typeは未解明のまま引き継ぐ。

### 次に確認したいこと

- 次回は本書のsrc変更範囲とrun同意/caller契約の承認を得てから、合成応答とテスト用rootでreadの接続を実装する。
  現行のsrc編集禁止をこの文書作成で解除しない。private endpoint再送停止を維持する。
- 今回の成果物は文書チェックとローカルcommitまで。実送信・pushはしない。

## 2026-11-24 — A案の接続契約・wire型と合成モデルテスト

### 分かったこと

- 作業ディレクトリと直近logを確認した。開始HEADは `6cc6823c`、続く履歴は `ffa8acac` / `6d99720a`。
  A案の採用とAGENTS.mdのElectron統合範囲に従い、今回は型・契約・合成テスト・文書に限定した。
- `src/shared/venice-integration.ts` に `VeniceToolCallRequest` / `VeniceToolCallResponse` /
  `VeniceRunGrant` の3型だけを追加した。runtime exportはなく、appのRPCやgatewayには接続していない。
- コメントに、app発行のrun許可、実際の送信元照合、受付の副作用前永続化、call IDの同時予約、
  同じ要求の記録再取得、異なるpayloadの拒否、run失効後の新規拒否、成否不明時の再実行禁止を定めた。
- `test/venice-integration.test.ts` の8件が成功した。疑似永続化の完了前は実行0回、
  同時重複・実行中の再取得・完了後の再取得を通じて実行1回、run失効後の新規呼び出し拒否を確認した。
  保存待ち中の失効、clientが作ったrun ID、引数を変えたcall ID、受付/結果の保存失敗も合成モデルで確認した。
- `node --check src/shared/venice-integration.ts` と `node --check test/venice-integration.test.ts` が成功した。
  `npm test -- --run test/venice-integration.test.ts` と `npm run typecheck` も成功した。
- 統合計画へ今回/次回の対象ファイルと承認UIの文言案を記載した。初回接続は `core/read` のみ。
  将来のshell同意は「あなたの権限でコマンドを実行できます」「選択したフォルダー内に隔離されず」
  「その外のファイルやネットワークにもアクセスできます」と明示し、read許可と分離する。
- 根拠は型・契約コメント・合成テスト。実fixture・Venice通信は使っておらず、新しいcapture / record番号はない。

### 不明なこと

- 実gatewayでの排他・ディスク永続化・再起動復元・sender/session認証は未実装で、今回のモデル検証には含まない。
- Venice chatの一意binding、画像添付UI、vision対応、既知の403原因・規約解釈・認証/attestation・
  provider側の履歴保持・Content-Typeは未解明のまま引き継ぐ。

### 次に確認したいこと

- 次の実装段階で、appの許可記録と実際のtab/documentを照合し、既存kernel経由のreadだけを接続する。
  今回の契約モデルを実gatewayのテストへ適用し、同時受付・保存失敗・失効を実装に対して確認する。
- 今回はローカルcommitまで。アプリ起動・ブラウザ操作・実送信・pushは行わない。

## 2026-11-24 — ビルドとElectron起動の確認（ソース変更なし）

### 分かったこと

- `/Users/atsu/chat-on-venice` でpwdと直近logを確認した。開始HEADは `00ce8fb2`、
  続く履歴は `6cc6823c` / `ffa8acac`。src/native/package.json/package-lock.jsonは変更していない。
- package scriptsでは `npm run build` がelectron-viteによるmain/preload/rendererのビルド、
  `npm run dev` が開発ビルドと起動。既存ビルドを直接起動する入口は `node_modules/.bin/electron .`。
  macOS DesktopのSwift/helper/dylib/Node addonは別の `npm run desktop:mac`。
- `npm ci --no-audit --no-fund` は終了コード0、678パッケージを導入した。
  Node v24.8.0 / npm 11.6.0で、一部のdev依存にNode 24.15.0以上等を要求するEBADENGINE警告と
  deprecated警告が出たが、導入は成功した。lockfileは変更していない。
- `npm run build` は終了コード0で完了した。Swift/Node addonのビルドはこのscriptからは実行されず、
  今回 `desktop:mac` は実行していない。nativeのコンパイル成否は未検証。
- 通常版 `/Applications/Chat On Steroids.app` が既に8765を使用していたため、別のuser-data-dirで
  今回のビルドを起動した。コマンドは
  `env -u ELECTRON_RUN_AS_NODE CLF_DEBUG=1 ./node_modules/.bin/electron . --user-data-dir=/Users/atsu/chat-on-venice/outputs/build-startup-check-20261124/runtime`。
  検証用Electronは8766で待ち受け、window loaded / renderer state readyを記録した。usableまで10.11秒。
- 実ウィンドウのセットアップ画面をaccessibility treeとスクリーンショットで確認した。
  起動時のエラーダイアログはなく、dialog surfacesは空。npm/build/startupログにエラーはなかった。
- `curl -s http://127.0.0.1:8766/hello` の実応答は
  `{"app":"chat-on-steroids","version":"2.1.54","bridge":15,"compatible":null,"paired":false,"disconnected":false}`。
  独立した新規プロファイルの検証用アプリは未ペアリング。通常版8765は同じapp/version/protocolで `paired:true`。
  pair操作や拡張の接続先変更は行っていない。
- Xcode 26.5（17F42）、CommandLineToolsディレクトリ、Apple Swift 6.3.2が存在する。
  選択中のDeveloper directoryは `/Applications/Xcode.app/Contents/Developer`。
- 結果を報告後、今回のElectronだけを通常終了した。shutdown sequence completeと8766のlistener消失を確認し、
  通常版のプロセスと8765のpaired:trueは維持された。
- 完全なログと画面はGit除外の `outputs/build-startup-check-20261124/` に保存した。
  今回の証拠はローカルビルド・起動画面・loopbackのhello応答で、Veniceへの送信や新しい通信record番号はない。

### 不明なこと

- 今回のビルドと通常拡張との実ペアリング、native Desktopのコンパイル/実操作は未検証。
  `/hello` のpairedは保存済みのpairing情報の有無であり、現在の拡張との疎通完了までは示さない。
- 既知のVenice private endpointや認証等の未解明事項は今回の調査対象外として引き継ぐ。

### 次に確認したいこと

- ビルド・GUI起動・bridge応答の確認は完了。native Desktopが必要な段階では、別scriptのビルドを確認する。
- 上記の実測結果を記録し、追加指示に基づいて本findingsのみローカルcommitする。
  ビルド・起動の再実行、Veniceへの送信、pushは行わない。

## 2026-11-24 — POST /venice/tools と core/read の縦接続

### 分かったこと

- `pwd` と直近3 commitを確認した。開始HEADは `13f9929a`、続く履歴は `00ce8fb2` / `6cc6823c`。
  AGENTS.mdのElectron統合範囲と採用A案に従い、readだけを実装した。
- `venice-tool-gateway.ts` がcall IDを最初のawait前に予約し、既存durable storeで受付を副作用前に保存する。
  同一要求は進行中の処理または保存結果に合流し、別payload/所有者の同じIDは拒否する。
  受付・結果の保存失敗、再起動でpendingが残った場合はunknownとして再実行しない。
- `kernel.ts::invokeHostAdmitted` とcall-contextのoriginを追加した。既存read schema/handlerとsandboxを使い、
  read capability・read-only・canonical root・symlinkを検証する。grant外の暗黙Skill rootや別chatのcwdは持ち込まない。
  app許可済みのローカルsessionへ `host_admitted` として記録し、ChatGPTのrequest/conversation IDは捏造しない。
- POST `/venice/tools` は既存bearer/protocol/Origin検証の内側に追加した。browser IDは既存header、
  tab/document IDはbackgroundのChrome MessageSenderから取得してgrantと照合する。
- 一時IPCは `venice:debugGrant` の1本でgrant/revokeを扱う。development・非packaged・app main frameだけを許可する。
  session IDと既存承認root、Chromeから取得したsenderを受け取り、appがrun IDを発行する。承認UIやroot追加機能は作らない。
- `executeTool('core/read', args)` は既存の `{ok:true,result}` / `{ok:false,error}` を維持する。
  transport失敗/pending時は同じcall IDで1回だけ再取得し、unknownでは新しい実行を始めない。
  他のブラウザtoolは従来経路のまま。shell・patch・find・Desktopは公開せず、desktopUnattributedも有効化しない。
- 通常アプリを終了し、`CLF_BRIDGE_PORTS=8766 npm run dev` にElectronの専用user-data-dir引数を加えて起動した。
  source extensionを読み込んだ隔離Chrome for Testingの実VeniceページとElectron rendererのConsoleから確認した。
  `ELECTRON_CLI_ARGS`環境変数はCLIに上書きされたため、最終起動は `npm run dev -- -- --user-data-dir=...` を用いた。
- 許可rootの小さい合成ファイルから `VENICE_LOCAL_READ_OK` と本文が返った。
  別の承認rootだがgrant外のファイルは拒否され、その本文は返らなかった。
  同じcall IDを2回送ると同一結果となり、該当IDのdurable台帳は1レコードだった。
  debug IPCでrevoke後、新しいcall IDは `RUN_REVOKED` で拒否された。
- 実測時の `/hello` はapp `chat-on-steroids`、version `2.1.54`、bridge protocol `15`、paired:true。
  実測用grantは失効済み。開発アプリは8766で稼働し、通常アプリは終了したままにする。
- 型チェックとnode --checkが成功した。gateway実装テスト9件、既存モデル/隣接workspaceテスト、
  拡張の従来33件＋local read 5件、関連MCP/IPC/identity/shieldテストが成功した。
  production/packaged/別sender/iframeからのdebug IPC拒否も検証した。
- `npm run verify` を実行した。最初の全体結果は530ファイル中507成功・4失敗・19skip、
  テストは12,742成功・4失敗・194skipだった。新IPCの大文字error codeによるi18n失敗1件は
  既存規約のsnake_case codeへ修正し、i18n/IPC 262件と型チェックを再実行して成功した。
- 残る3件は `extension-i18n.test.ts`（先頭ISOLATED script）、`extension-popup.test.ts`（manifest名）、
  `firefox-extension-package.test.ts`（既存venice-panel.jsのinnerHTML）。失敗対象のmanifest/panelと当該testは
  HEADから無変更であることを確認した。今回のread接続では変更しない。
- 生ログ・Console結果・再現用scriptはGit除外の `outputs/venice-read-live/` に保存した。
  実行したのはConsoleのlocal toolだけで、runTask/sendViaUiは呼んでいない。モデルへの送信・pushはしない。
  根拠は実装テストと上記のConsole/台帳。新しいVenice推論通信のrecord番号はない。

### 不明なこと

- 全体verifyは残る既存3件のためgreenではなく、後続のcomputer/mcp-shutdown単独phaseは実行されていない。
- debug grantとパネルのStop/完了の自動連動、正式な承認UI、provider sessionの全面統合、画像/書込/shell/Desktopは未実装。
  現段階の失効は明示revoke・Disconnect・app終了。別documentは以前のrun設定を継承しない。
- 既知のprivate endpointの403、規約解釈、認証/attestation、provider側の履歴保持、Content-Typeは未解明のまま引き継ぐ。

### 次に確認したいこと

- read接続の確認は完了。使用手順・一時IPC・sender指定・失効と現在の制限は統合計画§10を参照する。
- 全体verifyの既存3件を解消する作業は別途扱う。今回のcommitにはread接続と関連テスト・文書だけを含める。

## 2026-11-24 — モデル経由のcore/read E2E

### 分かったこと

- `/Users/atsu/chat-on-venice` でpwdと直近3 commitを確認した。開始HEADは `dc684ae0`、
  続く履歴は `13f9929a` / `00ce8fb2`。8766の既存開発アプリを再起動せずに使った。
- `/tmp/venice-e2e/note.txt` を新規作成し、UTF-8で「青い傘と赤い椅子」と改行を保存した（25 bytes）。
  アプリの既存フォルダー承認UIからこのディレクトリだけを追加した。
  macOSのcanonical pathは `/private/tmp/venice-e2e`、named rootは `/venice-e2e`。
- 通常ChromeのVeniceタブは最初は旧拡張で、localIdentity/core/readが未ロードだった。
  ユーザーが開発拡張を再読み込みし、対象タブの更新後に両関数の存在を確認した。
  Electron DevToolsの貼り付け保護もユーザーが解除した。
- Chrome MessageSenderの実browser/tab/documentをlocalIdentityから取得し、Electron Consoleの
  `api.debugVeniceGrant` で上記rootだけ・core/readだけのgrantを発行した。
  appが返したrunIdを同じタブのsetLocalRunに設定した。認証情報・run/session/document IDはcommitしない。
- VeniceタブのConsoleからrunTaskを1回だけ呼んだ。指示は
  「/tmp/venice-e2e/note.txt を read して、書かれている内容だけを報告してください。」、maxStepsは5。
  本文や期待する回答は指示に含めず、ツールの代行呼び出しや合成モデル応答は使わなかった。
- 2026-11-24 01:46:56–01:47:02 JSTに成功した。返り値は次のとおり。

  ```json
  {"summary":"青い傘と赤い椅子","steps":[{"name":"core/read","ok":true},{"name":"done","ok":true}]}
  ```

- 根拠の通信recordは、このタブの今回のrecon記録 #1 / #2。どちらもUI自身が送ったPOSTでHTTP 200、
  response.completedまで取得した。#1のモデル応答はcore/readと `paths:["/tmp/venice-e2e/note.txt"]`、
  #2は上記done。SSE内model_idは `deepseek-v4-1-flash-uncensored`。
  private endpointへのfetch再現・認証ヘッダ追加・追加のモデル試行は行っていない。
- gatewayの永続台帳 `outputs/venice-read-live/runtime/state/venice-tools.json` は全体6→7レコード。
  今回runのレコードは1件で、core/read、指定path、state:completed、本文の一致を確認した。
  対応するローカルsessionのtool_callも1件で、attribution:host_admitted、outcome:ok、durationMs:23だった。
- app.logの該当行は `tool read (1 target(s), 0 failed)` と `tool read ok in 23 ms`。
  後者は同時刻に2行ある。kernelと既存read handlerのguardがそれぞれ出すログで、
  read回数は上記のgateway台帳1件とsession記録1件で照合した。
- 検証後にdebug IPCのrevokeが `{"ok":true,"data":{"revoked":true}}` を返した。
  reconの記録も停止した。開発アプリは8766で稼働を維持し、helloはbridge:15 / paired:true。
  テスト用rootとファイルは残した。
- Console結果・gateway台帳の該当行・画面はGit除外の `outputs/venice-read-live/model-e2e-*` と
  `model-e2e.jpg` に保存した。変更は文書だけで、src/・拡張のコード変更はない。

### 不明なこと

- 今回確認したのは既存Veniceタブでの単発readだけ。grantとパネルStopの自動連動、正式承認UI、
  shell・書込・Desktopの未実装状態は変わらない。既存verifyの3件も今回の実測では再実行していない。
- private endpoint直叩きの403原因、規約解釈、認証/attestation、provider側の履歴保持、
  既知のContent-Type問題は未解明のまま引き継ぐ。

### 次に確認したいこと

- モデル→拡張→gateway→kernel/read→モデルの1往復は確認完了。次の機能追加は別タスクとする。
  今回はこの事実をローカルcommitし、pushしない。


## 2026-11-24 — grant要求・承認UIとrun失効

### 分かったこと

- pwdと直近3 commitを確認した。開始HEADは `26188ebf`、続く履歴は `dc684ae0` / `13f9929a`。
  AGENTS.mdのElectron統合範囲と統合計画に従った。
- POST `/venice/grant/request`、`/venice/grant/revoke`、`/venice/grant/document` を既存認証の内側に追加した。
  readだけを受理し、senderはbackgroundの実Chrome情報、session/projectはapp情報で確定する。
  gatewayが保留一覧・期限・許可・取消を所有し、固定IPCがrendererへ通知する。
- 見出しと本文は計画§9の指定をそのまま使った。既存plugin-dialogのmodal・配色・ボタンを再利用し、
  拒否に初期focus、未選択の許可はdisabled、Escapeは拒否とした。HTML様の指示やpathもtextContentで表示する。
- フォルダはネイティブpickerから選択し、既存sandboxでcanonical化する。選択したRoot snapshotはrunだけの権限で、
  configの承認rootへは追加しない。grantをvenice-grants.jsonに保存してからrunIdを返し、再起動時の権限として復元しない。
- パネルは承認前にモデルへ送信しない。拒否理由をステップ欄に表示し、実行中/完了後もrunIdを保持する。
  Stop、脳documentの変更/再読み込み、app終了で失効する。Stopは保留HTTPの待ちqueueに入れない。
- 稼働中のelectron-vite devはmain/preloadを自動更新しなかったため、ユーザーの追加承認を得て開発アプリだけを1回再起動した。
  同じ検証用profile・CLF_BRIDGE_PORTS=8766を維持した。通常アプリは起動していない。
  Chromeの開発拡張はユーザーが再読み込みし、対象Veniceタブを更新した。
- 実測用に `outputs/venice-read-live/grant-ui-root/note.txt` へ「青い傘と赤い椅子」と改行を保存した。
  このrootは全体configに存在しない。パネルから絶対pathのread指示、maxSteps:5で実行した。
- 承認ダイアログと未選択時のdisabledを実画面で確認した。操作ツールのnativeクリックがタイムアウトしたため、
  ユーザーにフォルダ選択と許可を依頼した。その後、実台帳とパネルで許可・成功を確認した。
  途中で「時間切れ」と報告した判断は誤りで、実際には同じrunが成功していた。モデル実行を再試行していない。
- 02:09 JSTの結果は `core/read / ok:true`、`done / ok:true`、summary「青い傘と赤い椅子」。
  今回reconの通信record #1 / #2はどちらもHTTP 200、complete:true。
  gatewayのcompleted記録1件とhost_admittedのsession tool_call 1件を照合した。
- 完了後にパネルの停止を実行し、「失効済み」でもrunIdが保持されることを確認した。
  同じrunIdを保持したまま新しいcallIdでreadすると `ok:false / RUN_REVOKED`。
  保存grantはactive:false、configured:falseで、configに当該rootが追加されていないことも確認した。
- 追加の表示確認用requestはrunTaskを起動せず、承認ダイアログの画面だけを保存して取消した。
  reconを停止し、保留画面も閉じた。開発アプリは8766で稼働中。既知の2.1.54 / bridge:15 / paired:trueを維持する。
- 型チェック、build、拡張4ファイルのnode --checkが成功した。
  gateway14件、renderer承認UI2件、IPC252件、i18n11件と、拡張の関連53件が成功した。
  未選択拒否・保存完了前のID非公開・別sender拒否・遅延保存中のreload・shutdown・選択rootの実kernel readを含む。
- 生IDを含むConsole結果、台帳の該当行、画面、build/testログはGit除外の `outputs/venice-read-live/grant-*` に保存した。
  src/rendererの日本語文言は指定どおり。shellの許可やdesktopUnattributedの有効化は行っていない。

### 不明なこと

- 他言語での新ダイアログ文言は当時未対応だったが、下記の回帰修正で対応済み。shell・書込・Desktop、画像、provider sessionの全面統合はこの実装の対象外。
- この時点では全体verifyを再実行していなかった。extension-i18n / extension-popup / FirefoxのinnerHTMLは、下記の回帰修正でVenice追加箇所の問題と確認し、解消した。
- private endpointの403原因、規約解釈、認証/attestation、provider側の履歴保持、Content-Typeは未解明のまま引き継ぐ。

### 次に確認したいこと

- パネルの承認→read→Stop→同じrunIdで拒否、まで確認完了。現行手順と期限・保存/失効の意味は統合計画§11を参照。
  今回のコード・関連テスト・文書をローカルcommitする。pushしない。


## 2026-11-24 — Node 22でのVenice追加ハンクの回帰修正

### 分かったこと

- 作業先は `/Users/atsu/chat-on-venice`。開始HEADは `e127d93b`、作業ツリーはcleanだった。
  Volta経由の実行値はNode `22.23.5` / npm `10.9.9`。Node固定設定は変更していない。
- 指定8ファイルの初回実行は7ファイル失敗、22テスト失敗 / 839成功、未処理エラー112件だった。
  `renderer-timeline.part1` のassertは通ったが、初期承認一覧のnullを `pending[0]` として読むエラーが出ていた。
- ブラウザ入力保守の同じ14件とtimelineの同じnull参照エラー112件を、最初の3回の指定8本で連続確認した。
  その3回が終わるまで、この2つの挙動は変更しなかった。フレークとして扱わず、追加ハンクを修正した。
- manifestのnameを `__MSG_extension_name__` に戻し、13言語の拡張カタログの値を
  `Chat On Venice (dev)` にした。既存ChatGPTのcontent_scriptsを先に保ち、i18n helperの順序を復元した。
  Venice bridgeは既存の専用ISOLATED登録を維持し、不要なresource登録は追加していない。
- パネルのstyleと全要素を `createElement` / `append` / `replaceChildren` で組み立てるようにした。
  CSS、ID、属性、入力値、実行・停止・折り畳みの契約は維持した。
- backgroundの新しいトップレベルイベント登録が、既存診断コードの抽出範囲と、最初のtab更新listenerの境界を変えていた。
  Veniceの登録は既存listenerの後に同期bootstrapし、独立したbridge入口からも同じ一度限りの登録を使う。
  上流の診断・ブラウザ入力処理の本体は変更していない。MV3中断後の失効を含む既存bridgeテストも成功した。
- ネイティブpickerは既存の `dialogLabel('Choose folders')` に統一し、titleとmacOSのmessageを両方設定する。
  MAIN_TEXTSとrendererの既存publisherにも同じキーを追加した。
- 承認画面の14種類の文言を12言語の全アプリカタログへ登録した。
  HTMLの既存日本語と独立したdialog入口の契約を保ちつつ、`data-i18n` の英語sourceを既存 `t()` / `ui()` で翻訳する。
  カタログには英語sourceと保持した日本語fallbackの両方を登録し、既存のキー・値は変更していない。
  日本語の見出し・本文・ボタン・エラー値は元の文言どおり。shellの許可は追加していない。
- 初期承認一覧は配列の応答だけをpaintし、一覧が提供されないnullで既存rendererを壊さないようにした。
  不明な応答から許可を作ったり、toolを実行したりはしない。
- 最終ソースで指定8ファイルは **8 passed / 861 tests passed / 失敗0**。
  追加の既存Venice bridge・grant・read・panelテスト38件、独立dialogテスト2件、型チェックも成功した。
- 指定8本が成功してから、全体の `npm test` を**1回だけ**実行した。終了コード0、390.61秒。
  **513ファイル成功 / 20スキップ、12,762テスト成功 / 218スキップ、失敗0**。
  テストの削除、skip追加、assert変更、その他test配下の変更はない。
- インストール済みChromeのheadless描画で、パネルを1280px/light・390px/darkで確認した。
  MAIN/ISOLATEDを分け、合成の実行・step・完了・停止・折り畳み、安全な文字列表示、CSS隔離、axe違反0件を確認した。
  承認画面も実ソースから描画し、日本語の指定文言、ドイツ語、フォルダ未選択拒否、選択後の許可、Escape拒否を確認した。
  全通信はローカル応答またはabortで、Veniceへの実送信は0回。通信record numberはない。
- 各回のログと画面はGit除外の `outputs/venice-test-repairs-20261124/` に保存した。
  ソース修正は `6557070c` / `a4c75e3a` / `8e262b3a` に分けてローカルcommitした。pushはしていない。

### 不明なこと

- 今回の画面確認は合成応答で行った。稼働中の開発アプリ・拡張の再起動や再読み込み、
  実Veniceでのモデル送信、ネイティブpickerの再操作、build、verify一式は実施していない。
- private endpointの403原因、規約解釈、認証/attestation、provider側の履歴保持、Content-Typeは未解明のまま引き継ぐ。

### 次に確認したいこと

- 今回の指定8本と全体テストの回帰修正は完了。progressのタスクには進んでいない。


## 2026-11-24 — core/apply_patchと独立write scope

### 分かったこと

- `/Users/atsu/chat-on-venice` でNode `22.23.5` を確認してから、`d548d00e` を基点に
  `codex/venice-apply-patch` を作成した。キューは `venice-progress.md` に0〜11の順で保存した。
- read grantの値と既定は維持した。appの承認画面で「書き込みも許可する」を明示チェックした場合だけ、
  mainが `write:true` と `core/apply_patch` のallowlistを保存する。ページからwriteを自己申告する入口は追加していない。
  チェックは未選択が既定で、別の承認要求へ持ち越さない。shell・Desktopの権限は含めない。
- `/venice/tools` → host-admitted kernel → 既存apply_patch handlerの接続を追加した。
  callIdの受付前予約・永続化・重複join・結果cache・unknownの再実行拒否は既存のまま。
  実ファイルの成功と、sessionへのhost_admitted記録1件、同一要求の再取得、失効後の新規拒否を確認した。
- パッチの基準はgrantの最初のroot。全対象とmove先を同じsandboxでcanonical化し、
  global configにあってもgrant外のroot、native/virtual path、traversal、外向きsymlinkを拒否した。
  root内の作成・更新・移動・削除、同じpathの連続操作も既存patch engineで成功した。
  native picker相当で選んだglobal config外のrun専用rootでも成功し、全体rootsは変更されなかった。
- read-onlyと個別create/edit/move/delete capabilityを保った。
  checkpointを待っている間の失効・Read-only化も、本適用直前の再検証で拒否され、ファイルは作られなかった。
- プレビューは同じgatewayの `{preview:true}` で受け、同じgrant・sender・root・schemaの検証を通す。
  write/remove/mkdirをメモリoverlayに向けた既存patch engineからunified diffを生成する。
  プレビュー時に実ファイル・checkpoint・canonical実行記録は作らず、read capabilityとshieldも適用する。
  プレビュー取得後の本適用は同一callId・tool・argsで送り、そこで既存の受付ledgerを使う。
- パネルは差分をtextContentで実行ステップ欄へ挿入し、自動の表示通知後に本適用する。
  長い差分は先頭8行・最大1,200文字と未展開の全文detailsに分けた。適用ごとの確認ボタンは増やしていない。
  展開、横スクロール、キーボードfocusを確認し、最初のaxe確認で見つかったスクロール領域のfocus不足を修正した。
- writeの2つの文言を全12アプリカタログに、差分の2つのラベルを全13拡張カタログに追加した。
  既存の翻訳キー・値と、read承認の日本語文言は維持した。
- 追加テストは3ファイル・15件で、指定の未許可拒否、root外拒否、root内成功、同一callId、失効、差分の生成・折り畳み、
  全カタログ登録を含む。既存テストの変更・削除・skip追加・assert変更はない。
- 関連6ファイルの295テスト、既存agent/bridge/panel/read/grantの53テストが成功した。
  headless Chromeで既存MAIN/ISOLATED bridge、承認の既定readと明示write、日本語・ドイツ語、
  適用前のsafe text表示、全文の折り畳み、1280px/light・390px/dark、axe違反0件を確認した。
  モデル応答は合成で、全リクエストをローカル応答またはabortにし、実Venice送信は0回。通信record numberはない。
- 全体 `npm test` は**1回だけ**実行し、終了コード1、690.03秒。
  **515ファイル成功 / 1失敗 / 20スキップ、12,776テスト成功 / 1失敗 / 218スキップ**だった。
  追加15テストは全件成功。失敗は既存 `codex-runtime-parity.test.ts:571` のPTYケースのみ。
  terminateProcess自体のassertは通り、最初のexec応答がprocessId:nullでなくPIDだったため、子プロセス終了のassert前に失敗した。
- そのファイルだけを単独再実行すると、終了コード0、**19成功 / 3スキップ**だった。
  当該テストと、それが直接使うunified-exec / shellの実装はこのブランチで変更していない。
- 最終の `npm run typecheck` と `npm run build` はともに終了コード0。
  ソース実装は `c3137481`、承認UI・パネル・i18n・画面チェックは `063e6cb9` にローカルcommitした。
  ログ・画面はGit除外の `outputs/venice-apply-patch/` に保存した。push・実Venice送信・アプリ再起動操作はしていない。

### 不明なこと

- 全体実行時だけ出たPTYの応答差の原因は未確定。並列負荷下のタイミング依存が疑われるが、全体グリーンは確認できていない。
- 差分は表示時点のsnapshotで、別プロセスへの編集lockは取らない。本適用時に既存patch検証をやり直す。
  プレビューのUTF-8上限は1,000,000 bytesで、超過は明示拒否する。全文を黙って切り詰めて適用しない。
- この段階では実Veniceモデルによるwrite E2Eは実施していない。ユーザー指定の合成・headless検証まで。

### 次に確認したいこと

- 実装と個別検証は済んだが、必須の全体テストに1失敗があるためprogressの3は**保留**にした。
  ユーザーによる追加全体実行の許可、または当該失敗の扱いの判断が必要。既存exec処理をこのタスクで変更して埋め合わせない。
  4以降には着手していない。


## 2026-11-24 — apply_patch 完了とPTYフレークの切り分け

### 分かったこと

- 全体テスト1回目で既存PTYテスト1件が失敗し、そのファイルの単独実行では成功した。
- 追試結果（ユーザー確認済み）：全体をもう1回実行して **516 passed / 20 skipped / 0 failed**。
  該当ファイルの単独実行も成功し、`test/unified-exec-output-stream.test.ts` の単独実行も成功している。
- 全体再実行と単独実行で再現せず、フレークと判断した。
- apply_patchの追加15テスト・型チェック・build・headless画面確認は成功済み。
  実装とテストは変更していない。
- `venice-progress.md` の3を完了に更新した。根拠commitは `c3137481`, `063e6cb9`。

### 不明なこと

- 実Venice送信は未実施。

### 次に確認したいこと

- 次は4のexec_command。今回は着手していない。


## 2026-11-24 — exec_commandのrun所有・独立shell同意・分離出力

### 分かったこと

- Node `v22.23.5`を確認し、クリーンな`158d68c1`から`codex/venice-exec`を作成した。
  実装の根拠commitは`eba8035a`（gateway / kernel / managerの任意observerとrun所有）、
  `969752ce`（独立同意 / i18n / パネル出力）、`ab7dd7a8`（観測のshieldとmask後の上限）、
  `0c3fb4fd`（既存のドイツ語du表記に統一）。
- read・write・shellは独立し、shellは明示同意がなければ省略される既定OFFのフラグ。
  チェックなしの既存read応答・write応答の引数/payloadを維持した。
  日本語の項目名は「コマンドの実行も許可する」。警告は
  「あなたの権限でコマンドを実行できます。選択したフォルダー内に隔離されず、その外のファイルやネットワークにもアクセスできます。」。
- 実execは既存handlerのcwd解決、canonical / symlink検証、command policy、shell正規化を通す。
  cwdの既定はgrant先頭root。read/writeの承認だけではexec不可、shell承認だけではpatch不可。
  stdout/stderrの分離のため単一cmdのpipeモードを使い、Veniceではtty:trueとcmdsを拒否する。
  通常CoSのTTY・batch・出力仕様は変えない。
- spawn待ちを含めrunごと3本まで。既存managerの生存期間をrunの所有者に登録し、
  revoke・Stop・app終了でそのrunの生存プロセスツリーを終了する。
  一時フォルダー内の実プロセスで子プロセスkillと別runの生存を確認した。
  元のcallIdの再取得は再実行せず、失効後も元の認証済み所有者に限って確定済み応答を返す。
- waitはyield_time_msで既定10,000ms・最大30,000ms。時間切れでkillせずprocessIdを返す。
  戻り値はprocessId・exitCode・stdout / stderrとoutput、running、truncated、omittedBytesを含む。
  同一要求の観測は同じgatewayのoutput:true分岐でsender / run / callId / tool / argsを検証する。
  追加のtool実行やstdin送信はしない。
- 出力はプロセスごとに合計64KiBの先頭を保持し、末尾を省略する。観測と確定応答の両方に
  既存の全体/プロジェクト設定のsecrets shieldを適用し、maskで増えた表示も64KiBへ収める。
  パネルはtextContentを使い、stdout / stderrを分け、改行・横スクロール・省略表示を保つ。
  yield後・モデルdone後も観測を続け、Stopまたは新runで止める。
- 追加テストは20件成功。最終の対象実行は103成功 / 0失敗
  （`outputs/venice-exec/final-targeted.log`、追加20件 + renderer-i18n 83件）。
  関連gateway / patch / secrets-shieldも112件成功（`output-shield-final.log`）。
- 全体テストは1回実行し、ファイル517成功 / 2失敗 / 20スキップ、
  テスト12,794成功 / 3失敗 / 218スキップ（`full-test.log`）。
  ドイツ語敬称は単独でも再現したため今回の翻訳を修正し、既存テスト83件の成功で確認した。
  execのshield / 上限2件は単独で再現せず、該当15件が全て成功した（`full-failures-isolated.log` / `final-targeted.log`）。
  全体実行中にその実装を補修しており、旧変換キャッシュや読込時点が影響した可能性はあるが原因は未特定。
  ユーザー指定の単独切り分けに従い非再現失敗として記録し、全体の追加再実行はしていない。
  全体0 failedと読み替えない。
- 既存の補助CJSは68成功 / 2失敗（`browser-regression.log`）。
  `venice-input.test.cjs`のactivate検査は初期localDocument通知を先頭のactivateと期待して失敗し、
  CONTRACT検査は既存core/readのスラッシュを正規表現が許容せず失敗する。
  `158d68c1`の該当ソースをoutputs内に展開して同じ2件の失敗を確認した（`baseline-input.log`）。
  今回の差分に起因するものではなく、既存テストは変更・skip・緩和していない。
- 最終`npm run typecheck`・`npm run build`は終了コード0。
  headlessは`node test/venice-exec.visual.cjs`で成功。既存CSS / i18nとMAIN / ISOLATEDを実行し、
  独立したshellチェック、日本語警告、ja/de、PC/モバイル、stream表示、改行、横スクロール、
  HTMLを解釈しない出力、省略、yield後の観測継続、Stopを確認した。axe違反0・pageerror 0。
  画像は`outputs/venice-exec/`。全てのブラウザ通信はローカル合成応答またはabortであり、実Venice送信recordはない。

### 不明なこと

- 実Veniceへの送信・モデル選択・実モデルがexecを選んだ場合の動作は未検証（今回の指定どおり未送信）。
- 全体実行でのexec 2件の非再現失敗について、変換キャッシュ/読込時点を含む正確な原因は未特定。
  単独実行の成功を全体実行の成功とは扱わない。
- 既存のprivate endpoint 403・attestation・規約解釈・サーバ履歴保持等は未解明のまま引き継ぐ。
  認証回避調査やprivate endpointの再送は実施していない。

### 次に確認したいこと

- 5のwrite_stdin。今回のrun所有者とprocessIdを再利用してpoll / stdinを接続し、別run・失効後の継続を拒否する。
  現行pipeは既存managerのstdin-closed契約を保つ。非空入力と空入力pollを区別して実装・検証する。
- 補助CJSの既存2件は、初期通知とcore名前空間を含む現行契約に対するテスト更新が別途必要。
  今回は既存テスト変更禁止のため、そのまま記録した。


## 2026-11-24 — ja/enを必須にし、他言語の不足キーを英語へフォールバック

### 分かったこと

- `codex/venice-exec`の`e4800747`から作業し、Node `v22.23.5`をVolta経由で使用した。
- rendererには英語sourceへ戻す経路があったが、明示的なenカタログはなかった。
  `src/renderer/locales/en.json`を追加し、英語source・既存の日本語キー18件の英訳・英語単数形84件を含む4,110件を登録した。
  ja.jsonの既存日本語キーは全て登録済みで、既存の他言語カタログは変更・削除していない。
- rendererの`t()` / `ui()`は選択言語 → en → sourceキーの順で解決する。
  `tn()`の未翻訳分には英語の複数形規則を使い、Russian 21 / Japanese 1でも英語fallbackの数を誤らない。
- 拡張は従来、アプリ指定言語でキーが欠けるとChromeの別言語へ戻ることがあった。
  既存i18nヘルパーで英語カタログを保持し、キー単位・カタログ全体の欠落とも英語へ戻すようにした。
  英語も無ければキーを返す。既存の明示的な英語fallback引数、placeholder、アプリ未指定時のChrome言語は維持した。
- mainのtray / 通知 / native dialogは既存どおりrendererから訳を受け取り、未受信・未登録時は英語sourceを使う。
  enカタログがMAIN_TEXTSの英語sourceと一致することもテストで確認した。
- カタログの必須対象をja / enに変更した。renderer / extension / main-textsの完全性検査と、
  同じ全言語必須方針を使っていたVenice承認・tool title・pet・Goal・Scheduled・Linux警告の検査を揃えた。
  テスト宣言は削除せず、既存の他言語の表示・言語選択・動的UI保持の回帰検査も残した。
- 追加8テストは、選択言語優先、英語fallback、双方にないキー、引数・draft・既存値の保持、
  日本語キーの英語source対応、欠落時の英語複数形、拡張page / content scriptでの欠落を確認した。
- 全体`npm test`は実装とテストを固定して1回実行し、終了コード0。
  **520 passed / 0 failed / 20 skipped**（ファイル）、**12,806 passed / 0 failed / 218 skipped**（テスト）。
  根拠: `outputs/venice-i18n/full-test.log` / `full-test.exit`。
- `npm run typecheck`も終了コード0（`outputs/venice-i18n/typecheck.log`）。
  headless Chromeでは既存のrenderer / i18n / CSSを実行し、日本語・英語・不足キーのある合成ロシア語カタログを確認した。
  既存ロシア語訳は残り、不足したshellラベル・警告だけが英語になる。checkboxとdraftを保持し、PC / モバイルでも表示できた。
  根拠: `outputs/venice-i18n/headless.log`と同フォルダーの画像。外部通信は全てローカル応答またはabortで、実Venice送信はない。

### 不明なこと

- 次の2.1.55取り込み時に、上流のi18n経路へどの差分が入るかは未確認。
  今回は上流取得・マージを実行していない。

### 次に確認したいこと

- 5のwrite_stdinに進む前に、2.1.55が出ていれば先にマージする。
  言語方針は今回決定済みで、以後の必須カタログはja / en。`docs/venice-i18n-decision.md`を参照する。


## 2026-11-24 — attestation輸送の保留と独立した入力修正

### 分かったこと

- `ec2fc746`から`codex/venice-attestation`を作成し、Node `v22.23.5`をVoltaで確認した。
- 指定のPROTOCOL.md §1・§2を読んだ。同文書は未公開エンドポイントのreverse engineeringによる実装を説明している。
  参考: https://github.com/CanArslanDev/opencode-venice-web/blob/main/docs/PROTOCOL.md
- ユーザーはADRの旧停止判断を上書きする追加輸送を要求した。
  サービスによるプログラム利用拒否の403記録に対し、認証・attestationを再現して通す実装と、
  401/403後の別経路への自動再送は実装していない。4.5は保留とし、採用済み・完了とは扱わない。
- 独立した要求7・8は`1ee5c67a`で実装した。tool resultの文字列値はJSON化前にNULを空白へ置換し、
  指示も同様に処理する。元のtool resultや文字列としてのバックスラッシュ表記は保持する。
  tool / done以外の応答は、元の指示とtool resultを保持して1回だけ実行・JSON形式を促し、2回連続なら終了する。
- 追加7件と既存パネル5件が成功（`outputs/venice-agent-input/tests.log`）。
  既存agentのCJS15件も成功（`agent-regression.log`）。型チェックも成功（`typecheck.log`）。
  既存テストは変更・削除・skip・assert緩和していない。
- 新しいfetch輸送、トークン取得、attestation mint、認証失敗からの自動再送は追加していない。
  read / write / exec等の実装と許可は変更していない。実Venice送信はなく、通信record番号もない。
  Console手順は送信しない入力整形の確認だけを`docs/venice-attestation-status.md`に記載した。

### 不明なこと

- 既存403の原因や、参考実装の方式がVeniceから自動利用を許可されているかは未確認。
  稼働報告を利用許可とは扱わない。認証情報の取得やprivate endpointの再送による確認は実施していない。

### 次に確認したいこと

- 輸送追加は正式に利用できる連携経路を使う設計として扱う。公開APIへの変更は別途の実装範囲とする。
- 4.5の保留は輸送追加に限る。5のwrite_stdinは未着手のまま維持する。


## 2026-11-24 — core/findのread権限接続と結果表示

### 分かったこと

- `795216fb`を基点に`codex/venice-find`で実装した。NodeはVoltaの`v22.23.5`。
  根拠commitは`72b6daea`（gateway / kernel / 検索結果）と`78d02537`（承認・パネル・追加検証）。
- 新しいパネルは`tools: ['core/read', 'core/find']`を要求し、appに読み取りと検索を明示する。
  旧`['core/read']`の要求・grantは引き続き受け付け、旧grantへfindを自動追加しない。
  findの実行にはreadとfindの両方が必要。write / shellの同意は不要で、既定OFFを保つ。
- Veniceのregistrarだけfindを明示的に登録し、既存find handlerのschema / search guardから既存search engineを呼ぶ。
  通常CoSでのfind / execの排他、name / 50件の既定、既存read / write / execの契約は変えていない。
  検索engine本体の`search.ts`も変更していない。
- Veniceのcontent検索はripgrepを使う。query / path等は既存の引数を使い、既定content / 200件、最大500件。
  path省略時はgrantの全root、相対pathは先頭rootを使い、全てのpathを既存resolverで検証する。
  別のglobally approved root、native path、traversal、外向きsymlinkは拒否し、配下の外向きlinkも走査しない。
- 上限+1件まで取得してから返す件数を制限する。実ファイルで200件ちょうどならtruncated:false、
  201件なら200件 / truncated:trueとなることを確認した。
  結果はmatches内のpath / line / text、count / limit / truncated / stoppedBecause / binaryPolicy。
  contentの抜粋は既存searchの最大300文字。明示nameモードはpathだけを返す。
- 明示binaryファイルにripgrepを使うと、NUL直前までの部分的なmatchが返る場合があることを実測した。
  Veniceの明示ファイル検索では既存の先頭8KiBのbinary判定を併用し、binaryを検索対象から除外する。
  UTF-16 BOM付きテキストはbinary扱いにせず、行番号とdecoded textを返す。
  nameモードではbinaryファイルの名前も対象にするためbinaryPolicyはnames-onlyとする。
- 出力NULは空白へ置換する。結果は既存のsecrets shield・host_admitted記録・callId台帳を通す。
  失効後の新規検索は拒否し、処理中に失効した結果も渡さない。再取得で検索を実行し直さない。
- パネルは結果をtextContentでまとめて描画する。改行・横スクロール・キーボード操作を保ち、0件と打ち切りを表示する。
  新しい承認scopeと出力ラベルは現在の方針どおりja / enへ登録した。
- 追加16件が全て成功（`outputs/venice-find/added-tests.log`）。実kernel / gateway / 認証HTTP、
  一時フォルダーと実ripgrepで権限拒否、root外、通常ヒット、0件、上限、NUL / binary / UTF-16、
  read-onlyでcommand無効、callId再取得、revoke、secrets shieldを確認した。既存テストは変更・削除・skip・緩和していない。
  既存ブラウザのCJS53件も成功（`browser-regression.log`）。
- 全体`npm test`は実装とテストを固定して1回実行し、終了コード0。
  **523 passed / 0 failed / 20 skipped**（ファイル）、**12,829 passed / 0 failed / 218 skipped**（テスト）。
  `npm run typecheck` / `npm run build`も終了コード0。根拠は同フォルダーの`full-test.log` / `full-test.exit` / `typecheck.log` / `build.log`。
- `node test/venice-find.visual.cjs`はheadless Chromeで成功。既存の承認UIとMAIN / ISOLATEDを実行し、
  read+findの明示、write / shell OFF、ja/enの表示、path / 行 / 抜粋、安全な文字列、NUL除去、打ち切り、
  横スクロール、PC / モバイル、axe違反0・pageerror 0を確認した。画像は`outputs/venice-find/`。
  ブラウザ通信はローカル合成応答またはabortで、実Venice送信recordはない。

### 不明なこと

- 実Veniceモデルがcore/findを選んで検索結果を利用する動作は未検証。モデル応答は合成値を使用した。
- private endpoint 403やattestation等の未解明事項は今回調査しておらず、4.5の保留を変更しない。

### 次に確認したいこと

- 残キューの5：write_stdin。execのrun所有者とprocessIdを使って継続を接続する。
  2.1.55が出ていれば先にマージする。7の履歴UIは引き続き未着手。

## 2026-11-24 — 開発用拡張の自動注入をVenice専用にする

### 分かったこと

- 通常CoSとの二重フックでChatGPTが固まるというユーザー報告を受け、開発用manifestの
  `content_scripts`から`https://chatgpt.com/*` / `https://chat.openai.com/*`だけを対象にした3登録を削除した。
  対象ホストがなくなる登録自体を外し、無効な空の`matches`は残していない。
  ChatGPT側は通常のChat On Steroidsが担い、開発用拡張の自動注入先はVeniceだけにする。
- VeniceのMAIN / document_start登録（`usage.js`を含む）とISOLATEDのbridge / panel登録は変更していない。
  `usage.js`のVenice分岐もそのまま残す。`background.js`と各スクリプト本体は変更していない。
  比較元`134a22e7`との構造比較で、`content_scripts`以外のmanifest全項目とVeniceの3登録が同一であることを確認した。
  name / version / host_permissionsも変更していない。
- ChatGPT自動注入を前提にした既存4テストファイルを開発用manifestの期待値へ合わせた。
  テストの削除やskipは行わず、palette本体やpopupのi18n読込順の検証も維持した。
- NodeはVoltaの`v22.23.5`。旧・新登録に含まれる12スクリプトの`node --check`が全て成功。
  manifest関連の既存5ファイル435テストと、Veniceの送信・bridge・panelの合成50テストは全て成功した。
  ログは`outputs/dev-extension-venice-only/targeted-test.log`と`venice-regression.log`。
- 全体`npm test`は1回実行し、終了コード0。
  **523 passed / 0 failed / 20 skipped**（ファイル）、**12,829 passed / 0 failed / 218 skipped**（テスト）。
  既存のskip数は変えていない。根拠は同フォルダーの`full-test.log`と`full-test.exit`。

### 不明なこと

- 実Chromeで通常CoSと併用した際のフリーズ解消は未検証。今回はmanifestと合成テストで検証した。
  programmatic injection等のbackground処理は、指示どおり変更していない。

### 次に確認したいこと

- Chromeで開発用拡張を再読み込みし、既に開いているChatGPTタブも再読み込みして旧注入を取り除く。
  通常CoSのChatGPT動作と、開発用拡張のVenice動作を確認する。

## 2026-11-24 — 開発版の表示名とferroアイコン

### 分かったこと

- Venice専用拡張の`81003931`を`codex/venice-exec`へno-ffでマージし、`5543094a`をpushした。
  その後`brand/dev-name`で表示上のブランドを変更した。
- メインウィンドウの初期タイトル、rendererのtitle、サイドバーとチャットヘッダの名前、
  トレイのツールチップ、ネイティブAboutのapplicationNameを`Chat On Venice (dev)`に統一した。
  rendererの既存t / ui経路とMAIN_TEXTSを使い、ja / enに同じ表示名を登録した。
  他言語は既存の英語フォールバックを使う。言語変更時はnative側のAboutとタイトルも更新する。
- `package.json` / lockfile / `electron-builder.yml`は変更していない。
  `productName`、`appId`、package名は内部の識別子として据え置き、app.setNameやuserDataの変更も行っていない。
  パッケージ版の既定保存先を動かさないためproductNameを維持する。devの保存先は別途
  `--user-data-dir`の明示パスで固定しており、productName据え置きとは独立した指定である。
  表示名で通常CoSとの見分けを付け、appIdは既存のnative識別を維持する。
- 新規の`artwork/app-icon-source.svg`は暗いティール`#123e42`の角丸四角と白いferroのオリジナルシルエット。
  六つの前歯・反対側の歯・上部の曲線を持つ形にした。rendererのi-markにも同じパスを使う。
  SVGからRGBA PNGを書き出し、既存の`npm run icon`でICO / PNG / BMPと拡張の4サイズを生成した。
  既存のPNG入力・mask / crop / resampleの流れと出力先は維持し、二色パレットだけを更新した。
  再生成手順は`artwork/README.md`に記載した。
- macOS開発起動時のDockには、チェックイン済みのsource PNGを設定する。
  無視対象のbuild画像の有無に起動を依存させない。packaged版のnativeアイコン選択や、トレイの状態ドットは変更していない。
- NodeはVoltaの`v22.23.5`。変更箇所のテスト5ファイル135件が成功し、最終変更後の追加6件も成功した。
  型チェックとbuild、変更したJSスクリプトの構文検査も成功した。
- 全体`npm test`は指定どおり1回実行し、**523 passed / 1 failed / 20 skipped**（ファイル）、
  **12,832 passed / 3 failed / 218 skipped**（テスト）。失敗は全て`window-lifecycle.test.ts`の
  darwin / win32 / linuxのconstructor切出し実行で、VMへ`mainText`が渡されていないReferenceErrorだった。
  同テストへ実際の`mainText`依存を渡し、既存assertは維持して新タイトルのassertも追加した。
  テストの削除・skip・assertの緩和は行っていない。全体実行のログは`outputs/dev-brand/full-test.log`。
  補完後は失敗ファイルを含む関連6ファイルを実行し、**152 passed / 0 failed**。
  根拠は`outputs/dev-brand/final-targeted-test.log`。
- headless Chromeで実rendererのHTML / CSS / i18nとローカルフォントを使い、英語・日本語、1280 / 800pxで検証した。
  表示名・折返し・検索ボタンの収まり・pageerror 0と、256 / 128 / 48 / 32 / 16pxアイコンを確認した。
  画面とログは`outputs/dev-brand/`。外部通信は遮断し、実Venice送信は行っていない。

### 不明なこと

- 起動中の開発アプリは再起動していないため、実nativeウィンドウ・About・トレイ・Dockの反映は未確認。
  native側は接続コード・翻訳契約のテストと型チェックで確認した。
- 全体実行は1回という指定を守り、VM依存補完後の全体再実行は行っていない。
  修正後は失敗ファイルと関連テストの対象実行で確認した。最終候補の全体0 failedという実行記録はない。

### 次に確認したいこと

- 次の開発アプリ再起動時に、ウィンドウ・About・トレイの表示名とDockアイコンを確認する。
  `productName` / `appId`を使うアプリメニューやインストール名などは、今回の表示名変更の対象外。

## 2026-11-24 — dev/prodの表示名分離と再検証

### 分かったこと

- 前commit`ba4ecfbe`は表示名が固定されており、パッケージ版にも`(dev)`が出る実装だった。
  `src/main/app-brand.ts`の1箇所で`app.isPackaged`を判定するよう変更した。
  開発版は`Chat On Venice (dev)`、パッケージ版は`Chat On Venice`。
  nativeのタイトル・About・トレイは同じmain所有のキーを使う。
- mainの既存AppState IPCに表示キーを追加し、rendererは渡されたキーをt / uiで反映するだけにした。
  index.htmlのtitleと両ヘッダは動的な空の表示先とし、dev名をHTMLへ埋め込まない。
  旧stateと既存呼出しの互換性のためフィールドは追加のoptionalとし、rendererでdev判定や別の名前推測はしない。
  ja / en両方にdev / prodキーとdev Aboutメニューのキーを登録した。
- `package.json` / lockfile / `electron-builder.yml`は変更していない。
  package名`chat-on-steroids`、productName`Chat On Steroids`、appId`com.chatonsteroids.app`を固定する回帰テストを追加した。
  app.nameやuserDataを変える処理は追加していない。

#### 前回の3件はVMへ新しい依存を渡し忘れた失敗

`ba4ecfbe`で行ったテスト環境修正の主要差分は次のとおり。

```diff
+import { mainText } from '../src/main/main-texts.js';
-      layout: {}, icon: null, process: { platform },
+      layout: {}, icon: null, process: { platform }, mainText,
+    expect(options?.title).toBe('Chat On Venice (dev)');
```

- 既存のdarwin / win32 / linuxの3ケースとfullscreen / sandbox等のassertは維持されている。
  テストの削除・skipやassertの緩和はなく、タイトルのassertを追加した。
  今回はconstructorがmain所有のキーを参照するため、同じVMへ`appBrand`も渡した。
- 前回commitの同じconstructor断片を使い、mainTextの有無だけを変える比較を実行した。
  3環境とも依存なしでは`ReferenceError: mainText is not defined`、実際のmainText関数を渡すと
  devタイトルと既存fullscreen条件が成功した。OS / Nodeのフレークではなく、テストハーネスの依存不足だった。
  根拠は`outputs/dev-brand-review/test-environment-fix.patch`と`test-environment-proof.json`。

#### アイコンの小サイズと出力を確認した

- `npm run icon`に16 / 22 / 32 / 48 / 128 / 256 / 512pxの全出力を追加した。
  `build/icons/icon*.png`と白単色透過の`ferro-template*.png`を生成する。
  既存のICO 6サイズ、1024px / preview / runtime PNG、installer BMP、拡張4サイズの出力も維持した。
- 16pxの角丸タイル版はferroの歯が詰まって見えたため、白いferroだけを大きく配置したトレイ専用版を追加した。
  mask外の透明画素も縮小時の面積へ数え、歯と隙間をアンチエイリアスする。
  16 / 32pxの`artwork/trayTemplate.png` / `trayTemplate@2x.png`をチェックインし、macOS devのtemplate imageに使う。
  devの接続状態はツールチップと既存メニューへ表示し、prodの既存状態ドットは変えていない。
- `test/dev-icon.test.ts`は一時フォルダーで実際のicon scriptを動かし、全出力・寸法・ICO収録数・透過白の画素を確認する。
  SVG source、既存script経路、依存パッケージは維持した。手順は`artwork/README.md`。
- headlessの実HTML / CSS / i18nでdev / prod、英語 / 日本語、1280 / 800pxを検証した。
  タイトル・ヘッダ・折返し・検索ボタンの収まり・pageerror 0を確認し、全サイズを目視した。
  根拠は`outputs/dev-brand-review/visual.log`と`outputs/dev-brand/icon-sizes.png`等。

#### macOSで確認したこととアプリメニューの判断

- 開始時点で開発アプリと8766 listenerは停止していた。既存の専用runtimeを使い、8766固定で起動・終了・再起動した。
  通常CoSは起動していない。実Venice送信は行っていない。
- 再起動後のnativeウィンドウ名と実rendererのヘッダは`Chat On Venice (dev)`。
  Aboutには同じ表示名とアプリ版`2.1.54`を確認した（括弧内のElectron runtimeは`44.3.0`）。
  根拠は`native-window-final.png` / `native-about-final.png`等、同reviewフォルダー内のローカル観測。
- 実機のmacOSアプリメニューの先頭名は、本番名ではなく開発用runtimeの`Electron`だった。
  カスタムの先頭ラベルを渡してもmacOSはruntime名を表示したため、先頭名は許容すると決めた。
  app.setNameを使ってprofileの識別を変えず、devのAbout項目だけ`Chat On Venice (dev)について`に差し替えた。
  残りの既存メニュー・role・shortcutはそのまま使い、prodのメニューは変更しない。
- macOSの標準Aboutパネルのアイコンは開発runtimeのElectronマークが残ることを実測した。
  iconPath指定による差し替えはこの環境の標準パネルへ反映されなかった。表示名と版は反映されている。
- トレイの白いferroは実メニューバーで確認できた（`native-menubar-strip.png`）。
  ツールチップとDock画像の確認中にはポインターが他の位置へ移動し、hoverを維持できなかった。
  agent-desktopのdelivery表示だけでは成功とせず、OSの実ポインター座標と画面を確認した。
  操作競合を避けるため、ユーザーへ短時間のマウス操作停止を依頼し、この2点の実機確認は保留した。

#### 最終候補の検証結果

- NodeはVoltaの`v22.23.5`。`npm test`を全体で1回実行し、終了コード0。
  **525 passed / 0 failed / 20 skipped**（ファイル）、**12,838 passed / 0 failed / 218 skipped**（テスト）。
  skip数は前回から変えていない。今回のコードとテストを固定して実行した。
  根拠は`outputs/dev-brand-review/full-test.log` / `full-test.exit`。
- `npm run typecheck`と`npm run build`も成功した（同フォルダーの`typecheck.log` / `build.log`）。
  関連6ファイル440件、最終候補のbranding / icon / lifecycle 26件も成功した。
  本番名 / dev名・ja / en・native About / window・メニューの保持・内部識別子・icon全出力に回帰テストを追加した。

### 不明なこと

- パッケージ版を実際に作成して起動する確認は行っていない。packaged=trueのmain分岐、native設定、
  renderer表示、ja / enカタログは回帰テストとheadless画面で確認した。
- トレイのツールチップが実際に表示された状態と、Dockのferro画像は未確認。
  開発アプリは8766固定・既存の専用runtimeで起動したままにしている。

### 次に確認したいこと

- 将来パッケージ版を配布する際に、実bundleの表示名とアイコンを確認する。
- マウス操作が競合しない時間に、起動中の開発アプリのツールチップとDock画像を確認する。
  短い操作停止の可否はユーザーへ確認中。この2点の記録が揃ったら実機確認を完了扱いにする。

## 2026-11-24 — brand/dev-nameを2.1.55へrebase

### 分かったこと

- 対象は`brand/dev-name`だけ。開始時はcleanで、元tipは`21fb547f`。
  upstreamは`https://github.com/totec448-spec/chat-on-steroids.git`が登録済みだった。
  fetchでは既存`canary`タグの移動だけが拒否され、v2.1.55とupstream/mainは取得できた。
  無関係なタグは強制更新していない。当たり判定の生ログは`outputs/brand-rebase-2155/impact.log`。
- `git rebase --rebase-merges v2.1.55`は完了した。v2.1.55のcommitは`a6936f41`。
  衝突は初期manifestのname / version周辺と、12ロケール末尾の追加キーだった。
  manifestは2.1.55とVenice登録を保持し、ロケールはupstream側とVenice側のキーを両方残した。
  機能単位で片側を捨てる解消はしていない。
- rendererのupstream 12カタログと追加en.jsonを維持した。各upstreamカタログについて
  v2.1.55の全キーが残ることを照合した。dev / prod名の追加はja / enだけ。
  enには2.1.55のsourceキー12件と、`Restored {0} of {1} files|one`の単数形を補った。
  単数形の値は既存`turn-changes.ts`のtn呼出しと同じ`Restored {0} of {1} file`。
- `src/main/version.ts`、package / lockfile、拡張の版は2.1.55。
  `scripts/verify-whats-new.cjs`はv2.1.55と差分がなく、2.1.55のleadを期待する版を採用した。
  `codex/venice-exec`は元の`5543094a`のままで、rebaseもpushもしていない。

#### テスト環境修正の棚卸し

- 元`ba4ecfbe`（rebase後`30d37073`）をgit showで確認した。
  `window-lifecycle.test.ts`へ実mainTextのimportとVM注入、タイトルassertを追加した差分は維持する。
  後続のmain所有キーに必要なappBrand注入も維持する。初回3件のReferenceErrorは、この依存注入で説明できる。
  主要差分は前節に掲載済み。元diffは`kept-test-environment.patch`、rebased diffは`rebased-test-environment.patch`に保存した。
- #2261の`cdcaa8fc` / merge `f4c63cdd`は、rebase前から共通祖先だった。
  timelineテストはv2.1.55と同一で、同じ修正がブランチ差分に重複していなかった。
  したがって削除した重複ハンクは0件。#2261のimmediate / deferred両ケースとUI待機のassertをそのまま採用した。
  根拠は差分なしの`timeline-vs-upstream.diff`。テストの削除・skip追加・assert緩和は行っていない。
- 関連8ファイルの確認では#2261の2ケースだけが並列時に待機期限で失敗した。
  同じ2ケースの単独実行は両方成功し、その後の全体実行でもこの2ケースは成功した。
  テストは変更せず、並列時のフレーク候補として記録する。原因は確定していない。

#### dev判定・識別子・macOSメニューの判断

- 判定は`src/main/app-brand.ts`の`!app.isPackaged`の1箇所に集約したまま。
  devは`Chat On Venice (dev)`、prodは`Chat On Venice`をmainが選び、既存AppState IPCでrendererへ渡す。
  index.htmlのtitleとヘッダは動的表示で、ja / enカタログを直接検証する回帰テストを維持した。
  productName`Chat On Steroids`はパッケージ版の既定userDataを動かさないため、
  appId`com.chatonsteroids.app`は既存native識別を維持するため据え置く。
  devのuserDataは`--user-data-dir`で固定しており、このproductName判断とは分ける。
  macOSの開発起動の先頭メニューは本番名ではなく`Electron`と実測したため、このruntime名を許容する。
  app.setNameで識別を変えず、devのAbout項目だけを識別可能な文言にする方針も維持した。
- npm ci後にElectron runtimeが未展開だったため、インストール済み公式electronパッケージのinstall.jsで展開した。
  設定や依存versionは変えていない。`npm ci`は成功し、既存依存のaudit表示は15件（8 moderate / 7 high）だった。
  audit fixや無関係な依存更新は行っていない。
- 8766固定、既存の専用runtimeで再起動した。実ウィンドウ名・ヘッダは`Chat On Venice (dev)`、
  Aboutは同じ名前と`2.1.55`（runtime `44.3.0`）。Dockには新しいティール / 白のferroを実機で確認した。
  根拠は`native-window.png` / `about.png` / `dock-live.png`。
  /helloもversion 2.1.55 / bridge 15 / paired:trueだった。実Venice送信は行っていない。

#### アイコンとインストーラ画像

- `npm run icon`で16 / 22 / 32 / 48 / 128 / 256 / 512pxを再生成し、各サイズを目視した。
  16pxタイル版は歯が詰まるが、22 / 32 / 48では輪郭が明確になり、128 / 256 / 512では歯と曲線が明瞭。
  既存の白単色透過トレイ専用版を維持し、devのmacOSではこのtemplateを使う。
  legacy ICO / PNG / BMPと拡張4サイズを含む生成一式も、実scriptを動かす回帰テストで確認した。
- artworkには別の古いインストーラ用ヘッダ / サイドバー原画はない。
  同じsource PNGから生成する`build/installerHeader.bmp`（150×57）と`installerSidebar.bmp`（164×314）は、
  どちらも現在のferroへ更新されていることを目視した。寸法・teal画素の回帰テストも追加した。
  根拠は`installer-branding.png`と`test/dev-icon.test.ts`。

#### 検証結果と実行回数

- `npm ci`、最終カタログでの`npm run typecheck` / `npm run build`は成功。
  icon / headless画面確認も成功した。ログは`outputs/brand-rebase-2155/`に保存した。
- 最初の全体実行は英語の`Restored {0} of {1} files|one`不足で1件失敗した。
  診断には同じ`full-test.log`を使い、テストやassertは変えず英語カタログを補完した。
  該当の既存source監査とbranding / iconの21テストは全て成功した。
- 指定の「全体1回」に対して、初回が失敗したため、0 failedの受入を確認する最終候補でもう1回実行した。
  合計2回の全体実行で、最終結果は**525 passed / 0 failed / 20 skipped**（ファイル）、
  **12,853 passed / 0 failed / 218 skipped**（テスト）、終了コード0。
  `final-full-test.log` / `final-full-test.exit`が根拠。#2261の2ケースも最終全体で成功した。
- カタログの最終照合では、upstream 12ロケールの全キーと、2.1.55で追加された各41〜44キーの値を保持していた。
  ja / enのdev / prod名はfallbackでなく直接登録を確認した（`catalog-audit.log`）。
  git diffでテストファイルの削除・skip追加がないことも確認した。

### 不明なこと・残る確認

- この時点で残したトレイのツールチップ目視は、下記の追加確認で解消した。
  外部ディスプレイで実際の表示を確認し、証跡を保存した。

### 次に確認したいこと

- トレイの追加確認結果は次節に記録する。

## 2026-11-24 — userData・トレイ・パッケージ版の追加確認

### 分かったこと

#### 1. userDataの実値とreadyの順序

- `app.getPath('userData')`で取得した実値を、表示名の適用前後にログへ出した。
  devでは前後とも`/Users/atsu/chat-on-venice/outputs/venice-read-live/runtime`で、
  `ready=true; packaged=false; unchanged=true`。従来の起動引数で指定していた専用runtimeと一致する。
  devの保存先が固定される直接の理由は`--user-data-dir`の明示指定であり、productName据え置きではない。
  根拠は`outputs/venice-read-live/runtime/app.log`の`branding:`行。
- パッケージ版も隔離した検証用profileを使い、前後とも
  `/Users/atsu/chat-on-venice/outputs/brand-native-validation/packaged-runtime`、
  `ready=true; packaged=true; unchanged=true`を記録した。通常版の保存先は検証に使っていない。
  この検証用パッケージ版も明示パス指定である。productNameを据え置く理由は、明示指定なしで
  パッケージ版を起動した場合の既定userDataを動かさないためであり、両者を区別する。
- `src/main/index.ts`と`src/main/app-brand.ts`に`app.setName()`、`app.name =`、
  `app.setPath()`による識別子変更はない。`!app.isPackaged`の判定自体はmodule読込時だが、
  nativeの表示名適用は`app.whenReady()`後。ready前の名前変更でprofileを動かす経路は追加していない。
  このログは同じ起動内の適用前後の比較であり、過去の未記録のgetPath値を再現したものではない。

#### 2. トレイの設定値と実表示

- 使用中のElectron 44.3.0は`Tray.setToolTip()`を提供するが、`Tray.getToolTip()`は提供しない。
  installedの`electron.d.ts`と[Electron 44のAPI実装](https://github.com/electron/electron/blob/v44.3.0/shell/browser/api/electron_api_tray.cc)を照合した。
  存在しないgetterの戻り値は作らず、実行時に
  `branding: tray.getToolTip=unavailable; configured="Chat On Venice (dev)"`と記録する。
- tooltipは接続状態の接尾辞を外し、正確に`Chat On Venice (dev)`へ揃えた。
  接続状態は既存のトレイメニューに残る。
- 外部ディスプレイの可視領域にある白いferroを実際にhoverし、
  `Chat On Venice (dev)`のネイティブtooltipを目視した。
  根拠は`outputs/brand-native-validation/tooltip-verified.png`。
  メニューを開いた実表示も`tray-menu-external.png`に保存した。
  確認中に一時的に隠した他アプリとOSのメニューバー項目、時計の日付・曜日はすべて元へ戻した。

#### 3. 小サイズの実ファイル

- `build/icons/icon16.png` / `icon22.png` / `icon32.png` / `icon48.png`を生成して実ファイルを目視した。
  16pxのタイル版は歯が詰まりferroの細部が読みにくい。22pxは小さいが輪郭が分かり、32/48pxは塗り潰れず歯と曲線を識別できる。
- トレイ専用の単色透過版は16pxの画素に合わせて調整し、6本の歯の間に1pxの隙間を確保した。
  当初は白だったRGBを、後述のtemplate形式確認で黒へ変更した。
  `artwork/trayTemplate.png`は16px、`trayTemplate@2x.png`は同じ形を2倍にした32px。
  小サイズのcrest・後方の刃・足の輪郭を保ち、実メニューバーでもferroとして読めることを確認した。
- 既存の`npm run icon`の起動方法、ICO/PNG/BMP・拡張アイコンの出力は維持した。
  回帰テストは16/22/32/48/128/256/512pxとlegacy出力を列挙し、16pxの歯と隙間のalphaも検証する。

#### 4. macOSのメニュー名を2種類の実行形で確認

- checkoutからのdev実行は`Electron`、このブランチをローカルでパッケージしたappは`Chat On Steroids`だった。
  両方を各プロセスの実メニューバーから読み取った。根拠は`outputs/brand-native-validation/menu-names.txt`。
  **両方とも許容する**。devの保存先は明示パスで固定する。
  パッケージ版の既定保存先と既存native識別子を守るため、productNameとappIdを維持し、表示名のために`app.setName()`を使わない。
- dev判定はmainの`!app.isPackaged`の1箇所。パッケージ版は開発ブランチからのローカルbuildでも
  `app.isPackaged=true`なので、ウィンドウ・About・tooltipにはprod側の`Chat On Venice`を使う。
  productNameは`Chat On Steroids`、appIdは`com.chatonsteroids.app`のまま。
- 既存の`scripts/package.mjs --platform darwin --arch arm64 --dir`で生成し、
  `release/mac-arm64/Chat On Steroids.app`のad-hoc封印とnative runtime smoke確認が成功した。
  根拠は`outputs/brand-native-validation/package.log`。生成時のホスト別ライセンス一覧はartifact側に含め、
  今回と無関係な依存inventoryの差分はソースへコミットしない。

#### 5. 英語キー不足の原因

- 英語キー不足は**実装側のen.jsonカタログの欠落**だった。テストのfixture不足ではない。
  `fa39d852`の実diffには2.1.55で増えた12キーと、全体監査で見つかった単数形キー
  `Restored {0} of {1} files|one`の追加がある。
  `src/renderer/turn-changes.ts`の既存`tn()`呼出しに対応する値は`Restored {0} of {1} file`。
- それ以前の初回3件の`window-lifecycle`失敗は別件で、VM環境に新しい`mainText`依存を渡していなかったため。
  `30d37073`のimportとVM注入のdiffで説明できる。英語カタログの欠落と混同しない。
  今回、既存テストの削除・skip追加・assertの緩和は行っていない。

#### 6. 最終候補のテスト

- Node 22.23.5で全体`npm test`を今回1回実行し、終了コード0。
  ファイルは**525 passed / 0 failed / 20 skipped**、
  テストは**12,854 passed / 0 failed / 218 skipped**だった。
  根拠は`outputs/brand-native-validation/full-test.log` / `full-test.exit`。
- branding・icon・window lifecycleの対象テストも**28 passed / 0 failed / 0 skipped**。
  `npm run typecheck` / `npm run build`も成功した。既存テストの削除・skip追加はdiffにない。
- 最終buildでdev/prod・ja/en・1280/800pxのheadless表示確認も成功。
  devを従来の8766 / 専用runtimeで起動し直し、最終ログでもパス不変とtooltipの設定値を確認した。
  `/hello`はversion 2.1.55 / bridge 15 / paired:trueだった。実Venice送信は行っていない。

#### 7–8. 識別子の回帰テストとWhat's New

- productName/appIdは以前から設定行のリテラルをregexで比較していた。今回さらにYAMLをparseし、
  `.toBe('Chat On Steroids')` / `.toBe('com.chatonsteroids.app')`で値を直接固定した。
  ja/enのdev/prodキーもfallbackを使わず直接参照するテストを維持した。
- 2.1.55のWhat's Newはdevビルドにも含まれ、通常版と同じ更新時の一度だけ表示する条件で出る（devを除外する分岐はない）。

### 不明なこと

- `tray.getToolTip()`の戻り値はAPIが存在しないため取得できない。設定値のログと実際のtooltip表示は両方確認済み。

### 次に確認したいこと

- 次の機能作業は既存のprogressキューで管理する。この追加確認では着手していない。

## 2026-11-24 — トレイの実配線・template形式・上流skip件数

### 分かったこと

- `scripts/make-icon.mjs`は`artwork/trayTemplate.png`（16×16）と
  `artwork/trayTemplate@2x.png`（32×32）を生成する。
  mainの`trayIcon()`はmacOSかつdevの場合に
  `path.join(app.getAppPath(), 'artwork', 'trayTemplate.png')`を読み、
  そのNativeImageを`new Tray()`と`tray.setImage()`の両方へ渡す。
  実行時ログは`image="/Users/atsu/chat-on-venice/artwork/trayTemplate.png"; template=true; size={"width":16,"height":16}`。
  汎用の`build/icon.png`へは接続されておらず、読込先の修正は不要だった。
- ファイル名の`Template`接尾辞と`setTemplateImage(true)`は既に有効だった。
  RGBは白だったため、今回、黒（RGB 0/0/0）＋アルファへ統一した。
  16pxとRetinaの32pxの両方について、全可視画素のRGB・透明画素・6本の歯の隙間をテストで固定した。
  Retinaファイルと既存のICO/PNG/BMP・拡張用出力を生成する流れは維持している。
- 外部ディスプレイの**ライトのメニューバーでは黒いferro**、**ダークでは白いferro**を目視した。
  壁紙色の影響を分けるため、確認中だけメニューバーの背景表示と「透明度を下げる」をonにした。
  根拠は`outputs/tray-template-validation/light-opaque-screen.png` / `dark-opaque-screen.png`。
  いずれも実macOSの表示で、画像上の色反転による合成ではない。
  終了時に外観は元のダーク、背景表示と透明度設定は元のoffへ戻した。
- 今回のサイズ判定は**汎用タイルではなく、実際に使うトレイ専用のferro**を対象にした。
  **16px：読める**。6本の歯の間隔、上端の曲がり、後ろの刃と足が残る。
  **22px：黒い本体の塗りと歯の隙間を保持し、潰れていない**。
  **32px：2倍の画素グリッドで塗りと隙間を保持し、潰れていない**。
  **48px：曲面・本体の塗り・歯の隙間を保持し、潰れていない**。
  この判定では追加の形状変更は不要だった。実ファイルは
  `build/icons/ferro-template{16,22,32,48}.png`。nativeサイズで並べた確認画像は`outputs/dev-brand/icon-sizes.png`。
- userDataの理由をdevとパッケージ版で分けて、既存の該当節も修正した。
  devの保存先は`--user-data-dir=/Users/atsu/chat-on-venice/outputs/venice-read-live/runtime`で明示固定。
  productNameを`Chat On Steroids`のままにする理由は、**明示パス指定なしのパッケージ版の既定userDataを動かさないため**。
  前回のパッケージ版検証も隔離profileを明示指定したもので、既定保存先の実測とは区別する。

#### v2.1.55とのskip比較

- 素のタグ`v2.1.55`（`a6936f41`）を`outputs/tray-template-validation/upstream-v2155`に
  detached worktreeとして展開し、変更なし・Node 22.23.5・同じlockfileの`npm ci`後に全体テストを1回実行した。
  218は**skippedテスト数**、20は**全テストがskipされたファイル数**であり、passed数ではない。

| 実行範囲 | テスト passed / failed / skipped | ファイル passed / failed / skipped |
| --- | --- | --- |
| 素のv2.1.55、今回の全体実行 | 12,749 / 1 / 218 | 509 / 1 / 20 |
| このブランチ`0e6007cf`、前回の全体実行 | 12,854 / 0 / 218 | 525 / 0 / 20 |
| 今回の最終候補、skipを含む41ファイルの実行 | 659 / 0 / 218 | 21 / 0 / 20 |

- 今回の最終候補では、上流でskipを含んだ41ファイルを再実行した。
  JSONレポートの**218件のケース名と20件の全skipファイル名は完全一致**し、追加・消失は各0件。
  40ファイルは上流と同一、残る`linux-screenshot-consent.test.ts`の差分は既存のja/enカタログassertだけで、
  skip条件とケース名は同じだった。今回の編集にもskipの追加やテスト削除はない。
- 上流全体の1失敗は`renderer-timeline.part1.test.ts`の
  `keeps the prior transcript inert until the selected detail arrives and fences A to B to A (immediate traces)`。
  現在の回答が待機期限内に表示されなかった。同じ素のworktreeで該当ファイルを単独実行すると
  **111 passed / 0 failed / 0 skipped**で再現しなかった。テストは変更していない。
- 根拠は`upstream-tests.log` / `upstream-tests.json` / `upstream-timeline-isolated.log`、
  `current-skip-audit.log` / `current-skip-audit.json`、`skip-comparison.json`（すべて`outputs/tray-template-validation/`）。
  前回のブランチ全体結果は`outputs/brand-native-validation/full-test.log`。
- 変更対象のbranding・icon・tray imageのテストは**19 passed / 0 failed / 0 skipped**。
  typecheck、build、JS構文検査、headless表示確認も成功した。
  今回はskip比較を必要な41ファイルで行い、ブランチ全体の再実行はしていない。

### 不明なこと

- 上流のtimeline失敗は単独では再現せず、原因の確定はしていない。skip件数・対象の一致は確認できた。

### 次に確認したいこと

- 次の機能作業は既存のprogressキューに従う。今回の変更はトレイ・回帰テスト・確認記録に限定した。

## 2026-11-24 — パッケージのトレイ資産を統合（実機表示は後続の追試で完了）

### 分かったこと

#### 1–2. 収録対象と正・派生

- 元の`electron-builder.yml`の`files`は`out/**`と`package.json`等で、
  `artwork/trayTemplate.png` / `trayTemplate@2x.png`は含まれていなかった。
  実読込用の正を`build/icons/trayTemplate.png` / `trayTemplate@2x.png`へ移し、
  読まれない`artwork`側の2ファイルと、そのディレクトリへの生成を削除した。
- native画像は`extraResources`で実ファイルとして収録する。
  `build/icons`から2ファイルだけを`Contents/Resources/icons`へコピーし、
  Dock/Aboutの`build/runtime-icon.png`は`Contents/Resources/runtime-icon.png`へコピーする。
  Linuxが既に使っていたruntime-iconの収録先も維持した。
- `appBrandAssetPath()`が、checkoutでは`<appRoot>/build`、パッケージ版では
  `process.resourcesPath`を選ぶ。トレイはその`icons/trayTemplate.png`と`icons/trayTemplate@2x.png`を読み、
  1x/2xのPNG表現を明示して`setTemplateImage(true)`を設定する。
  final artifactの`app.asar`内にはartwork版やbuild/icons版の重複はない。
- `ferro-template*.png`は確認専用の派生。16/32pxは実読込用と同じエンコード済みバイトから生成し、
  その他のサイズも同じmask関数から生成する。回帰テストは正と派生のバイト一致と、artwork版を生成しないことを確認する。
  `npm run dev` / `npm run build`には`predev` / `prebuild: npm run icon`を追加し、既存の起動・build方法だけで資産が揃うようにした。
  packageスクリプトも同じgeneratorを使う。
- final artifactの実収録を確認した。`trayTemplate.png`は16×16、`trayTemplate@2x.png`は32×32、
  runtime-iconは256×256。根拠は`outputs/packaged-ferro-validation/effective-assets.json`。

#### 3. パッケージ実行の確認と未達（当時の記録）

- `scripts/package.mjs --platform darwin --arch arm64 --dir`で実物を生成し、
  `release/mac-arm64/Chat On Steroids.app`を隔離profileで起動した。
  最終packageの内部build、ad-hoc封印、既存native runtime smokeは成功した。
  根拠は`outputs/packaged-ferro-validation/package-delivery.log` / `package-delivery.exit`。
- mainのdev判定を`!app.isPackaged || process.env.COS_DEV_BRAND === '1'`へ拡張した。
  通常パッケージはprodのまま。今回のパッケージ確認は`COS_DEV_BRAND=1`を明示した。
  productName / appId / userDataの識別子は変更していない。
- 実パッケージのログで`packaged=true`、userDataの前後一致、
  `Contents/Resources/icons/trayTemplate.png`の読込、`template=true`、16×16を確認した。
  tooltipのsetterへ渡した文字列は正確に`Chat On Venice (dev)`だった。
  NativeImageの実デコードでも非透明画素73個を確認し、空画像ではなかった。
  ウィンドウのAXタイトルとrenderer URLも、この実パッケージの`Chat On Venice (dev)`だった。
- **この時点ではferroとtooltipの目視が未達で、項目3を保留とした。後続の「トレイの実行時診断と実表示」で保留を解除した。**
  ライト・ダーク両方で確認したが、アイコンを可視表示できなかった。
  メニューバー項目の一時非表示、表示許可の再確認、通常版の一時終了、
  ユーザー承認済みのSystemUIServer / ControlCenter再起動後にも確認した。
  パッケージ内で同じPNGを使って作った診断用の最小Trayでも表示を確認できず、
  画像の収録漏れや空画像とは別の問題が残る。原因は未特定で、OS不具合とは断定していない。
  GUIDを変える切り分けでも改善せず、その変更は採用していない。
- 診断用Trayと検証用パッケージのプロセスは終了した。
  ユーザー指定どおり通常版を再起動し、8765の`/hello`でversion 2.1.55 / bridge 15 / paired:trueを確認した。
  開発アプリも従来の8766 / 専用runtimeへ戻し、paired:trueを確認した。
  一時変更した13個のメニューバー項目、背景表示、透明度設定、外観は元へ戻した。
  Mac全体の再起動は行っていない。

#### 4. 全体テスト1回

- アセット配線・dev判定・native画像読込を反映したソースで、Node 22.23.5の全体`npm test`を1回実行し、終了コード0。
  **テスト：12,858 passed / 0 failed / 218 skipped。ファイル：525 passed / 0 failed / 20 skipped。**
  根拠は`outputs/packaged-ferro-validation/full-test.log` / `full-test.exit`。
  最終typecheckも成功した。既存テストの削除・skip追加はない。
  その後、通常のbuild入口にも資産生成を補完し、対象テストと`npm run build`で確認した。

#### 5. 素のv2.1.55で確認した既知のflake

- 素の`v2.1.55`の全体実行で`renderer-timeline.part1.test.ts`の
  `keeps the prior transcript inert until the selected detail arrives and fences A to B to A (immediate traces)`
  が1 failedになった。該当ファイルの単独実行は111 passed / 0 failed / 0 skippedで再現しなかったため、
  **既知のflakeとして記録する**。テストとassertは変更していない。
  根拠は前節の`outputs/tray-template-validation/upstream-tests.log` / `upstream-timeline-isolated.log`。

### 不明なこと・残作業

- この時点の残作業は項目3の目視確認だった。後続の追試でライト・ダークのferroとtooltipの実表示を確認した。

### 次に確認したいこと

- 当時はCodexが目視確認を引き継いだ。追試の結果と再利用できる観測手順は次節に記録する。

## 2026-11-24 — トレイの実行時診断と実表示

### 分かったこと

#### 1. 成果物の配置

再ビルドした`.app`に対する`find`の結果は次の2ファイル。`ferro-template*.png`は確認用派生なので収録せず、
`app.asar`のエントリ一覧にも`ferro` / `trayTemplate`を含むファイルはなかった。

```text
/Users/atsu/chat-on-venice/release/mac-arm64/Chat On Steroids.app/Contents/Resources/icons/trayTemplate@2x.png
/Users/atsu/chat-on-venice/release/mac-arm64/Chat On Steroids.app/Contents/Resources/icons/trayTemplate.png
```

根拠: `outputs/tray-runtime-diagnosis/find-packaged-assets.log`。実読込用ファイルは`extraResources`側だけにある。

#### 2. 実行時の画像・Tray・readyを記録

`src/main/index.ts`の既存Tray初期化にdev/macOS限定の構造化ログを追加した。
この時点ではdevで既定出力だったが、現行の出力条件は後続「ブランディングのクローズ前確認」の明示フラグ方式に変更した。
実パッケージの実行ファイルをターミナルから`COS_DEV_BRAND=1`、8767、隔離profileで起動した結果は次のとおり。

| フィールド | 実測値 |
| --- | --- |
| imagePath | `/Users/atsu/chat-on-venice/release/mac-arm64/Chat On Steroids.app/Contents/Resources/icons/trayTemplate.png` |
| exists | `true` |
| fromPathEmpty（`createFromPath(...).isEmpty()`） | `false` |
| imageEmpty（実際に渡したPNG buffer由来の画像） | `false` |
| template / imageSize | `true` / 16×16 |
| trayCreated / trayDestroyed | `true` / `false` |
| ready / packaged | `true` / `true` |
| resourcesPath | `/Users/atsu/chat-on-venice/release/mac-arm64/Chat On Steroids.app/Contents/Resources` |
| appPath | `/Users/atsu/chat-on-venice/release/mac-arm64/Chat On Steroids.app/Contents/Resources/app.asar` |

根拠: `outputs/tray-runtime-diagnosis/runtime/app.log`、ターミナルの起動記録は`packaged-terminal*.log`。
`new Tray(...)`は既存の`app.whenReady().then(...)`内で実行される。
`isPackaged`でTray生成を省く分岐はない。`appBrand.development && darwin`は画像選択と診断ログだけの分岐。
secondary instance / 終了中のbootstrapを止める既存ガードと、終了時の`tray.destroy()`は維持した。

初期化直後の`getBounds()`はlayout前で高さ0だったが、描画後の当該PIDのAX status itemは34×24だった。
最終パッケージ実行のPIDと実座標は`outputs/tray-runtime-diagnosis/packaged-visible-state.json`に保存した。

#### 3. 切り分け結果と観測手順の修正

- 空画像、未生成、ready前の生成、破棄済みのいずれでもなかった。
  パッケージの解決先は既に`process.resourcesPath/icons/...`で正しく、asarとの混在もなかった。
  パスや画像、GUID、Tray生成条件は変更していない。
- 今回は通常版とdevを一時終了して実パッケージのPIDを特定し、そのウィンドウを外部ディスプレイへ移して確認した。
  外部画面の座標は`x=1512, y=-98`から始まる。主画面だけの観測や非アクティブなメニューバーではなく、
  対象PIDのAX status itemの位置を取得し、対象画面のアプリをアクティブにして、そのアイコンをクリック／hoverした。
- 同じ成果物でferroの描画とメニュー操作、ツールチップの実表示まで確認できた。
  前回の「表示なし」はこの有効な実機観測で訂正し、**項目3の保留を解除する**。
  OS再起動やOS不具合を前提にした製品側の回避策は不要だった。

#### 4. パッケージ版の実表示

- `npm run build`と`scripts/package.mjs --platform darwin --arch arm64 --dir`を再実行し、内部build・ad-hoc封印・native smokeが成功した。
  根拠: `outputs/tray-runtime-diagnosis/build.log` / `build.exit`、`package.log` / `package.exit`。
- ライトの明るいメニューバーでは黒いferro、ダークでは白いferroを確認した。
  16pxで6本の歯と隙間を識別でき、同じTemplate PNGがテーマに追従した。
  ライトでのhover表示は正確に`Chat On Venice (dev)`だった。
- 根拠: `packaged-light-tooltip.png`（黒いferroとtooltip）、`packaged-dark-final.png`（白いferro）、
  `packaged-click-final.png`（当該トレイのメニュー）。いずれも`outputs/tray-runtime-diagnosis/`内。
  明暗を明確に比較する間だけメニューバー背景と「透明度を下げる」を有効にし、検証後は元のoffへ戻した。外観も元のダークへ戻した。

#### 5. devを犠牲にしていないことと回帰確認

- devは従来どおり`CLF_BRIDGE_PORTS=8766 npm run dev -- -- --user-data-dir=/Users/atsu/chat-on-venice/outputs/venice-read-live/runtime`で起動した。
  devの解決先は`/Users/atsu/chat-on-venice/build/icons/trayTemplate.png`。
  `exists=true`、`fromPathEmpty=false`、`imageEmpty=false`、`trayDestroyed=false`、`ready=true`、`packaged=false`だった。
  packageだけは`resourcesPath`、checkoutだけは`app.getAppPath()/build`を使う既存の単一resolverを維持している。
- devの実メニューバーにも同じferroと`Chat On Venice (dev)`のtooltipを確認した。
  根拠: `outputs/tray-runtime-diagnosis/dev-dark-tooltip.png`、devの既存runtime内`app.log`。
- 診断ログが実際の`isEmpty()` / `isDestroyed()`を記録する2ケースを追加し、対象5ファイルは
  **73 passed / 0 failed / 0 skipped**。型チェックも終了コード0。既存テストの削除、skip、assertの緩和はない。
  根拠: `outputs/tray-runtime-diagnosis/targeted.log` / `targeted.exit`、`typecheck.log` / `typecheck.exit`。

### 不明なこと

- 前回の各未表示場面の具体的な要因は、当該PID・画面・アクティブ状態を対応付けた記録がなく遡及できない。
  今回はこれらを揃え、画像パスを変えずに描画とtooltipを確認した。

### 次に確認したいこと

- 同様の確認では、成果物の配置と実行時ログに加え、対象PID・ディスプレイのグローバル座標・アクティブ状態を揃える。
  setter値だけでtooltipの目視確認を代用しない。

## 2026-11-24 — ブランディングのクローズ前確認

### 分かったこと

#### 1. 診断はdevの明示フラグで1行だけ

- 起動時のuserData、画像、存在しないtooltip getterについて分散していた診断を、1行の構造化ログへ統合した。
  出力条件は`appBrand.development && COS_TRAY_DIAGNOSTICS === '1' && darwin`。
  通常のprodではフラグを指定しても出ず、devも既定は出さない。パスの追加probeも同じ条件内だけで実行する。
- mainのフラグ定義に、native描画の切り分け用に残す理由を1行コメントで記載した。
  再現する場合だけ、dev起動へ`COS_TRAY_DIAGNOSTICS=1`を付ける。
  パッケージのdev確認は従来の`COS_DEV_BRAND=1`に加えてこの診断フラグも必要。
  `configuredTooltip`はsetterへ渡す値であり、nativeのgetter値と混同しない。
- prodとdevの既定OFF、prodでのフラグ拒否、devの明示ON、1行だけの出力、OFF時に追加画像probeを実行しないことを回帰テストで固定した。

#### 2. outputsは非管理・既存ignoreで除外

- `git ls-files -- outputs/`は0件。
  `.gitignore`のルート規則`/outputs/`（48行）が`tray-runtime-diagnosis/`、そのJSONとuserData、今回の`brand-closeout/`も除外する。
  既存規則で十分なので重複するignoreは追加していない。
- 古いパネルvisual scriptが再実行のたびに追跡済みのdocs画像を上書きする経路も、`outputs/venice-panel/`へ変更した。
  既存の合成docs画像は保存資料として維持し、今回生成した画像と診断ファイルはコミットしない。

#### 3. 全体テスト1回と追加の検証

- 診断ガードと回帰テストを反映したNode 22.23.5の全体`npm test`は1回だけ実行し、終了コード0。
  **テスト：12,865 passed / 0 failed / 218 skipped。ファイル：525 passed / 0 failed / 20 skipped。**
  根拠: `outputs/brand-closeout/full-test.log` / `full-test.exit`。
- 型チェックとbuildも成功した。同ディレクトリの`typecheck.log` / `typecheck.exit`、`build.log` / `build.exit`が根拠。
- 以下のレビューで修正した3ファイルはVitest対象外のCJSだけで、全体実行後の製品コードとVitestテストは変更していない。
  既存の関連CJS 6ファイルは**100 passed / 0 failed / 0 skipped**。
  パネルのheadless検証も完了・停止・折り畳み・MAIN/ISOLATED分離・明暗desktop/mobile・axe・外部送信ゼロが成功し、生成画像も確認した。
  根拠: `cjs-regression.log` / `cjs-regression.exit`、`panel-visual.log` / `panel-visual.exit`。

#### 4. v2.1.55との差分棚卸し

- 対象は133ファイル。既存Venice基盤116ファイルは読み取り専用Goose（codex-acp/current）、
  後続brandingとクローズ前の修正は親Codexで分担した。
  保存文書は来歴とコピー元との差分、英語のキー＝値エントリはデータ照合で確認し、同一本文の再精読とは区別した。
  根拠: `outputs/brand-closeout/diff-review.json`、`venice-base-review.log`。
- 英語12キーの不足という基盤レビューの指摘は、最終候補では既に2.1.55取り込み時に補完済みだった。
  現行のカタログを巻き戻さず、履歴整理では非brandingの英語補完を基盤側へ収める。
- 修正した追随漏れは、旧CJSのChatGPT登録期待、初期`localDocument`通知の欠落、`core/read`等を拒む名前の正規表現、
  パネルvisual scriptのgrant接続不足だった。前者3件は修正前に35件中3失敗を実測した。
  契約に合わせた厳密な通知列・登録ツール名・通信列のassertと、既存worker harnessへの接続で修正した。
  検証の削除やskip、製品機能の巻き戻しはしていない。
- 一時Tray、仮GUID、常時診断、無関係な整形、生成されたライセンス一覧の混入は残していない。
  `git diff --check`も成功した。既存Veniceのread/write/exec/findと英語fallbackは意図した差分として保持する。

#### 5. 当時の2コミット分割（単独適用の主張は後続検証で撤回）

- `--no-ff`マージを含む作業履歴は、v2.1.55上の「既存Venice基盤」「devブランディング」の2コミットへsquashする。
  基盤には上記CJSの追随修正と非brandingの英語補完も含め、後者を表示名・アイコン・その回帰確認へ限定する。
  この時点ではbrandingだけを取り出しやすいと判断したが、単独適用を検証していなかった。
  後続の検証で旧brandingコミットの衝突・検証依存が判明したため、その主張を撤回してbranding先行の順序へ分割し直した。
- 旧履歴はローカル`refs/backup/brand-dev-name-before-closeout`に保存する。
  旧commit番号を記した過去の記録は、この保存履歴を参照できる。
  `codex/venice-exec`の既存履歴は書き換えない。PR作成、mainへの切替、次のAPI疎通には着手しない。

### 不明なこと

- 上流へ提案するかどうかは未決定。このブランチ全体にはVenice基盤も含むため、表示名だけのPRとしてそのまま提出はしない。

### 次に確認したいこと

- step 0は完了。次の最小疎通とツール成功率の計測は、別途その作業が指示された範囲で実施する。

## 2026-11-24 — brandingの単独適用を実証し、ブランチ範囲を訂正

### 分かったこと

#### 1. 旧基盤コミットはブランド変更ではない

- 旧`b8688e12`の116ファイルを全件分類した。ブランド専用0、ブランド＋基盤14、基盤102。
  内訳は実行環境2、資料／fixture保護14、検証44、混在14、製品動作25、基盤i18n17。
  全ファイル名・分類・動作変更の有無は`docs/venice-branch-scope.md`に掲載した。
- 基盤はVenice専用拡張、送信・SSE・DOM agent、承認と`/venice/tools`、read/write/exec/find、プロセス失効、英語fallback等の製品動作を変更する。
  ブランチの説明を「ブランド変更」から「Venice基盤＋devブランディング」へ訂正し、ブランチ名を
  `codex/venice-foundation-and-branding`へ変更する。既存PRは0件で、上流PRは作成しない。

#### 2. 旧56ebe1b2はそのまま取り出せなかった

- v2.1.55から`codex/brand-isolation-check`と専用worktreeを作り、旧`56ebe1b2`だけをcherry-pickした。
  `docs/venice-findings.md`、`src/renderer/locales/en.json`がmodify/delete、main/indexとmain/ipcの先頭importがcontent conflictになった。
  この時点ではコンパイル可能な適用結果にならず、旧コミットを単独で取り出せるという主張を撤回した。
- 衝突するimport文脈はVeniceの行を含んでいた。runtimeのbranding処理自体にgatewayは不要だが、旧差分と文書・カタログ・検証の境界は基盤から独立していなかった。
  文脈を解消した候補の型チェックは成功した一方、i18n監査を含む対象7ファイルは93 passed / 4 failed。
  失敗は新規3キーに既存の全12言語catalog契約を一律適用したことによるものだった。
- brandingをv2.1.55直上へ置き直した。英語は表示名3キーだけの独立したcatalog、文書は`docs/development-branding.md`にする。
  既存UIキーの12言語のassertは維持し、新規3キーだけja/enという既定仕様を検証へ明示した。
  その3キーの実行時fallbackは全13 UI言語で検証した。基盤の完全なen catalogを前提とする既存の統合テスト1件は、assertを維持して基盤のfallbackテスト側へ移した。
- 新しいbranding元コミット`c4931465`を、別の素のv2.1.55 worktreeへcherry-pickした結果は衝突0、終了コード0。
  **typecheck成功、build成功、対象8ファイル190 passed / 0 failed / 0 skipped。**
  対象にはmain-texts、renderer-i18n-source、renderer-i18nを含めた。
  `package-lock.json`はupstreamと同一なので、既存のインストール済み依存だけをsymlinkで再利用し、sourceと生成先は専用worktreeで検証した。
- 証跡は`outputs/brand-isolation/`の`original-cherry-pick.log`、`candidate-tests-before.log`、
  `proof-cherry-pick.log`、`proof-node.log`、`proof-typecheck.log`、`proof-build.log`、`proof-tests.log`と各exit記録。
  履歴の順序は「単独branding → Venice基盤＋今回の分類・証跡」とし、最終の製品コードは変更しない。
  確認用の2つのworktreeと一時ブランチは、コミットを正式履歴へ取り込んだ後に削除する。

#### 3. 旧履歴は名前付きタグで保存

- `archive/brand-dev-name-pre-squash-20261124`は`56a76537`を指し、旧no-ffマージを含む全作業履歴を保持する。
- `archive/brand-dev-name-before-isolation-20261124`は旧公開tipの`56ebe1b2`を指す。
- 従来の`refs/backup/brand-dev-name-before-closeout`も`56a76537`を保持しており、reflogだけの保存ではなかった。

#### 4. recon CJSはnpm testの外

- `npm test`は`vitest run`、収集対象は`test/**/*.test.ts`。
  `docs/venice-recon.test.cjs`は収集されない。前回の関連100テストは次の明示コマンドで別実行した。

```sh
node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-input.test.cjs test/venice-panel.test.cjs test/venice-ui-send.test.cjs docs/venice-recon.test.cjs
```

#### 5. ロケール変更とupstream同期の代償

- rendererのupstream由来12カタログすべてに製品名を追加したわけではない。表示名3キーはja/enだけ。
  基盤のVenice用UI文言と英語fallbackの変更とは分けて扱う。
- 拡張は英語を含め13言語で、旧基盤は全13ファイルの`extension_name`を`Chat On Venice (dev)`へ変更していた。
  今後upstreamを取り込むたびに、この13ファイルで製品名の維持を照合するコストがある。
  同じキーや近接箇所のupstream更新では衝突する可能性があり、rendererのVenice追加キーの末尾競合も別途確認が必要。
  全12／13ファイルが毎回必ず衝突するという意味ではない。

### 不明なこと

- 上流提案の可否は未決定。単独適用の証跡はアプリのbrandingコミットについてであり、Venice基盤全体の上流受入を意味しない。

### 次に確認したいこと

- API最小疎通は未着手。別途指示された範囲で、今回の表示確認とは分けてツール成功率を計測する。

## 再配置後HEADの全体検証とVenice基盤の保守先一本化

### 分かったこと

- Node 22.23.5で、再配置後のclean HEAD `1253e3ef150329f2f435bf6c2af6efc5681b58ef`を検証した。
  `npm test`は全体1回で、ファイル525 passed / 0 failed / 20 skipped（計545）、
  テスト12875 passed / 0 failed / 218 skipped（計13093）。失敗はなく、原因調査のための再実行はしていない。
  既存の218テスト／20ファイルのskipをそのまま保持し、削除・skip追加・assert変更はしていない。
- 同じHEADのCJS6ファイルは100 passed / 0 failed / 0 skipped。
  typecheck、build、darwin-arm64のunpackedパッケージ生成も全て終了コード0。
  パッケージ後のresource／native runtime smokeも成功した。GUIの再起動・Venice実送信は今回行っていない。
- `package.json`に、相対パス6本の`test:venice`を追加した。
  通常の`npm test`の先頭で必ず実行し、失敗時は後続のVitestを止める。
  CIはVitestを直接shard実行するため、Linux `checks` jobにも同じscriptを必須stepとして追加した。
  入口変更後に実際の`npm test -- test/venice-integration.test.ts test/packaging.test.ts`を実行し、
  CJS100件→Vitest2ファイル40件が全成功した。workflowのactionlintも成功した。
- 旧`codex/venice-exec`のtipは`5543094aee1ca147b24d810bcb103152f93ca6d4`。
  v2.1.55との共通祖先からの変更116ファイルは、`c4931465..1253e3ef`の117ファイルと116件重複し、
  旧側だけのファイルは0。重複のうち88件が完全一致、28件が異なる。
  差分には上流2.1.55、branding、検証修正・記録が含まれ、gateway／exec／find本体は一致する。
  2ブランチを並行保守せず、`codex/venice-foundation-and-branding`だけを正にする。
  旧tipは`archive/venice-exec-retired-20261124`へ保存し、旧ブランチはローカル／originとも退役させる。
- `git ls-remote`のpeeled targetで旧archive2本を照合した。
  `archive/brand-dev-name-pre-squash-20261124` → `56a765378da5746866e6cc447b108b5e7c7fe33f`、
  `archive/brand-dev-name-before-isolation-20261124` → `56ebe1b217afc7dab9f69903d310f9685b7a2619`。
  いずれもリモートに存在し、報告済みのcommitと一致した。
- 「基盤102」には利用者可視の動作変更もある。権限は未承認／root未選択から始め、承認の既定はreadのみ
  （検索要求時はread＋find）、write／shellは独立したOFF。一般のcapability設定は変更していない。
  UI senderは選択中モデルを維持し、既定ポート15本もupstreamのまま。
  起動時はcall台帳を読み込むだけで、grant復元・実行・送信は始めない。
  一方、Venice専用の拡張登録、Run→承認→開始、ステップ既定10／上限40は明確な製品動作の追加である。
  scope文書とブランチ説明を「Veniceツール・権限・拡張の動作変更＋独立devブランディング」へ具体化した。
- 上流向けは`c4931465`単体だけと決定した。このSHAは変更せず、基盤と今回の検証入口は自分のリポジトリに残す。
  brandingキーは第1コミットに閉じるが、基盤側のロケール競合リスクは別に残る。

証跡: `outputs/venice-head-verification/`の各log／exit、`tested-head.txt`、`branch-overlap.json`。
パッケージは`release/mac-arm64/Chat On Steroids.app`。分類・保守先・検証入口の地図は`docs/venice-branch-scope.md`。

### 不明なこと

- 追加したCI stepのGitHub runner上での結果は未実測。ローカルの同じcommandとworkflow静的検証は成功した。
- API最小疎通とツール成功率は引き続き未計測。

### 次に確認したいこと

- 上流PRを作成する際は`c4931465`だけを対象にし、Venice基盤を混ぜない。
- API最小疎通は別途承認された範囲で行う。今回の検証は実送信を含まない。

## 2026-11-25 — 退役差分の全件監査とChatGPT再注入の残存

### 分かったこと

- archive `5543094a`と監査開始HEAD `590868eb`を比較し、相違28ファイルを全件確認した。
  全ファイルの分類・理由は`docs/venice-branch-scope.md`の「退役ブランチとの相違28ファイルを全件確認」に掲載した。
  28件とも「こちらが新しい（rebase由来／以降の作業）」で、旧側だけの未移植作業は0件、今回の取り込み0件。
  戻さなかったのは、現行に上流更新・branding・検証修正があり、旧内容に戻すとそれらを後退させるため。
  旧findingsは全文がbyte単位で残り、カタログ13ファイルも旧キー削除0／旧値変更0だった。
  AGENTS／preload／chatの差分は上流更新と完全一致し、main/index／renderer HTMLの差分は単独brandingと完全一致した。
  IPCの削除側も確認し、旧checkpoint確認処理は同じ条件を保ってhelperへ移されたものだった。
- `gh run list`で当該ブランチのCIは0件、`590868eb`のcheck-runsも0件、PRも0件。
  push条件がmain限定なので、今回のブランチpushはトリガー対象外である。
  Actions permissionsはenabled:trueだが、workflow一覧APIは0件、ci.ymlのworkflow取得APIは404だった。
  mainにworkflowファイルがあることは別途確認した。**GitHub runner上のCIは未検証**とする。
  actionlintとローカル実行の成功をCI実行結果として扱わない。
- 「Venice専用」の保証が不完全だった。manifestはChatGPTの静的注入を外しただけで、
  backgroundのrestoreChatgptTab／restoreOpenChatgptTabs／restoreSilentRecordersは残っている。
  service worker起動時、onInstalled、pairing、maintenanceからChatGPTへ動的に
  i18n／DOM adapter／palette／usage／fiber／contentとCSSを再注入できる。
  現物のrestoreChatgptTab関数をVMで実行し、6スクリプトの注入要求を確認した。
  ChatGPT機能は完全撤去されていない一方、従来の初期注入タイミングは失われている。
  通常CoSのファイルは変更していないが、同じChromeで両拡張を使う場合の二重フック経路は残る。
  **通常CoSとの非干渉は未達**としてscopeの既存記述も訂正した。実ページでの再フリーズは起こしていない。
- `git ls-remote`で`archive/venice-exec-retired-20261124^{}`が
  `5543094aee1ca147b24d810bcb103152f93ca6d4`を指すことを再確認した。リモートから旧作業を復元できる。

### 上流PRの表示名：接尾辞だけの案を採用する

- 案A：現行のまま、devを`Chat On Venice (dev)`、prodを`Chat On Venice`、ferroアイコンで提案する。
  fork内では通常CoSとの区別に役立つが、上流CoS自体の製品名・ブランドを変える提案になる。
- 案B：上流はdevだけ`Chat On Steroids (dev)`にし、prodの`Chat On Steroids`とCoSアイコンを維持する。
  「開発版を通常版と取り違えない」という目的を、上流の製品名を変えずに満たせる。
- **案Bを採用する。** このforkのVenice表示は維持する。上流候補の元は`c4931465`だけだが、
  現コミットはVenice名とferroを含むため、そのままの差分ではPRを出さない。
  PR準備時は上流直上にc4931465だけを適用し、接尾辞の変更へ絞り込む。基盤コミットは含めない。
  今回は表示実装・c4931465・PR自体を変更していない。

### 検証件数の再確認

- 今回の変更はscope／findingsだけで、runtime・test・lockfileは全体検証済み`1253e3ef`と同一。
  全体テストは再実行せず、終了コード0の完全ログと現在の545テストファイルを照合した。
  Vitestはファイル525 passed / 0 failed / 20 skipped（計545）、
  テスト12875 passed / 0 failed / 218 skipped（計13093）。CJSは6ファイル100 passed / 0 failed / 0 skipped。

証跡: `outputs/venice-retirement-audit/`の28 patch、locale-retention.json、origin-checks.txt、
chatgpt-reinjection.json、runs.json、actions-permissions.json、workflows.json、remote-archive.txt、counts-confirmed.json。

### 不明なこと・次に必要なこと

- CIのrunner実行結果はない。CIを受入根拠にするには、GitHub側のworkflow登録状態を確認して実行結果を取得する必要がある。
- 通常CoSと同時使用するには、開発拡張の動的ChatGPT注入も止める対応が必要。backgroundの修正は今回行っていない。
- 上流PRはc4931465由来のdev接尾辞案へ絞ってから作成する。API最小疎通は引き続き別作業。

## 2026-11-25 — 手動CIの復旧・ChatGPT注入遮断・上流用ブランチ分離

### 分かったこと

- 28件のうち追加＋削除行数が大きい5件を、archive `5543094a`→監査開始HEAD `9c684b69`で再確認した。
  findings +786/-0、ipc +36/-20、main/index +34/-3、AGENTS +18/-3、panel.visual +16/-5。
  同数はファイル名順。実際の全diffは`outputs/venice-dispatch-and-pr/top-1.patch`～`top-5.patch`へ保存した。
  各削除側も読み、findingsの全文保持、checkpoint確認条件の保持、branding差分一致、上流文書差分一致、
  UI／a11y／通信禁止assertの保持を確認した。再分類0件、旧側だけの作業0件、取り込み0件。
  根拠と再現コマンドはscope文書の「大きい上位5件の実際の差分」に掲載した。
- workflow_dispatchは当初からあった。mainに実ファイルがあるのにGitHubのworkflow APIが404で、Actions画面もNo workflows foundだった。
  既定ブランチを作業ブランチへ一時切替したところworkflowが登録され、CI IDは429223434になった。
  直ちにmainへ戻し、push条件のmain限定・Actions権限は変えていない。
  [GitHubの手動実行手順](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)のCLI経路でdispatchできる状態になった。
  登録確認用run 45426591854は旧HEADなので中止し、最終コード9dd2aa89をrun 45428690299で手動実行した。
- ChatGPT回復注入は「警告だけで許容」せず、`be53004d`で遮断した。
  manifestがVeniceのみならrestoreChatgptTabとreplaceUsageObserverの両方を止め、
  ChatGPT検出時にworkerごとに1回だけja/en catalog経由で1行警告を出す。
  consoleだけでなくactionのbadgeを!、tooltipを同じ警告にして、拡張UIでも気付けるようにした。
  通常CoSにChatGPTを任せるため、この開発拡張で二重フックを維持する利点がないことが理由。
  既存ページに残る旧フックはreloadが必要で、その案内も警告に含める。
  通常のChatGPT登録manifestは従来動作のまま。6回帰テストと関連3ファイル407テストが成功した。
  既存usage observerテストは新しいguard依存をVMへ渡しただけで、assertは変更していない。
- 上流用`codex/upstream-dev-suffix`をv2.1.55から作り、c4931465をno-commitでcherry-pickした。
  Venice名・ferro・診断・icon生成変更を取り除き、表示名実装を`70589d99`へまとめた。後述の906666f2と合わせて上流用は2コミット。
  devはChat On Steroids (dev)、prod名とCoSアイコンは据え置き。
  productNameはChat On Steroids、appIdはcom.chatonsteroids.appのリテラル比較を保持した。
  カタログのChat On Steroidsは元から12言語にあるため、新規ja/en限定の例外はdev名とAboutの2キーだけ。
  旧キーの12言語検査は保持した。typecheck・build、対象7ファイル178 passed / 0 failed / 0 skipped、
  headlessでen/ja・1280/800pxのdev/prod表示、文字切れなし、pageerror 0を確認した。
  macOSのアプリメニューはcheckoutではElectron、packageではproductNameのまま残す。
- フォークはca0a2b2dで同じ70589d99を祖先へ取り込み、Venice機能・旧カタログ・ferro・診断gateを保持した。
  続く`9dd2aa89`はsrc/shared/app-brand-name.tsの定数だけをCoS→Veniceへ変える1ファイル1行の追従コミット。
  productNameから表示名を導かない。上流用ブランチは新規pushのみで上書きせず、PRは作成していない。
- フォークの追従後HEAD 9dd2aa89で、全体npm testを1回実行した。
  CJS6ファイル100 passed / 0 failed / 0 skippedに続き、Vitestは527 passed / 0 failed / 20 skipped（ファイル、計547）、
  12900 passed / 0 failed / 218 skipped（テスト、計13118）。typecheckとbuildも終了コード0。
  フォークの実rendererもheadlessでen/ja・1280/800pxを確認し、Veniceのdev/prod名、文字切れなし、pageerror 0を確認した。
  上流とforkの既存テストを削除・skip追加していない。新規6件の回復注入テストと19件の共有表示名テストを追加した。
- runner実行で初めてWindowsのfixture不整合が見つかった。app-display-name／dev-brandのパス期待値がUnix固定、
  findのnul.txtがWindows予約名、execのprintf／sleep／awk／shがWindowsの既定PowerShellでは無効だった。
  製品側のpath解決・予約名拒否・shell既定は正しく、変更していない。
  36f5dd56で期待パスをpath.joinへ変え、予約名を避け、同じ出力・待機・子processをNode fixtureで生成するようにした。
  native shell経由の実行、stdout/stderr分離、64KiB、callId再取得、失効、descendant killのassertを保持した。
  子processはstdoutのPID receiptで開始を確認し、固定sleepやPID-file pollingを加えていない。
- Mac UIチェックも2件失敗した。verify-setup-guideは英語をcatalog数と別枠の両方で数えていたため、
  言語IDの集合で英語を1回だけ数えるよう直した。同じ906666f2を上流用ブランチへ追記し、37a34a4aでforkにも取り込んだ。
  What's Newはferroに旧CoS folder mark用translateが残り、ink左右15/13pxだった。既存ferroの形・色を維持し、古い光学補正だけを除いた。
  flag判定・pixel許容閾値は変更していない。修正後は対象5ファイル82テスト＋CJS100件と、実Electronの両UIチェックが成功した。
- CI run 45428690299のLinux両shardとCJS100件／typecheck／privacyは成功した。
  修正前の残りjobを止め、最終コード37a34a4aをrun 45431889881で再実行した。
  [修正後run 45431889881](https://github.com/atsu6/chat-on-venice/actions/runs/45431889881)のattempt 2時点では13 job中11 success／2 cancelled、全体の結論はfailureだった。
  Windows全6 job・Linux全3 job・macOSの2 jobが成功し、CJS100件／typecheck／privacyも実runnerで成功した。
  残るUI checks (macOS 2/2)とVerify macOS arm64 (1/2)はrunner未割当・steps 0で、GitHubがhosted runner取得失敗とarm64容量不足を注記していた。
  `gh run rerun 45431889881 --repo atsu6/chat-on-venice --failed`で未実行の2 jobだけを1回再実行した。
  attempt 2も2026-11-25 01:24～01:39 JSTの待機後に同じ理由で開始前キャンセルとなった。成功済み11 jobは再実行していない。
  この時点では実行されたテストに失敗はなかったが、2 jobは未実行でありCI全体は緑ではなかった。
  runner構成やarchを変えず、テストの削除・skip追加・assertの緩和も行っていない。
  証跡はoutputs/venice-dispatch-and-prのci-final-state.jsonとci-macos-*-retry-{job,annotations}.json。
  fcf8a3cfまでは文書だけの更新で、実装・テスト・workflow・依存関係はCI対象37a34a4aから変更していなかった。

### 残る条件

- この時点ではmacOS arm64 runnerの容量回復後の2 job確認が残った。後述のattempt 3では開始できた。
- 旧フックが既に残るChatGPTページは再読み込みが必要。現在のページ操作を中断するreloadは今回行っていない。
- backgroundの全ChatGPT関連機能を撤去したわけではなく、Veniceへの移行自体は継続中。API最小疎通は別作業。

## 2026-11-25 — CI再開とferro前景の中央揃え修正

### 分かったこと

- 旧run 45431889881を`--failed`で再開したattempt 3は、容量不足だった2 jobを実runnerで開始できた。
  macOS arm64の単体テスト・専有テスト・実plugin検証が成功し、全体は12 success／1 failureになった。
  UI checks (macOS 2/2)は37/38成功で、唯一の失敗はWhat's Newの明色アイコン中央揃えだった。
- ローカルの既存`verify-whats-new.cjs --force-device-scale-factor=1`で同じ左右23px／21px、上下18px／17pxの失敗を再現した。
  白いferroの元座標は横23～45、縦約12～54で、中心は34,約33。ティールの台座の中心32,32からずれていた。
  以前のfolder用CSS補正除去は必要だったが、これだけでは前景自体のずれを直せていなかった。
- `5a3fc432`でSVG原本とrenderer spriteの同じpathにtranslate(-2 -1)を設定した。
  pathの形・白とティールの色・台座の位置は変更していない。themeやDPRごとの条件分岐や測定閾値変更も加えていない。
  既存のheadless Chrome手順で原本PNGを更新し、make-iconで追跡対象の拡張アイコン4サイズも再生成した。
  生成script自体とトレイ16/32pxのpixel hintは変更していない。
- SVG原本とspriteのtransform一致、補正値を既存テストへ追加assertで固定した。既存assertの削除・緩和・skip追加はない。
  CJS6ファイル100 passedと関連3ファイル50 passed、typecheck・buildが成功した。
  実ElectronのWhat's New検証はDPR 1/2とdark/lightで成功し、短い画面・ドイツ語・閉じる操作も既存の検証を通った。
  実rendererのen/ja・dev/prod・1280/800pxに文字切れ・pageerrorがないことと、生成アイコンの全レビューサイズも確認した。
  16pxのトレイ用ferroは歯と隙間が残り、22/32/48pxも塗り・輪郭を保持していた。
- 修正はフォーク側だけ。上流候補906666f2は元のCoSマークを維持し、今回更新していない。
  [修正版run 45531914064](https://github.com/atsu6/chat-on-venice/actions/runs/45531914064)で5a3fc432の全CIを実行した。
  attempt 1で13/13 job success、全体の結論もsuccess。Windows／Linux／macOSの全検証とCJS・typecheck・privacyが成功した。
  問題のmacOS UI shard 2は38/38成功・0 skippedで、What's Newも初回成功した。

証跡: outputs/venice-dispatch-and-prのci-attempt3-state.json、ci-attempt3-failed.log、whats-new-dpr1-before.log、
whats-new-dpr{1,2}-fixed.log、ferro-{targeted,typecheck,build,visual}.logとferro-dpr1/、ci-ferro-fixed-state.json、ci-ferro-fixed-ui.log。
生成画像一覧はoutputs/dev-brand/icon-sizes.png。

### 結論と次

- CIのrunner待ちと実際のアイコン中央揃え失敗は解消した。結果の追記だけなので、実装・テスト・workflow・依存関係はCI対象5a3fc432と同じ。
- 次のAPI最小疎通は別作業のまま。上流PRはまだ作成していない。

## 2026-11-25 — 名前の静的ソース確認とコミット対称性の未達

### 名前は定数1箇所で選択する

- 表示名の選択元は`src/shared/app-brand-name.ts:2`のAPP_DISPLAY_NAMEだけ。
  mainの`src/main/app-brand.ts:9,12`がdev判定と接尾辞を決め、同:21,32がnative表示へ使う。
  `src/main/ipc.ts:700`からAppStateへ渡し、`src/renderer/main.ts:1673`と`src/renderer/app-brand.ts:5-7`が既存のt/uiで表示する。
  カタログ・MainTextの型／一覧にある名前は翻訳用の静的データで、別の表示名選択ロジックではない。
- `artwork/app-icon-source.svg:2`のVenice名は非描画のtitleメタデータ。SVGは静的原本で、表示名定数からの生成物ではない。
  `src/renderer/index.html:5,36`のtitle／ヘッダは空bindingで、Venice名の直書きはない。同ファイルに残るCoS本文は別の既存UI文言。
  `electron.vite.config.ts:51`はこのHTMLをビルド入力としている。
- SVGからPNGを描画するのは`test/dev-brand.visual.cjs:13-16`、そのPNGからICO／PNGを出すのは`scripts/make-icon.mjs:26,363-364`。
  ICNSは`electron-builder.yml:117`のPNG入力からbuilderが変換する。SVG／srcのHTMLを定数で生成する手順は無い。
  上流候補906666f2にはSVG原本がなく、元のCoSマークを維持する。ferro関連の差分はフォーク固有であり、上流PR本文へ含めない。
- 「埋め込み2箇所」は確認された事実ではない。両ブランチの全出現・分類・根拠は`outputs/dev-name-source-audit/inventory.md`と同JSONに保存した。

### 追従とCI修正の取り違えを訂正する

- 実際の追従は`9dd2aa895fc487059726dbe4a1a7e175940e657a`。定数ファイル1件、+1/-1だけで、名前以外を変更していない。
- ユーザーが参照した「5ファイル +63/-10」はCI修正側の差分だったとの訂正を受けた。これを追従コミットのstatと結び付けない。
  現履歴のCI修正36f5dd56の`git show --stat`は6ファイル +35/-21であり、前記の比較範囲自体は特定していない。
  fcf8a3cfも追従ではなく、文書2ファイル +21/-1の記録コミットである。

### コミット対称性の検証結果

- 上流側で定数ファイルに触るコミットは`70589d99fb477b17616a46cfa65bb0b956e43cdc`だけ。
  `git show --stat`は17ファイル +180/-11で、定数ファイルは親に無く、このコミットで新規作成されている。
  これは独立したVenice→CoSのrenameではなく、dev表示機能の導入コミットである。
- 70589d99と9dd2aa89のファイル集合は不一致。`git show -R 9dd2aa89`との比較でも完全な逆写像は成立しない。
  HTMLの変更は空bindingの導入であり、余分なrenameとして戻せるものではない。SVGは70589d99に含まれない。
- 現在の定数ファイルと各コミット後の内容は一致する。9dd2aa89の逆差分を現在のフォーク側の内容へ適用した結果も、上流側の現在の内容と一致する。
  名前1行の内容比較は成功したが、これをコミット対称性の合格とは読み替えない。
- コードは増減せず、上流への不要な往復renameや履歴上書きも行わない。
  70589d99を機能導入とrenameへ履歴分割するには、既存上流ブランチのfast-forward限定方針とは別の判断が必要。
  揃わないまま進めない指定に従い、必須の記録訂正とPR本文案の整理だけを行い、受け入れ未達として停止する。

検証資料: `outputs/dev-name-symmetry/verification.json`、`upstream-candidate.patch`、`fork-follow.patch`、`fork-follow-reversed.patch`。

### PR本文案と検証の状態

- 本文案は`docs/upstream-dev-suffix-pr.md`。dev接尾辞、productName/appId据え置きによるパッケージ版のidentity／userData維持、
  macOSメニューがcheckoutではElectron・packageでは本番名のまま残る点だけを記載した。アイコン変更は含めず、PRは作成していない。
- 名前・その他の製品コード、CI workflow、push条件は変更していない。
  手順1の停止条件に当たったため、今回指定された両ブランチのテスト・typecheck・buildは未実行。過去の成功を今回の再実行として報告しない。


## 2026-11-25 — 名前の状態比較を完了し、履歴再構成を不要と確定

### 受け入れ方針と結果

- 以前の「コミット対称性が未成立で停止」という記録は、当時の条件と判断の経緯として残す。70589d99は機能導入と定数ファイル新規作成を兼ねるので、独立renameの逆対が無いことは欠陥ではない。
  今回は利用者の承認により、履歴再構成をせず現在の状態を比較する基準へ切り替えた。既存の共有ファイルの差分を名前だけに縮めることも要求しない。
- 上流の基底名は`Chat On Steroids`、フォークは`Chat On Venice`。両定数にdev接尾辞はなく、定数ファイルの差分は1ファイル+1/-1だけ。
- app-brand.tsの上流8-12行／フォーク9-13行にあるdev判定と接尾辞合成ブロックは、空白を含めて文字単位で同一。画像パス・About設定の既存差分は別扱いとした。
- 全追跡ファイルの`Chat On Venice` grepは上流0件。フォークは32ファイル64行（79出現）で、(a)名前選択の定数1行、(b)説明できるフォーク固有データ63行、(c)説明不能0行。
  (b)には共有ファイル内のカタログ／型／native翻訳キー、拡張の静的UI、合成fixture、文書を含む。デスクトップ表示名の選択ロジックとは区別した。

### 全ヒットのファイル別分類

全ハンク、ヒット行、原文は`outputs/dev-name-state-verification/verification.json`と同Markdown、`patches/`へ保存した。共有は同じパスが上流にもあることを示す。

| ファイル | 分類 | 共有 | 正常扱いの理由 |
| --- | --- | --- | --- |
| `artwork/app-icon-source.svg` | b | forkのみ | SVG原本の非描画titleメタデータ。デスクトップ表示名の選択には使わない。 |
| `docs/development-branding.md` | b | 共有 | フォーク用表示名・資産・確認方法の利用文書。PR本文とは別管理。 |
| `docs/venice-adapter-contract.md` | b | forkのみ | フォーク専用の拡張パネルの操作説明。 |
| `docs/venice-branch-scope.md` | b | forkのみ | フォークのブランチ範囲と過去の製品名変更の記録。 |
| `docs/venice-findings.md` | b | forkのみ | 過去の実測・判断と今回の検証結果の記録。表示名ロジックではない。 |
| `extension/_locales/de/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/en/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/es/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/fr/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/ja/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/ko/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/pt_BR/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/pt_PT/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/ru/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/tr/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/vi/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/zh_CN/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/_locales/zh_TW/messages.json` | b | 共有 | フォーク専用拡張のextension_name翻訳データ。manifestのロケール置換で使用し、Electron名の定数とは別surface。 |
| `extension/venice-panel.js` | b | forkのみ | Venice専用パネルの見出し・aria-labelという静的UIデータ。Electronの表示名選択とは別surface。 |
| `src/renderer/locales/en.json` | b | 共有 | フォーク表示名・Aboutの英語3項目と既存の完全英語fallbackデータ。大きい単一ハンクはJSONキー単位でも比較し、既存upstream3キーは同値保持。 |
| `src/renderer/locales/ja.json` | b | 共有 | フォーク用表示名・Aboutの日本語カタログ3項目。読み書き・実行許可の既存翻訳とは別ハンク。 |
| `src/renderer/main-texts.ts` | b | 共有 | 既存t()経路でnativeへ公開するフォーク用翻訳キー。別の名前選択はしない。 |
| `src/shared/app-brand-name.ts` | a | 共有 | デスクトップ表示名を選択する唯一の基底名定数。 |
| `src/shared/main-texts.ts` | b | 共有 | native翻訳公開を許可するフォーク用キー一覧。別の名前選択はしない。 |
| `src/shared/types.ts` | b | 共有 | mainから届くフォーク表示名も許容するAppStateの型。実行時の選択処理ではない。 |
| `test/dev-brand.visual.cjs` | b | forkのみ | フォークのdev/prod表示を検証する合成入力・期待値。 |
| `test/i18n-english-fallback.test.ts` | b | forkのみ | フォーク用表示名の翻訳・fallback検証の入力と期待値。 |
| `test/venice-apply-patch.visual.cjs` | b | forkのみ | フォーク専用の画面検証に使う合成ページの見出し。 |
| `test/venice-exec.visual.cjs` | b | forkのみ | フォーク専用の画面検証に使う合成ページの見出し。 |
| `test/venice-find.visual.cjs` | b | forkのみ | フォーク専用の画面検証に使う合成ページの見出し。 |
| `test/venice-panel.visual.cjs` | b | forkのみ | フォーク専用の画面検証に使う合成ページの見出し。 |
| `test/window-lifecycle.test.ts` | b | 共有 | 既存windowタイトル更新のフォーク名mockと期待値。 |

### 共有ファイルの名前ハンクと非名前の既存差分

| ファイル／ハンク | 内容と保持する理由 |
| --- | --- |
| app-brand.tsのimport追加と`@@ -11,9 +12,15 @@` | checkout／packageのnative画像パス解決とdev Aboutアイコン。表示名のdev判定／合成とは別で、追従9dd2aa89の親から同じ内容 |
| ja.jsonの`@@ -1,6 +1,9 @@` | 名前・Aboutの3キーだけの追加 |
| ja.jsonの`@@ -4002,5 +4005,43 @@` | 既存のread/write/shell/find承認文言。名前ハンクと分離して保持。上流4004キーを同値で残し、追加41キーのうち名前は3キー |
| en.jsonの`@@ -1,5 +1,4132 @@` | 追従前からある包括的英語fallbackカタログ。上流の既存3キーは同値、追加4127キーのうち名前3キー。単一大ハンクのためJSONキー単位でも比較した |
| renderer/main-texts.tsとshared/main-texts.tsの後方ハンク | 既存のChoose foldersというnativeフォルダー選択ラベル。名前3キーの追加ハンクとは分離して保持 |
| extension/_localesの13ファイルの末尾ハンク | extension_name変更とは別の、既存のツール承認・検索・隔離警告文言。全13カタログは追従の親から同じ内容 |

これらの製品コード／カタログは今回は変更しない。sharedHunkReviewには共有ファイルごとの全ハンクと、追従の親との内容比較、JSONキー追加／変更／削除を残した。
rendererの既存上流カタログキーは削除・値変更とも0。拡張13カタログの既存キーで値が違うのは名前差分のextension_nameだけで、キー削除は0。

### 実行時と検証

- フォークの実Electron BrowserWindowで、nativeタイトル・rendererのdocument.title・可視ヘッダが`Chat On Venice (dev)`になったことを確認。実mainの合成モジュール、今回ビルドしたpreload／rendererを使用した。
  userDataと他のstateは検証用に隔離し、外部ネットワークを遮断した。画面画像は`electron-title.png`、実行値と条件は`electron-title.json`に保存。通常のdevアプリやbridgeの二重起動ではない。
- フォーク: branding対象9ファイル210 passed / 0 failed / 0 skipped。npm test入口のCJS6ファイルも100 passed / 0 failed / 0 skipped。typecheck・buildは終了コード0。
- 上流906666f2: 対象7ファイル178 passed / 0 failed / 0 skipped。typecheck・buildは終了コード0。上流worktreeは未変更で、pushしない。
- PR本文案はVenice製品名・アイコン記述0件。dev接尾辞、productName/appId据え置きの理由、native macOSメニュー名の3点だけを保持する。PRは作成しない。
- 検証時HEADはフォークab96dbbd、上流906666f2。今回の変更は文書の追記と現在方針の明確化だけで、履歴・CI・push条件・非名前の既存差分・テスト判定は変更しない。

証跡: `outputs/dev-name-state-verification/`のverification.json／verification.md、constant.patch、app-brand-existing-non-name.patch、fork／upstreamのtests・typecheck・buildログとchecks.exit、electron-title.json／png。

## 2026-11-25 — PR本文・保守コスト・画面確認の再現手順を確定

### PR本文案の確認結果

- `docs/upstream-dev-suffix-pr.md`を全文確認し、`Chat On Venice`は0件、英語のicon／iconsと日本語のアイコン記述も0件だった。
  内容はdev接尾辞、パッケージ版のproductName/appId維持によるidentity／userData保持、macOSアプリメニュー名の3点だけ。
- 上流906666f2の全追跡ファイルでもVenice製品名0件を再確認した。PRは作成せず、上流へpushしない。

### 許容する上流同期コスト

f8a37860時点の分類は32ファイル64行で、そのうち名前選択以外のフォーク固有データが63行だった。
この件数は競合件数ではない。共有ファイルの同じキー・近傍を上流も更新したときにテキスト競合や意味の再確認が発生し得るため、次の維持コストを許容する。
32ファイル全部が毎回必ず競合するわけではなく、フォーク専用の資料・fixture・資産が名前の出現を持つことだけで競合にはならない。

| 共有面 | 許容する維持作業 |
| --- | --- |
| 基底名定数 | 上流同期後もフォークの1行差を維持する。dev判定と接尾辞合成式は共通のままにする |
| app-brand.ts | 上流の表示処理更新を取り込みつつ、既存のnative画像パスとAboutアイコンを誤って落とさない |
| rendererのja/enカタログ、MainText一覧、AppState型 | 上流キーを保持し、名前用のフォーク追加データと既存ツール文言を区別して解消する。enの包括的fallbackデータを縮めない |
| 拡張の13カタログ | 上流の新キーを取り込み、フォークのextension_nameを維持する。これはElectronの基底名定数とは別surfaceの翻訳データ |
| 共有のwindow-lifecycle fixture | フォーク表示名を渡すmockと期待値を対で維持する。productName/appIdの検証までフォーク表示名に変えない |

名前の出現数を減らすための巻き戻しや、上流用ブランチへのフォーク資産追加はしない。取り込み時は、競合箇所の意味と既存の名前・識別子テストで判断する。

### テストfixtureの分類を再点検した

- f8a37860の分類一覧のうち、テスト内の7ファイル9ヒット行を原文で確認した。文字列snapshotファイルへのヒットは0件。
- 共有ファイルは`test/window-lifecycle.test.ts:25,30`の2行だけで、appBrand mockとwindow title期待値を同じフォーク名にしている。
  これは渡された表示名をウィンドウへ反映する検証であり、パッケージの製品識別子がSteroidsであることを検証するケースではない。
- フォーク専用の`test/dev-brand.visual.cjs`と`test/i18n-english-fallback.test.ts`は表示名・翻訳仕様の入力と期待値。
  `test/venice-apply-patch.visual.cjs`、`test/venice-exec.visual.cjs`、`test/venice-find.visual.cjs`、`test/venice-panel.visual.cjs`は外部通信を遮断した合成ページの見出しだった。
- Steroidsであるべきものを誤ってVeniceと分類したケースは0件。`test/app-display-name.test.ts:89-90`と`test/dev-brand.test.ts:195-199`のpackage名・productName・appIdは引き続き既存のリテラルを直接比較している。

### 実Electron画面確認を再実行する

手動harnessはnpm test／CIの収集対象外。作業ルート、Node 22.23.5、導入済みのlockfile依存関係、macOSのGUIセッションを前提とする。
通常のCoSや開発アプリを終了・再起動する必要はなく、検証用userDataと合成stateを使う。外部HTTP(S)を遮断し、Veniceへ送信しない。

```sh
cd /Users/atsu/chat-on-venice
volta run --node 22.23.5 npm run build
# harnessが無いcheckoutでは、下記の再現文書の復元ブロックを先に実行する。
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron outputs/dev-name-state-verification/electron-title.cjs
```

`outputs/`はGit対象外のため、コマンドだけでは別checkoutにharnessが残らない。
`docs/development-branding-runtime-check.md`へ、前提・復元を含む一連のコマンド・成功条件・検証済みharnessのソースそのものを保存した。
文書から復元できる内容が実行済みのharnessと同一であることを確認した。実行コードは変更していない。
結果は同じ出力先のelectron-title.json／pngで確認でき、成功後約20秒で検証ウィンドウだけが閉じる。

今回は文書だけの更新なので、前回のテスト・typecheck・build・実画面の成功証跡を再利用した。実行したものとして新しいテスト件数を計上しない。
今回の追記と再現文書内の名称は(b)文書データに分類し、既存の表示名選択やテストfixtureは変更しない。

## 2026-11-25 — harnessの正を一本化し、PR本文を確認待ちにする

- 実行するharnessの正は`outputs/dev-name-state-verification/electron-title.cjs`。再現文書からソース全文と復元ブロックを削除し、必要なNode／Electron、ビルド済み成果物、実行ディレクトリ、3面の期待値と実行コマンドだけを残した。実行コードは変更していない。
- 53df4580から`/tmp/runtime-check`へ新規worktreeを作り、修正後の文書の実行ブロックをそのルートで実行した。未追跡の正ファイルが存在せず、Missing canonical harnessで終了コード1。3面確認は未実行で、worktreeは削除した。
  53df4580時点で全文を文書へ保存したことは上記の経緯として残すが、現在の文書の主張は「前提とコマンドを記録」に限定する。別checkoutでは正ファイルを別途用意する必要がある。
- 上流906666f2は2コミット・18ファイル +182/-12。17ファイル +180/-11は70589d99単体であり、もう1件は英語カタログの二重計数を直すsetup検証修正。履歴や候補コードを変更せず、この実数で提出前チェックを行った。
- 候補差分のdocsはdevelopment-branding.mdの9行だけで、workflow・outputsの変更は0件。Venice固有機能やCI基盤の説明は含まれない。
- PR本文は指定の3点を維持し、上流候補のtypecheck・build成功と対象178 passed / 0 failedの検証行だけを追加した。フォークの件数・アイコン・Venice固有機能は含めない。既存の上流検証ログを再利用し、新しいテスト実行とは扱わない。
- PR本文全文と候補のdevelopment-branding.mdの+9ハンクを提示する段階で停止する。push・PR作成は行わない。

## 2026-11-25 — write_stdinをrun所有のgatewayへ接続

### 分かったこと

- 実装commitは`1d1eb1bd`。作業は`/Users/atsu/chat-on-venice`の`codex/venice-foundation-and-branding`で行い、Node `v22.23.5`を確認した。
  先に必要だった2.1.55の取込は完了済み。上流候補`codex/upstream-dev-suffix`は`906666f2`のまま変更していない。
- 新しいshell grantに`core/write_stdin`を追加し、gateway・kernel・拡張service worker・MAINの許可リストを接続した。
  初回の合成結合確認でservice worker側の未接続を検出して修正した。ローカルkernel単体の成功だけではパネルの経路を証明できない。
- 通常のUnifiedExecProcessManagerのpipeはstdinを閉じて起動する。これを一律に開くと既存の終了条件が変わるため、
  Veniceのgateway引数`stdin_open: true`を明示した場合だけ開く内部opt-inを追加した。通常CoSのschema・既定は変更していない。
  stdout / stderrは分離したまま。閉じたstdinへの非空入力は拒否し、空pollは許可する。
- 継続呼び出しはrunのleaseと既存managerの所有者を二重に照合する。別run・別document・未知のIDは入力も出力も拒否する。
  interaction lock待ちで権限が変わる場合に備え、lock取得後にもlive grant / command permissionを検証する。
  同じcallIdは台帳の応答を再取得するだけで入力を二度送らない。失効後の新規呼び出しと確定済み応答の再取得は区別する。
- pipeにはTTYの制御文字処理がないため、Ctrl-Cは文字列として送らず既存のプロセスツリー割り込みを使う。
  Stop / revoke / app終了のkillを引き継ぐ。終了済みプロセスへの非空入力は拒否し、出力が保持されている間は空pollで再取得できる。
- 空pollは出力到着で早く返るため、最後のstdout / stderrと終了イベントが別の応答になることがある。
  固定回数のpollで終了したと仮定せず、必要なら新しいcallIdでrunning:falseまで確認する。
  既定10秒・最大30秒、空pollの最小待機枠5秒は既存managerに合わせた。
- 戻り値のsnapshotは元のexec callIdを保持し、パネルの同じプロセス行へ累積出力を反映する。
  継続のwire callIdとは別物である。既存secrets shield・64KiB上限・textContent・改行・横スクロールを再利用し、UIラベルは追加していない。

### 検証結果

- 追加は`test/venice-write-stdin.test.ts`の13件と`test/venice-write-stdin-panel.test.ts`の2件。
  実kernel・一時フォルダー・実Nodeプロセス・認証HTTPでpoll / input / Ctrl-C / Stopを確認し、
  shell同意、所有権、失効、二重送信防止、Read-only、待機中の権限変更、秘密値mask、出力上限も検証した。
- 既存`test/venice-exec.test.ts`はshell grantのtool配列の期待値2箇所へ新しいtoolを追加しただけ。
  テストの削除・skip追加・assert緩和はない。
- 実装を固定して全体`npm test`を1回実行した。Vitestは**529 passed / 0 failed / 20 skipped（549ファイル）**、
  **12,915 passed / 0 failed / 218 skipped（13,133テスト）**。通常経路のCJS6ファイルも**100 passed / 0 failed / 0 skipped**。
- 最終コードで`npm run typecheck`と`npm run build`成功。`node --check extension/background.js` / `extension/venice-agent.js`も成功。
- `volta run --node 22.23.5 node test/venice-write-stdin.visual.cjs`で実MAIN / ISOLATEDの描画を確認した。
  前提はrepoルート、lockfile依存関係、macOSのChrome。ビルドは不要。全通信をローカル応答/abortにし、実コマンド・実Venice送信は行わない。
  合成モデル4ターンでexec → poll → input → doneが通り、PC / モバイルで同じプロセス行の更新、改行、安全な文字列表示、横スクロールを確認。
  画像も目視し、モバイルのパネルが画面内に収まることとページ例外0を確認した。
- ログ・画像はGit対象外の`outputs/venice-write-stdin/`。再実行できるvisual harnessの正は追跡対象の`test/venice-write-stdin.visual.cjs`。

### 不明なこと・次

- 実Veniceモデルが`stdin_open`と継続操作を選ぶE2E、Windows / Linux実機での今回の入力経路は未確認。
  実Veniceへの送信は行わず、attestation輸送の保留も継続する。
- 第5段階を完了とし、次は第7段階の履歴UI。上流PRの提出保留を維持し、この作業ではpush・PR作成を行わない。

## 2026-11-25 — 現在地と残りのロードマップ

- 分かったこと: HEAD `199bf453`の進捗・計画・検証ログを確認し、`venice-progress.md`をロードマップの正として拡充した。
  0〜6（4.5除く）の実装完了と、実Veniceでの複数ツール作業の成功率が未測定であることを分けて記載した。
  最新の12,915成功とCJS100成功は前段階の有効な証跡を参照し、今回はテストを再実行していない。
- 次の順序: 7履歴UI → 8通知 → 文字作業MVPの実測確認 → 9AX観測 → 10画像 / vision → 11総回帰。
  既存キューの番号順は変えず、Desktopへ広げる前の確認点を明記した。履歴UIを先に作るのは失敗箇所を追えるようにするため。
- 不明なこと: 実モデルでの連続作業の成功率、画像添付の受付とvision対応、対象OSごとの実機受け入れ。
  attestation輸送は既存どおり保留。上流PR提出も開発の前提にはせず、保留を維持する。
- 次に確認すること: 第7段階で既存のsession / recorderとタイムラインを再利用する接続点を調べる。
  今回は文書のみの更新で、実送信・コード変更・push・PR作成は行わない。

## 2026-11-25 — 第7段階: Veniceのタスク履歴UI

### 分かったこと

- 実装commitは`4aae9145`。既存session / recorder / timelineを再利用し、ブラウザのパネルで承認したrunの指示、DOM等のステップ、完了・失敗・停止・再起動中断を表示する。
  見た目は既存の折り畳み行と色・文字・余白に合わせた。新しい履歴DBや別の実行ボタンは作っていない。
- Coreの実記録にはrunIdとwire callIdを添えた。成功したCore呼び出しをページ報告として重複保存せず、
  DOMステップやgatewayでの拒否は「Veniceページからの報告」として区別する。表示データでprovider IDや呼び出し権限を作らない。
- `/venice/run/event`は既存bridge認証に加え、app発行runとChrome由来のsender / documentを照合する。
  step / completed / failedだけを受け付け、クライアントはsessionやgrantを指定できない。
  失効後の新規報告は拒否する。未終了runではステップの重複と内容の変わった同一indexを区別し、最初の終了を保持する。
- 保存ACK後に次のmodel turnへ進み、ACKを失ったときは同じ履歴だけを再取得する。
  保存不能はパネルに明示し、次のステップを実行しない。Stopが終了報告を追い越しても、想定内の失効を実行エラーとして表示しない。
- 起動時は保存済みgrantを履歴照合だけに使い、開始だけ残ったrunを中断にする。grant・stdin所有権・処理は復元しない。
  実装はローカルのタスク履歴であり、Veniceサーバの過去チャットを取り込む機能ではない。
- 長文は既存のStoredText / asset経路を使い、NULと既知の秘密値パターンを保存前に処理する。
  ページ報告の64,000文字上限は切り詰め表示を伴う。2.1.55の記録常時ON仕様も保ち、旧record:falseを有効なOFF設定として扱わない。

### 実画面で見つけた不整合を修正した

初回の全体テストは**12,928 passed / 0 failed / 218 skipped**だったが、実Electronの画面では、
中断したrunにも既存の「最近ツールが動いた」推定が働き、作業中 / Thinkingが残った。
`SessionSummary.veniceRuns`へ未終了タスクを投影し、ローカルVenice sessionの表示に使うよう修正した。
複数runの完了・停止は独立に更新し、通常のconversation付きsessionの従来判定は変更しない。
この一覧はタスクの表示状態であり、生存shellプロセスの一覧・実行権限・同時実行枠とは別である。

### 検証結果

- 追加はbackend 9件、renderer 3件、MAIN / ISOLATED panel 4件の**16件**。
  実store・実kernel・認証HTTP、永続化、ACK再取得、別run / documentの拒否、保存失敗、長文の秘密値除去、
  複数run、中断復元、ja / en、文字列表示、表示時に再実行しないこと、Stop競合を確認した。
- 既存assert・skip指定は変更していない。CJS harnessに履歴専用transport mockと観測を追加し、実backendへの接続は別の追加テストで確認した。
- 表示状態の修正後に全体を再実行し、**532 passed / 0 failed / 20 skipped（552ファイル）**、
  **12,931 passed / 0 failed / 218 skipped（13,149テスト）**。通常経路のCJS6ファイルも**100 passed / 0 failed / 0 skipped**。
  typecheck・buildと変更した拡張JS3ファイルのnode --checkも成功した。
- `test/venice-history.visual.cjs --seed`と`--restore`を別の実Electronプロセスで実行した。
  実store・ビルド済みpreload / rendererと専用userDataを使い、英語5履歴行・6イベントを保存し、
  別プロセスで日本語6履歴行・7イベントとして読み出した。増えた1件は未終了runの中断記録。
  作業中の誤表示なし、入力送信0、ページエラー0を確認し、両方の実描画も目視した。
  通常のCoS / 開発サーバは再起動していない。外部HTTP(S)は遮断し、実Venice送信は行っていない。
- 正のharnessは追跡対象の`test/venice-history.visual.cjs`。前提とコマンドは計画§16、ログと画像はGit除外の`outputs/venice-history/`。

### 不明なこと・次

- 実Veniceモデルによるタスク履歴E2Eと、サーバ側の履歴保持・過去チャット取り込みは未確認。
  attestation輸送は保留を継続する。
- 第7段階を完了とし、次は第8段階の通知。既存通知経路へ、正しいsessionを開く完了・失敗・承認待ち通知を接続する。
  上流用ブランチ・CI・PR提出には触れず、pushも行っていない。

## 2026-11-25 — Venice通知の接続と、OS受付・実表示の切り分け

### 分かったこと

- 実装`848e554c`で、gatewayの保存済み完了・失敗報告とapp所有の承認待ちを既存通知経路へ接続した。
  履歴からは通知を再生せず、通知側の例外で保存済み結果を取り消さない。同一run / 承認要求の通知は一度だけ。
- 完了は既存のturnNotifications設定、失敗・承認待ちは既存needs-you通知と同じ独立扱い。
  フォーカス中のデスクトップ通知を抑え、サウンド・スマホの同意とquiet hours・頻度制限は既存実装を使う。
- クリックは全OSでローカルsessionへ向ける。既存のChatGPT用クリック経路ではSettingsから会話画面へ切り替わらないため、
  Venice専用の固定IPCと既存の一覧ページ外session取得経路を組み合わせた。ChatGPT側の既存経路は変更していない。
  承認IDを指定し、既に失効した通知を他の要求へ振り替えない。クリックは許可・送信を行わない。
- スマホは既定で状態のみ、既存の詳細表示がONならタイトルだけを追加する。生の回答・指示・エラーは送らない。
  Venice通知へChatGPT URLやTelegram返信先・Deny操作を付けると別providerの操作になるため、新しいprovider属性で除外した。
  通常のChatGPTイベントは従来どおり。今回、スマホ・Telegramへ実メッセージは送っていない。

### 検証結果

- 追加は通知制御14件・gateway5件・承認UI / IPC6件・スマホ5件の30件。既存関連を含む13ファイル・104件成功。
  typecheck・build、visual harnessのnode --checkが成功。既存テストは変更していない。
- 実装固定後の全体npm testは1回。**534 passed / 2 failed / 20 skipped（556ファイル）**、
  **12,958 passed / 3 failed / 218 skipped（13,179テスト）**。先行する通常経路のCJS6ファイルは**100 passed / 0 failed / 0 skipped**。
- 失敗は既存の以下3件。元の同じ実行ログで失敗箇所を確認した。
  - `renderer-timeline.part1.test.ts`: `keeps the prior transcript inert until the selected detail arrives and fences A to B to A` のimmediate / deferred traces。
    待機内にCURRENT A ANSWERが出ず、以前のA ANSWERが残った（619行）。
  - `session-list-refresh.test.ts`: `retries via catalog catch-up when a full-size incremental drain read fails and cancels pending drain on hide`。
    待機内にRecovered trailing drain rowが出なかった（995行）。
- 該当2ファイルを単独のVitest実行で確認すると、**145 passed / 0 failed / 0 skipped**で全件成功した。
  フレークとして記録する。非再現の失敗を消すために既存のタイムライン処理・テスト・timeoutは変更せず、全体0 failedとは記録しない。
- 実store / gateway / ビルド済みpreload / rendererを専用userDataで使い、合成clickからSettings→対象session、2件目の承認選択、
  ja / en、失効済みクリック無視、入力送信0・自動承認0・ページエラー0を確認し、実描画を目視した。
  最初はDOM更新直後のcaptureに前フレームが残ったため、描画完了を待ってから画像を保存するようharnessを修正した。

### OS通知の切り分けと残作業

- npm同梱のElectron 44.3.0は、通知を一時ONにしても4件とも`UNErrorDomain 1`で拒否された。
  codesignの実値はlinker署名のみ、Info.plist未束縛・Sealed Resourcesなしだった。
- [Electron公式のmacOS通知仕様](https://www.electronjs.org/docs/latest/tutorial/notifications#macos)を確認し、
  検証用コピーへ既存の`afterpack-macos-adhoc-seal.mjs`を適用した。通常パッケージと同じbundle整備で、
  **4件すべてがshow、failed 0件**になった。元のElectron・通常アプリ・appId・署名方針は変更していない。
- OS受付は確認できたが、バナーの目視とネイティブな実クリックは未確認。
  通知センターのAutomationはClockセレクタを取得できず、CUA / agent-desktopのFn入力も非対応だった。
  このGUI操作依存を残し、受け入れ済みとはしない。利用者に承認されたElectron通知の一時ONは、検証後に元のOFFへ戻した。
- 正のharnessは`test/venice-notifications.visual.cjs`、再実行手順は計画§17。
  ログは`outputs/venice-notification-full-test.log`、`outputs/venice-notification-failure-isolation.log`、
  OS受付は`outputs/venice-notifications-sealed-runtime.log`と`outputs/venice-notifications/native-result.json`。いずれもGit除外。

### 不明なこと・次

- 第8段階は実装済み・実表示受け入れ待ちとして保留。担当はCodex。再開条件は、通知センターを操作できるGUI経路、または利用者による実クリックの補助。
  計画§17の署名整備済みコピーと`--native --inspect`で、OS通知から正しいsessionへ戻ることを実操作で確認したら完了にする。
- その後は既存Web UI経路で文字作業MVPの成功率を測り、それから9のDesktop AXへ進む。
  実Venice・スマホ送信、attestation再送、push・PR作成は今回行っていない。

## 2026-11-25 — 上流PR規約対応とpackaged-runtime smokeでの停止

- 分かったこと: 上流CONTRIBUTING / PRテンプレートの現行内容をAPIで確認した。公開規約にDCO / CLA / Signed-off-by必須や特別なコミット件名・ブランチ名規則は見当たらず、履歴の書き換えはしていない。
  全12翻訳カタログ、契約説明、エッジケース・プラットフォーム・live proof等の必須項目、maintainer編集許可、main追従・検証が必要だった。
- 利用者の追加承認により18ファイル固定を解除し、上流候補だけ全12言語登録と元のlocale監査の復元を行った。
  上流の英語はソース文字列を使うため、未使用の部分en.jsonと専用カウント修正を撤去。AppStateの任意表示名と旧snapshotのfallbackをAGENTS.mdへ記載した。
  21件先行していたmainを通常mergeで取り込み、候補HEADは`4f3e6b5e`。最新main `8721bb1b`基準では27ファイル / +250 / -6。通知・outputs・workflow・findingsはPR差分へ含めていない。
- 元のoriginはGitHubのforkではなかったため、提出用の`atsu6/chat-on-steroids-upstream`を作り、`pr-fork` remoteへ登録した。候補ブランチはまだpushしていない。PRは未作成で、Phase Bには着手していない。
- 上流のtypecheck・buildと通常のnpm run verifyは成功。2つの規定Vitest実行の合計は**511 passed / 0 failed / 20 skippedファイル、12,795 passed / 0 failed / 218 skippedテスト**。
  同じログ内のbranding関連7ファイルは合計178件成功。フォーク側のテスト数とは分けている。
- 停止理由: macOS arm64パッケージの組み立て・ad-hoc seal検証までは成功したが、packaged-runtime smokeが`Cannot find module 'detect-libc'`で失敗した。
  electron-builderには多数の推移依存の解決失敗があり、上流worktreeのnode_modulesは主checkoutへのsymlinkだった。環境・依存収集の問題と表示名実装の不具合は未確定のまま分ける。
- 実Electron用の新しいverify-app-display-nameはPASSを返したが、before.pngのみでafter.png / result.jsonが未生成だった。成功判定を撤回し、harnessの完走と実画面の受け入れを未確認として残す。
  未完了の検証コードは上流候補のローカルcheckpointに保存した。packagingが生成した無関係なTHIRD-PARTY-NOTICESの差分だけを除外し、両worktreeはcleanにした。
- 不明なこと・次: Codexが停止解除後に、上流worktreeだけ独立したlockfile依存関係へ切り替えてnpm ciを行い、UI verifierの途中終了とpackage smokeを直す。
  その後、本文・差分を再提示してPRを作成し、上流ブランチを凍結してから通知へ戻る。詳細な規約a〜d、word-diff、両基準のdiffstat、未提出本文は`outputs/pr-preflight/report.md`。
  今回は上流候補もフォーク側もpushしていない。通常アプリ・主checkoutのnode_modules・通知設定には手を加えていない。


## 2026-11-25 — 件数収支、worktree依存分離、成果物を条件にした表示名検証

### 全体件数の差は削除ではなく、比較対象の違い

- 通知を含むフォーク `b67dad4d` の12,958成功＋3失敗と、上流候補 `4f3e6b5e` の12,795成功を比較していた。
  成功だけの差は163、実行ケースの差は166。`12,961 − 189 − 3 ＋ 26 ＝ 12,795`で説明不能0件。
- フォーク専用25ファイル189件、共有ファイル内のフォーク専用3件、上流mainで増えた9ファイル26件を全数照合した。
  同じ上流ブランチ内でのテストファイル削除・改名・統合は0本。locale監査の例外撤去は既存assert内の対象拡大で、ケース数増減0件。
  ファイル別件数・増減・条件は `docs/venice-test-counts.md`。CJS100件とElectron画面確認はVitest件数に加算しない。
- 前回の3失敗はrenderer-timeline.part1のimmediate / deferred tracesとsession-list-refreshのcatch-up待ち。
  元ログのエラー概要は直前の通知節に残し、テスト・assert・timeoutを緩めない。

### worktreeごとの独立インストール

- 上流worktreeのnode_modulesリンクだけをGit除外のoutputs/dependency-bootstrapへ移動し、上流内でNode 22.23.5の `npm ci` を実行した。
  主checkoutの依存・通常アプリは操作していない。各実体は非symlink、同一device 16777233上でinodeは以下の別値。
  主checkout=102815150、v2.1.55検証worktree=105647304、上流worktree=107103526。
- npm ciは既存の依存インストールを置換する。別checkoutのnode_modules共有は禁止し、それぞれでnpm ciする手順とrealpath確認を上流のdevelopment-branding.mdへ記載した。
  通常のnpm checkout向けの説明であり、上流のNix管理下symlink運用を置き換えるものではない。

### detect-libcとパッケージの検査範囲

- sharp 0.35.4はproduction依存としてdetect-libc ^2.1.2を持ち、dist/sharp.cjsで無条件にrequireする。
  Linux専用として除去できない。元の失敗asarにはsharpはあったがdetect-libcが無かった。
- 独立npm ci後、既存 `npm run dist:dir:mac:arm64` だけで再構築し、asar内のdetect-libc/lib/detect-libc.jsとpackage.jsonの実在を確認した。
  梱包設定・依存宣言・asarUnpackは変更していない。今回観測した失敗は再インストールで直った。
  外部共有リンクによる依存収集不整合と整合するが、過去のnpm ciが主checkout実体を消したことまでは証明していない。
  他の依存配置でのcollector不具合・梱包漏れの可能性も、この1回で解消済みとはしない。
- 同梱Electronで行う既存smokeは終了コードだけでなくJSON値をassertする。
  version=2.1.55、Electron=44.3.0、MCP=true、sharp=0.35.4、vips=8.18.6、生成PNG=95 bytes、PTY=true、tree=program、desktop=trueが成功。
  このsmokeはELECTRON_RUN_AS_NODEによるnative stackの証拠であり、GUI mainの起動とは区別する。ログはoutputs/pr-preflight/package-isolated.log。
- package.mjsが生成したTHIRD-PARTY-NOTICESの473追加／296削除は、上流mainと同一の生成スクリプト・lockfileによるhost依存の出力だった。
  上流の既存Atkinsonフォント告知と当該hostのnative licenseが再生成され、パッケージには生成後の内容が入る。
  本PRへ無関係な生成物を混ぜないため追跡ファイルだけ元の上流状態へ戻し、生成後の実値はoutputs/pr-preflight/packaged-third-party-notices.txtへ保持した。

### 途中終了を成功と誤認しないharness

- `scripts/verify-app-display-name.cjs` のNode親が実行ごとに新しいディレクトリを作り、Electron子の終了後に成果物を検査する。
  Electron側は両状態を撮り終えるまで同じウィンドウを保持する。以前は最初のウィンドウを閉じた時点で終了していた。
- before.png・after.png・result.jsonの実在と通常ファイルを先にassertし、PNGの非空・シグネチャ・異なるbytesを確認する。
  JSON内の旧AppState／devの両状態についてnativeタイトル・rendererタイトル・可視ヘッダとエラー0を確認し、最後にだけPASSを出す。
  以前の成果物やElectronの終了コード0だけでは成功にならない。
- 追加15テストで欠落3種、空画像、同一画像、非PNG、JSON破損・部分結果、誤ラベル、renderer error、古い成果物、早期正常終了を拒否し、PASS最終出力も確認した。
  追加テスト・branding・UI runnerの計3ファイル39件が成功した。既存の削除・skip・assert緩和はない。
- 修復後の実Electron確認は `npm run verify:ui -- app-display-name` で成功し、画像2枚を目視した。
  正の成果物は上流worktreeの outputs/app-display-name/before.png=327,290 bytes、after.png=330,352 bytes、result.json=341 bytes。
  legacyはChat On Steroids、devはChat On Steroids (dev)で、3面すべて一致、errors=[]。
  3成果物を親側検査で確認してから表示名チェックのPASSを復活させた。外部HTTP・ユーザーの実データは使っていない。


### GUI起動と上流の最終候補

- 同じパッケージを実GUIとしても起動した。既存smoke-macos-gui.mjsの検査は維持し、Git除外のコピーで専用userData・CLF_BRIDGE_PORTS=0・COS_DEV_BRAND=1だけを指定した。
  `app started` / `window loaded` / `renderer state ready`の3イベントと10秒の生存を検査し、成功後にこの子プロセスだけを終了した。
  ログはoutputs/pr-preflight/package-gui-isolated.log、最後は `macos-gui-startup-ok arch=arm64 exit=0 signal=null`。
  通常アプリ・開発サーバ・ユーザーのprofileには触れていない。
- 上流の新HEADは `d4c0500b`。全体npm run verifyは**512 passed / 0 failed / 20 skipped（532ファイル）、12,810 passed / 0 failed / 218 skipped（13,028テスト）**。
  前回12,795からの増分15は、今回追加したharness自己検証1ファイルだけである。branding関連7ファイル178件は従来どおり成功。
  typecheckとbuildも成功。画面確認は前記のapp-display-name限定実行で、UI全件をローカル再実行したという意味にはしない。
- DCO / CLA / Signed-off-by必須は現行公開規約に見当たらず、コミットの署名追記・内容書き換えはしていない。したがってDCO range-diffの対象はない。
- `git diff v2.1.55 d4c0500b --stat` は **49ファイル / +949 / -61**。元の18 / +182 / -12から変わっている。
  うちmain取り込み自体が20ファイル / +526 / -55、実PRのmain基準は **30ファイル / +423 / -6**。共有のAGENTS.mdを除いて合計49ファイルになる。
  元の18ファイル固定は規約適合の追加承認で解除済み。最新PR差分の内訳は、表示名コード10ファイル(+62/-5)、カタログ12(+24)、契約・使い方2(+30)、UI proof3(+125)、テスト3(+182/-1)。
  4f3e6b5e後の修復は5ファイル(+224/-51)、追加はfixture・自己検証テスト・既存UI runnerへのNode親配線である。
- main基準の変更パスを全件確認し、Venice名0件、通知・workflow・outputs・findings・package設定・画像素材の混入0件。
  v2.1.55基準に見えるbridge等の変更はmain由来で、実PRには含まれない。


### フォーク全体の再実行で再停止（push・提出は未実施）

- フォークはアプリ／テストコードを変更せずにnpm testを全体1回再実行した。**533 passed / 3 failed / 20 skipped（556ファイル）、12,958 passed / 3 failed / 218 skipped（13,179テスト）**。
  同じ通常経路のCJS6ファイルは**100 passed / 0 failed / 0 skipped**。実行ログはoutputs/pr-preflight/fork-recheck.log。
- 今回の3失敗は前回と同じ集合ではない。同じ実行のログから確認した内容は以下。
  - `test/renderer-state.part1.test.ts:2291` — `offers all six bridge ports, saves numbers, and distinguishes saved choice from the override listener`。30秒timeout。
  - `test/renderer-timeline.part1.test.ts:619` — `keeps the prior transcript inert until the selected detail arrives and fences A to B to A (immediate traces)`。
    CURRENT A ANSWERが表示されず、旧A ANSWERのまま。これは前回の失敗1件と同じ再発。
  - `test/renderer-timeline.part4.test.ts:1132` — `scrolls forward through evicted history with wheel, keyboard and scrollbar, then resumes live deltas`。30秒timeout。
- 最新指示の「テスト赤で停止」に従い、原因を確定するための追加実行・修正へは進んでいない。
  この3件を今回も一括でフレークと判断したり、全体0 failedと記録したりはしない。既存テスト・assert・skip・timeoutは変更していない。
- 上流は全体0 failed、成果物3つ、native runtimeと実GUI smokeまで成立しているが、両ブランチが緑というpush条件は未達。
  **両ブランチともpushなし、PR作成なし**。上流の修復はローカルcommit d4c0500bに保存し、フォークはこの記録と件数比較だけをcommitする。
- 次の担当はCodex。再開は利用者の停止解除後とし、上記3件の原因調査を先に行う。PRの本文と差分の最終提示・fast-forward push・提出は、その後に緑を確認できた時点で行う。
  通知Phase Bは未着手であり、上流に通知や基盤を混ぜない。公開用の英語画像は未アップロードのまま、ローカルで保持している。


## 2026-11-25 — 停止解除後の3失敗の切り分けとrunnerの並列上限

### 単独実行と修正の判断

- 同じ3ファイルを、Node 22.23.5で1ファイルずつ独立実行した。state.part1は71件、timeline.part1は111件、timeline.part4は77件、計259件がすべて成功した。
  同じテスト・assert・timeoutのままであり、#2261で既に入った条件待ちを追加で変更していない。
- 問題のケースの比較（前回の全体 → 単独 → 修正後の全体、ms）:
  - bridge port設定: 32,907（timeout）→ 1,264 → 1,657。
  - A→B→A / immediate traces: 13,975（CURRENT A ANSWERなし）→ 1,148 → 1,461。
  - 双方向履歴スクロール: 30,324（timeout）→ 2,810 → 3,221。
- Vitest 5.0.5のrun時の既定はavailableParallelism−1。この10 logical CPUのMacでは9 workerになる。
  単独timeline workerのRSSは約1.7GBまで増え、当時swap使用も約9GBだった。個別のアプリ操作ではなく、多数のrendererを並列mountする全体実行時の負荷が主な差だった。
  これらの比較から過剰な並列実行を原因候補とし、製品のtimeline処理ではなくrunnerの資源上限を修正した。
- 変更はフォークのvitest.config.tsだけ。`maxWorkers = max(1, min(4, availableParallelism−1))`を既定とし、CLIによる明示上書きは既存どおり。
  低CPU環境で元より並列度を増やさず、大きいマシンでもrenderer-heavyなworkerを際限なく増やさない。
  testTimeout / hookTimeoutは30秒、harness waitForは10秒、retryの既定は0のまま。test / srcの差分は0で、削除・skip・assert緩和はない。

### 修正後の全体確認

- plain `npm test` が **12,961 passed / 0 failed / 218 skipped（13,179テスト）、536 passed / 0 failed / 20 skipped（556ファイル）**。
  先行する通常経路のCJS6ファイルも **100 passed / 0 failed / 0 skipped**。typecheck成功。実行中のscoped process観測でもworker上限4を確認した。
- ケース総数は13,179で不変。前回の失敗3件が成功へ移ったので、12,958＋3＝12,961となる。
  全体所要時間は482.43秒（前回449.23秒）で少し長くなるが、既存の判定期限内で完了するための並列上限として採用する。
  今回の全体成功は資源競合という説明を支持する。他の負荷条件での非再発まで保証したものとしては扱わない。
- 根拠: outputs/pr-preflight/isolate-state-part1.log、isolate-timeline-part1.log、isolate-timeline-part4.log、fork-bounded-workers.log、fork-worker-samples.json。
  ログ・観測データはGit除外。修正と理由はこのcommitへ保存する。
- 上流候補d4c0500bは変更していない。既存の全体12,810成功／0失敗／218 skip、typecheck・build、成果物3つ、packaged native runtime・実GUI smokeの証拠を再利用する。
  上流mainは8721bb1bのままで候補の祖先。通知・基盤・このrunner上限変更は上流PRへ含めない。
- 両ブランチが緑という条件が成立したので、fast-forward pushとPR提出へ進む。提出先はtotec448-spec/chat-on-steroids、headはatsu6/chat-on-steroids-upstreamのcodex/upstream-dev-suffix。
  提出前に本文全文とmain基準diffstatを提示し、提出後は上流ブランチを凍結する。
