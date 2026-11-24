# Venice 移植キュー

0〜2は完了。今回は **3: apply_patch** のみを実装・検証する。4以降は未着手。

| 状態（番号・項目） | 根拠commit | 残作業 |
| --- | --- | --- |
| 0. recon / 送信 / SSE — 完了 | `f03f7792`, `5ecd2d67` | なし |
| 1. agent契約とDOMツール — 完了 | `f9572fcd`, `72616f62`, `2e1a37ba` | なし |
| 2. Electron read E2E — 完了 | `26188ebf`, `d2e9c4c6` | なし |
| 3. apply_patch — 進行中（今回） | — | writeの独立同意、gateway/kernel接続、適用前差分、追加テスト・合成画面・全体テスト・型チェック・build |
| 4. exec_command — 未着手 | — | 独立したshell同意と実行接続 |
| 5. write_stdin — 未着手 | — | 実行所有者とstdin/poll接続 |
| 6. find — 未着手 | — | 検索接続 |
| 7. 履歴UI — 未着手 | — | Venice履歴の表示・検証 |
| 8. 通知 — 未着手 | — | Venice通知の接続・検証 |
| 9. Desktop AX観測 — 未着手 | — | AX観測・所有者・権限の検証 |
| 10. Desktop画像 / vision — 未着手 | — | 画像添付とモデルの視覚入力の検証 |
| 11. 総回帰 — 未着手 | — | 全機能が揃った時点での総回帰 |

実送信の証拠と各段階の条件は `venice-findings.md` と `venice-integration-plan.md` を参照。
今回の3はユーザー指定に従って実Venice送信なしで検証する。shell・Desktopの権限は追加しない。
