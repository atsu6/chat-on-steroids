# Veniceツール・拡張の動作変更＋devブランディング：ブランチ範囲と分離検証

作業ルート: `/Users/atsu/chat-on-venice`。

## このブランチはブランド変更だけではない

旧`b8688e12`はv2.1.55に対する116ファイルのVenice基盤コミット。
前回の133は、この116ファイルと旧brandingの26ファイルの和集合（9ファイルが重複）であり、branding単体が133ファイルになった数字ではない。
recon・SSE・DOM/タブのagent loop、extensionの静的登録のVenice専用化とChatGPT回復注入の遮断、runごとのread/write/shell承認、
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
- 上流用ブランチは`codex/upstream-dev-suffix`、tipは`906666f2`。
  v2.1.55直上で`c4931465`を`cherry-pick --no-commit`し、dev接尾辞へ絞った`70589d99`と、英語catalogのUI検証カウント修正の2コミットにした。
  devは`Chat On Steroids (dev)`、prodは既存の`Chat On Steroids`、アイコン・productName・appIdはupstreamのまま。
  対象7ファイル178テスト、typecheck、build、headlessのen/ja・1280/800px表示確認が成功した。追加のsetup guide実Electron検証も成功した。PRは未作成。
  Venice基盤・拡張・ferro・診断ログ・icon scriptの変更は上流用差分に含まれない。
- フォークは`ca0a2b2d`で同じ上流用コミットを実際の祖先へ取り込んだ。Venice機能・全カタログ・ferroは維持した。
  追従`9dd2aa89`は`src/shared/app-brand-name.ts`の定数をCoS→Veniceへ変える1ファイル1行だけ。
  以後、表示ラベルをproductNameから導かず、この追従差分を維持する。
  共通のcatalog数修正906666f2も37a34a4aで取り込み済み。上流用ブランチへの更新はfast-forwardだけで、上書きしていない。
  brandingは第1コミットに閉じているが、基盤のロケール変更には別途upstream同期の競合リスクが残る。

## 退役ブランチとの相違28ファイルを全件確認

対象は`archive/venice-exec-retired-20261124`（`5543094a`）と監査開始HEAD `590868eb`。
旧基盤の変更116ファイルとの重複は116のまま、内容一致88／相違28である。
28は旧基盤116ファイル内の相違数。`c4931465..590868eb`全体は118ファイルで、
旧側だけ0／現側だけ2（scope文書とCI workflow）である。
以下の全28件を「こちらが新しい」に分類した。「向こうにしかない未移植作業」は0件、今回の取り込みも0件。
旧側の文書・カタログ・処理・assertの削除側も確認し、単なる変更日時で判断していない。

| # | ファイル | 分類：こちらが新しい理由／旧側を戻さない理由 |
| --- | --- | --- |
| 1 | `AGENTS.md` | rebase由来。draft数値診断とturn restoreの説明。差分内容が共通祖先→v2.1.55の差分と完全一致 |
| 2 | `docs/venice-findings.md` | 以降の作業記録732行の追加。旧文書の全文を先頭からbyte単位で保持 |
| 3 | `docs/venice-recon.test.cjs` | 以降のテスト修正。旧tipのmanifestも既にVeniceのみの静的登録だったため、古いChatGPT登録の期待値を現物へ合わせた。実機能の削除ではない |
| 4 | `extension/manifest.json` | rebase由来。差分は版2.1.54→2.1.55だけ。旧tipにもChatGPT静的登録はない |
| 5 | `package.json` | 2.1.55化、brandingのpredev/prebuild icon生成、CJSの通常テスト入口を追加。旧scriptsとNode固定は保持 |
| 6 | `src/main/index.ts` | 以降のbranding。旧→現差分がv2.1.55→c4931465の差分と完全一致。旧タイトル／tooltip／画像の置換は意図した表示変更 |
| 7 | `src/main/ipc.ts` | upstreamのturn restore／checkpointRef追加とbrandingのAppState追加。旧checkpoint確認処理は共通helperへ移り、警告・ボタン・default/cancel条件を保持 |
| 8 | `src/preload/index.ts` | rebase由来。turn restore APIと型の追加。差分内容が共通祖先→v2.1.55と完全一致 |
| 9 | `src/renderer/chat.ts` | rebase由来。プロジェクト移動後の再描画とturn restore／undoの接続。差分内容が共通祖先→v2.1.55と完全一致 |
| 10 | `src/renderer/index.html` | 以降のbranding。動的title／ヘッダとferro mark。旧→現差分がv2.1.55→c4931465と完全一致 |
| 11 | `src/renderer/locales/de.json` | upstreamの13キー追加だけ。旧キー／値の削除・変更0 |
| 12 | `src/renderer/locales/en.json` | upstream新機能の英語source 13キーとbranding 3キーを追加。旧キー／値の削除・変更0 |
| 13 | `src/renderer/locales/es.json` | upstreamの14キー追加だけ。旧キー／値の削除・変更0 |
| 14 | `src/renderer/locales/fr.json` | upstreamの14キー追加だけ。旧キー／値の削除・変更0 |
| 15 | `src/renderer/locales/ja.json` | upstreamの12キーとbranding 3キーを追加。旧キー／値の削除・変更0 |
| 16 | `src/renderer/locales/ko.json` | upstreamの12キー追加だけ。旧キー／値の削除・変更0 |
| 17 | `src/renderer/locales/pt-BR.json` | upstreamの14キー追加だけ。旧キー／値の削除・変更0 |
| 18 | `src/renderer/locales/pt-PT.json` | upstreamの14キー追加だけ。旧キー／値の削除・変更0 |
| 19 | `src/renderer/locales/ru.json` | upstreamの15キー追加だけ。旧キー／値の削除・変更0 |
| 20 | `src/renderer/locales/tr.json` | upstreamの13キー追加だけ。旧キー／値の削除・変更0 |
| 21 | `src/renderer/locales/vi.json` | upstreamの12キー追加だけ。旧キー／値の削除・変更0 |
| 22 | `src/renderer/locales/zh-CN.json` | upstreamの12キー追加だけ。旧キー／値の削除・変更0 |
| 23 | `src/renderer/locales/zh-TW.json` | upstreamの12キー追加だけ。旧キー／値の削除・変更0 |
| 24 | `src/renderer/main-texts.ts` | upstreamのturn restore警告1キーとbranding 3キーを追加。旧キーは保持 |
| 25 | `src/shared/main-texts.ts` | 同じ4キーをnative翻訳の許可一覧へ追加。旧キーは保持 |
| 26 | `test/i18n-english-fallback.test.ts` | 以降の検証追加。12ロケールと2.1.55キー維持の1ケース追加のみ。既存ケースは保持 |
| 27 | `test/venice-input.test.cjs` | 現行bridgeのlocalDocument→activateを厳密比較し、既に旧registryにあったcore/name構文と4ツールを検証。旧の登録一覧一致・重複禁止・入力操作assertは保持 |
| 28 | `test/venice-panel.visual.cjs` | 以降の検証修正。既存bridge harnessでgrant要求／revokeを通す合成RPCとそのassertを追加。旧run／stop／CSS／a11yの検証を保持し、画像出力だけignore対象outputsへ移した |

非英語12カタログの追加キーは、branding 3キーを除きv2.1.55のキー／値と一致する。
旧tipにしかないファイルも0件。証跡は`outputs/venice-retirement-audit/`の`01.patch`～`28.patch`、
`locale-retention.json`、`origin-checks.txt`。ログや文書の追記を旧作業の欠落として数えていない。

### 大きい上位5件の実際の差分

比較を`5543094a..9c684b69`に固定し、追加行数＋削除行数で順位付けした。同数はファイル名順。
全diffを`outputs/venice-dispatch-and-pr/top-1.patch`～`top-5.patch`へ保存した。
以下のコマンドで、どのチェックアウトでも同じdiffを再取得できる。

```sh
git diff --no-ext-diff --unified=4 archive/venice-exec-retired-20261124 9c684b69 -- <ファイル>
```

| 順位 | ファイル | 追加／削除 | 差分を読んだ判断の根拠 |
| --- | --- | --- | --- |
| 1 | `docs/venice-findings.md` | +786 / -0 | 全て末尾追記。旧文書全文はbyte単位で同一のprefixとして残る。branding・実機診断・履歴分離・前回監査の記録が増えただけで、旧記録の削除0 |
| 2 | `src/main/ipc.ts` | +36 / -20 | 削除側はcheckpointの確認dialog。共通helperへ同じ警告・25件上限・defaultId/cancelId=0・buttonsを移し、旧restoreCheckpointもそのhelperを呼ぶ。新しいrestoreTurnとcheckpointRefはv2.1.55由来、displayNameはbranding由来 |
| 3 | `src/main/index.ts` | +34 / -3 | 旧→現差分がv2.1.55→c4931465のbranding差分と完全一致。削除3行は固定window title、tooltip、Tray生成行の置換で、Venice gatewayの初期化／終了処理は削除されていない |
| 4 | `AGENTS.md` | +18 / -3 | 共通祖先f4c63cdd→v2.1.55の差分内容と完全一致。draft診断の数値説明とturn restore文書の更新で、Venice節を落とした差分ではない |
| 5 | `test/venice-panel.visual.cjs` | +16 / -5 | 合成grant／revokeのRPC harness追加、bridgeの実注入、RPC順序assertを追加。UI操作・a11y・外部通信禁止を維持。旧画像保存先はignore対象outputsへ移動。ネットワークassertの期待値は合成RPCだけを加えたもの |

上位5件も再分類0件。「こちらが新しい」は行の新旧だけでなく、旧処理・旧記録を残した上で何が追加／置換されたかを確認した結果である。

## ChatGPT側と通常CoSの併存：静的登録だけでは隔離できていない

監査時`9c684b69`では、静的登録だけを外した状態で動的回復注入が残っていた。以下はその時点の原因。

- `extension/manifest.json`にはVeniceの静的content_scriptsだけがある。
  新しいChatGPTページへの初期注入はなくなり、旧tipも同じ状態だった。
- しかし`extension/background.js`の`restoreChatgptTab`は、ChatGPTへ`i18n.js`、`chatgpt-dom.js`、
  `app-palette.js`、`usage.js`、`fiber.js`、`content.js`とoverlay CSSを動的に注入する。
  MAIN helperは健康なrecorderが応答した場合にも再注入する経路がある。
- 呼び出し元はservice worker起動末尾、onInstalled、ensurePaired、maintenanceの
  `restoreSilentRecorders`（チェック間隔60秒）。静的登録を外してもこの経路は残る。
  host_permissionsとscripting権限も残っている。現在の関数をそのままVMへ読み込んだ合成実行でも、6スクリプトの注入要求を確認した。
- よってChatGPTの観測・送信処理は完全撤去されておらず、回復注入後に動作し得る一方、
  初期注入がないので従来と同じ開始タイミングにもならない。「従来どおり動く」「完全に切れている」のどちらも正確ではない。
  通常CoSのインストール済みファイルを変更したわけではないが、同じChromeで両拡張を使うと二重注入経路が残る。
  今回は実ページで二重フックを起こさず、コードと合成実行からこの欠陥を確定した。再フリーズの発生自体は未実測。

backgroundの実装は旧archiveと同一で、manifestの差もversionだけである。
退役に伴う作業欠落ではなく、先行する「Venice専用化」の未完了が見つかった。
reconのCJSテストが検査するのは静的manifestと観測器のhost guardであり、この動的回復経路は検査していない。

### 修正：回復注入を止め、警告を表示する

`be53004d`で「許容」ではなく遮断を選んだ。通常CoSがChatGPTを担当するため、この拡張で回復注入を続ける利点がない。
manifestにVeniceだけが登録されている場合、`restoreChatgptTab`と別経路の`replaceUsageObserver`を入口で止める。
ChatGPTを検出するとworkerごとに1回、ja/en catalog経由の1行警告をconsole.warnへ出し、拡張badgeを`!`、action tooltipを警告文にする。
ChatGPTを明示登録した標準manifestでは従来の回復処理を維持する。

新規の回復注入は止まるが、既に旧コードが注入したページのフックをこの修正だけで消すことはできない。
警告はChatGPTページの再読み込みと通常CoS拡張の使用を案内する。他のChatGPT関連background処理は残っているため、ビルド全体の移行完了とは扱わない。
実ページの既存操作を中断するreloadは今回行っていない。注入なし・警告1回・badge／tooltip・標準manifestの互換性を6テストで固定した。

原因の合成記録は`outputs/venice-retirement-audit/chatgpt-reinjection.json`、修正後のテストは`test/venice-chatgpt-isolation.test.ts`。

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

### GitHub上での実行状況

`gh run list --repo atsu6/chat-on-venice --branch codex/venice-foundation-and-branding`は0件、
push済み`590868eb`のcheck-runsも0件だった。PRもない。
workflowのpush条件は`branches: [main]`なので、このブランチへのpushはCIを起動しない。
repoのActions permissionsは`enabled: true`であり、Actions無効と推測したわけではない。
ただしworkflow一覧APIも0件、workflow `ci.yml`の取得APIは404だった（main上のファイル存在は確認）。
この時点ではrunner上のCIは未検証だった。

`workflow_dispatch`は元からmain／作業ブランチの両方に存在した。GitHub側のworkflow未登録を、
既定ブランチmain→作業ブランチ→mainの一時切替で解消し、CI workflow ID `429223434`が登録された。
既定ブランチはmainへ復元済み。push条件main限定とActions権限は変更していない。
登録確認用run `45426591854`は旧HEADのため中止し、最終コード`9dd2aa89`で`gh workflow run ci.yml --ref codex/venice-foundation-and-branding`を実行した。

このrun `45428690299`ではCJS100件とtypecheck／privacyが実runnerで成功した一方、Windows fixtureとUIチェックに失敗が出た。
Unix固定パスの厳密比較、Windows予約名nul.txt、POSIX専用のexec fixtureが原因だった。
36f5dd56で期待パスをOS標準joinへ変え、fixture名をnul-containing.txtへ変え、execの入力生成をnative shell経由のNodeへ移した。
stdout／stderr／制限／失効／descendant kill等のassertは保持した。PID取得には子のstdout receiptを待つ。
UIでは英語catalogの二重計数と、ferroに残った旧folder mark用の光学補正を直した。flag数やpixel許容閾値は緩めていない。
変更後の対象5ファイル82テストとCJS100件、実Electronのsetup guide／What's Newチェックが成功した。
最終コード37a34a4aをrun `45431889881`で再実行し、修正前runは中止した。

[run 45431889881](https://github.com/atsu6/chat-on-venice/actions/runs/45431889881)のattempt 2時点の結果はfailure。
13 job中11がsuccess、残る`UI checks (macOS 2/2)`と`Verify macOS arm64 (1/2)`はcancelledだった。
両jobともrunner未割当・steps 0で、GitHubの注記はhosted runnerを取得できなかったこととmacOS arm64の容量不足を示す。
失敗jobだけを`gh run rerun 45431889881 --repo atsu6/chat-on-venice --failed`で1回再実行したが、
attempt 2も同じ2 jobが2026-11-25 01:24～01:39 JSTの待機後に開始前キャンセルとなった。
成功済み11 jobは再実行していない。Windows全6 job、Linux全3 job、macOSの残り2 jobは成功し、CJS100件・typecheck・privacyも実runnerで成功した。
この時点ではテスト失敗は記録されていないが、未実行の2 jobがあるためCI全体の成功とは扱わなかった。
両attemptのjob情報・注記と最終状態は`outputs/venice-dispatch-and-pr/ci-*.json`に保存した。
当時は容量回復後の2 job確認が残った。runner構成・arch・skip・assertを変えて代替していない。
fcf8a3cfまでは文書だけの更新で、実装・テスト・workflow・依存関係はこのCI対象SHAと同じだった。

### 容量回復後に見つかったferro前景のずれ

同じrunのattempt 3では両macOS jobが開始され、Verify macOS arm64 (1/2)も成功した。
全体は12 success／1 failureとなり、残るUI checks (macOS 2/2)の37/38成功・1失敗はWhat's Newの明色アイコン中央揃えだった。
ローカルでも`verify-whats-new.cjs --force-device-scale-factor=1`で左右23/21pxの同じ失敗を再現した。
旧folder補正を消しただけでは、白いferro本体の中心34,約33が台座の中心32,32からずれたままだった。

`5a3fc432`でSVG原本とrenderer spriteの白いpathへ同じtranslate(-2 -1)を加え、既存手順でPNGと派生アイコンを再生成した。
path形状・色・台座・make-iconの生成方式・トレイのpixel hintは変更していない。SVGとspriteのtransform一致を既存回帰テストの追加assertで固定した。
関連3ファイル50テストとCJS100件、typecheck、buildが成功し、実ElectronのWhat's NewはDPR 1/2・dark/lightの全条件で既存のpixel判定を通過した。
実rendererのen/ja・dev/prod・1280/800pxと、生成した16/22/32/48/128/256/512pxの画像も確認した。
上流用ブランチ906666f2にはferroがないため変更していない。
修正版の全CIは[run 45531914064](https://github.com/atsu6/chat-on-venice/actions/runs/45531914064)、対象SHAは5a3fc432。
attempt 1で13/13 job success、全体の結論もsuccessになった。問題のmacOS UI shard 2は38/38成功・0 skippedで、What's Newも初回成功した。
Windows／Linux／macOSの全検証とCJS・typecheck・privacyが揃い、runner容量待ちと中央揃えの未解決条件は解消した。
この結果の追記は文書だけで、CI対象から実装・テスト・workflow・依存関係は変更していない。

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

### 追従後9dd2aa89の全体検証

フォークの表示定数をVeniceへ戻した後、Node 22.23.5で`npm test`を全体1回実行した。
Vitestはファイル527 passed / 0 failed / 20 skipped（計547）、
テスト12900 passed / 0 failed / 218 skipped（計13118）。先行するCJS6ファイルも100 passed / 0 failed / 0 skipped。
typecheckとbuildも終了コード0。forkと上流候補の両方で、headlessの実rendererのen/ja、1280/800px、dev/prod名と文字切れなしを確認した。
上流既存テストの削除・skip追加はなく、forkの既存assertも保持した。
証跡は`outputs/venice-dispatch-and-pr/`の`fork-tested-head.txt`、`fork-full-test.log`、`fork-final-typecheck.log`、`fork-final-build.log`、両ブランチのvisual画像。

## 「基盤102」の既定値・起動条件を抜き打ち確認

「基盤」は内部処理だけを意味しない。次の製品動作変更も含む。

| 観点・確認した所有者 | 確認結果と利用者への影響 |
| --- | --- |
| 権限：`src/main/venice-tool-gateway.ts`、`src/renderer/chat.ts`、`src/renderer/index.html` | Venice用の承認UIとrun単位の権限を追加する変更。初期rootは空で、フォルダー選択と承認までは権限なし。承認の既定はread（検索要求時はread＋find）だけ。write／shellは別フラグで両方false、UIも要求ごとに未チェックへ戻す。writeはshellを許可しない。一般の設定・capability既定値はupstreamのまま |
| モデル：`extension/venice-agent.js`、`extension/venice-send.js` | 現行agentは`sendViaUi`を使い、モデルを選び直さない。Veniceページで選択中のモデルを使用する。未使用の旧`sendTurn`も明示model引数が必須で、URL内の記録値を既定モデルとして使う経路ではない |
| ポート：`src/shared/browser-bridge.ts`、`src/main/bridge-ports.ts`、`src/main/bridge.ts`、`extension/background.js` | Autoの8765–8769 → 18765–18769 → 38765–38769はupstreamと同じ。新たな既定ポートは追加していない。開発用8766固定は起動時の`CLF_BRIDGE_PORTS`指定で、製品既定値の変更ではない |
| 起動：`src/main/index.ts`、`src/main/venice-tool-gateway.ts` | 既存のwhenReady後・single-instance guardを維持し、追加の初期化は過去のcall台帳の読み出し。grant復元・ツール再実行・モデル送信は行わない。トレイ診断はdev判定かつ`COS_TRAY_DIAGNOSTICS=1`のときだけ |
| 拡張の開始条件：`extension/manifest.json`、`extension/background.js`、`extension/venice-agent.js`、`extension/venice-recon.js`、`extension/venice-panel.js` | 静的登録はVeniceだけ。動的ChatGPT回復注入も遮断し、検出時に警告・badge・tooltipを表示する。旧フックの除去にはページ再読み込みが必要。Venice側はパネルRun後にgrantを要求して開始し、UI送信時に記録を開始する。ステップ既定10／上限40 |

比較で`src/main/config.ts`、`src/main/bridge-ports.ts`、`src/shared/browser-bridge.ts`、
`src/main/window-lifecycle.ts`にv2.1.55との差分がないことも確認した。
上記の意図したVenice機能追加はscopeへ明示し、表示名だけの変更や挙動不変の内部基盤とは扱わない。

## 分離可能性の実測

- 旧`56ebe1b2`は素のv2.1.55へのcherry-pickで4ファイルが衝突した。旧「そのまま取り出せる」は撤回。
- `c4931465`はbrandingをv2.1.55直上へ作り直したコミット。新しい文書と3キーだけのen catalogを持ち、Venice gatewayへのimportを含まない。
- その`c4931465`だけを別の素のv2.1.55ブランチへcherry-pickし、typecheck / build / 対象8ファイル190テストが成功した。
- 既存キーの12言語検査を残し、新規3キーだけのja/en仕様と、全13 UI言語でのfallbackを検証した。基盤の完全en catalogを前提とする統合テストは基盤側に保持した。
- 元の履歴はbranding→Venice基盤の順。上流用はc4931465から絞った`70589d99`で、フォークにも同じコミットを取り込んだ。

証跡: `outputs/brand-isolation/proof-cherry-pick.log`、`proof-typecheck.log`、`proof-build.log`、`proof-tests.log`。全てローカルのignore対象。
