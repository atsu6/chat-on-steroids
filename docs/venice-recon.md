# Venice の手動通信偵察

手動で2ターン送信し、伏字済みの通信記録を
`/Users/atsu/chat-on-venice/fixtures/` に保存する。
送信やモデル選択を自動化するコードは今回含めていない。

## 人間が行う手順

1. `docs/adr/0001-venice-web-transport.md` を読む。
2. Chrome の設定 → ダウンロードで「ダウンロード前に各ファイルの保存場所を確認する」を有効にする。
   記録スクリプトは任意のローカルパスへ直接書けないため、最後の保存ダイアログで保存先を指定する。
3. `chrome://extensions` を開き、デベロッパーモードを有効にする。
   「パッケージ化されていない拡張機能を読み込む」で
   `/Users/atsu/chat-on-venice/extension` を選ぶ。
   同じフォルダを既に読み込み済みなら、その拡張機能の再読み込みを押す。
   拡張一覧のバージョンが **2.1.54** であることを確認する。
   同期前の拡張を別のフォルダから読み込んでいる場合は、今回の `extension/` に切り替える。
   Chat On Steroids 本体の起動・ペアリングは今回不要。
4. **自分で** `https://venice.ai/` にログインする。ログイン後にそのタブを再読み込みする。
   ログイン操作、パスワード変更、決済操作は記録しない。
5. このセッション用の新規チャットを1つ開く。他の Venice タブでは記録を開始しない。
   テキスト無制限対象のモデルを画面上で選び、画面の表示名をメモする。
   クレジット消費対象のプレミアムモデルを選ばない。
6. DevTools の Console を開く。実行コンテキストは Venice のトップページ文脈（`top`）にする。
   次を実行し、`installed: true`、`recording: false` を確認する。

   ```js
   window.__cosVeniceRecon.status()
   ```

   `undefined` の場合は拡張の再読み込み、サイトへのアクセス許可、Venice タブの再読み込みを確認する。
   本記録はページ内 `fetch` のみを対象とする。
7. ページが落ち着いたら、Console で次を実行する。**ここから記録が始まる。**

   ```js
   window.__cosVeniceRecon.start()
   ```

8. Venice の入力欄に、個人情報を含まないテスト文
   `この通信テストでは「青い傘」とだけ答えてください。` を**人間が入力して送信**する。
   応答が終わるまで待つ。Console やスクリプトから送信しない。
9. 応答終了後1〜2秒待ち、同じチャット・同じモデルで
   `直前に指定した物をもう一度答えてください。` を手動送信し、応答終了まで待つ。
   2ターンを比較し、リクエストに履歴が含まれるか確認する材料にする。
   429 が出た場合は追加送信せず、画面や `Retry-After` に従って待つ。
   自動リトライはしない。警告が出た場合は送信を止める。
10. Console で `window.__cosVeniceRecon.status()` を確認する。
    `requests` は記録候補の件数で、チャット送信数とは限らない。
    `window.__cosVeniceRecon.progress()` では本文を出さずに
    `{ recording, requests, lastNumber, lastBodyComplete, lastStatus }` を確認できる。
    記録がなければ `lastNumber: 0`、`lastBodyComplete: false`、`lastStatus: null`。
    `lastBodyComplete: true` は最後の複製本文が最後まで読めたことを示し、HTTP成功とは別なので
    `lastStatus` も確認する。`readingBodies: 0` なら現在の全複製ストリームの読み取りは終わっている。
    2回目を待つ場合は送信直前より `lastNumber` が増えたことも確認し、1回目の完了を使い回さない。
    続いたままなら少し待ち、それでも終わらない場合は次の保存で部分記録として残す。
11. 次を実行する。記録を停止し、JSON のブラウザダウンロードを開始する。

    ```js
    window.__cosVeniceRecon.save()
    ```

    保存ダイアログで **`/Users/atsu/chat-on-venice/fixtures/`** を選び、
    提案された `venice-capture-日時.json` の名前のまま保存する。
    戻り値はダウンロード開始の通知であり、ファイルの保存完了を示すものではない。
    ダイアログが出ず Downloads に保存された場合は、そのファイルだけを上記フォルダへ移動する。
12. 保存された JSON をローカルのエディタで確認する。
    `records[].request` の URL・method・headers・body.text と、
    `records[].response` の status・headers・body.text を見る。
    Authorization / Cookie の観測できた値が `[REDACTED]` になっていることを確認し、
    その他の個人情報・認証情報が残っていないか確認する。生の HAR や Cookie 値は添付しない。
13. Cookie 認証の有無は、この JSON だけで確定しない。
    必要なら DevTools の Network で**自分の送信**の Request Headers / Cookies を確認し、
    Cookie / Authorization の**有無とヘッダ名だけ**メモする。値はコピーしない。
14. `docs/venice-findings.md` に「分かったこと / 不明なこと / 次に確認したいこと」を追記する。
    選択したモデルの表示名と、根拠になる記録のファイル名・`number` を記載する。
    該当通信が見つからなければそのまま「不明」とし、推測でエンドポイントやモデルIDを埋めない。
    実測 JSON は Git 除外対象。コミット・push はしない。
15. 記録は停止済み。保存せず止めたい場合は `window.__cosVeniceRecon.stop()` を使う。
    ページを再読み込みすると記録は消える。必要な保存を終えてから再読み込みする。

## 知りたい項目

- 送信先エンドポイントとメソッド: （空欄・不明）
- 履歴がサーバ保持かクライアント送信か: （空欄・不明）
- モデルIDの決定箇所: （空欄・不明）
- 認証が Cookie かヘッダか: （空欄・不明）
- SSE のチャンク形式: （空欄・不明）

## 記録の範囲と読み方

- `venice-recon.js` と `usage.js` を manifest の `world: "MAIN"` / `document_start` で注入する。
  `usage.js` は Venice ホストだけを新しい生トレースへ振り分ける。ChatGPT の既存処理は変更しない。
  upstream 2.1.54 では `app-palette.js` が追加され、ChatGPT 用の ISOLATED / document_idle 登録に含まれる。
  これは拡張の色を CSS に反映するスクリプトで、ページ JS の注入ヘルパーではない。
  Venice の fetch 観測は引き続き `usage.js` と同じ manifest 登録の MAIN / document_start を使い、
  `app-palette.js` は Venice へ読み込まない。
- Venice ページから `venice.ai` とそのサブドメインへ向かう `fetch` の書き込みメソッド、
  および実際に `text/event-stream` が返った GET を対象にする。
  エンドポイント名は決め打ちしない。リクエストは元の `fetch` へ1回だけ渡し、元の Promise を返す。
- レスポンスは複製を UTF-8 の生テキストとして記録する。JSON / SSE の意味パースはしない。
  `body.text` に連結テキスト、`body.chunks` に複製リーダーが受け取ったバイト数と時刻を残す。
  これはネットワークパケット境界や SSE イベント境界とは限らない。
- 最大8リクエスト、各 request / response body は最大1 MiB・2048チャンク。
  `limitReached`、`complete`、`limitation` を見て完全・部分記録を区別する。
  `response: null` は保存までにレスポンス未観測、`networkError` は観測上の失敗コード。
- 文字列・URLSearchParams の送信本文、および `Request` の複製本文を記録する。
  `init.body` が FormData・Blob・バイナリ・ReadableStream などの場合は読み取らず、
  `non-text-init-body-not-read` を残す。未知の本文を推測で復元しない。
- Authorization / Cookie / session / token などのヘッダ値、機密名のクエリ値、
  JSON風の機密文字列フィールドと既知の認証値の本文へのエコーを保存前に伏字にする。
  本文やファイル名に任意形式で埋め込まれた秘密を網羅するものではないため、共有前の目視確認は必要。
- ブラウザが自動付与した Cookie（HttpOnly を含む）と Set-Cookie はページの fetch から見えない。
  Cookie 権限や `document.cookie` による読み取りは追加しない。ヘッダが記録にないことは認証不使用の証拠ではない。
- XMLHttpRequest / WebSocket / EventSource、Venice 以外のホストは今回のトレース対象外。
  送信が記録されない場合は、まず Network で実際の transport / host を確認する。

## ローカルの確認コマンド

依存追加なしで合成通信の透過性・伏字・制限・ホスト分岐を確認する。

```sh
cd /Users/atsu/chat-on-venice
node --check extension/venice-recon.js
node --check extension/usage.js
node --test docs/venice-recon.test.cjs
```

実際の Venice への送信・保存の確認は、上記の人間の手順で行う。
