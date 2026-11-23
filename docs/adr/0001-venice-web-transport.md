# ADR 0001: Venice は Web UI 経由で駆動する

## 決定
Venice の Web UI をブラウザ拡張で駆動する。Venice API は使わない。

## 理由
Venice Pro のアプリ内テキスト無制限を使うため。API は完全従量課金で
プランに無制限枠はない（Pro の付帯クレジットは月 $1）。

## 規約
Venice ToS §12(d): "The web interface is for individual, interactive use only;
scripted, looped, or automated requests through the web interface are prohibited."
リスクは3点で下げる。1セッション1チャット、ターン間1〜2秒、429は待つ。

この3点は負荷を抑える運用方針であり、規約上の自動化の許可にはならない。
上の引用は依頼時の提示文。現行の [Venice ToS §12(d)](https://venice.ai/legal/tos)
（最終更新 2026-06-08、確認 2026-11-23）も Web UI の自動リクエストを禁止し、
アカウント停止・終了の可能性を明記している。

## 却下した代替案
Venice API 直叩き（課金が別）、UI-TARS-desktop（アーカイブ済み）、
Agent S（別プロダクトになり既存資産を捨てる）。

## 再検討条件
規約違反の警告が出たときのみ API 移行を検討する。実装中に蒸し返さない。

### 2026-11-23: 再検討条件が成立

fixture に基づく単発送信が HTTP 403 となり、レスポンスはプログラム利用の禁止と、
継続すると利用停止になることを明示した。根拠は
`fixtures/venice-capture-2026-11-23T13-27-41-319Z.json` の #1。
private endpoint の再送はここで停止した。API 移行は再検討対象になったが、まだ実施・承認していない。

## 確認資料
[Venice Pricing](https://venice.ai/pricing)（確認 2026-11-23）では、Pro に
テキスト無制限と月100クレジット（$1相当）を記載している。
クレジット消費対象のプレミアムテキストモデルは別扱いで、API はモデル別従量課金。
初回偵察は手動送信の記録に限定した。その後の単発sender検証は上記403で停止しており、
自動ループや認証ヘッダを補う処理は実装していない。
