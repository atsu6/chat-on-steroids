# Venice と Electron の接続計画

初回調査日: 2026-11-24。対象: `/Users/atsu/chat-on-venice`、調査時HEAD `ffa8acac`。
同日にA案を採用し、`6cc6823c` を基点にwire型・契約コメントと合成モデルテストを追加した。
現在は `/venice/tools` → host-admitted kernel → `core/read` の縦接続を実装し、Consoleで実測済み。
readの承認UIを実装し、パネルからのgrant要求・ネイティブフォルダ選択・許可・停止まで実測済み（§11）。
同日の先行E2Eでもモデル経由のreadが1回成功した
（`docs/venice-findings.md` の「モデル経由のcore/read E2E」参照）。
以下のパスはこのリポジトリを基準とし、既存ソースの行番号は初回調査時点のもの。

**採用案はA: ブラウザループを残し、ローカルツールだけElectronへRPCする。**
完成したブラウザ操作を保ち、既存のツール実装と権限・記録の境界を再利用する。
現在のbridgeはgrant付き `core/read` と `core/find`（§14）、独立したwrite同意を要する `core/apply_patch`（§12）、
独立したshell同意を要する `core/exec_command`（§13）を受ける。Desktopは公開しない。
`AGENTS.md` の「Electron 統合（A案）の範囲」が変更可能なファイルを定める。
初回のread接続は§10–11、apply_patch接続は§12、exec接続は§13、今回のfind接続は§14。以降のキューは `venice-progress.md` を参照する。

## 1. agent map の要約（8行）

1. Electronがローカルの作業場所・履歴・権限を所有し、モデル実行と会話UIはブラウザ側にある。
2. Core・Desktop・Pluginsは別のMCP surfaceで、拡張用bridgeはさらに別の通信路である。
3. 拡張は会話の観測とブラウザ操作を担当し、ローカルツールの実行結果はmain processが確定する。
4. ツールはregistrar → kernel → 実装を通り、実行時の権限・呼び出し元・workspaceを検証する。
5. ローカルsessionは永続的な作業IDであり、交換可能なproviderのconversation IDと区別する。
6. ファイルの承認root・端末プロセスの所有者・desktopのframe/refは各所有者で検証する。
7. 入力outbox・ブラウザcommand・ACK・記録は、それぞれの所有者と永続化順序を保って扱う。
8. Goal/Loop・worker・Compact & Resumeも既存の状態所有者を持ち、不明な宛先や曖昧な送信を再実行で埋めない。

資料は `docs/chat-on-steroids-agent-map.md`（保存版2.1.35）。現行規則は `AGENTS.md` §§1–22、
wireの事実は現行ソースを優先した。現行はapp 2.1.54 / bridge protocol 15
（`src/main/version.ts:15` と同ファイルの `BRIDGE_PROTOCOL`、`extension/background.js:59`）。
保存版のLinux Desktop非対応という記述は現行のopt-in Linux実装とは異なる。本書のnative調査はmacOSを対象にする。

## 2. 拡張とアプリの既存通信

### 2.1. 待ち受けポートとプロトコル

| 経路 | 現行実装・用途 |
| --- | --- |
| Browser bridge | `src/main/bridge.ts:3218` の `handle(req, res)`、`:6790` の `startBridge`、`:6841` の `prepareBridgeListener`。`127.0.0.1`限定のHTTP/JSON。Autoは8765–8769、次に18765–18769、38765–38769を順に試す。8765・8766・8767は機能別ポートではなく候補。設定の固定指定、`CLF_BRIDGE_PORTS`によるoverrideもある。 |
| DiscoveryとHTTP client | `src/shared/browser-bridge.ts` と `src/main/bridge-ports.ts` が候補を定義。`extension/background.js:32` に同じ探索リスト、`:1234` の `call(path, init = {}, retried = false)` が認証付きHTTPを送る。 |
| Wake socket | `src/main/browser-wake.ts:20` の `attachBrowserWake(...)`。bridgeと同じポートの `ws://127.0.0.1:<port>/wake`。`wake` / `browser-control` / `activity[:conversationId]` とheartbeat用 `ping` / `pong`。通知のみで、command本体・ツール実行・結果配信はHTTPのclaim/receiptが所有する。 |
| MCP | `src/main/mcp/server.ts:268` の `startMcpServer(...)`。別のloopback HTTP listener。通常OS割当ポート、保持済みポートの再利用指定も可能。`/mcp/{core,desktop,plugins}/<surface別secret>` でMCPを受ける。bridge tokenとは別の認証で、ブラウザ拡張用RPCではない。 |
| Local control API | `src/main/control-api.ts:154`付近。別のOS割当loopbackポート。opt-in、起動ごとのtoken。既存状態の参照と限定されたsend/cancel/stop用であり、汎用ファイル・shell実行の入口ではない。 |

**従来のVenice専用ブリッジは作業タブDOM用。現在のlocalTool分岐は§10の経路でElectronへ接続する。**

```text
Venice MAIN: venice-agent.js / runTask → executeTool → callVeniceBridge
  → window.postMessage(__cosVeniceBridge)
Venice ISOLATED: venice-bridge.js
  → chrome.runtime.sendMessage({type: 'cos-venice-bridge', id, op, args})
background.js: handleVeniceBridge(message, sender)
  → 作業タブへChrome APIでDOM操作
  ← {ok:true, result} または {ok:false, error}
```

`extension/background.js:5766`付近で送信元extension ID、top frame、Venice origin、
現在の脳タブURLを検証する。DOM用opは `ensureTab` / `eval` / `activate` / `close`。
local tool用に `localIdentity` / `setLocalRun` / `localTool` を追加した（§10）。
`venice-agent.js` のMAIN側はChrome APIもbridge tokenも持たない。

### 2.2. 認証・ペアリング

- `GET /hello` は未認証の識別用。`{app, version, bridge, compatible, paired, disconnected}` を返す。
- `POST /pair` は対応protocolを要求し、確認コードなしでloopback上の呼び出し元へtokenを発行する。
  `reuse:true` は現世代のtokenを再利用し、明示reconnectはtokenを更新できる。
  `randomBytes(32)` のbase64urlで、appは `secrets.ts` の暗号化保存、拡張は
  `chrome.storage.local` に `{port, token, disconnected}` を保存する。
- それ以外のHTTPは `Authorization: Bearer ...` と `x-extension-protocol: 15`。定時間比較、protocol一致、Origin検証を通る。
  `chrome-extension://` / `moz-extension://`、またはOriginなしを許可する。
  一般web origin・`Origin: null` は拒否する。extension IDの固定allowlistや本人確認コードではない。
- protocol不一致は426、認証拒否は401、過大bodyは413、rate limitは429。
  通常body上限2 MiB、rate limitは共有窓で60秒あたり900リクエスト。route固有の小さい上限もある。
- Disconnectは永続的な失効状態を持ち、自動再pairで解除しない。
  `/wake` は接続後5秒以内の最初のテキストframeをtokenとして認証する。URLにtokenは入れない。
- このpairingは**同一ユーザーのローカルプログラムもtokenを取得できる設計**である。
  ローカルツールの実行同意を意味しない。ファイル・shellを追加するなら、別途app側の明示的なrun許可が必要。

根拠: `bridge.ts:1748–1764, 1895–1901, 3218–3357`、
`background.js:454–455, 1139–1153, 1234–1286, 1341–1376`、`browser-wake.ts:109–169`。

### 2.3. 拡張から来るメッセージと応答

HTTPの成功bodyはrouteごとに異なり、一律の `{ok,result}` ではない。
`background.js::call` が受け手側で `{ok: response.ok, status, data}` に包む。
HTTPエラーは通常 `{error: '<code>', ...}`。下表は `bridge.ts::handle` のroute群。

content→backgroundの既存runtime messageは `background.js:4577` の `HANDLERS` が受ける。
例えば `events` → journal → `/events`、`correlate` → `/correlations`、
`desktop_input` → `/input/*`、`redeem/command_step/ack` → `/commands/*`。
`desktop_input` はapp composerの入力配送であり、native mouse/key実行ではない。
Veniceの `cos-venice-bridge` はこの表とは別の専用分岐である。

| 種類 / route | 拡張から送るもの → アプリが返すもの |
| --- | --- |
| `GET /hello`, `POST /pair` | 識別・protocol / reuse・reconnect → 上記識別情報 / `{token}`。 |
| `/status`（通常POST、GETも受理） | open/stalled conversation一覧、ブラウザ状態 → `{ok, conversations, inputs, stopTurns, commandIds, revivals, repairs, ...}`。command件数と一覧は実行許可そのものではない。 |
| `POST /events` | `{conversationId, events, agent?, agentCommandId?, ...}`。turn開始/終了、user/assistant本文、page tool、tool evidence、model選択、native画像、trace等 → 通常 `{sessionId, stored}`。補助観測のみなら `{ok:true, stored:0}`。 |
| `POST /correlations` | `{conversationId, calls, ...}` の正確なrequest証拠 → `{ok, conversationId, sessionId, requestIds, confirmed, conflicts, complete}`。ChatGPTのrequest-idと会話のjoinで、Veniceにはそのまま使えない。 |
| `/input/*`（POST） | `claim/bind/ack/fail/answer/progress/attachment/opening-unavailable`。入力UUID・ownerと必要な会話/文書情報、結果・添付chunk要求 → claimされた入力/添付データまたはroute固有の受付結果。outboxが権限と遷移を検証する。 |
| `/commands/*`（POST） | `redeem/step/ack/revivals/pending`。command ID、owner、document等のlease、実行step・receipt → 対応command/stepの許可や受付結果。command種別はworker/resume/revive/stop。 |
| `POST /browser-control` | `poll` / `claim` / `check` / `result` とbrowser ID、command ID、epoch等 → pending情報とpolicy / `{command}` / `{allowed}` / `{ok}`。これは**app→拡張のブラウザ操作RPC**を拡張が受領・報告する経路であり、逆向きのOSツールRPCではない。 |
| `/activity`, `POST /activity/detail` | conversation宛ての状態取得、明示的な1呼び出し詳細要求 → appが持つ作業状態・tool詳細。 |
| `POST /repairs/claim`, `/reveal/failed`, `/closed`, `/conversation-deleted`, `/page-note` | 正確な対象・repair token・失敗/閉鎖/ページ注記 → claim可否や受付結果。閉鎖観測と会話削除は別。 |
| `POST /models`, `/chatgpt-projects`, `/project-create`, `/plugin-refresh`, `/browser/preferences`, `/browser/web-chat-title` | アカウントcatalog、project作成、connector更新、設定、titleの観測・receipt → route固有の受付/次の状態。 |
| `POST /usage`, `/core-plugin`, `/image-export`, `/diagnostics`, `/extension/update` | 使用状況、connector存在、画像export、診断、更新準備 → 受付結果、または更新の `{ready, hold?, ...}`。 |
| `/compact`, `/goal/draft`, `/goal/ack`, `/goal/objective`, `/goal/open`（POST）、`/settings`（GET/POST） | compaction、Goal/Loop、限定設定の操作 → 各所有者の状態/受付結果。任意config変更APIではない。 |
| `POST /browser/presence`, `/cos-browser/sign-in`（GET/POST） | 外部browserの存在/ログイン観測、明示的なCoS browserログイン移送 → `{ok}`、transfer offer/受付。Veniceの認証を移送する経路ではない。 |

## 3. ファイル・shell・grepを実行する関数

### 3.1. 呼び出しの共通入口

```text
mcp/server.ts::startMcpServer → tools.ts::buildServer(ctx, surface, ...)
  → kernel.ts::createRegistrar(server, ctx, surface, ...)
  → tools-core.ts::registerCoreTools(reg) の匿名handler
  → kernel.ts::dispatch(...) → 実行時検証 → 下表の実装
```

`tools-core.ts` に汎用export `executeTool(name,args)` はない。
`SurfaceRegistrar.invokeNested(name: string, args: unknown, parent: CallContext): Promise<ToolResult>`
（`kernel.ts:1566,1596`）はcode-modeの既存child呼び出し用。
`tools.ts::buildServer` がlive configでregistrarを再構築してこれを使う。
新しい外部RPCへそのまま公開すると、親の呼び出し元証明やtop-levelの記録・結果配信条件が欠ける。

### 3.2. モデル向けhandlerと実行実体

`ToolResult = {content: (text | image)[], structuredContent?: Record<string,unknown>, isError?: boolean}`
（`kernel.ts:262–266`）。引数の細部は各 `toolDeclaration` / Zod schemaが正。
下表の型名は元ファイルの型を参照する。省略記号で新しい呼び出し規約を作らない。

| 操作 | 関数名・シグネチャ | 直接の呼び出し元 / 実体 |
| --- | --- | --- |
| 登録 | `registerCoreTools(reg: SurfaceRegistrar): void` (`tools-core.ts:265`) | `tools.ts::buildServer` とcode-mode child用registrar構築。 |
| 読む | 登録名 `read`、匿名 `async ({paths, start_line, end_line, max_bytes}) => Promise<ToolResult>` (`tools-core.ts:327`) | registrar → `readOne`。pathsの展開、capability、総量制限、部分失敗の扱いを所有。 |
| 1対象を読む | `readOne(requested: string, options: ReadOneOptions): Promise<{text:string; bytes:number; image?:{data:string; mimeType:string}}>` (`tools-core.ts:2413`) | `read` handler → `resolveIn` → `read-backend.ts::statInfo/listDirectoryLevel/readTextFile` または画像経路。private関数。 |
| テキスト読取 | `readTextFile(realPath: string, opts: {startLine?:number; endLine?:number; maxBytes?:number; fs?:ProjectFs} = {}): Promise<ReadTextResult>` (`codex/read-backend.ts:236`) | `readOne`、`project-files.ts:496,542`。`ProjectFs.readFileStream`で範囲付き・上限付き読取。 |
| 書く/作る | 登録名 `apply_patch`、匿名 `async ({patch}) => Promise<ToolResult>` (`tools-core.ts:729`) | registrar → `runParsedPatch`。create/edit/move/deleteを別々に判定。 |
| patch検証と記録 | `runParsedPatch(args: {patch:string; hunks:Hunk[]; workdir:string\|null; environmentId:string\|null}, roots: readonly Root[], base: {real:string; virtual:string}, caps?:Capabilities): Promise<ParsedPatchRun>` (`tools-core.ts:1903`) | `apply_patch` handler、`exec_command`の明示apply_patch intercept。path解決・検証・checkpoint・失敗時rollback・変更記録 → `executeApplyPatch`。 |
| patch実行 | `executeApplyPatch(options: {patch:string; cwd:string; updateFileMode?:ApplyPatchFileUpdateMode; resolvePath?:PatchPathResolver; fs?:ProjectFs}): Promise<ApplyPatchExecution>` (`codex/apply-patch/index.ts:479`) | `runParsedPatch` → `applyPatchWithMode(patch, updateFileMode, cwd, stdout, stderr, resolvePath, fs)` (`:185`) → `ProjectFs.writeFile/remove/createDirectory`。 |
| shell | 登録名 `exec_command`、匿名 `async (input) => Promise<ToolResult>` (`tools-core.ts:807`付近) | `cmd`または`cmds`の片方、`workdir`, `tty`, `yield_time_ms`, `max_output_tokens`, `shell`, `login`。cwd、command policy、shell/rg正規化、プロセス所有者 → manager。 |
| プロセス開始 | `UnifiedExecProcessManager.execCommand(request: ExecCommandRequest): Promise<ExecCommandToolOutput>` (`codex/unified-exec.ts:816`) | `tools-core.ts:997` の `unifiedExecManager.execCommand` → `UnifiedExecProcess.spawn(params: SpawnParams): Promise<UnifiedExecProcess>` (`:335`) → PTYまたはchild process。singletonは `codex/manager.ts`。 |
| stdin/続きの取得 | 登録名 `write_stdin`、匿名 `async (input) => Promise<ToolResult>` → `UnifiedExecProcessManager.writeStdin(request: WriteStdinRequest): Promise<ExecCommandToolOutput>` (`tools-core.ts:1168`, `unified-exec.ts:934`) | `session_id`, `chars`, `yield_time_ms`, `max_output_tokens`。handlerで所有者/現在workspaceを検証してから送る。数字のprocess IDだけでは権限にならない。 |
| 検索 | 登録名 `find`、匿名 `async ({query,path,mode,include,exclude,case_sensitive,regex,max_results}) => Promise<ToolResult>` (`tools-core.ts:607`付近) | commandが無効でsearchが有効な場合に公開。`mode:'content'`がgrep相当。folder → `search`、file → `searchOneFile`。 |
| folder検索 | `search(req: SearchRequest): Promise<SearchOutcome>` (`search.ts:357`) | `find` handler (`tools-core.ts:691`)。ローカルcontent検索はbundled ripgrep優先、利用可能な条件でbounded JS walkへ。regexにはrgが必要。 |
| file検索 | `searchOneFile(realPath:string, virtualPath:string, req: Pick<SearchRequest,'query'\|'mode'\|'include'\|'caseSensitive'\|'regex'\|'maxResults'\|'deadline'\|'server'>): Promise<SearchOutcome>` (`search.ts:491`) | `find` handler (`tools-core.ts:625`)。サイズ上限とinclude判定後に検索。 |
| ローカルFS最下層 | `readFile(path:string, maxBytes:number = MAX_READ_FILE_BYTES): Promise<Buffer>`、`readFileStream(path:string): AsyncGenerator<Buffer,void,undefined>`、`writeFile(path:string, contents:Buffer\|string): Promise<void>` (`codex/filesystem.ts:179,215,252`) | `remote/project-fs.ts::localFs` → read-backend / patch runtime。権限検証済みの上位から使うprimitiveで、外部RPCへ直接公開しない。 |

補足:

- commandが有効な通常構成では独立した `grep` toolはなく、`exec_command`でbundled `rg`を使う。
  `ripgrep.ts::locateRipgrep` と `tools-core.ts` のnormalizer/binderを再利用する。
- `fsops.ts` の `replaceTextFile(realPath, content)` / `appendTextFile(realPath, content)` /
  `editTextFile(realPath, edits)` / `editTextFiles(files)` は存在するが、現行Coreの書込handlerはそれらを呼んでいない。
  `exec.ts` の `runPowerShell(script,cwd,timeoutMs)` / `runCommand(command,args,cwd,timeoutMs,env?)` も
  現行 `exec_command` の起動経路ではない。古いhelper名を新しいgatewayの入口にしない。
- `exec_command` の `max_output_tokens` はschema上受理するが、このhandlerは固定上限を使う。
  RPCで実効値の意味を変更しない。textとstructuredContent、実exit code、benign exit、process/session情報を保つ。
- file sandboxはファイルツールの制限。**shellはログインユーザー権限の任意コードで、承認root内にOS隔離されない。**
  shell権限を単なる「承認フォルダ内の操作」と説明して許可を取ってはいけない。

## 4. native Desktopの入口

macOSの公開toolは `mcp/tools-desktop.ts::registerDesktopTools(reg)` →
`guardDesktopTools(reg)` → `tools-desktop-macos.ts::registerMacOSDesktopTools(reg)`。
`observe`（`:185`付近）と `computer`（`:388`付近）が入口で、screen/control/clipboardを個別に検証する。
`mcp/desktop-caller.ts::desktopCallerRefusal` は既定で既知のsession/conversationを要求する。
Veniceのために `desktopUnattributed` を有効にして回避しない。

```text
observe / computer
  → computer/index.ts::screenshot / getWindowState / act / actAndCapture
  → exclusiveな取得/操作 → runHelper → sendHelperRequest
  → packaged macOS: sendMacOSAddonRequest → Electron Worker
  → addon.initialize(library) / addon.handle(JSON.stringify(request))
  → native/macos-desktop-addon/addon.cc::Initialize / Handle
  → Swift dylib: cos_desktop_handle_json → response(for:) → handle(_:)
```

`MACOS_ADDON_WORKER_SOURCE` は `computer/index.ts:592` に埋め込まれている。
別のworkerファイルではない。開発用などの別経路は、同じSwift実装をstandalone helperとして使い、
stdin/stdoutの1行JSONで通信する。native helperに8765付近のTCP listenerはない。

| 目的 | JS入口 | nativeの入口・実行関数 |
| --- | --- | --- |
| screenshot | `screenshot(opts:{window?:number;full?:boolean;maxWidth?:number;crop?:Rect}): Promise<Screenshot>` (`computer/index.ts:1221`)。`observe`やcapture付き操作から呼ぶ。 | Swift `handle(_ request:JSONObject) throws -> JSONObject` (`main.swift:1587`) の `op:'capture'` / `'snapshot'` → `capture(_ request:JSONObject, forcedWindow:CGWindowID? = nil) throws -> JSONObject` (`:1493`)。ScreenCaptureKit。 |
| click | `act(actions:Action[], opts:{frameId?:number;window?:number;ownerWindow?:number;app?:string;ownerApp?:string} = {}): Promise<ActionResult>` (`computer/index.ts:1428`)。結果capture/verify付きなら `actAndCapture` (`:1444`)。 | `op:'act'`, action `'click'/'double_click'` → `click(_ point:CGPoint, button:CGMouseButton, count:Int, targetWindow:CGWindowID? = nil) throws` (`main.swift:815`)。ref操作は `actUI` / AX経路。 |
| key/text | 同じ `act` / `actAndCapture` に `{type:'keypress',keys:string[]}` / `{type:'type',text:string}`。 | `op:'act'` → `pressKeys(_ names:[String], targetWindow:CGWindowID? = nil) throws` (`:1022`) / `typeText(_ text:String, targetWindow:CGWindowID? = nil) throws` (`:1081`)。CGEvent、対象focusを再検証。 |

C ABIは `main.swift:1779–1795` の `cos_desktop_handle_json` / `cos_desktop_free_json`。
N-API exportは `addon.cc:85–91` の `initialize` / `handle`。
nativeの成功は `{ok:true,...}`、失敗は `{ok:false,error_code,message,...}`。
部分実行したbatchはcompleted/failed index等の証拠を上位で保持する。
frame ID・AX ref・window geometry・helper generationの検証と、パッケージアプリ自身の
Screen Recording / Accessibility権限を保つ。新しいnativeコードは不要という設計見込みである。

## 5. A/B共通で必要な接続契約

以下は**ローカルツールを使うrunの提案**。現行route・型・実装と混同しない。
runTaskのブラウザ専用の直接利用は従来どおり。現在のパネルは今回の指定により、全実行でread grantを先に要求する（§11）。

1. **runの許可はappが所有する。** 既存Electron UIで、local session / project、Veniceの脳タブ、許可tool、
   データをVeniceへ渡す範囲をユーザーが確認する。MAINから来た `postMessage` は同じwebページも作れるため、
   origin検査とpairingだけでOS権限を与えない。bridge tokenはMAIN・モデル本文へ渡さない。
   runIdはMAINに保持する照会キーであり、単独では権限にならない。
   backgroundがChrome由来のtab/document IDを付け、appは許可時のbinding/epochと照合する。
2. **専用gatewayから既存handlerへ入る。** 例えば `/venice/tools` と専用wire型を追加する。
   clientはrun ID / call ID / surface / tool / argsを送り、app内の許可記録からcaller・session・cwdを決める。
   clientの自己申告session IDやモデル出力から `CallContext` を作らない。
3. **kernelの共有検証を正規に再利用する。** `createRegistrar` にhost-admitted top-level呼び出し口を設ける案とし、
   `call-context` / recorderのoriginにapp許可済みVenice runを区別して導入する。
   `invokeNested`へ偽のparentを渡すだけの接続はしない。schema、live capability、read-only、Block/Trust、workspace、
   shell policy、秘密のshield、記録・publicationを通す。ChatGPTの既存request証明方式はそのまま維持する。
4. **provider IDを偽造しない。** 現行 `bridge.ts:2401` のconversation parserはChatGPT向け。
   Veniceのchat ID形式は本調査で未確認。app発行のlocal session/runとprovider名、観測したopaqueなchat keyを分ける。
   `shared/session.ts` / store / recorderで既存ChatGPT sessionの既定値・復元契約を保ち、Veniceを記録する。
   Venice側の一意bindingが証明できないときは、runを開始しない。
5. **副作用を重複させない。** gatewayはcall IDを一度だけ受理し、同じ内容の再取得には同じ記録結果を返す。
   実行受付を副作用前に永続化し、完了結果は既存のcanonical tool記録を参照する。app再起動後に受付だけ残ったcallは
   成否不明として停止し、command/clickを自動再実行しない。別sessionからの結果・stdin取得は拒否する。
6. **返す形式と停止条件を保つ。** appはcall ID / state（pending/completed/unknown）と元の `ToolResult` を返す。
   HTTP受付成功と `isError:false` を区別する。長いshellは既存 `exec_command` のyield/sessionと `write_stdin` を使う。
   HTTPが先に期限に達したら同じcallを照会し、新規実行しない。現行MAIN bridgeの45秒deadlineを無限待ちにしない。
   Stop・脳タブ再読込/別chat遷移・disconnect・app終了はrunを失効させ、次のtool/turnを開始しない。
   実行済み副作用は戻さない。2026-11-24の第4段階の指定により、Veniceのshellはそのrunの生存プロセスをkillする（§13）。
   通常のChatGPT向けStopや、他runのプロセスには適用しない。
7. **画像をtextへ偽装しない。** 現行 `sendViaUi(text)` と `buildTurn` はtext専用であり、MCP image blockは渡せない。
   画像はapp/ISOLATEDでサイズを制限し、明示許可後にVenice UIの添付として送るmedia adapterを別途設計する。
   image blockはapp/ISOLATEDで扱い、MAINへはtext/structured情報と添付受付の参照を返す。
   base64をpromptのJSONへ埋め込まない。添付selector・UI受付の証拠・利用モデルのvision対応は未確認。
   AXのtext観測とローカルの画像previewまでは分けて検証できるが、それを画像を見たモデルのdesktop操作完了とは扱わない。

Core/desktopでsurface境界を維持し、初回公開のallowlistは `core/read` のみ。
その後に `apply_patch`, `exec_command`, `write_stdin`, 構成に応じた `find`、macOSの `observe` / `computer` を
段階的に追加する。任意IPC、Plugins、agents、Goal/Loopを一括公開しない。
新namespaceの対応確認を行い、未対応appなら明示的に停止する。現行ChatGPT protocol 15の意味を変更しない。

### 5.1. wire型と受付の状態遷移

`src/shared/venice-integration.ts` は主要wire型の下記3つと、承認UI用の `VeniceGrantPending` / `VeniceGrantReply` をexportする。実行時のvalidator・定数・関数は持たない。

| 型 | フィールド |
| --- | --- |
| `VeniceToolCallRequest` | `runId: string`, `callId: string`, `surface: 'core' \| 'desktop'`, `tool: string`, `args: Record<string, unknown>` |
| `VeniceToolCallResponse` | `callId: string`, `state: 'pending' \| 'completed' \| 'unknown'`, `result?: unknown`, `error?: string` |
| `VeniceRunGrant` | `runId: string`, `sessionId: string`, `tabId: number`, `documentId: string`, `tools: string[]`, `roots: string[]`, `write?: boolean` |

grantはappが同意後に発行・保存する記録であり、clientから受け取って権限を作るデータではない。
`tools` は `core/read` のようなsurface付きの名前を保存する。`roots` はファイルツールの承認rootで、
shellの隔離境界ではない。requestは本人証明やgrantを含まず、送信元のtab/documentを実際の拡張contextから別途検証する。
TypeScriptの型はwire入力を検証しないため、将来のgatewayには実行時のschema・許可照合が必要になる。

受付はcall IDを最初のrun / surface / tool / argsに結び付ける。最初のawaitより前に予約し、
同時に届いた同じ要求は同じ受付を待つ。引数または所有者を変えた同じcall IDは、既存記録を変えずに拒否する。

```text
未受付 → メモリ上でcall IDを予約 → 受付を永続化 → pending → 最大1回の実行
                                                         → 結果を永続化 → completed
                                        再起動等で成否不明 → unknown（自動再実行なし）
```

- `pending` は受付の永続化後だけ返す。受付の保存失敗では実行しない。
- `completed` は結果が確定・永続化した状態。tool自体の失敗や、受付後・実行前のrun失効による実行拒否も含む。
  `result` は元toolのcontent / structuredContent / isErrorを保ち、受付成功とtool成功を混同しない。
- `unknown` は未受付の拒否または受付後の成否不明。`error` で理由を区別し、自動再試行の根拠にしない。
  合成テストでは `RUN_REVOKED`, `RUN_NOT_AUTHORIZED`, `CALL_ID_CONFLICT`,
  `ACCEPTANCE_NOT_DURABLE`, `RESULT_NOT_DURABLE` という理由を使う。実HTTP error mappingは次段階。
- 同じcall IDの再取得は、現在のpending/completed/unknown記録を返すだけで、新規実行しない。
  run失効は新規受付を拒否する。受付の永続化待ちの後にも失効を再確認し、実行前なら止める。
  失効前の結果を再取得する場合も、元の所有者を独立して認証する。失効したrunをclientの要求で復活させない。

`test/venice-integration.test.ts` はこの遷移の実行可能な仕様である。
メモリ上の疑似journal、遅延できる保存応答、実行回数spyで契約を検証する。
このモデル自体はappのgatewayや実ディスクを検証しない。後続の実装テストとConsole実測は§10を参照。

## 6. A案とB案の比較

### 6.1. 同じ完成範囲で比べる

範囲は、既存ブラウザ操作の維持、appでのrun許可と記録、file読書き、shellと継続stdin、grep相当、
macOS screenshot/click/key、モデルへ画像を渡すUI transport、失効・重複防止まで。
依存追加、新アプリ、ChatGPTのGoal/worker/compactionをVeniceで全面再現する作業は含めない。

| 比較 | A: ループは拡張、local toolをRPC | B: ループはsrc、拡張はadapter |
| --- | --- | --- |
| 状態の所有者 | `venice-agent.js::runTask` がstep/stopを所有。appはrun許可・local toolとその結果のみを所有。 | 新しい `src/main/venice-runner.ts` がstep/stopを所有。拡張はsend/応答観測/ブラウザ操作を依頼どおり行う。 |
| 経路 | 既存MAIN → ISOLATED → background → 新gateway → registrar/kernel → 既存tool。browser toolは現状維持。 | app runner → provider adapter → bridgeのoffer/claim/result → background → Venice UI。model actionをappが解析してlocal toolを呼び、browser toolだけ拡張へ返す。 |
| コード変更ファイル数の基準見積り | **19ファイル**（新規含む）。下記共通候補のみ。 | **25ファイル**（共通19 + 追加6）。 |
| テスト・文書を含む基準見積り | test 6 + docs 2を加え **27ファイル**。 | test 8 + docs 2を加え **35ファイル**。 |
| 実行実体の再利用率 | 下記10実行moduleの **10/10 = 100%を改変せず利用する設計**。 | 同じ **10/10 = 100%**。loopを移すだけでは既存toolの再利用率は上がらない。 |
| Veniceの既存3機能単位の維持率 | loop、UI sender/SSE、作業タブDOM実行の **3/3**。RPC分岐は追加する。 | sender/SSE、DOM実行の **2/3**。loopは移設し、panelをapp状態の表示に変える。 |
| 壊れやすさ | 比較的小さい。ただしMAIN再読込でloop状態は失われ、appの許可・結果との照合が必要。切断後は停止し、勝手に復元しない。 | 比較的大きい。UI transportのclaim/receipt、outbox、stop、session開始・promptとloop所有者を同時に変更する。appにloopがあっても曖昧な送信を自動再送できるわけではない。 |
| 使い方 | 現行パネルを残し、local toolを使うrunだけapp側の許可を追加する。browser-only taskは従来どおりappなしでも動く。 | appを起点にし、パネルは進捗/停止adapterにする。基本構成はbrowser-onlyでもappが必要になる契約変更を伴い、B採用時の明示承認が必要。app不要の利用も維持する場合は、旧loop互換モードの追加設計と所有者の排他が必要。 |
| 実装順 | 共通契約 → textのreadだけ縦接続 → patch → shell/stdin/rg → DesktopのAX/画像添付 → 回帰検証。 | 共通契約 → 合成providerでrunner → browser send/receipt adapter → outbox/session/panelの接続 → local tool → Desktop/media → 既存loopの撤去と回帰検証。 |

**数え方と確度:** 実装前の候補ファイルに基づく基準値で、実測diffやLOC再利用率ではない。
添付UI・provider sessionの詳細と型依存で増減する。テストは6/8の直接対象ファイルを見込み、
追加の既存回帰test修正は別に増え得る。画像添付を後回しにして最初のtext縦接続を作っても、上の完成範囲は変えない。
Bの数にはapp不要の旧loop互換モードを含めていない。現行のapp不要という利用条件を保つ場合は追加見積りが必要。
初回見積りの26/34から、今回追加した契約モデルtestの1ファイル分を両案に加えた。コード候補19/25は変わらない。

共通19ファイルの候補:

1. `extension/venice-agent.js`, `venice-bridge.js`, `background.js`, `venice-panel.js`（4）: local RPC・sender証明・stop/失効。
2. `extension/venice-media.js`（新規）、`extension/manifest.json`（2）: 画像添付adapterの登録。具体的なUI実装は要確認。
3. `src/main/bridge.ts`, `src/main/venice-tool-gateway.ts`（新規）、`src/shared/venice-integration.ts`（新規）（3）: route・run許可/receipt・wire schema。
4. `src/main/mcp/kernel.ts`, `src/main/mcp/call-context.ts`, `src/main/session/recorder.ts`, `src/main/session/store.ts`, `src/shared/session.ts`（5）: 正規callerと記録のprovider境界。
5. `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/chat.ts`, `src/renderer/index.html`, `src/main/index.ts`（5）: 固定IPCのrun許可操作・UI・終了時の失効配線。

Bの追加6ファイル候補:

- `src/main/venice-runner.ts`、`src/main/venice-provider.ts`（新規2）: loopとbrowser往復の所有者。
- `src/main/session/input.ts`, `start-input.ts`, `prompt.ts`、`src/shared/input.ts`（4）: providerに応じた入力配送とprompt。
  `goal.ts` のChatGPT固有automationをそのままVenice loopへ転用しない。

共通の10実行module: `codex/read-backend.ts`, `codex/filesystem.ts`, `codex/apply-patch/`, `search.ts`,
`ripgrep.ts`, `codex/unified-exec.ts`, `codex/manager.ts`, `computer/index.ts`,
`native/macos-desktop-helper/main.swift`, `native/macos-desktop-addon/addon.cc`（先頭8つは `src/main/` 基準）。
permission/identity/recording層はこの「無改変再利用」の分母に含めていない。

直接対象testの見積りは、既存 `test/venice-agent.test.cjs`, `test/venice-bridge.test.cjs` と、
今回の `test/venice-integration.test.ts`、今後のgateway/session/mediaの3ファイル。Bはrunner/providerの2ファイルを追加する。
docs 2は本書と `docs/venice-findings.md`。

## 7. 採用A案の最初の3ステップ

1. **契約を固定する（今回）。** A案とAGENTS.mdの変更対象は承認済み。wire型・状態遷移・合成モデルtestと
   run同意の文言案を作る。最初の実接続はreadのみとし、Venice認証ヘッダやprivate endpointを調べ直さない。
2. **textのreadを1本つなぐ。** appで許可したsessionから、既存panel/loop → ISOLATED/background → gateway →
   live registrar/kernel → `read` → 元の `ToolResult` → 次の合成model turn、まで通す。
   未pair、許可なし、別tab/document/session、期限切れ、root外、read無効、再読込後の呼び出しを拒否する。
   browser-only taskがappなしでも継続して使えることも検証する。
3. **同じ入口でpatchとshell/stdin/rgへ広げる。** 一時的なテスト用workspaceで、書込後read、遅いcommandのyield/poll、
   別sessionのstdin拒否、途中の権限取消、受付後の通信断・同じcall ID再取得を検証する。
   その後、同じcaller経路でDesktopのAX観測・frame/ref付きclick/key・画像添付を実装し、実アプリで受け入れる。
   画像をモデルが実際に見られるまではDesktop全体を完了扱いにしない。

Bへ移る判断点は「脳タブ再読込をまたぐtask継続」や「appのoutboxをVenice操作の唯一の起点にする」が
実際に必要になった時。Aのgatewayとcaller契約はそのまま使い、loop所有者だけを後から移せる形にする。

## 8. 初回調査の証拠と残る確認

- 今回の証拠はソース読取。ポート値は設定/実装値で、稼働中listenerを実測したものではない。
- `pwd` と直近logは依頼どおり確認した。`ffa8acac`、`6d99720a`、`9ccfaecd`。
- 文書の参照先、主要関数の行番号、見積り集計、diffを確認した。実装test・build・native操作・実送信は未実施。
- `src/` の変更対象は現在AGENTS.mdのElectron統合節で承認済み。今回の契約作成に続く実接続はreadのみ。
  画像添付DOM、vision対応、Venice chatの一意bindingは未確認。
- private endpointの403原因、attestation/認証の要否、規約解釈、provider側の履歴保持、既知のContent-Type問題は
  未解明のまま引き継ぐ。ADRのprivate endpoint再送停止を維持し、今回の調査で送信再開は承認しない。

## 9. 契約定義段階の変更対象と承認UIの文言案

### 型・契約定義段階の4ファイル

| ファイル | 今回の内容 |
| --- | --- |
| `src/shared/venice-integration.ts`（新規） | 3つのwire型と受付・重複・失効の契約コメント。 |
| `test/venice-integration.test.ts`（新規） | 型の使用例と、テスト内だけの状態遷移モデル。疑似保存待ち中の重複、失効、保存失敗等。 |
| `docs/venice-integration-plan.md` | 採用状態、wire契約、対象ファイル、段階、文言案。 |
| `docs/venice-findings.md` | 分かったこと / 不明なこと / 次に確認したいこと、実際の検証結果。 |

次回のread接続で実装する候補は§6の19ファイルのうち、次の範囲である。今回の変更対象には含めない。

- 拡張: `extension/venice-agent.js`, `extension/venice-bridge.js`, `extension/background.js`（Venice分岐）, `extension/venice-panel.js`。
- 入口とwire: `src/main/bridge.ts`, `src/main/venice-tool-gateway.ts`（新規）, `src/shared/venice-integration.ts`。
- callerと記録: `src/main/mcp/kernel.ts`, `src/main/mcp/call-context.ts`, `src/main/session/recorder.ts`,
  `src/main/session/store.ts`, `src/shared/session.ts`。
- 許可と失効: `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/chat.ts`, `src/renderer/index.html`, `src/main/index.ts`。
- 画像用の `extension/venice-media.js` とその `extension/manifest.json` 登録は後段階。
  patch/shell/grep/Desktopも後段階とし、read接続のために先行して有効化しない。

### 初回のread許可

**見出し:** 「Veniceによるファイルの読み取りを許可しますか？」

**本文:** 「このrunでは、選択したフォルダー内のファイル内容を読み取り、Veniceへ送信できます。」

**表示する対象:** ローカルsession / project、承認フォルダーの実際の一覧、対象Veniceタブ、許可tool「ファイルの読み取り（core/read）」。
モデルやwebページが申告した値で表示内容を上書きせず、appの許可対象を表示する。

**ボタン:** 「このrunだけ許可」 / 「許可しない」。許可はrun単位とし、全体の権限設定を広げない。

### shellの独立した同意（第4段階で追加）

初回readの既定ではshellを許可しない。第4段階で、ファイル読取・書込とは別の未選択の項目を追加した。

**項目名:** 「コマンドの実行も許可する」

**説明:** 「あなたの権限でコマンドを実行できます。選択したフォルダー内に隔離されず、その外のファイルやネットワークにもアクセスできます。」

既存のコマンド許可ルールも適用する。日本語は上の指定文言をそのままカタログに保持する。

書込は作成・編集・移動・削除を、Desktopは画面画像のVeniceへの送信とマウス・キー操作を別に示す。
shellの許可を「承認フォルダー内だけの操作」と説明したり、readの許可から自動的に追加したりしない。

**Venice shellの停止:** 第4段階の指定により、runの許可を失効させ、run所有の生存プロセスも終了する。
初期計画の「開始済みのコマンドは自動終了しません」は、このVenice shellには使わない。

readの見出し・本文・ボタンは§11の承認UIでそのまま使用する。readまたはwriteの許可だけではshellは有効にならない。

## 10. core/readの縦接続（2026-11-24実装）

```text
MAIN executeTool('core/read', args)
 → ISOLATED venice-bridge.js → backgroundのlocalTool分岐
 → 認証済みPOST /venice/tools {sender:{tabId,documentId}, request:VeniceToolCallRequest}
 → venice-tool-gatewayの予約・永続化
 → createRegistrar(...).invokeHostAdmitted('read', args, appが作ったorigin)
 → 既存read schema/handler → 既存sandbox → ToolResult → 既存の{ok,result}/{ok,error}
```

browser IDは既存の認証付きextension headerから、tab/document IDはbackgroundのChrome MessageSenderから取る。
MAINが指定したsenderは転送しない。gatewayはその3つとappのgrantを照合し、`core/read`以外を拒否する。
host-admitted originは既知のローカルsessionへ帰属し、履歴のattributionは `host_admitted`。
ChatGPTのrequest-idを捏造せず、ChatGPTのinbox・自動継続・Desktop経路へは入らない。
ファイルのschema・capability・read-only適用・canonical root/symlink検証は既存実装を再利用する。
user/managed Skillの暗黙rootや別chatの学習cwdはこの経路へ持ち込まない。

### 初期検証用の一時IPC（通常パネルは§11）

`api.debugVeniceGrant(...)` は `venice:debugGrant` という1つのIPC channelだけを使う。
非packagedかつElectron-vite development、app本体のmain frameだけが呼べる。
`grant` と `revoke` の2操作を持ち、production/packaged/別sender/iframeは `venice_debug_disabled` で拒否する。
shell許可・設定変更・rootの新規承認は行わず、すでに承認済みのnamed root全体を選ぶ。
sessionはChatGPTに結び付いていないローカルsessionに限定し、未作成の合成debug session IDなら作成する。

実測では通常アプリを終了し、次のように専用profileで起動した。`--`以降をElectronへ渡すことが必要。
`ELECTRON_CLI_ARGS`環境変数だけの指定はelectron-vite CLIに上書きされたため使わない。

```sh
CLF_BRIDGE_PORTS=8766 npm run dev -- -- --user-data-dir=/Users/atsu/chat-on-venice/outputs/venice-read-live/runtime
```

ソース拡張を読み込んだVeniceタブのConsoleで、実際のsenderを取得する。モデル送信は行わない。

```js
await window.__cosVeniceAgent.localIdentity()
```

その戻り値をElectron Consoleの変数 `sender` に設定してから、grantを発行する。
以下のroot名と合成session IDは実測用。root名は使用する既存の承認rootに合わせる。

```js
const granted = await api.debugVeniceGrant({
  action: 'grant', sessionId: '2026-11-24-11111111', roots: ['/venice-test'], sender
});
// granted.ok === true のときだけ granted.data.runId を次のConsoleへ渡す。
```

Venice Consoleでapp発行のIDを `runId` に設定してから読む。

```js
await window.__cosVeniceAgent.setLocalRun(runId)
await window.__cosVeniceAgent.executeTool('core/read', {
  paths: ['/venice-test/small.txt']
})
```

同じcall IDの再取得を手動確認する場合は、MAINのbridge関数を同じrequestで呼ぶ。

```js
const request = {callId: crypto.randomUUID(), surface: 'core', tool: 'read',
  args: {paths: ['/venice-test/small.txt']}};
await callVeniceBridge('localTool', request)
await callVeniceBridge('localTool', request) // 同じ記録。readを再実行しない。
```

Electron Consoleで `await api.debugVeniceGrant({action:'revoke', runId})` を実行すると、新規callは `RUN_REVOKED` になる。
既存の同一要求の結果取得は、同じ認証済みbrowser/tab/documentだけに許可する。
通常のexecuteToolは最初にcall IDを作り、transport失敗/pending時には同じIDで1回だけ再取得する。
unknownは停止理由として返し、新しいcall IDを作ってやり直さない。

### 状態の所有者と現在の制限

- gatewayの `state/venice-tools.json` が受付とresponse cacheを所有する。受付保存前は実行せず、完了保存後に応答する。
  再起動時のpendingはunknownにし、再実行しない。grantはプロセス内のみで、再起動後の新規実行権限として復元しない。
- 保存上限は256 call、プロセス内予約512件、grant32件、1結果のJSONは1,000,000 bytes。
  上限到達は明示的な拒否/エラーとし、過去のcall IDを忘れて再実行できるようにはしない。
- grantの明示revoke・bridge Disconnect・app終了で新規実行を止める。別documentは以前のrun設定を継承しない。
  現在のパネルは§11の承認UIとStop失効を使う。完了後もrunIdを保持し、完了自体では失効させない。
  session/providerの全面統合は後段階。
- このread段階では `desktopUnattributed`を有効にせず、shell・patch・find・Desktop・画像添付を公開しなかった。patchの追加は§12を参照。
  テキストreadの縦接続までを確認し、画像をモデルが見られるという扱いにはしない。

## 11. パネルからrun単位でreadを許可する（2026-11-24実装）

パネルの指示と最大ステップ数を設定して「実行」を押す。Electronの承認ダイアログで対象を確認し、
「フォルダを選ぶ」から読み取り対象を選び、「このrunだけ許可」を押す。拒否・時間切れならステップ欄に理由が出て、モデル送信は始まらない。
完了後も「停止」を押すと、このrunの新しいreadを拒否する。runIdと実行済みステップは保持する。

- 拡張は `/venice/grant/request` へ `{tools:['core/read'],instructionSummary}` を送り、backgroundが
  requestIdとChrome MessageSender由来のtab/document/URLを付ける。browser IDは既存認証headerを使う。
  appは承認までHTTP応答を保留し、`{runId}` または `{error:拒否理由}` を返す。
- gatewayが保留要求（最大8件、120秒）とgrantの所有者。固定IPC `venice:grantPending` が一覧を通知する。
  app main frameだけの `venice:grantPick` / `venice:grantAnswer` が選択・承認を行い、
  `venice:context` はappで選択したsessionだけを伝える。ロード時は同じ固定IPCから保留一覧を取得する。
- sessionはappの選択済みローカルsessionを使う。未選択・終了済み・ChatGPTに紐付くsessionなら、
  appが新しいVeniceローカルsessionを作る。元sessionがあればそのprojectを継承する。
  ダイアログのsession/projectはappの保存情報、VeniceタブはChrome由来、toolはapp固定allowlistから表示する。
  instructionSummaryは別の「ブラウザからの指示」としてtextContentで表示し、対象情報を上書きしない。
- ネイティブpickerの選択を既存sandboxのvalidateNewRootでcanonical化し、実パスを表示する。
  選択はrun専用rootsで、全体configの承認rootを追加・変更しない。フォルダ未選択はUIとmainの両方で許可を拒否する。
  grant内のRoot snapshotで既存resolvePathを通し、core/read schema・live read capability・read-only・shield・記録を維持する。
  初期debug IPCだけは従来どおり、config内の既存named rootを選ぶ。
- app発行のgrantを `state/venice-grants.json` に永続化してからrunIdを返す。
  このファイルは保存記録であり、再起動時に実行権限として復元しない。app終了時は全grantを失効し、保存をdrainする。
- パネル停止は `/venice/grant/revoke` で同じ認証済みbrowser/tab/documentのgrantと保留要求を失効する。
  MV3のsession storageにdocument bindingを保持し、loading/URL変更/タブ閉鎖でも失効を通知する。
  新documentの起動通知 `/venice/grant/document` も旧documentのgrantを失効させる。
  grantを待つHTTPはtab操作queueを占有せず、Stopが承認待ちの後ろで詰まらない。
- 保存済みcall結果の同一所有者による再取得は従来契約どおり。失効後に同じrunIdで新しいcallIdを送ると `RUN_REVOKED`。
  readの承認UIは日本語の指定文言を使用する。既定ではshell・書込・Desktopの権限を含まない。独立したwriteの追加同意は§12。

今回の実測: configにない合成フォルダをネイティブ選択して許可し、パネルのcore/readとdoneがともにok:true。
停止後もrunIdは同じで、新規readはRUN_REVOKED。gateway・sessionの実行記録は各1件、モデル通信は2回ともHTTP 200。
詳細はfindings「grant要求・承認UIとrun失効」を参照する。


## 12. runのwrite同意とcore/apply_patch（2026-11-24）

パネルの「実行」から既存の承認画面を開き、対象フォルダーを選ぶ。
書き込ませる場合だけ「書き込みも許可する」をチェックして「このrunだけ許可」を押す。
未チェックなら従来どおりreadのみ。チェックは別の承認要求に引き継がない。
説明は「選択したフォルダー内のファイルの作成・編集・移動・削除を許可します。」。
見出し・readの本文・ボタンの日本語は変更せず、新しい文言も既存i18n経路の全カタログで翻訳する。

- `venice:grantAnswer` の任意の `write` は既定false。app本体main frameからだけ受け、
  gatewayが `write:true` と `tools:['core/read','core/apply_patch']` を同意記録に保存する。
  既存のread grantは変更しない。ページからのgrant要求は引き続きread要求だけで、writeを自己申告できない。
- `/venice/tools` の本適用は既存のcallId受付・永続化・結果cacheを使う。
  gatewayとhost-admitted kernelの両方でread/patchだけをallowlistし、patchには明示writeを要求する。
  handler・schema・patch parser・sandbox・rollback・記録は既存実装を再利用する。
  実行時のRead-onlyとcreate/edit/move/deleteの個別capabilityも適用する。
- Veniceの作業基準はgrantの最初のroot。別chatの学習cwdやsessionのグローバルprojectから借りない。
  全source・destination・move先をgrantのcanonical rootsで解決し、root外・traversal・外向きsymlinkを拒否する。
  checkpointの待ち時間が終わった直後にも、失効とlive capabilityを検証してから本適用を始める。
- プレビューは同じ `/venice/tools` に `{sender,request,preview:true}` を送る。
  同じwrite grant・sender・root・schema・patch検証に加えてread capabilityを必要とする。
  既存patch engineのwrite/remove/mkdirをメモリ上のoverlayに向け、実ファイルの変更、checkpoint、実行記録は作らない。
  既存 `unifiedDiff` で `---` / `+++` と行番号付きhunkを作り、shield適用後の `{diff}` を返す。
- パネルは差分をtextContentで先に描画する。12行または1,200文字を超えると先頭8行・最大1,200文字を表示し、
  全文を未展開のdetailsに保持する。preはキーボードでスクロール可能。新しいラベルは拡張の全13カタログに登録する。
  DOMへ挿入したことの通知を受けてから本適用を送る。5秒以内に表示通知が来ない差分は適用しない。
  これは自動の表示通知であり、呼び出しごとの承認UIは増やさない。
- プレビューと本適用のrequestは同じcallId・tool・argsを使う。プレビューは実行ledgerを消費しない。
  本適用が通信断/pendingになった場合だけ同じcallIdで従来どおり1回再取得し、unknownから新しい実行を作らない。
  プレビュー後に失効したrunの本適用は拒否する。完了済みの同一要求は失効後も元の所有者だけが再取得できる。
- プレビューは表示時点の読取snapshotであり、本適用は改めてpatchのcontextとpathを検証する。
  別プロセスとの排他的な編集lockは取らない。差分はUTF-8で1,000,000 bytesまでとし、超過時は明示拒否する。
  受理した差分の全文を黙って切り捨てることはしない。
- 追加の実装境界は `src/main/mcp/tools-core.ts` のVenice限定分岐と、
  `src/main/venice-patch-preview.ts` のメモリoverlay。通常のChatGPT handler・shell・Desktopは変更しない。

検証はユーザー指定どおり実Venice送信なし。`test/venice-apply-patch*.test.ts` は実kernel・HTTP route・一時フォルダーと
合成DOMを検証し、`node test/venice-apply-patch.visual.cjs` は通信を全てローカル応答/abortにしたheadless Chromeで
既存のMAIN/ISOLATED bridgeと承認・差分の描画を確認する。実測値・完了commitはfindingsとprogressに記録する。


## 13. exec_command（2026-11-24 実装）

- ユーザー承認の第4段階。read / writeとは独立した既定OFFのshell同意を追加する。
- 既存のkernel、exec_commandハンドラ、コマンド許可ルール、UnifiedExecProcessManagerを使う。
  stdout / stderrの分離とspawn直後のrun所有登録が必要なため、`src/main/codex/unified-exec.ts`には
  任意指定の出力・生存期間コールバックだけ追加する。未指定の既存呼び出しの動作は変えない。
  run別の上限・出力保持・失効時killはVenice専用の所有者が担う。
- cwdはgrant先頭rootが既定。明示cwdも同じcanonical / symlink検証を通し、root外を拒否する。
  shell自体はフォルダー内に隔離されない。ファイルread/writeの承認とは別の権限として説明する。
- Venice shellに限り、revoke / Stop / app終了でそのrunの生存プロセスをkillする。
  既存のread / writeの失効契約や、通常のChatGPT向けStopの動作は変更しない。
- 出力は1プロセス64KiBまで先頭を保持し、stdout / stderrを分けて省略を表示する。
  実行中の出力取得は同じgatewayで元のsender / run / callIdを照合する観測のみとする。
- waitは`yield_time_ms`、既定10,000ms・最大30,000ms。時間切れでkillせずprocessIdを返す。
  `write_stdin`の継続操作は§15を参照。
- 入力は単一の`cmd`と任意の`workdir` / `yield_time_ms` / `shell` / `login`。
  stdoutとstderrを分離するためpipeモードを使い、`tty:true`と`cmds`は拒否する。
  既存の通常CoSのTTY / batch / 出力形式は変更しない。
- 戻り値の`structuredContent`は`processId` / `exitCode` / `running` / `stdout` / `stderr` / `output` /
  `truncated` / `omittedBytes`を含む。完了時も元のprocessIdを保持し、exitCodeを返す。
  同じcallIdの再取得は初回の確定済み応答を返し、後の終了状態に書き換えない。
- `{sender, request, output:true}`を同じ`/venice/tools`へ送ると、同一の受理済みexecだけを観測する。
  read/writeや新規execを実行せず、stdinも送らない。現在のgrant、sender、run、callId、tool、argsを全て照合する。
  通常のexec戻り値と同じ全体/プロジェクト設定のsecrets shieldを通し、maskが文字数を増やしても64KiBに収める。
  MAINは250ms間隔で重複なしに観測し、パネルのステップへtextContentで表示する。
  yield後・モデルのdone後も生存プロセスは観測を続け、Stopまたは新規runで観測を止める。
- spawn待ちも3本の枠に含め、spawn直後の生存期間・出力コールバックでrunに所有させる。
  killは既存のプロセスツリー終了を使う。StopのHTTP応答とapp終了は終了処理を待つ。
- 第5段階はこのrun所有者とprocessIdを使って接続する（§15）。
  既存managerのstdin-closed既定を保つため、空入力pollと明示的に開いたstdinへの非空入力を区別する。

検証は実Venice送信なし。`test/venice-exec.test.ts`は実kernel・実プロセス・一時フォルダー・認証HTTP、
`test/venice-exec-ui.test.ts`は承認状態と全カタログ、`test/venice-exec-panel.test.ts`はMAIN / ISOLATEDの合成経路を使う。
`node test/venice-exec.visual.cjs`はネットワークを全てローカル応答/abortにして、既存CSS / i18nの承認画面、
分離出力、改行、横スクロール、省略、完了後の継続観測、Stop、日本語/ドイツ語、PC/モバイル、axeを確認する。


## 14. core/find（2026-11-24 実装）

新しいパネルからrunを開始して読み取りを許可すると、同じroot内を検索できる。
既存runの許可を自動で広げないため、旧read-only grantでfindを使う場合は新しい承認を取る。
書き込み・shellのチェックは不要で、既定OFFのままにする。

- 新しい承認要求は`tools: ['core/read', 'core/find']`。従来の`['core/read']`も受け付け、旧grantのtool配列は変えない。
  appの承認画面は新しい要求に「ファイルの読み取りと検索（core/read、core/find）」を表示する。
  `core/find`とreadの両方がappの許可リストにあり、現在のread / search capabilityが有効な場合だけhost_admittedで実行する。
- 既存find handlerのschemaとsearch guardを使い、Veniceのregistrarだけ`exposedFind: true`にする。
  通常CoSでfindとexecが排他的になる既存の登録条件・動作は変えない。
  `src/main/venice-find.ts`は既存の`search()` / `searchOneFile()`を呼ぶVenice専用の結果整形で、検索engine自体は変更しない。
- 引数は既存どおり`query`, `path?`, `mode?`, `include?`, `exclude?`, `case_sensitive?`, `regex?`, `max_results?`。
  Veniceは`mode: 'content'`、`max_results: 200`を既定とし、上限は既存schemaの500。
  通常CoSの既定name / 50件は維持する。contentは既存のripgrep経路を使用し、runtime不在時は明示エラーにする。
- path省略時はgrantの全root、相対pathはgrant先頭rootが基準。virtual / nativeの明示pathも既存resolverで検証し、
  root外・traversal・外向きsymlinkを拒否する。配下走査でsymlinkを追わない既存searchの動作を使う。
  デフォルト除外・include / exclude・大文字小文字・regexも既存実装に従う。
- ユーザーの上限より1件多くまで取得してから切り詰める。200件ちょうどで探索終了ならtruncated:false、
  201件以上なら200件とtruncated:trueを返す。複数rootで全体上限と10秒のdeadlineを共有する。
- `structuredContent`は`matches: [{path, line?, text?}]`, `count`, `limit`, `truncated`, `stoppedBecause`, `binaryPolicy`。
  contentのlineは1始まり、textは既存searchの最大300文字の抜粋。nameモードではpathだけを返す。
  件数・時間・ファイルサイズ等で探索を打ち切ったときは理由を含める。0件も空のmatchesとして返す。
- contentでbinaryを除外する。明示ファイルは既存の先頭8KiBのbinary判定を併用し、UTF-16 BOM付きテキストは検索する。
  これはripgrepが明示binaryファイルから部分的なmatchを返すケースを避けるため。
  `binaryPolicy`はcontentなら`skip`、nameなら`names-only`。NULは出力時に空白へ置換する。
- 結果は既存secrets shieldとcallId台帳を通す。失効後の新規検索は拒否し、検索中に失効した場合も結果は渡さない。
  完了済みcallIdの再取得は元の認証済み所有者だけが行い、検索を実行し直さない。
- MAIN / ISOLATEDを通してパネルのステップ欄へpath・行番号・抜粋をtextContentで表示する。
  preは改行を保ち、長い行を折らず横スクロールできる。0件と打ち切りを明示し、preはキーボードでも操作できる。
  新しい表示文言は方針どおりja / enだけを必須カタログとして登録した。

検証は実ファイルとripgrep、実kernel / gateway / 認証HTTPに加え、合成モデル応答のパネル経路を使う。
`node test/venice-find.visual.cjs`で既存承認UIとパネルをheadless Chromeで確認し、外部通信は全てローカル応答またはabortにする。
実Venice送信は行わない。根拠commit・検証結果はprogressとfindingsに記録する。

## 15. core/write_stdin（2026-11-25 実装）

時間のかかるコマンドは、`exec_command`が返した`processId`を`session_id`として継続する。
空の`chars`は出力をpollし、非空の`chars`は明示的に開いたstdinへ送る。

```js
// Venice gatewayのargs。通常のCoS向けexec schemaにはstdin_openを追加しない。
{cmd: 'node interactive-script.js', stdin_open: true, yield_time_ms: 1000}
// 上の実行から返ったprocessIdを使う。
{session_id: 1234, chars: '', yield_time_ms: 1000}    // poll
{session_id: 1234, chars: 'hello\n', yield_time_ms: 1000} // input
```

- 新しいshell grantは`core/exec_command`と`core/write_stdin`を含む。read / writeだけではどちらも使えない。
  承認チェックの追加は不要で、既存の独立shell同意・警告文・既定OFFをそのまま使う。
- `/venice/tools`、host_admitted、既存UnifiedExecProcessManagerを通す。runのleaseとmanagerの所有者の両方を照合し、
  別run・別document・未知のprocessIdからはstdinも出力も操作できない。数値のprocessIdだけでは権限にならない。
- 既存のexec既定は変更しない。stdinは閉じたままで、pollは使えるが非空入力は拒否する。
  Veniceで`stdin_open: true`を明示したときだけpipeのstdinを開き、stdout / stderr分離を維持する。
  この引数はgatewayで検証してhost originへ渡し、通常のCoSのexec schemaやPTY既定は変えない。
- 1プロセスのpoll / inputは既存のinteraction lockで直列化する。待機中に失効やcommand permission変更が起きた場合も、
  lock取得後に再検証してから入力する。Read-only中も拒否する。Stop / revoke / app終了の既存killを引き継ぐ。
- waitは既定10秒・最大30秒。空pollは既存managerどおり最低5秒の待機枠を取り、出力か終了が届けば早く返る。
  出力が届いた瞬間はまだrunningの場合があるため、終了確認が必要なら新しいcallIdで再pollする。
  pipeへの`chars: '\u0003'`は文字を書き込まず既存のプロセスツリー割り込みを使う。
- 応答は元のexecの`callId` / `processId`と累積stdout / stderr、running / exitCodeを返す。
  wire応答のcallIdは各継続呼び出しのもの。累積出力は同じ64KiB上限・省略表示・secrets shieldを通す。
  MAIN / ISOLATED bridgeはこのsnapshotを既存パネルの同じプロセス行へtextContentで反映する。
- 同じ継続callIdの再取得は確定済みの応答を返し、入力を二度送らない。失効後も元の所有者による確定応答の再取得は可能だが、
  新しいcallIdでのpoll / inputは拒否する。終了済みprocessへ非空入力は送らない。
  managerが保持している終了済み出力は空pollで読める。保持期間を超えて破棄されたIDは再実行せず拒否する。

検証: `test/venice-write-stdin.test.ts`で一時フォルダー・実kernel・実プロセス・認証HTTPを使う。
`test/venice-write-stdin-panel.test.ts`は実MAIN / ISOLATED bridgeと合成モデル応答を通す。
`node test/venice-write-stdin.visual.cjs`はビルド不要、Node 22.23.5・lockfile依存関係・macOSのChromeを前提とし、
外部通信をローカル応答/abortに限定してPC/モバイル表示、改行、安全な文字列表示、横スクロールを確認する。
ログと画面は`outputs/venice-write-stdin/`。実Venice送信は行わない。
