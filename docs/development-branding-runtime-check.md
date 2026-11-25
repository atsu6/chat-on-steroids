# 実Electronのdev表示名：前提と実行コマンド

正は `outputs/dev-name-state-verification/electron-title.cjs`。

## 前提

- 対象はフォークのdev実行。実行ディレクトリは対象checkoutのリポジトリルート（通常は`/Users/atsu/chat-on-venice`、worktreeならそのルート）。
- Node 22.23.5／Volta、lockfileの依存関係、ローカルElectron 44.3.0（`./node_modules/.bin/electron`）が必要。未導入なら`volta run --node 22.23.5 npm ci`で準備する。
- `volta run --node 22.23.5 npm run build`が成功し、`out/preload/index.js`と`out/renderer/index.html`があること。
- 正のharnessファイルが同じcheckoutの上記パスに存在すること。`outputs/`はGit対象外で、buildもこのharnessを生成しない。別checkoutでは検証済みの正ファイルを別途用意する必要がある。
- macOSのGUIセッションで実行する。通常のCoSや開発アプリを再起動する必要はない。

## 実行

リポジトリルートへ移動してから、次を実行する。

```sh
if [ ! -f outputs/dev-name-state-verification/electron-title.cjs ]; then
  printf '%s\n' 'Missing canonical harness: outputs/dev-name-state-verification/electron-title.cjs' >&2
  exit 1
fi
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron outputs/dev-name-state-verification/electron-title.cjs
```

## 確認する3面と成功条件

- nativeウィンドウタイトル（nativeWindowTitle）
- rendererのdocument.title（rendererTitle）
- 可視ヘッダ（header）

3面とも期待文字列は`Chat On Venice (dev)`。errorsが空配列、終了コード0で成功とする。合成結果は実mainモジュールから取得し、基底名はdev接尾辞なし、developmentはtrue、isPackagedはfalseになる。

userDataと合成stateは`outputs/dev-name-state-verification/electron-runtime`へ隔離し、外部HTTP(S)を遮断する。成功時は同じ出力先に`electron-title.json`と`electron-title.png`を保存し、約20秒後に検証用ウィンドウだけが閉じる。

これは手動確認であり、npm test／CIの自動収集対象ではない。この文書は前提と実行コマンドの記録で、Git checkoutだけからharnessを復元する手順ではない。

53df4580から作った新規worktree `/tmp/runtime-check` に本書の実行ブロックを適用すると、正ファイルがなく終了コード1で停止した。3面確認は未実行で、確認後にworktreeを削除した。
