# Venice 移植キュー

0〜3は完了。今回の作業は **4: exec_command**。5以降は未着手。

| 状態（番号・項目） | 根拠commit | 残作業 |
| --- | --- | --- |
| 0. recon / 送信 / SSE — 完了 | `f03f7792`, `5ecd2d67` | なし |
| 1. agent契約とDOMツール — 完了 | `f9572fcd`, `72616f62`, `2e1a37ba` | なし |
| 2. Electron read E2E — 完了 | `26188ebf`, `d2e9c4c6` | なし |
| 3. apply_patch — 完了 | `c3137481`, `063e6cb9` | なし（全体 516 passed / 0 failed） |
| 4. exec_command — 進行中 | — | 独立したshell同意と実行接続 |
| 5. write_stdin — 未着手 | — | 実行所有者とstdin/poll接続 |
| 6. find — 未着手 | — | 検索接続 |
| 7. 履歴UI — 未着手 | — | Venice履歴の表示・検証 |
| 8. 通知 — 未着手 | — | Venice通知の接続・検証 |
| 9. Desktop AX観測 — 未着手 | — | AX観測・所有者・権限の検証 |
| 10. Desktop画像 / vision — 未着手 | — | 画像添付とモデルの視覚入力の検証 |
| 11. 総回帰 — 未着手 | — | 全機能が揃った時点での総回帰 |

実送信の証拠と各段階の条件は `venice-findings.md` と `venice-integration-plan.md` を参照。
3および今回の4はユーザー指定に従って実Venice送信なしで検証する。4は独立したshell同意を追加し、Desktopは追加しない。

## 3の検証状況

- writeの独立同意、root内のapply_patch、適用前unified diff、折り畳み、i18nを実装済み。
- 追加15テスト、既存関連テスト、headless画面確認、型チェック、buildは成功。
- 全体 `npm test` の再実行は **516 passed / 20 skipped / 0 failed**（ユーザー確認済み）。
- 初回の既存PTYテスト1件の失敗は、全体再実行と単独実行で再現せず、フレークと判断。
  `test/unified-exec-output-stream.test.ts` の単独実行も成功している（ユーザー確認済み）。
  テストとexec実装は変更していない。
- 3のapply_patchは完了。今回の4の着手前ベースライン。
