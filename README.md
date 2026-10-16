# dsh-plugins-in-settings

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）**侧栏的「插件」收进设置**：
在 **设置 → 插件** 里新增一个 **「插件管理」** 标签页，把官方插件面板的能力搬进来
（浏览官方 / 已装组合包、**添加插件**、开关组合包、开关单个插件行、卸载）。

> 侧栏原有的「插件」入口**保持原样**。本插件是**再加一个入口**，不是把原来那个拆掉 ——
> 任何一边出问题都不会让对方不可用。

## 装好之后长这样

```
设置 → 插件（官方那一页）
┌──────────────────────────────────────────────────────────┐
│ 内置插件                                                  │
│ 查看内置部署的插件列表                                    │
│                                                          │
│  ┌──────────────┬──────────────┐  ← 官方标签页栏         │
│  │ 插件管理      │ 插件列表      │                        │
│  │ ▔▔▔▔▔▔       │              │  ← 本插件新增的标签页   │
│  ├──────────────┴──────────────┴──────────────────────┐ │
│  │ 运行中的改动会即时生效；个别插件需要…      [刷新]    │ │
│  │                                                     │ │
│  │ ┌─ 添加插件 ──────────────────────────────────────┐ │ │
│  │ │ 输入包名、GitHub 地址或本机目录路径。            │ │ │
│  │ │ [dsh-plugin-whale-pet    ] [安装源▾] [安装]      │ │ │
│  │ │ 请确认插件来源可信。插件以你的权限在本机运行。    │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ 官方                                                │ │
│  │ ┌─────────────────────────────────────────────────┐ │ │
│  │ │ dsh-experimental-voice-input    官方  已停用    │ │ │
│  │ │ …                                      [启用]   │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
│  │                                                     │ │
│  │ 已安装                                              │ │
│  │ ┌─────────────────────────────────────────────────┐ │ │
│  │ │ dsh-better-sidebar                已启用        │ │ │
│  │ │ …                        [停用]  [卸载]         │ │ │
│  │ │ ─────────────────────────────────────────────── │ │ │
│  │ │ sidebar（组合包里的插件行）        [停用]       │ │ │
│  │ └─────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**与官方面板的关系**：本插件不重写一套安装器。列表、安装、开关、卸载全部走
**官方同一个远程接口**（`remote.pluginManager`）—— 官方怎么装、怎么开、怎么卸，
这里就是同一条路径，不存在"两份实现漂移"的问题。

### 「添加插件」的四步

1. **填规格** —— 包名（`dsh-xxx`）、`github:作者/仓库`、或本机绝对路径。
2. **宿主先读一遍**（`inspect`）—— 不是有效插件包、读不到源、pnpm 会拒绝的写法，
   都会在**开始装之前**把原因显示在输入框下面，规格留着让你改。
3. **真的开装**（`installBundle`）—— 装上后**默认启用**，装完自动刷新列表。
4. **看结局** —— 按宿主回报的 `application` 分四种：
   装好 / 装好但要重启 / 失败（含 pnpm 挡下的构建脚本，可「同意并重试」）/ 取消。

装的过程中**随时可取消**。如果回应在途中丢了（超时、断线），会拿同一个任务 id
向宿主把结果**问回来**；问不到就如实显示「结果不明」，**绝不谎报成功**。

## 30 秒上手

```powershell
# 方块一：下载 / clone 本仓库，然后
.\install.cmd
# 方块二：完全退出并重开 DSH Desktop（关窗口不够，要退出进程）
# 方块三：设置 → 插件 → 顶部「插件管理」
```

## 安装（三条路，任选）

### 1. 设置面板安装（推荐）

**设置 → 插件 → 添加插件**，填三者之一：

- **本地目录路径**（本仓库解压后那一层目录）
- **`github:<用户名>/<仓库>`**
- **npm 包名**（发布到 registry 后可用）

### 2. 命令行（**只有非 desktop profile 能这么装**）

```powershell
dsh plugin --profile tui add link:"<本插件的绝对路径>"
dsh plugin --profile tui add github:<用户名>/dsh-plugins-in-settings
```

> `desktop` 是 Electron 应用保留的 profile，命令行会被直接拒绝：
> `error: profile "desktop" is managed exclusively by the Electron application`。

### 3. 脚本（desktop profile，或设置里没有「插件」面板时）

```powershell
.\install.cmd                    # 装进 desktop
.\install.cmd -Profile tui       # 装进别的 profile
.\install.cmd -WhatIf            # 只看要做什么，不落盘
.\install.cmd -Uninstall         # 卸载
```

脚本做四件事：备份 profile 的 `package.json` → 加一条 `link:` 依赖 →
把包名追加进 `dsh.profile.bundles` → 在 profile 的 `node_modules` 下建链接
（Windows 用 junction，其它平台用符号链接），最后校验这三项都成立。

> **卸载**用面板，或 `install.cmd -Uninstall`。
> 手工建过 junction 的用 `cmd /c rmdir <junction>` ——
> **不要**用 `Remove-Item -Recurse`，那可能顺着链接把插件目录里的文件删掉。

## 它怎么工作

| 半边 | 干什么 |
|---|---|
| `lib/index.js`（宿主） | 空逻辑 + 一次客户端产物静态核对。存在的唯一理由是让本包成为 cordis 树上的一行，否则 `dsh.client` 的 bundle 不会被扫进启动图 |
| `lib/client.js`（客户端） | 一个标签页：注册进 `settings.plugins.tab`，用 `remote.pluginManager` 驱动列表 / 开关 / 卸载 |

### 挂在哪儿，为什么

官方 `@deepseek-ai/dsh-client-ui-settings-plugins` 已经占住了 `settings.section` 里
id 为 `plugins` 的设置页（侧栏文案「内置插件」），并声明了子槽 **`settings.plugins.tab`**
（`list`，scope `root`）用来放"这个页里的各个标签页"；官方自己的只读清单
（`ui-settings-plugin-inventory`）就以 id `all`、order 10 挂在里面。

所以"把插件综合到设置里"最自然、事后最不容易坏的落点就是这里：

- **复用**官方已经建好的设置导航与标签页外壳，只贡献一个标签页；
- **不**新开设置页（会和官方页重复）；
- **不**改官方任何 DOM，**不**抢官方注册（本插件 id 是 `manage`，order 5，排在官方清单前面）；
- **不**动侧栏。

### 数据路径（只用官方公开面）

| 用途 | 接口 |
|---|---|
| 列出组合包 | `ctx.remote.pluginManager.listBundles()` |
| **安装前预检** | `ctx.remote.pluginManager.inspect(spec, { registry }, signal)` |
| **安装** | `ctx.remote.pluginManager.installBundle(spec, { enabled, requestId, registry, approvedBuilds? })` |
| **找回安装结果** | `ctx.remote.pluginManager.waitForInstall(requestId)` |
| **取消安装** | `ctx.remote.pluginManager.cancelInstall(requestId)` |
| 开关组合包 | `ctx.remote.pluginManager.setBundleEnabled(name, enabled)` |
| 开关单个插件行 | `ctx.remote.pluginManager.setPluginEnabled(entryId, enabled)` |
| 卸载 | `ctx.remote.pluginManager.removeBundle(name)` |

安装是一条**四方法链**：`inspect` 先问"这个规格能不能装"，
`installBundle` 带一个**自己生成的 `requestId`** 真开装，
回应丢了就拿同一个 id 走 `waitForInstall` 把结果问回来，
中途取消则走 `cancelInstall`（它可能回 `too-late`，意思是已经装完了）。

`remote.pluginManager` 由官方 `ui-plugin-manager` 的宿主半边暴露。本插件**软探测**它
（`ctx.get("remote")`）而**不是**写成硬依赖 `inject` ——
申明一个可能不存在的服务会让 fiber 停在 PENDING，从而拖累整棵插件树。
探测不到时，标签页显示一条可读的「暂不可用」说明，**其余一切照常**。

## 稳健性

- **fail-open**：远程命名空间缺失 / 方法不全 / 列表读失败 / 任何一步认不出 ——
  都收敛成一条可读文字或一个空列表，**绝不抛**，也绝不影响设置面板、官方插件页与侧栏入口。
- **绝不谎报成功**：安装结局按 `application` 判定；认不出的取值一律算「结果不明」，
  而不是当成成功。回应丢失时先问宿主要结果，问不到就如实说不知道。
- **旧宿主自动降级**：只有管理方法、没有安装方法的宿主上，「安装」按钮**禁用**，
  其余功能照常 —— 不会因为缺一个方法就整页不可用。
- **刷新失败保留旧列表**（与官方面板同样的节奏），只在下面追加一行错误。
- **卸载要按两次**（第一次变成「确定卸载」，失焦即还原），避免误点。
- **安装全程可取消**，且取消后不留下"半装"的假状态。
- **零第三方依赖**：只 `require` 平台种子表里的 `react` / `react/jsx-runtime`，
  无构建步骤 —— `lib/client.js` 就是发布产物（手写、可读）。
- 所有失败路径都有离线断言守着（见下）。

## 开发

```powershell
npm test        # 离线断言套件（154 项）
npm run preflight   # 对着**真实安装**的官方产物核对契约（35 项）
```

- `test/run.mjs` 验的是"我们自己的形状对不对"：产物契约、纯函数归一化、
  注册契约、数据路径的成功与失败两条路。
- `test/preflight.mjs` 验的是"我们挂的那个地方还在不在"：直接读官方
  `ui-settings-plugins` / `ui-settings-plugin-inventory` / `ui-plugin-manager`
  的产物（从 profile 的 `node_modules` 或 `app.asar` 里找），核对槽位名、
  注册形状、以及官方占用的 id。**官方升级改掉这些时先在这里炸**，
  而不是等装进真机才发现"设置里是空的"。

本机没有可离线使用的真 React（`app.asar` 里不带），所以渲染层是
`test/harness.mjs` 里的**保状态 React 桩**（`useState` / `useMemo` / `useCallback` /
`useEffect` / `useId`，含 setState 触发的重渲染）；数据路径与注册路径跑的都是真代码。

## 兼容性

- 依赖官方**语义契约**：槽位名 `settings.plugins.tab`、远程命名空间 `remote.pluginManager`
  及其方法名。官方若改这些，本插件会**静默退回"暂不可用"**（fail-open），
  不会把官方界面改坏；`npm run preflight` 会先一步报出来。
- 需要**完全重启** DSH Desktop 才生效（客户端 bundle 在启动时注入）。
- 本插件**不注册任何宿主钩子、不注入会话消息、不监听 agent 事件** ——
  结构上只碰一个 UI 槽位与几个远端管理方法。

## 已知限制

- 官方 `listBundles()` 的回应形状由宿主决定，本插件按已观察到的字段
  （`official` / `installed`，以及平铺数组与 `{bundles:[]}` 两种退路）取值；
  认不出就显示空列表而不是猜测。
- **安装源**用的是宿主 `registries()` 给的列表 + 一个「默认安装源」。
  官方面板还会在首次使用时**并行探测** npm 官方源与 npmmirror、把选择记进
  `localStorage`，并在 GitHub 连不上时主动提示改用镜像 —— 这些**本插件没做**。
  安装源默认交给 pnpm 自己的配置，需要换源时在下拉里手动选。
- **不显示 pnpm 的实时输出**。官方面板会把 pnpm 的命令行与输出折在
  「显示安装详情」里；本插件只报最终结局与失败原因。
- 安装时**一律带上 `enabled: true`**（装完即启用）。官方面板是先装上、
  再让你自己决定要不要现在启用。

这三条是有意的取舍：把管理做扎实，把"长尾的安装体验"留给官方面板
（侧栏入口仍在原处）。要哪一条补上，提 issue 即可。

## 许可

MIT（见 [`LICENSE`](LICENSE)）。无第三方代码。
