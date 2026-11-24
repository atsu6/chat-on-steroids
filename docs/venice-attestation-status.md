# attestation輸送の状態

## 輸送本体は保留、入力整形と応答再試行は実装済み

2026-11-24の要求は、attestation付きfetchを優先し、認証失敗時にはUIへ自動再送する追加輸送。
参考の[PROTOCOL.md §1・§2](https://github.com/CanArslanDev/opencode-venice-web/blob/main/docs/PROTOCOL.md)は確認した。
同文書はreverse engineeringによる未公開エンドポイントの利用を説明している。
実運用の記述だけでは、Veniceがこの自動アクセスを許可しているとは判断できない。

ADR 0001には、プログラム利用を拒否する403と利用停止警告の記録がある。
その拒否を通すための認証・attestation再現、401/403後の別経路への自動再送は実装していない。
`venice-fetch.js`、追加のトークン取得経路、実fetchを2ターン送るConsole手順も未作成。

送信方式と独立した要求7・8は`1ee5c67a`で実装した。

- 既存の`buildTurn()`で指示とtool resultの文字列値に含まれるNULを半角空白へ置き換える。
  tool resultはJSON化する前に処理し、元のデータ、数値、真偽値、null、文字列としての`\\u0000`は変えない。
- tool / done以外の応答には「今すぐ実行してください。JSONのみで再出力してください。」を付けて1回だけ再試行する。
  元の指示と直前のtool resultを保持する。2回連続で形式が合わなければ終了する。
- 送信自体の例外は再試行しない。既存のStopとステップ上限を維持する。

## 実ページConsole：送信しない入力整形の確認

拡張が読み込まれたページのMAIN文脈で、次を実行する。

```js
const prompt = window.__cosVeniceAgent.buildTurn('確認\0指示', {
  ok: true,
  result: { text: 'left\0right', literal: '\\u0000' }
});
console.assert(!prompt.includes('\0'));
const previous = JSON.parse(prompt.split('前のツール結果: ')[1]);
console.assert(previous.result.text === 'left right');
console.assert(previous.result.literal === '\\u0000');
```

計画だけの再試行・打ち切りは、実送信の代わりに合成応答で確認できる。

```sh
cd /Users/atsu/chat-on-venice
volta run --node 22.23.5 npm test -- test/venice-agent-input.test.ts
```

## 検証

- 追加7件と既存パネル5件：12成功 / 0失敗。
- 既存agentのCJSテスト：15成功 / 0失敗。
- `npm run typecheck`：成功。
- ログ：`outputs/venice-agent-input/`。実Venice送信は行っていない。
