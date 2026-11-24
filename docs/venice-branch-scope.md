# Venice基盤＋devブランディング：ブランチ範囲と分離検証

作業ルート: `/Users/atsu/chat-on-venice`。

## このブランチはブランド変更だけではない

旧`b8688e12`はv2.1.55に対する116ファイルのVenice基盤コミット。
前回の133は、この116ファイルと旧brandingの26ファイルの和集合（9ファイルが重複）であり、branding単体が133ファイルになった数字ではない。
recon・SSE・DOM/タブのagent loop、extensionのVenice専用化、runごとのread/write/shell承認、
`/venice/tools`とkernelのread/apply_patch/exec_command/find接続、出力・差分表示、失効・プロセス終了、
i18n fallbackなど、製品動作を変更している。

ブランチ名は`codex/venice-foundation-and-branding`、説明は「Venice基盤＋devブランディング」とする。
既存PRはない。全ブランチを表示名だけのPRとしては提出しない。

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

## CJS検証の実行入口

`npm test`は`vitest run`であり、`vitest.config.ts`の収集対象は`test/**/*.test.ts`。
`docs/venice-recon.test.cjs`は対象外。前回の関連100テストは次の別コマンドで実行した。

```sh
node --test test/venice-agent.test.cjs test/venice-bridge.test.cjs test/venice-input.test.cjs test/venice-panel.test.cjs test/venice-ui-send.test.cjs docs/venice-recon.test.cjs
```

## 分離可能性の実測

- 旧`56ebe1b2`は素のv2.1.55へのcherry-pickで4ファイルが衝突した。旧「そのまま取り出せる」は撤回。
- `c4931465`はbrandingをv2.1.55直上へ作り直したコミット。新しい文書と3キーだけのen catalogを持ち、Venice gatewayへのimportを含まない。
- その`c4931465`だけを別の素のv2.1.55ブランチへcherry-pickし、typecheck / build / 対象8ファイル190テストが成功した。
- 既存キーの12言語検査を残し、新規3キーだけのja/en仕様と、全13 UI言語でのfallbackを検証した。基盤の完全en catalogを前提とする統合テストは基盤側に保持した。
- 正式履歴はbrandingを先、Venice基盤を後にする。独立PRとして検討する際は最初のbrandingコミットだけを選ぶ。

証跡: `outputs/brand-isolation/proof-cherry-pick.log`、`proof-typecheck.log`、`proof-build.log`、`proof-tests.log`。全てローカルのignore対象。
