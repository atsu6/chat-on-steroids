# テスト件数の突き合わせ — 2026-11-25

比較したのは同じブランチの前後ではなく、通知を含むフォーク `b67dad4d` と、独立した上流PR候補 `4f3e6b5e`。
以下は保存済みの同じ実行ログから全ファイルを集計し、各HEADの追跡対象 `test/**/*.test.ts` 全件と一致することも確認した結果。

| 指標 | フォーク | 上流候補 | 上流 − フォーク |
| --- | ---: | ---: | ---: |
| 成功テスト | 12,958 | 12,795 | -163 |
| 失敗テスト | 3 | 0 | -3 |
| 実行ケース（成功＋失敗） | 12,961 | 12,795 | -166 |
| skipケース | 218 | 218 | 0 |
| 収集ケース総数 | 13,179 | 13,013 | -166 |
| 収集ファイル | 556 | 531 | -25 |

## 166件の収支

`12,961 − 189 − 3 ＋ 26 ＝ 12,795`。説明不能な差は **0件**。

- フォーク専用25ファイルの189件は、初めから上流PRに含まれない。今回の変更で削除したものではない。
- 共有ファイル内のフォーク専用3件（Venice承認IPC 2件と、英語を含めた翻訳パラメーター1件）も上流候補には含まれない。
- 上流mainから取り込んだ21コミットが、共有9ファイルへ26件を追加した。
- locale監査の例外撤去は **テスト件数の増減0件**。既存のケース内で検査対象を全12言語へ戻す変更であり、it/it.eachの新規ケースを作る変更ではない。
  例としてmain-textsの監査では、以前除外していた新規2キー×日本語以外11ロケール＝22個の登録を再び必須にした。

## フォークにのみ存在する25ファイル（189件）

| ファイル | 件数 | 上流候補に含めない理由 |
| --- | ---: | --- |
| `test/dev-brand.test.ts` | 30 | フォーク固有の名前・素材 |
| `test/dev-icon.test.ts` | 1 | フォーク固有の名前・素材 |
| `test/i18n-english-fallback.test.ts` | 9 | フォークの英語fallback方針 |
| `test/venice-agent-input.test.ts` | 7 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-apply-patch-panel.test.ts` | 3 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-apply-patch-ui.test.ts` | 3 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-apply-patch.test.ts` | 9 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-chatgpt-isolation.test.ts` | 6 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-exec-panel.test.ts` | 2 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-exec-ui.test.ts` | 3 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-exec.test.ts` | 15 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-find-ui.test.ts` | 4 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-find.test.ts` | 12 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-grant-ui.test.ts` | 2 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-history-panel.test.ts` | 4 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-history-renderer.test.ts` | 3 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-history.test.ts` | 9 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-integration.test.ts` | 8 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-notification-gateway.test.ts` | 5 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-notification-phone.test.ts` | 5 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-notification-ui.test.ts` | 6 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-notifications.test.ts` | 14 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-tool-gateway.test.ts` | 14 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-write-stdin-panel.test.ts` | 2 | Venice基盤・権限・ツール・履歴・通知 |
| `test/venice-write-stdin.test.ts` | 13 | Venice基盤・権限・ツール・履歴・通知 |

## 共有ファイル内のフォーク専用3件

- `test/ipc.test.ts`（252 → 250）: `restricts every Venice approval IPC to the app main frame` と `refuses the Venice debug grant outside development, in packages, and from foreign senders or frames`。
- `test/renderer-i18n.test.ts`（84 → 83）: lost-opening通知の `it.each` はフォークが英語を含む13言語、上流は翻訳カタログのある12言語。英語パラメーター1件の差。上流では元の翻訳必須assertを維持している。

## 上流mainから追加された26件

| ファイル | フォーク | 上流候補 | 増分 |
| --- | ---: | ---: | ---: |
| `test/age.test.ts` | 5 | 6 | +1 |
| `test/bridge-turn-rotation.test.ts` | 29 | 30 | +1 |
| `test/content-script.test.ts` | 1093 | 1095 | +2 |
| `test/exec-completed-results.test.ts` | 5 | 6 | +1 |
| `test/extension.test.ts` | 393 | 394 | +1 |
| `test/fsops.test.ts` | 40 | 41 | +1 |
| `test/kernel-rotation-hold.test.ts` | 2 | 4 | +2 |
| `test/plugins-installer.test.ts` | 16 | 20 | +4 |
| `test/worker-archive.test.ts` | 20 | 33 | +13 |

## 削除・改名・統合と、前回の失敗3件

同じ上流ブランチの元HEAD `906666f2` から候補 `4f3e6b5e` への変更で、削除・改名・統合されたテストファイルは **0本**。
`git diff --name-status --find-renames 906666f2 4f3e6b5e -- test` にD/Rはなく、上記25ファイルはいずれも元の上流HEADにも存在しない。
`test/main-texts.test.ts` と `test/renderer-i18n-source.test.ts` は最新上流mainと同一内容へ戻している。

前回失敗したrenderer-timeline.part1の2件とsession-list-refreshの1件は、ファイルのケース数がそれぞれ111件・34件のまま上流実行で成功している。失敗3件を削って0 failedにしたものではない。

フォークの別経路で実行されたCJS 100件と、ElectronのCJS画面確認は、上記Vitest件数にどちらも含めない。

## 根拠

- フォーク全体: `outputs/venice-notification-full-test.log`
- 上流の規定2回のVitest: `outputs/pr-preflight/verify.log`
- ファイル別集計: `outputs/pr-preflight/test-counts.raw.json`
- Gitの追跡ファイル一覧: `git ls-tree -r --name-only <HEAD> -- test`

ログとJSONはGit除外、表と比較条件はこの文書へ固定する。


## harness修復後の最終候補（同じ上流ブランチ内）

`d4c0500b`では成果物ゲートの自己検証 `test/app-display-proof.test.ts` を15件追加した。
規定の全体verifyは12,810成功／0失敗／218 skip、532ファイル（512成功／0失敗／20 skip）。
`12,795 ＋ 15 ＝ 12,810`。歴史的な166件の比較とは分け、追加の収支も説明不能0件とする。
根拠は `outputs/pr-preflight/verify-repaired.log`。


## フォーク再実行の結果

同じフォークのアプリ／テストコードで全体を1回再実行し、12,958成功／3失敗／218 skip、556ファイル（533成功／3失敗／20 skip）。
ケース総数13,179は元のフォーク実行と同じ。ただし今回の失敗はrenderer-state.part1、renderer-timeline.part1、renderer-timeline.part4で、元の失敗集合とは異なる。
CJS6ファイル100件は成功、Vitestとは別計上。根拠は `outputs/pr-preflight/fork-recheck.log`。
テスト赤の停止条件によりpush・PR提出はしない。上流の12,810成功は、フォークが緑であることの代わりにはならない。


## 停止解除後、runner上限を修正した全体実行

3ファイルを単独実行して71＋111＋77＝259件成功を確認し、フォークのrunner既定を最大4 workerへ制限した。
テスト・assert・timeout・retry設定は変更せず、plain npm testで12,961成功／0失敗／218 skip、556ファイル（536成功／0失敗／20 skip）。
総数13,179は不変で、前回の失敗3件が成功へ移った収支は `12,958 ＋ 3 ＝ 12,961`。
CJS6ファイル100件も成功、Vitestとは別計上。根拠は `outputs/pr-preflight/fork-bounded-workers.log`。
