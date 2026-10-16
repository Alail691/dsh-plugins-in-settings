# 发布指南：GitHub 与 DSH 插件市场

本文件是**给你（仓库作者）**的操作手册，不是给插件使用者的。分三部分：

1. 发布前自检（必须先全绿）
2. 推到 GitHub
3. 进 DSH 插件市场（dsh-plugin.org）

---

## 0. 先改掉仓库地址占位符

`package.json` 里的 `REPLACE_WITH_YOUR_GITHUB_USERNAME` 必须换成你的 GitHub 用户名，
否则 `repository` / `homepage` / `bugs` 三个字段都是坏的（插件市场和 npm 会读它们）。

```powershell
cd dsh-plugins-in-settings

# 用 Node 改写（比 PowerShell 的 -replace 稳：不会有 BOM / 编码问题）
node -e "const fs=require('fs');const f='package.json';fs.writeFileSync(f,fs.readFileSync(f,'utf8').split('REPLACE_WITH_YOUR_GITHUB_USERNAME').join('<你的用户名>'))"
```

改完确认一下（三条都应当指向真实地址、且不再有 `REPLACE_WITH`）：

```powershell
node -e "const p=require('./package.json');console.log(p.repository.url);console.log(p.homepage);console.log(p.bugs.url)"
```

---

## 1. 发布前自检

```powershell
node test/run.mjs         # 离线断言：必须 97 项全过
node test/preflight.mjs   # 契约预检：在装过 DSH 的机器上应当 0 跳过
```

`preflight` 的**跳过项要在意**：它说明"我们挂的那个槽位在你这台机器上没被验证过"。
在装过 DSH 的机器上跑，理想输出是 `✓ 预检通过：24 项` 且**没有任何跳过**。

另外确认这三件事（CI 也会查）：

- `package.json` 里 **没有** `"private": true`（有的话 npm 拒发、别人也装不了）
- `dsh.bundle.patch` 指向的 `cordis.patch.yml` 真的在仓库里
- `lib/client.js` 与 `lib/index.js` 已提交（`lib/client.js` 就是发布产物，没有构建步骤）

---

## 2. 推到 GitHub

### 2.1 建仓库

在 GitHub 上新建一个**公开**仓库，名字建议就叫 `dsh-plugins-in-settings`
（包名与仓库名一致时，`github:<user>/<repo>` 这种安装方式最不容易出错）。

**不要**勾选 "Add a README / .gitignore / license" —— 本目录里已经有了，
勾了会产生冲突。

### 2.2 初始化并推送

```powershell
cd dsh-plugins-in-settings

git init -b main
git add -A
git commit -m "feat: 把侧栏「插件」综合进设置（设置 → 插件 → 插件管理）"

git remote add origin https://github.com/<你的用户名>/dsh-plugins-in-settings.git
git push -u origin main
```

### 2.3 ⚠️ 必须加 topic —— 插件市场就是靠它自动收录的

插件市场（DSH Plugin Hub）的收录方式是：

> 将你的插件发布到 GitHub 并添加 **`dsh-plugin`** topic，
> 即可被 DSH Plugin 插件目录自动发现与收录。

也就是说 **topic 是收录入口，不是可选项**。仓库页面 → 右上角 ⚙️ (About) →
Topics → 填 `dsh-plugin`，再加几个便于检索的：

```
dsh-plugin
dsh
deepseek-harness
plugin-manager
settings
```

仓库建好后可以用命令验证 topic 是否生效（需要 `gh`，没装就跳过）：

```powershell
gh repo view <你的用户名>/dsh-plugins-in-settings --json repositoryTopics
```

### 2.4 打一个 Release（可选但推荐）

市场与使用者都更愿意装"有版本号"的东西：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

然后在 GitHub 上基于该 tag 建 Release，说明写这一版做了什么。

---

## 3. 进 DSH 插件市场

### 3.1 自动收录（主要路径）

做完 **2.3 的 topic** 之后，剩下的交给市场：它每日抓取带 `dsh-plugin` topic 的仓库，
人工审核后发布。**你不需要写申请邮件。**

收录后可以在官网看到插件详情页：

```
https://dsh-plugin.org/plugins/<你的用户名>/dsh-plugins-in-settings
```

### 3.2 主动提交 / 催收录（可选）

如果等了一段时间没被收录，或者想补充分类、描述、截图：

- 官网提交页：<https://dsh-plugin.org/zh/submit>
- 或到市场仓库开 issue：<https://github.com/dshplugin/dsh-plugin-hub/issues>

提交时把下面这份材料贴上，能显著减少来回问：

```
插件名：dsh-plugins-in-settings
仓库：https://github.com/<你的用户名>/dsh-plugins-in-settings
一句话：把 DSH 侧栏的「插件」收进设置 —— 在「设置 → 插件」里新增「插件管理」标签页，内嵌官方插件面板的全部管理能力。
分类建议：界面与体验 / 设置
语言：中文 + English（README.md / README.en.md）
许可：MIT
依赖：零运行时依赖，无构建步骤
```

### 3.3 关于 npm

市场支持按**包名**安装，所以发 npm 也是个加分项（不是必须的）。
发之前务必确认 `package.json` 里没有 `private: true`：

```powershell
npm publish --access public
```

发完之后，使用者就能用 `npm install dsh-plugins-in-settings` 或在设置面板里直接填包名了。

---

## 4. 发布之后

### 4.1 别人怎么装

三种（详见 README）：设置面板填 `github:<user>/dsh-plugins-in-settings`、命令行
`dsh plugin --profile <非desktop> add github:<user>/dsh-plugins-in-settings`、
或 `install.cmd`。

### 4.2 你自己怎么迭代

```powershell
# 改完代码
node test/run.mjs && node test/preflight.mjs

# ⚠️ 改过 lib/client.js 后必须完全退出并重开 DSH Desktop ——
# 宿主在启动时把插件读进内存，只关窗口不够。

git add -A && git commit -m "..." && git push
```

版本号改了之后记得重新打 tag（`git tag v1.1.0 && git push origin v1.1.0`）。

### 4.3 官方升级把契约改掉时

`npm run preflight` 会先炸（它直接读官方产物核对槽位名与远程方法名）。
按报错项去 `lib/client.js` 里改对应的常量即可：

| 常量 | 含义 |
|---|---|
| `SLOT_NAME` | 目标槽位，当前 `settings.plugins.tab` |
| `TAB_ID` | 本插件的标签页 id，当前 `manage`（**不要**用 `all`，官方占了） |
| `TAB_ORDER` | 排序，当前 5（官方清单是 10） |

---

## 5. 自查清单（发布前逐项打勾）

- [ ] `package.json` 里的用户名占位符已替换
- [ ] `node test/run.mjs` → 97 项全过
- [ ] `node test/preflight.mjs` → 无跳过项
- [ ] 没有 `"private": true`
- [ ] `lib/client.js`、`lib/index.js`、`cordis.patch.yml` 都已提交
- [ ] GitHub 仓库已加 **`dsh-plugin`** topic
- [ ] 打过 tag 并建了 Release
- [ ] （可选）已发 npm
