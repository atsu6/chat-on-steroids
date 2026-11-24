# Veniceツール・拡張の動作変更＋devブランディング：ブランチ範囲と分離検証

作業ルート: `/Users/atsu/chat-on-venice`。

## このブランチはブランド変更だけではない

旧`b8688e12`はv2.1.55に対する116ファイルのVenice基盤コミット。
前回の133は、この116ファイルと旧brandingの26ファイルの和集合（9ファイルが重複）であり、branding単体が133ファイルになった数字ではない。
recon・SSE・DOM/タブのagent loop、extensionのVenice専用化、runごとのread/write/shell承認、
`/venice/tools`とkernelのread/apply_patch/exec_command/find接続、出力・差分表示、失効・プロセス終了、
i18n fallbackなど、製品動作を変更している。

ブランチ名は`codex/venice-foundation-and-branding`、説明は「Veniceツール・権限・拡張の動作変更＋独立devブランディング」とする。
既存PRはない。全ブランチを表示名だけのPRとしては提出しない。

## 保守するブランチと上流に出す範囲

- Venice実装の正は`codex/venice-foundation-and-branding`だけとする。
- `codex/venice-exec`は退役する。tip `5543094aee1ca147b24d810bcb103152f93ca6d4`を
  `archive/venice-exec-retired-20261124`に保存し、ローカル／originの旧ブランチを削除する。
  新規修正は正のブランチだけに積み、旧ブランチから再度mergeしない。
- 比較は、旧ブランチとv2.1.55の共通祖先`f4c63cdd`から旧tipまでの変更116ファイルと、
  `c4931465..1253e3ef`の基盤変更117ファイルを対象にした。重複116、旧側だけ0、
  新側だけ1（このscope文書）。重複の内容は88ファイルが完全一致、28ファイルが異なる。
  後者には2.1.55の更新、branding、CJS検証修正、記録が含まれる。Venice gateway／exec／findなどの実装は一致する。
- 上流へ提案するのは`c4931465c8fb023dc99faa9b06fcf2667173b294`のbranding単体だけ。
  `1253e3ef`と後続のVenice検証・運用変更は自分のリポジトリに残す。
  brandingは第1コミットに閉じているが、基盤のロケール変更には別途upstream同期の競合リスクが残る。

## 旧b8688e12の全変更ファイル

ブランド専用ファイルは0件。ブランドと基盤が同居する14件は拡張の13言語catalogとmanifest。
残りは基盤（実行環境・i18n・製品動作・検証・資料）である。
「i18n」はすべてブランド変更ではなく、Venice機能の文言とfallbackも含む。

### 基盤・実行環境（2件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| A | `.nvmrc` | Node 22.23.5の固定 | 実行環境 |
| M | `package.json` | Node 22.23.5の固定 | 実行環境 |

### 基盤・資料／fixture保護（14件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| M | `AGENTS.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/adr/0001-venice-web-transport.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/chat-on-steroids-agent-map.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/screenshots/venice-panel-desktop.png` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/screenshots/venice-panel-mobile.png` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-adapter-contract.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-attestation-status.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-findings.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-i18n-decision.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-integration-plan.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-progress.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `docs/venice-recon.md` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `fixtures/.gitignore` | 設計・観測記録・合成画像・fixture除外 | なし |
| A | `fixtures/README.md` | 設計・観測記録・合成画像・fixture除外 | なし |

### 基盤・検証（44件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| A | `docs/venice-recon.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `docs/venice-send.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `docs/venice-sse-fixture.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `docs/venice-sse.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/extension-i18n.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/extension-in-page-look.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/extension-popup.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/extension.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/goal-errors.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/i18n-english-fallback.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/i18n-english-fallback.visual.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/ipc.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/linux-screenshot-consent.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/main-texts.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/pets-renderer.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/renderer-i18n-source.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/renderer-i18n.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/renderer-scheduled.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/settings-backup.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| M | `test/tool-titles.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-agent-input.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-agent.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-apply-patch-panel.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-apply-patch-ui.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-apply-patch.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-apply-patch.visual.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-bridge-harness.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-bridge.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-exec-panel.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-exec-ui.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-exec.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-exec.visual.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-find-ui.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-find.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-find.visual.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-grant-ui.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-grant.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-input.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-integration.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-local-read.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-panel.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-panel.visual.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-tool-gateway.test.ts` | Venice／i18nの合成・CJS・画面検証 | なし |
| A | `test/venice-ui-send.test.cjs` | Venice／i18nの合成・CJS・画面検証 | なし |

### ブランド＋基盤（14件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| M | `extension/_locales/de/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/en/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/es/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/fr/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/ja/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/ko/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/pt_BR/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/pt_PT/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/ru/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/tr/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/vi/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/zh_CN/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/_locales/zh_TW/messages.json` | extension_name製品名＋patch/exec/find文言 | あり |
| M | `extension/manifest.json` | short_name＋Venice host/content_scripts切替 | あり |

### 基盤・製品動作（25件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| M | `extension/background.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `extension/usage.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-agent.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-bridge.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-panel.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-recon.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-send.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `extension/venice-sse.js` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/bridge.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/codex/unified-exec.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/index.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/ipc.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/mcp/call-context.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/mcp/kernel.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/mcp/tools-core.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/main/session/recorder.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `src/main/venice-exec.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `src/main/venice-find.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `src/main/venice-patch-preview.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `src/main/venice-tool-gateway.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/preload/index.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/renderer/chat.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/renderer/index.html` | Venice通信・承認・ローカルツール・状態連携 | あり |
| M | `src/shared/session.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |
| A | `src/shared/venice-integration.ts` | Venice通信・承認・ローカルツール・状態連携 | あり |

### 基盤・i18n（17件）

| 状態 | ファイル | 内容 | 製品動作の変更 |
| --- | --- | --- | --- |
| M | `extension/i18n.js` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/i18n.ts` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/de.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| A | `src/renderer/locales/en.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/es.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/fr.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/ja.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/ko.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/pt-BR.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/pt-PT.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/ru.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/tr.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/vi.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/zh-CN.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/locales/zh-TW.json` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/renderer/main-texts.ts` | Venice用UI文字列／英語fallback／nativeラベル | あり |
| M | `src/shared/main-texts.ts` | Venice用UI文字列／英語fallback／nativeラベル | あり |

## 12言語・13言語の区別とupstream同期コスト

- rendererにはupstream由来の12カタログがあり、Venice基盤で英語カタログを追加した。旧b8688e12では表示名3キーはまだ含まれず、追加は旧56ebe1b2のja/enだけだった。
- 拡張は英語を含め13カタログ。旧b8688e12は全13ファイルの`extension_name`を`Chat On Venice (dev)`へ変えている。非英語12ファイルだけではなく英語も対象。
- upstream取り込みのたび、拡張の全13ファイルでこの製品名を維持できているか確認するコストがある。upstreamが同じキー／近接部分を更新すれば衝突し得る。毎回すべてが必ず衝突するわけではない。
- rendererのVenice追加キーにも末尾付近の競合リスクがある。dev表示名3キーはja/enだけを登録し、既存の他言語へ新たにばらまかない。

## 旧履歴の名前付き保存先

- `archive/brand-dev-name-pre-squash-20261124` → `56a76537`：旧マージを含む作業履歴。
- `archive/brand-dev-name-before-isolation-20261124` → `56ebe1b2`：分離検証前の公開済み2コミット。
- 従来の永続ref `refs/backup/brand-dev-name-before-closeout` も `56a76537` を指す。reflogだけの保存ではない。

上のarchiveタグ2本は`git ls-remote origin`で確認した。annotated tagオブジェクトではなく、
`^{}`で展開した対象commitはそれぞれ次のとおりで、保存時の記録と一致する。

| タグ | リモートの対象commit |
| --- | --- |
| `archive/brand-dev-name-pre-squash-20261124` | `56a765378da5746866e6cc447b108b5e7c7fe33f` |
| `archive/brand-dev-name-before-isolation-20261124` | `56ebe1b217afc7dab9f69903d310f9685b7a2619` |

## CJS検証の実行入口

`vitest.config.ts`の収集対象は`test/**/*.test.ts`であり、CJSはVitest自身の収集対象外。
現在は`npm test`が`npm run test:venice && vitest run`を実行する。
`test:venice`は次の6ファイル・100件で、全てチェックアウト相対のパスで指定する。

```sh
node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-input.test.cjs test/venice-panel.test.cjs test/venice-ui-send.test.cjs docs/venice-recon.test.cjs
```

通常の`npm test`で必ず先に実行し、失敗したらVitestへ進まない。
`npm test -- test/example.test.ts`の引数は末尾のVitestへ渡り、対象を絞る既存の使い方も維持する。
CIはVitestを直接shard実行するため、`.github/workflows/ci.yml`のLinux `checks` jobにも
`npm run test:venice`を必須stepとして追加した。ローカルとCIのどちらでも手打ちに依存しない。

## 再配置後HEADの全体検証

実装の再配置後、未変更の`1253e3ef150329f2f435bf6c2af6efc5681b58ef`で実行した。
Nodeは22.23.5。

| 検証 | 結果 |
| --- | --- |
| `npm test`（全体1回） | ファイル525 passed / 0 failed / 20 skipped、計545。テスト12875 passed / 0 failed / 218 skipped、計13093 |
| CJS 6ファイル | 100 passed / 0 failed / 0 skipped |
| `npm run typecheck` / `npm run build` | 両方終了コード0 |
| `node scripts/package.mjs --platform darwin --arch arm64 --dir` | 終了コード0。`release/mac-arm64/Chat On Steroids.app`を生成し、同梱resourceとnative runtimeのsmoke確認も成功 |

検証入口を追加した後の`npm test -- test/venice-integration.test.ts test/packaging.test.ts`も成功した。
CJS100件の後にVitest2ファイル40件が走り、いずれも0 failed / 0 skipped。
workflowの`actionlint`も成功した。今回の追加はscripts／CI／文書だけで、製品コード・テスト本体は変えていない。

証跡: `outputs/venice-head-verification/`の`tested-head.txt`、`full-test.log`、`cjs.log`、
`typecheck.log`、`build.log`、`package.log`、`npm-test-entrypoint.log`、`actionlint.log`と各exit記録。

## 「基盤102」の既定値・起動条件を抜き打ち確認

「基盤」は内部処理だけを意味しない。次の製品動作変更も含む。

| 観点・確認した所有者 | 確認結果と利用者への影響 |
| --- | --- |
| 権限：`src/main/venice-tool-gateway.ts`、`src/renderer/chat.ts`、`src/renderer/index.html` | Venice用の承認UIとrun単位の権限を追加する変更。初期rootは空で、フォルダー選択と承認までは権限なし。承認の既定はread（検索要求時はread＋find）だけ。write／shellは別フラグで両方false、UIも要求ごとに未チェックへ戻す。writeはshellを許可しない。一般の設定・capability既定値はupstreamのまま |
| モデル：`extension/venice-agent.js`、`extension/venice-send.js` | 現行agentは`sendViaUi`を使い、モデルを選び直さない。Veniceページで選択中のモデルを使用する。未使用の旧`sendTurn`も明示model引数が必須で、URL内の記録値を既定モデルとして使う経路ではない |
| ポート：`src/shared/browser-bridge.ts`、`src/main/bridge-ports.ts`、`src/main/bridge.ts`、`extension/background.js` | Autoの8765–8769 → 18765–18769 → 38765–38769はupstreamと同じ。新たな既定ポートは追加していない。開発用8766固定は起動時の`CLF_BRIDGE_PORTS`指定で、製品既定値の変更ではない |
| 起動：`src/main/index.ts`、`src/main/venice-tool-gateway.ts` | 既存のwhenReady後・single-instance guardを維持し、追加の初期化は過去のcall台帳の読み出し。grant復元・ツール再実行・モデル送信は行わない。トレイ診断はdev判定かつ`COS_TRAY_DIAGNOSTICS=1`のときだけ |
| 拡張の開始条件：`extension/manifest.json`、`extension/venice-agent.js`、`extension/venice-recon.js`、`extension/venice-panel.js` | ChatGPTへのcontent-script登録を外してVenice専用にする、明確な製品動作変更。MAINの設置だけではタスクも記録も始めない。パネルRun後にgrantを要求して開始し、UI送信時に記録を開始する。ステップ既定10／上限40も新しい利用者可視の制御 |

比較で`src/main/config.ts`、`src/main/bridge-ports.ts`、`src/shared/browser-bridge.ts`、
`src/main/window-lifecycle.ts`にv2.1.55との差分がないことも確認した。
上記の意図したVenice機能追加はscopeへ明示し、表示名だけの変更や挙動不変の内部基盤とは扱わない。

## 分離可能性の実測

- 旧`56ebe1b2`は素のv2.1.55へのcherry-pickで4ファイルが衝突した。旧「そのまま取り出せる」は撤回。
- `c4931465`はbrandingをv2.1.55直上へ作り直したコミット。新しい文書と3キーだけのen catalogを持ち、Venice gatewayへのimportを含まない。
- その`c4931465`だけを別の素のv2.1.55ブランチへcherry-pickし、typecheck / build / 対象8ファイル190テストが成功した。
- 既存キーの12言語検査を残し、新規3キーだけのja/en仕様と、全13 UI言語でのfallbackを検証した。基盤の完全en catalogを前提とする統合テストは基盤側に保持した。
- 正式履歴はbrandingを先、Venice基盤を後にする。上流PRには最初のbrandingコミット`c4931465`だけを選ぶ。

証跡: `outputs/brand-isolation/proof-cherry-pick.log`、`proof-typecheck.log`、`proof-build.log`、`proof-tests.log`。全てローカルのignore対象。
