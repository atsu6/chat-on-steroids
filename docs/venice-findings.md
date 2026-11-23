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
