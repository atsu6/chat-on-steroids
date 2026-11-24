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

追加の読み取り確認では、scope `https://venice.ai/` のSW登録が1件あり、controllerは
`pwa-install-sw.js` / `activated` だった。登録の存在だけでヘッダ付与の有無は判断できない。
認証・attestationを再現して拒否を回避する調査や追加送信は行わず、停止状態を維持する。
詳細は `docs/venice-findings.md` の「追加送信なしのリソース・Service Worker登録確認」を参照する。

## 確認資料
[Venice Pricing](https://venice.ai/pricing)（確認 2026-11-23）では、Pro に
テキスト無制限と月100クレジット（$1相当）を記載している。
クレジット消費対象のプレミアムテキストモデルは別扱いで、API はモデル別従量課金。
初回偵察は手動送信の記録に限定した。その後の単発sender検証は上記403で停止しており、
自動ループや認証ヘッダを補う処理は実装していない。

## 2026-11-23 追記

### 実測したこと

- 実UIで2ターン送信した通信は `POST /api/inference/chat/agents/venice`、HTTP 200 だった。
  根拠: `venice-capture-2026-11-23T13-15-07-891Z.json` の record #2 / #3。
- 同じリクエストを fetch で再現した単発送信は HTTP 403 だった。
  根拠: `venice-capture-2026-11-23T13-27-41-319Z.json` の record #1。
  当時の警告本文と再送停止は上記の記録どおり。403の原因は未確認で、今回調査しない。

### 現行の送信方式

`__cosVeniceSend.sendViaUi(text)` が `form textarea[aria-label="チャットメッセージ入力"]` に
native value setterで文字列を入れ、bubbling `input` の後、requestAnimationFrameを2回と50ms待つ。
入力値が空なら停止する。続けて `form [aria-label="メッセージを送信"]` を
100ms間隔・最大3000msで確認し、出現かつdisabledでなくなったらクリックする。
期限内に有効にならなければEnterの `keydown` / `keypress` / `keyup` を送る。
キーイベントは `composed: true` / `isComposing: false`。
private endpointへのfetch再現は使わない。
既存 `sendTurn` は「403 のため未使用」として残す。

記録中でなければ記録を開始し、呼び出し時の `chatProgress().lastChatNumber` を基準に、
初回送信トリガ後から500ms間隔、最大90秒で新しいチャット応答本文の読み取り完了を待つ。
送信から2秒経ってもrecord番号が基準値のままの場合、Enterで1回だけnudgeする。
`follow(cb)` はPOSTのチャットSSEを到着ごとの生テキスト差分とrecord番号で通知し、
senderは同じrecordの差分を連結して `venice-sse.js` で解析する。
`response.completed` で正常終了した応答のtextを返す。タイムアウトは基準値と最終進捗に加え、
入力値の文字数・ボタンの有無・disabled状態を含む例外にする。入力本文は診断に含めない。

### 未確認のこと

- UI操作を関数から行うことの許可の可否と、§12(d)の解釈。
- fetch再現の403の原因、attestationと認証ヘッダの要否。
- 今回修正したsenderによる実UI送信の成立と、実アカウントでの応答取得。

今回の検証は合成DOM・合成通信・仮想時計のみ。実送信は行わない。

## 2026-11-24: attestation輸送の追加要求と保留

ユーザーから、旧停止判断を上書きし、attestation付きfetchを優先する追加輸送を採用する要求を受けた。
参考の[PROTOCOL.md §1・§2](https://github.com/CanArslanDev/opencode-venice-web/blob/main/docs/PROTOCOL.md)は確認した。
同文書の稼働報告は、Veniceによる自動アクセスの許可を示す資料ではない。

プログラム利用を拒否した403に対して、認証・attestationを再現して通す輸送と、
401/403後の別経路への自動再送は保留。実装・実送信は行っていない。
送信方式と独立したNUL除去と応答形式の1回再試行のみ`1ee5c67a`で追加した。
現状と送信しない確認方法は`docs/venice-attestation-status.md`を参照する。
