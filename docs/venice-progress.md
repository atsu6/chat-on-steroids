# Venice 移植キュー

0〜4は完了。次は **5: write_stdin**。5以降は未着手。

| 状態（番号・項目） | 根拠commit | 残作業 |
| --- | --- | --- |
| 0. recon / 送信 / SSE — 完了 | `f03f7792`, `5ecd2d67` | なし |
| 1. agent契約とDOMツール — 完了 | `f9572fcd`, `72616f62`, `2e1a37ba` | なし |
| 2. Electron read E2E — 完了 | `26188ebf`, `d2e9c4c6` | なし |
| 3. apply_patch — 完了 | `c3137481`, `063e6cb9` | なし（全体 516 passed / 0 failed） |
| 4. exec_command — 完了 | `eba8035a`, `969752ce`, `ab7dd7a8`, `0c3fb4fd` | なし（追加20件成功。全体の失敗と切り分けは下記） |
| 5. write_stdin — 未着手 | — | run所有権を使うstdin/poll接続。write_stdin の前に 2.1.55 が出ていればマージと i18n 判断を先に行う |
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


## 4の検証状況

- shellを独立した既定OFFのgrantに追加。read / writeだけではexecを許可しない。
  指定の警告文を既存の承認UI・全12アプリカタログへ登録し、拡張の出力ラベルも全13カタログへ登録した。
- 既存exec handler / command policy / UnifiedExecProcessManagerを使用。
  grant内cwd、run所有、同時3本、revoke / Stop / app終了のプロセスツリーkill、64KiB先頭保持、
  stdout / stderr分離、既定10秒・最大30秒のyield、同一callId再取得を実装した。
  実行中の出力観測にも既存secrets shieldと出力上限を適用する。
- 追加20テストは全て成功。最終の対象実行は **103成功 / 0失敗**
  （追加20件と既存renderer-i18nの83件）。既存gateway / patch / secrets-shieldの関連実行も成功。
- 全体 `npm test` は指定どおり1回実行し、**517 passed / 2 failed / 20 skipped**（ファイル）、
  **12,794 passed / 3 failed / 218 skipped**（テスト）だった。
  - ドイツ語の敬称1件は単独でも再現。今回追加した文言を既存のdu表記へ修正し、該当83件が全て成功した。
  - execのshield / 上限の2件は該当ファイル単独で再現せず、15件全て成功。
    全体実行中にその実装を補修したため、変換キャッシュ/読込時点の影響の可能性もあるが原因は未特定。
    非再現失敗として記録し、全体テストは重ねて実行していない。全体0 failedとは記録しない。
- `npm run typecheck` / `npm run build`は成功。headless Chromeで指定の日本語警告、独立チェック、
  日本語/ドイツ語、PC/モバイル、分離出力、改行、横スクロール、省略、yield後の観測、Stop、axeを確認した。
- 補助の既存CJS実行は68成功 / 2失敗。2件は直前HEAD `158d68c1` のソースでも再現した
  （初期localDocument通知と、core/readのスラッシュを許容しない既存CONTRACT検査）。既存テストは変更していない。
- 検証ログ・画像: `outputs/venice-exec/`。実Venice送信は未実施（指定どおり）。次は5のwrite_stdin。
