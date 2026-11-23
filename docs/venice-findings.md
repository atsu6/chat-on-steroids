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
