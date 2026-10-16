# GitHub 仓库设置备忘（给仓库作者）

GitHub 的 topic **没有**对应的文件可以提交 —— 必须在仓库页面上手工设置。
这份备忘把要填的东西集中在一处，免得忘。

---

## 当前状态（已核实）

用 GitHub API 查过（2026-10-16）：

| 检查项 | 结果 |
|---|---|
| 账号 `Alail691` | ✅ 存在（id 197763924） |
| 仓库 `Alail691/dsh-plugins-in-settings` | ✅ **已创建**（2026-10-16T10:58:27Z，公开，默认分支 main） |
| 仓库内容 | ⬜ 还是空的（size 0，还没有提交） |
| `dsh-plugin` topic | ❌ **还没加**（names 为空） |

所以现在要做的就两件：**推送**、**加 topic**。

---

## 第一步：推送

```powershell
cd dsh-plugins-in-settings
npm run push          # 接远程 + 推 main + 打 tag
```

（仓库已建好，`push:check` 现在应当报"仓库已存在"。）

---

## 第二步：加 `dsh-plugin` topic

GitHub 的 topic **没有文件可提交**，只能在页面上加；而**市场只靠它收录**。
路径：<https://github.com/Alail691/dsh-plugins-in-settings> → 右上角 ⚙️ (About) → Topics。

---

## 两个容易踩的坑

### 1. curl 报 SSL 错 ≠ 没网

本机 curl 走 schannel，TLS 会报 `SEC_E_NO_CREDENTIALS`；用 Node 的 `https`
模块则完全正常。要命令行查 GitHub，**用 Node 或浏览器**，
别被 curl 的报错误导成"网络不通"。

### 2. GitHub API 有未认证限流

未认证调用**每小时 60 次**，而且**按出口 IP 共享** —— 很容易撞上，
报 `HTTP 403: API rate limit exceeded`。

`scripts/push.mjs` 对这种情形**不会拦住推送**（仓库存不存在、有没有 topic
只影响提示，`git push` 本身不需要这些），只会降级成警告，并告诉你多久恢复。
想彻底避免：

```powershell
gh auth login                        # 或用环境变量
$env:GITHUB_TOKEN = "ghp_xxx"        # 带上它，限额提到每小时 5000
```

---

---

## 必须做的：加 `dsh-plugin` topic

> **这是插件市场的收录入口。** 市场（DSH Plugin Hub）每天抓取带 `dsh-plugin`
> topic 的 GitHub 仓库，人工审核后发布。**没加 topic = 不会被收录**，
> 而且没有别的申请通道能替代它。

设置路径：仓库页面 → 右上角 **⚙️ (About)** → **Topics** → 逐个填入：

```
dsh-plugin
dsh
deepseek-harness
deepseek-harness-plugin
plugin-manager
settings
```

前两个（`dsh-plugin`、`dsh`）是检索用的关键；其余帮助别人按功能找到它。

**验证（有 `gh` 的话）：**

```powershell
gh repo view Alail691/dsh-plugins-in-settings --json repositoryTopics
```

没有 `gh` 就刷新仓库页面，看 About 区域右侧有没有显示出这些 topic 标签。

---

## 建议同时填的

**About → Description**（一句话，会显示在仓库页顶部、也是市场抓取用的描述）：

```
把 DSH 侧栏的「插件」收进设置：设置 → 插件里新增「插件管理」标签页，内嵌官方插件面板的能力（浏览 / 添加 / 开关 / 卸载）。
```

**About → Website**：

```
https://github.com/Alail691/dsh-plugins-in-settings#readme
```

**About → 勾选 Releases / Packages**（如果后续要用 Release 分发 zip）。

---

## 发布节奏

```powershell
# 改完代码，先跑全套自检
npm run verify

# 打 tag 发版（市场与使用者都更认有版本号的）
git tag v1.0.0
git push origin main --tags
```

然后在 GitHub 上基于该 tag 建一个 Release，说明这一版做了什么。

> ⚠️ 改了 `lib/client.js` 之后**必须完全退出并重开** DSH Desktop 才生效 ——
> 宿主在启动时把插件读进内存，只关窗口不够。
