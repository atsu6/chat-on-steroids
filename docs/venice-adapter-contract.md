# Venice adapter boundary

- `sendTurn(messages, model)`
- `onChunk(cb)`
- `onDone(cb)`
- `setModel(id)`
- `isAlive()`

`sendTurn` のみ `extension/venice-send.js` に実装した。
実通信の検証は HTTP 403 とプログラム利用禁止の警告で停止中。HTTP 200 は未確認。
Venice ページの MAIN 文脈で読み込むと `window.__cosVeniceSend.sendTurn(messages, model)` が使える。
messages は fixture の `input.messages` と同じ配列形式、model はURLの `agentModelId` に入れる文字列。
戻り値は fetch の Promise で、元の Response をそのまま返す。401等のHTTPエラーもパース・再試行しない。
認証情報の生成・取得や認証ヘッダの追加は行わない。標準 Content-Type は `application/json`。

他の4つは境界の宣言のみ。コールバックのペイロード、完了判定、モデル選択の実装は（空欄・不明）。
