/**
 * dsh-plugins-in-settings — 客户端半边
 *
 * 把**侧栏的「插件」**收进设置：在「设置 → 插件」现有的一排标签页里，
 * 新增一个「插件管理」标签页，它内嵌官方插件面板的全部能力
 * （列出官方/已装组合包、安装、开关组合包、开关单个插件行、卸载）。
 *
 * 侧栏的「插件」入口**保持原样、不做任何改动** —— 本插件是"再加一个入口"，
 * 不是"把原来那个拆掉"。这样任何一边出问题都不会让对方不可用。
 *
 * ── 为什么是「设置 → 插件」里的一个标签页（而不是一个新的设置页）──────────
 *
 * 官方 `@deepseek-ai/dsh-client-ui-settings-plugins` 已经占住了 `settings.section`
 * 里 id 为 `plugins` 的那个设置页（侧栏文案「内置插件」），并声明了子槽
 * `settings.plugins.tab`（list，scope root）用来放"这个页里的各个标签页"，
 * 官方自己的只读清单（`ui-settings-plugin-inventory`）就以 id `all`、order 10 挂在里面。
 *
 * 所以"把插件综合到设置里"最自然、事后最不容易坏的落点就是这里：
 * 复用官方已经建好的设置导航与标签页外壳，我们只贡献一个标签页。
 * 不新开设置页（那会和官方页重复）、不改官方任何 DOM、不抢官方注册。
 *
 * ── 数据从哪来 ──────────────────────────────────────────────────────────
 *
 * 官方面板的全部数据与动作都走 `ctx.remote.pluginManager`（一个 Remote 门面）：
 *   listBundles / listPlugins / registries / inspect / installBundle /
 *   waitForInstall / cancelInstall / setBundleEnabled / setPluginEnabled / removeBundle
 * 本插件以 `inject: ["slots", "locale", "remote", "remote.pluginManager"]` 声明它，
 * 并用与官方**同一套**方法来驱动界面 —— 也就是说，官方怎么装、怎么开、怎么卸，
 * 这里就是同一条路径，不存在"自己另写一遍安装器"的偏差。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 *  1. **fail-open**：远程命名空间没就绪、列表读失败、任何一步认不出 ——
 *     标签页显示一条可读的说明（或干脆不注册），**绝不**影响设置面板本身，
 *     更不会影响官方插件页与侧栏入口。
 *  2. **零第三方依赖**：只 require 平台种子表里的 `react` / `react/jsx-runtime`。
 *     不做构建、产物即源码，装上就能用。
 *  3. **不注入会话消息、不注册宿主钩子**：本插件结构上只碰 UI 槽位与 Remote 只读/管理方法。
 */
window.__ModuleLoader__.load({
  id: "dsh-plugins-in-settings",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");
    var jsxRuntime = require("react/jsx-runtime");
    var jsx = jsxRuntime.jsx;
    var jsxs = jsxRuntime.jsxs;
    var Fragment = React.Fragment;

    var PACKAGE_ID = "dsh-plugins-in-settings";
    /** 本插件贡献的槽位：设置 → 插件 → 各标签页。 */
    var SLOT_NAME = "settings.plugins.tab";
    /** 标签页 id。官方只读清单用 `all`，这里必须有区别（`all` 已被占用）。 */
    var TAB_ID = "manage";
    /** 排序：官方只读清单是 10，管理页放在它前面，打开这一页先看到能动手的那个。 */
    var TAB_ORDER = 5;
    var STYLE_MARKER = PACKAGE_ID;

    /* ════════════════════════════ 文案 ════════════════════════════ */

    var ZH = {
      tab: "插件管理",
      loading: "正在读取插件列表…",
      unavailableTitle: "插件管理暂不可用",
      unavailableBody: "当前部署没有提供插件管理能力（远程命名空间未就绪）。请确认本插件已启用，且这个 profile 由应用管理。",
      retry: "重试",
      refresh: "刷新",
      refreshing: "刷新中…",
      official: "官方",
      installed: "已安装",
      empty: "这里还没有任何插件。",
      enable: "启用",
      disable: "停用",
      uninstall: "卸载",
      uninstalling: "卸载中…",
      confirmUninstall: "确定卸载",
      cancel: "取消",
      rows: "个插件",
      bundleOn: "已启用",
      bundleOff: "已停用",
      problem: "有问题",
      unknown: "状态未知",
      version: "版本",
      noRows: "这个组合包没有可单独开关的插件。",
      toggleFailed: "操作失败",
      runtimeNote: "运行中的改动会即时生效；个别插件需要刷新页面或重启应用。",
      // ── 安装 ──
      installTitle: "添加插件",
      installHint: "输入包名、GitHub 地址（github:作者/仓库）或本机目录路径。",
      installPlaceholder: "例如 dsh-plugin-whale-pet",
      install: "安装",
      installChecking: "正在读取…",
      installRunning: "正在安装…",
      installCancel: "取消安装",
      installCancelling: "正在取消…",
      installDone: "安装完成。",
      installDoneRestart: "安装完成，需要重启应用后生效。",
      installFailed: "安装失败",
      installCancelled: "已取消安装。",
      installUnknown: "结果不明：连接中断，宿主没有留下这个任务的记录。请刷新后用「设置 → 插件」确认是否装上了。",
      installAgain: "再装一次",
      installClear: "收起",
      installTrust: "请确认插件来源可信。插件在本机以你的权限运行，来源不明的插件可能损坏 DeepSeek Harness，或读取和泄露你的数据。",
      installPendingBuilds: "pnpm 挡下了这些包的构建脚本（需要你同意才会执行）：",
      installApproveBuilds: "同意并重试",
      registryLabel: "安装源",
      registryDefault: "默认安装源",
      installGitPlaceholder: "请把 github: 后面的地址换成真实的仓库地址",
    };

    var EN = {
      tab: "Plugin manager",
      loading: "Reading the plugin list…",
      unavailableTitle: "Plugin manager unavailable",
      unavailableBody: "This deployment exposes no plugin-management capability (the remote namespace is not ready). Check that this plugin is enabled and the profile is managed by the app.",
      retry: "Retry",
      refresh: "Refresh",
      refreshing: "Refreshing…",
      official: "Official",
      installed: "Installed",
      empty: "No plugins here yet.",
      enable: "Enable",
      disable: "Disable",
      uninstall: "Uninstall",
      uninstalling: "Uninstalling…",
      confirmUninstall: "Confirm uninstall",
      cancel: "Cancel",
      rows: "plugins",
      bundleOn: "Enabled",
      bundleOff: "Disabled",
      problem: "Problem",
      unknown: "Unknown",
      version: "Version",
      noRows: "This bundle exposes no individually switchable plugins.",
      toggleFailed: "Action failed",
      runtimeNote: "Changes apply live; a few plugins need a page refresh or an app restart.",
      // ── Install ──
      installTitle: "Add a plugin",
      installHint: "Enter a package name, a GitHub address (github:owner/repo), or a local directory path.",
      installPlaceholder: "e.g. dsh-plugin-whale-pet",
      install: "Install",
      installChecking: "Reading…",
      installRunning: "Installing…",
      installCancel: "Cancel install",
      installCancelling: "Cancelling…",
      installDone: "Installed.",
      installDoneRestart: "Installed; restart the app to activate it.",
      installFailed: "Install failed",
      installCancelled: "Install cancelled.",
      installUnknown: "Outcome unknown: the connection dropped and the host has no record of this task. Refresh and check Settings → Plugins to see whether it landed.",
      installAgain: "Install again",
      installClear: "Dismiss",
      installTrust: "Make sure the plugin's source is trustworthy. Plugins run on this machine with your permissions; an untrusted plugin can damage DeepSeek Harness or read and leak your data.",
      installPendingBuilds: "pnpm blocked the install scripts of these packages (they run only with your permission):",
      installApproveBuilds: "Allow and retry",
      registryLabel: "Registry",
      registryDefault: "Default registry",
      installGitPlaceholder: "Replace the address after github: with a real repository",
    };

    /* ════════════════════════════ 样式 ════════════════════════════ */

    /*
     * 颜色一律走 DSH 自己的设计令牌（`--dsw-*`），浅色/深色自动跟随；
     * 令牌缺失时回退到中性灰，保证"至少看得清"，不保证和主题完全贴合。
     */
    var CSS = [
      ".pis-root{display:flex;flex-direction:column;gap:12px;max-width:760px;color:var(--dsw-alias-label-primary,#0f1115)}",
      ".pis-bar{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      ".pis-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(15,17,21,.6))}",
      ".pis-btn{font:inherit;font-size:13px;line-height:20px;padding:4px 10px;border-radius:8px;cursor:pointer;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));background:0 0;color:var(--dsw-alias-label-primary,#0f1115)}",
      ".pis-btn:hover:not(:disabled){background:var(--dsw-alias-bg-hover,rgba(15,17,21,.05))}",
      ".pis-btn:disabled{opacity:.5;cursor:default}",
      ".pis-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:2px}",
      ".pis-btn[data-danger='1']{color:var(--dsw-alias-state-error-primary,#e5484d);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 40%,transparent)}",
      ".pis-group{display:flex;flex-direction:column;gap:8px}",
      ".pis-groupTitle{margin:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-secondary,rgba(15,17,21,.75))}",
      ".pis-cards{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}",
      ".pis-card{border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}",
      ".pis-cardHead{display:flex;align-items:center;gap:8px;min-width:0}",
      ".pis-name{font-size:13px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".pis-tag{flex:0 0 auto;font-size:11px;line-height:16px;padding:1px 6px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));color:var(--dsw-alias-label-tertiary,rgba(15,17,21,.6))}",
      ".pis-tag[data-tone='error']{color:var(--dsw-alias-state-error-primary,#e5484d);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 40%,transparent)}",
      ".pis-tag[data-tone='on']{color:var(--dsw-alias-state-business-primary,#4d93f8);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4d93f8) 40%,transparent)}",
      ".pis-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(15,17,21,.6));margin:0}",
      ".pis-spacer{flex:1 1 auto;min-width:0}",
      ".pis-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}",
      ".pis-rows{display:flex;flex-direction:column;gap:4px;margin:2px 0 0;padding:8px 0 0;list-style:none;border-top:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16))}",
      ".pis-row{display:flex;align-items:center;gap:8px;min-width:0}",
      ".pis-rowName{font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".pis-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".pis-empty{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary,rgba(15,17,21,.6))}",
      ".pis-title{margin:0;font-size:15px;font-weight:600;line-height:22px}",
      ".pis-unavailable{display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));border-radius:10px}",
      /* ── 安装表单 ── */
      ".pis-install{display:flex;flex-direction:column;gap:8px;padding:12px;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));border-radius:10px}",
      ".pis-installHead{display:flex;align-items:center;gap:8px}",
      ".pis-installRow{display:flex;gap:6px;align-items:center}",
      ".pis-input{flex:1 1 auto;min-width:0;font:inherit;font-size:13px;line-height:20px;padding:5px 9px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,#0f1115)}",
      ".pis-input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:1px}",
      ".pis-input:disabled{opacity:.6}",
      ".pis-input[data-invalid='1']{border-color:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".pis-select{font:inherit;font-size:12px;line-height:18px;padding:5px 8px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));background:var(--dsw-alias-bg-base,transparent);color:var(--dsw-alias-label-primary,#0f1115);max-width:200px}",
      ".pis-status{display:flex;flex-direction:column;gap:4px}",
      ".pis-ok{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-business-primary,#4d93f8)}",
      ".pis-builds{margin:0;padding-left:18px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,rgba(15,17,21,.75))}",
      ".pis-spin{display:inline-block;width:11px;height:11px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2,rgba(15,17,21,.16));border-top-color:var(--dsw-alias-state-business-primary,#4d93f8);animation:pis-spin .7s linear infinite}",
      "@keyframes pis-spin{to{transform:rotate(360deg)}}",
      "@media (prefers-reduced-motion: reduce){.pis-spin{animation-duration:2.4s}}",
    ].join("\n");

    /** 把样式挂进文档。加载器会把它认领为「本插件产出的 style」（HMR 卸载时一并清理）。 */
    function installStyles() {
      try {
        if (typeof document === "undefined" || !document.head) return null;
        var existing = document.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]');
        if (existing) return existing;
        var style = document.createElement("style");
        style.setAttribute("data-plugin-css", STYLE_MARKER);
        style.textContent = CSS;
        document.head.appendChild(style);
        return style;
      } catch (error) {
        /* 样式失败只影响观感，绝不影响功能 */
        return null;
      }
    }

    /* ════════════════════ 纯函数（可离线单测，不碰 DOM）════════════════════ */

    /**
     * 把 `remote.pluginManager` 的响应收敛成 `{ official: [], installed: [] }`。
     *
     * 官方 `listBundles()` 的回应形状由宿主决定，本插件**只按已观察到的字段**取值，
     * 认不出就退化成空数组（fail-open：界面显示"还没有"而不是崩掉）。
     */
    function toEntries(payload, key) {
      if (!payload || typeof payload !== "object") return [];
      var value = payload[key];
      if (!Array.isArray(value)) return [];
      var out = [];
      for (var i = 0; i < value.length; i += 1) {
        var entry = normalizeEntry(value[i]);
        if (entry !== null) out.push(entry);
      }
      return out;
    }

    /** 单个组合包条目：只取我们真正会用到的字段，其余原样保留在 `raw` 上。 */
    function normalizeEntry(input) {
      if (!input || typeof input !== "object") return null;
      var name = typeof input.packageName === "string" && input.packageName.length > 0
        ? input.packageName
        : typeof input.name === "string" && input.name.length > 0
          ? input.name
          : null;
      if (name === null) return null;
      return {
        name: name,
        title: typeof input.title === "string" && input.title.length > 0 ? input.title : name,
        description: typeof input.description === "string" ? input.description : "",
        version: typeof input.version === "string" ? input.version : "",
        enabled: input.enabled === true,
        official: input.official === true || input.builtin === true,
        removable: input.removable !== false,
        rows: normalizeRows(input.plugins !== undefined ? input.plugins : input.entries),
        problem: input.problem !== undefined && input.problem !== null ? String(input.problem) : null,
        raw: input,
      };
    }

    /** 组合包里的插件行（可单独开关的那些）。 */
    function normalizeRows(input) {
      if (!Array.isArray(input)) return [];
      var out = [];
      for (var i = 0; i < input.length; i += 1) {
        var row = input[i];
        if (!row || typeof row !== "object") continue;
        var id = typeof row.id === "string" && row.id.length > 0
          ? row.id
          : typeof row.entryId === "string" && row.entryId.length > 0
            ? row.entryId
            : null;
        if (id === null) continue;
        out.push({
          id: id,
          title: typeof row.title === "string" && row.title.length > 0
            ? row.title
            : typeof row.name === "string" && row.name.length > 0
              ? row.name
              : id,
          description: typeof row.description === "string" ? row.description : "",
          enabled: row.enabled === true,
          locked: row.locked === true || row.removable === false,
          problem: row.problem !== undefined && row.problem !== null ? String(row.problem) : null,
        });
      }
      return out;
    }

    /** 从 `listBundles()` 的任意一种回应里取出两组条目。 */
    function splitBundles(payload) {
      var official = toEntries(payload, "official");
      var installed = toEntries(payload, "installed");
      // 宿主若只回一个平铺数组，按 official 标记自行分组。
      if (official.length === 0 && installed.length === 0) {
        var flat = Array.isArray(payload) ? payload : Array.isArray(payload?.bundles) ? payload.bundles : [];
        for (var i = 0; i < flat.length; i += 1) {
          var entry = normalizeEntry(flat[i]);
          if (entry === null) continue;
          if (entry.official) official.push(entry);
          else installed.push(entry);
        }
      }
      return { official: official, installed: installed };
    }

    /** 错误 → 一行可读文字（Remote 的失败可能是字符串、Error、或带 code 的对象）。 */
    function errorText(error) {
      if (error === null || error === undefined) return "";
      if (typeof error === "string") return error;
      if (typeof error.message === "string" && error.message.length > 0) return error.message;
      if (typeof error.code === "string" && error.code.length > 0) return error.code;
      return String(error);
    }

    /* ══════════════════════════ 数据访问（组件用）══════════════════════════ */

    /**
     * 组件与 Remote 之间的薄适配层。
     *
     * 为什么不让组件直接 await：组件要的是"一个快照 + 一次刷新"，
     * 而 Remote 是异步的。这里把三件事收在一处：
     *   · `load()`  读一次列表并归一化；
     *   · `mutate()` 调一个管理方法，成功后重读（官方面板也是这个节奏）；
     *   · 所有失败都变成状态里的 `error` 字符串，**不抛给 React**。
     */
    function createManagerView(remote) {
      var disposed = false;

      function call(method, args) {
        if (disposed || !remote || typeof remote[method] !== "function") {
          return Promise.reject(new Error("remote method unavailable: " + method));
        }
        try {
          return Promise.resolve(remote[method].apply(remote, args || []));
        } catch (error) {
          return Promise.reject(error);
        }
      }

      return {
        available: function () {
          return remote !== null && typeof remote.listBundles === "function";
        },
        load: function () {
          return call("listBundles", []).then(function (payload) {
            return { ok: true, groups: splitBundles(payload) };
          }, function (error) {
            return { ok: false, error: errorText(error) || "listBundles failed" };
          });
        },
        setBundleEnabled: function (name, enabled) {
          return call("setBundleEnabled", [name, enabled]).then(function () {
            return { ok: true };
          }, function (error) {
            return { ok: false, error: errorText(error) };
          });
        },
        setPluginEnabled: function (entryId, enabled) {
          return call("setPluginEnabled", [entryId, enabled]).then(function () {
            return { ok: true };
          }, function (error) {
            return { ok: false, error: errorText(error) };
          });
        },
        removeBundle: function (name) {
          return call("removeBundle", [name]).then(function () {
            return { ok: true };
          }, function (error) {
            return { ok: false, error: errorText(error) };
          });
        },
        /** 能不能装：`inspect` 与 `installBundle` 都在才算（旧宿主只有管理方法）。 */
        canInstall: function () {
          return !disposed
            && remote !== null
            && typeof remote.inspect === "function"
            && typeof remote.installBundle === "function";
        },
        /**
         * 安装前让宿主读一遍这个规格。
         * 官方回应 `{ ok, value: { status, problem?, reason?, registries? } }`：
         *   · `ok === false`      → `value` 不存在，`error` 是失败原因；
         *   · `status === "ready"` → 可以装；
         *   · `status === "refused"` → 宿主拒绝了，`reason` 给人看，`problem` 是机器码。
         * 这里把两种"不行"统一成 `{ ok:false, error }`，让调用方只有一条失败分支。
         */
        inspect: function (spec, options) {
          var opts = options || {};
          var args = [spec, { registry: opts.registry }];
          if (opts.signal !== undefined) args.push(opts.signal);
          return call("inspect", args).then(function (answer) {
            if (!answer || answer.ok !== true) {
              return { ok: false, error: errorText(answer && answer.error) || "inspect failed" };
            }
            var value = answer.value || {};
            if (value.status === "refused") {
              return {
                ok: false,
                error: typeof value.reason === "string" && value.reason.length > 0
                  ? value.reason
                  : "refused",
                problem: typeof value.problem === "string" ? value.problem : null,
                registries: value.registries,
              };
            }
            return { ok: true, value: value };
          }, function (error) {
            return { ok: false, error: errorText(error) || "inspect failed" };
          });
        },
        /**
         * 真的开始装。`requestId` 由调用方生成并留着 —— 取消与"结果丢了再问一次"
         * 都要靠它找回同一个任务。
         */
        installBundle: function (spec, options) {
          var opts = options || {};
          var payload = {
            enabled: opts.enabled === true,
            requestId: opts.requestId,
            registry: opts.registry,
          };
          if (Array.isArray(opts.approvedBuilds) && opts.approvedBuilds.length > 0) {
            payload.approvedBuilds = opts.approvedBuilds.slice();
          }
          return call("installBundle", [spec, payload]).then(function (answer) {
            if (!answer || answer.ok !== true) {
              return { ok: false, error: errorText(answer && answer.error) || "installBundle failed" };
            }
            return { ok: true, result: normalizeInstallResult(answer.value) };
          }, function (error) {
            return { ok: false, error: errorText(error) || "installBundle failed" };
          });
        },
        /**
         * 回应丢了（超时 / 断线）时把同一个任务的结果问回来。
         * `value === null` 表示宿主手上没有这个任务了 —— 那是"结果不明"，
         * 不能假装成功，也不能假装失败。
         */
        waitForInstall: function (requestId) {
          return call("waitForInstall", [requestId]).then(function (answer) {
            if (!answer || answer.ok !== true) {
              return { ok: false, error: errorText(answer && answer.error) || "waitForInstall failed" };
            }
            if (answer.value === null || answer.value === undefined) {
              return { ok: true, result: null };
            }
            return { ok: true, result: normalizeInstallResult(answer.value) };
          }, function (error) {
            return { ok: false, error: errorText(error) || "waitForInstall failed" };
          });
        },
        /** 请求取消。`status` 可能是 `cancelled`，也可能是 `too-late`（已经装完了）。 */
        cancelInstall: function (requestId) {
          return call("cancelInstall", [requestId]).then(function (answer) {
            if (!answer || answer.ok !== true) {
              return { ok: false, error: errorText(answer && answer.error) || "cancelInstall failed" };
            }
            var value = answer.value || {};
            return { ok: true, status: typeof value.status === "string" ? value.status : "unknown" };
          }, function (error) {
            return { ok: false, error: errorText(error) || "cancelInstall failed" };
          });
        },
        /** 宿主提供的安装源列表；失败就退回"只有一个默认源"。 */
        registries: function () {
          return call("registries", []).then(function (answer) {
            if (!answer || answer.ok !== true) {
              return { ok: false, error: errorText(answer && answer.error) || "registries failed", list: [] };
            }
            return { ok: true, list: normalizeRegistries(answer.value) };
          }, function (error) {
            return { ok: false, error: errorText(error) || "registries failed", list: [] };
          });
        },
        dispose: function () {
          disposed = true;
        },
      };
    }

    /**
     * 官方 `installBundle` / `waitForInstall` 的 `value` 收敛成我们要的形状。
     *
     * `application` 是这次安装的**结局**：
     *   · `"success"`          装好了；
     *   · `"restart-required"` 装好了但要重启才生效；
     *   · `"failed"`           失败，`error` 里是原因；
     *   · `"cancelled"`        被取消。
     * 认不出的一律当 `"unknown"` —— 那种情况**不谎报成功**。
     */
    function normalizeInstallResult(value) {
      if (!value || typeof value !== "object") return { application: "unknown", bundle: null, error: null };
      var application = ["success", "restart-required", "failed", "cancelled"].indexOf(value.application) >= 0
        ? value.application
        : "unknown";
      var bundle = value.bundle && typeof value.bundle === "object"
        ? normalizeEntry(value.bundle)
        : null;
      return {
        application: application,
        bundle: bundle,
        error: value.error !== undefined && value.error !== null ? errorText(value.error) : null,
        // pnpm 挡下的构建脚本：用户同意后带回去重装
        pendingBuilds: Array.isArray(value.pendingBuilds) ? value.pendingBuilds.slice() : [],
      };
    }

    /** 安装源列表：官方回的是数组，元素可能是字符串或对象。 */
    function normalizeRegistries(value) {
      if (!Array.isArray(value)) return [];
      var out = [];
      for (var i = 0; i < value.length; i += 1) {
        var item = value[i];
        if (typeof item === "string" && item.length > 0) {
          out.push({ id: item, label: item, value: item });
          continue;
        }
        if (!item || typeof item !== "object") continue;
        var url = typeof item.url === "string" && item.url.length > 0
          ? item.url
          : typeof item.registry === "string" && item.registry.length > 0
            ? item.registry
            : typeof item.value === "string" && item.value.length > 0
              ? item.value
              : null;
        if (url === null) continue;
        out.push({
          id: typeof item.id === "string" && item.id.length > 0 ? item.id : url,
          label: typeof item.label === "string" && item.label.length > 0 ? item.label : url,
          value: url,
        });
      }
      return out;
    }

    /* ════════════════════════════ 组件 ════════════════════════════ */

    /** 一行小标签。 */
    function Tag(props) {
      return jsx("span", {
        className: "pis-tag",
        "data-tone": props.tone,
        children: props.children,
      });
    }

    /** 一个组合包卡片：标题 + 标签 + 描述 + 开关/卸载 + 可单独开关的插件行。 */
    function BundleCard(props) {
      var entry = props.entry;
      var t = props.t;
      var busy = props.busy;
      var onToggle = props.onToggle;
      var onUninstall = props.onUninstall;
      var onToggleRow = props.onToggleRow;

      var confirming = React.useState(false);
      var isConfirming = confirming[0];
      var setConfirming = confirming[1];

      var tags = [];
      if (entry.official) tags.push(jsx(Tag, { key: "official", children: t("official") }, "official"));
      tags.push(jsx(Tag, {
        key: "state",
        tone: entry.enabled ? "on" : undefined,
        children: entry.enabled ? t("bundleOn") : t("bundleOff"),
      }, "state"));
      if (entry.problem !== null) {
        tags.push(jsx(Tag, { key: "problem", tone: "error", children: t("problem") }, "problem"));
      }

      var subtitle = [];
      if (entry.version.length > 0) subtitle.push(t("version") + " " + entry.version);
      if (entry.rows.length > 0) subtitle.push(entry.rows.length + " " + t("rows"));

      return jsxs("li", {
        className: "pis-card",
        "data-pis-bundle": entry.name,
        children: [
          jsxs("div", {
            key: "head",
            className: "pis-cardHead",
            children: [
              jsx("span", { className: "pis-name", title: entry.name, children: entry.title }, "name"),
              jsx("span", { className: "pis-spacer" }, "spacer"),
              jsx("span", { className: "pis-actions", children: tags }, "tags"),
            ],
          }),
          jsxs("p", {
            key: "meta",
            className: "pis-desc",
            children: [
              entry.description,
              entry.description.length > 0 && subtitle.length > 0 ? " · " : "",
              subtitle.join(" · "),
            ],
          }),
          entry.problem !== null
            ? jsx("p", { key: "problem", className: "pis-error", children: entry.problem })
            : null,
          jsxs("div", {
            key: "actions",
            className: "pis-cardHead",
            children: [
              jsx("span", { className: "pis-spacer" }, "spacer"),
              jsx("span", {
                className: "pis-actions",
                children: [
                  jsx("button", {
                    type: "button",
                    className: "pis-btn",
                    disabled: busy,
                    onClick: function () { onToggle(entry, !entry.enabled); },
                    children: entry.enabled ? t("disable") : t("enable"),
                  }, "toggle"),
                  entry.official || !entry.removable
                    ? null
                    : jsx("button", {
                        type: "button",
                        className: "pis-btn",
                        "data-danger": "1",
                        disabled: busy,
                        onClick: function () {
                          if (!isConfirming) { setConfirming(true); return; }
                          setConfirming(false);
                          onUninstall(entry);
                        },
                        onBlur: function () { setConfirming(false); },
                        children: isConfirming ? t("confirmUninstall") : t("uninstall"),
                      }, "uninstall"),
                ],
              }),
            ],
          }),
          entry.rows.length === 0
            ? null
            : jsx("ul", {
                key: "rows",
                className: "pis-rows",
                children: entry.rows.map(function (row) {
                  return jsxs("li", {
                    className: "pis-row",
                    "data-pis-row": row.id,
                    children: [
                      jsx("span", { className: "pis-rowName", title: row.id, children: row.title }, "name"),
                      row.problem !== null
                        ? jsx(Tag, { tone: "error", children: t("problem") }, "problem")
                        : null,
                      jsx("span", { className: "pis-spacer" }, "spacer"),
                      jsx("button", {
                        type: "button",
                        className: "pis-btn",
                        disabled: busy || row.locked || !entry.enabled,
                        title: !entry.enabled
                          ? t("bundleOff")
                          : row.locked
                            ? t("unknown")
                            : undefined,
                        onClick: function () { onToggleRow(entry, row, !row.enabled); },
                        children: row.enabled ? t("disable") : t("enable"),
                      }, "toggle"),
                    ],
                  }, row.id);
                }),
              }),
        ],
      });
    }

    /**
     * 「添加插件」表单。
     *
     * 流程刻意对齐官方面板，但**不做** registry 自动探测与 pnpm 日志流
     * （那些是本插件有意留下的边界，见 README「已知限制」）：
     *   输入规格 → inspect 让宿主先读一遍 → 通过才 installBundle → 看 application 结局
     * 取消与"结果丢了再问一次"都靠同一个 requestId 找回任务。
     */
    function InstallPanel(props) {
      var t = props.t;
      var manager = props.manager;
      var onInstalled = props.onInstalled;

      var specStore = React.useState("");
      var spec = specStore[0];
      var setSpec = specStore[1];

      var phaseStore = React.useState("idle");
      var phase = phaseStore[0];
      var setPhase = phaseStore[1];

      var messageStore = React.useState("");
      var message = messageStore[0];
      var setMessage = messageStore[1];

      var errorStore = React.useState("");
      var error = errorStore[0];
      var setError = errorStore[1];

      var pendingBuildsStore = React.useState([]);
      var pendingBuilds = pendingBuildsStore[0];
      var setPendingBuilds = pendingBuildsStore[1];

      var registriesStore = React.useState([]);
      var registries = registriesStore[0];
      var setRegistries = registriesStore[1];

      var registryStore = React.useState("");
      var registry = registryStore[0];
      var setRegistry = registryStore[1];

      // requestId 与取消都放 ref：它们在异步流程里被读写，走 state 会读到旧值。
      var requestRef = React.useRef(null);
      var disposedRef = React.useRef(false);
      // 组件卸载后不再 setState（下面每个异步回调都先看这个）。
      React.useEffect(function () {
        return function () {
          disposedRef.current = true;
        };
      }, []);

      var canInstall = manager !== null && typeof manager.canInstall === "function" && manager.canInstall();

      // 打开时读一次安装源列表；读不到就只留"默认安装源"。
      React.useEffect(function () {
        if (!canInstall || typeof manager.registries !== "function") return;
        manager.registries().then(function (answer) {
          if (disposedRef.current) return;
          if (answer.ok) setRegistries(answer.list);
        }, function () { /* 读不到就保持空列表 = 只有默认源 */ });
      }, [canInstall, manager]);

      /** 生成一个任务 id。crypto 不可用时退回时间戳 + 随机数（够用，不用于安全）。 */
      function newRequestId() {
        try {
          if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
          }
        } catch (e) { /* 落到下面的退路 */ }
        return "pis-" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
      }

      /** 规格为空或还是模板占位符时，不发请求（官方也会拦住这种）。 */
      function specProblem(value) {
        var trimmed = String(value || "").trim();
        if (trimmed.length === 0) return t("installHint");
        if (/^github:\s*<.*>$/.test(trimmed) || /^<.*>$/.test(trimmed)) return t("installGitPlaceholder");
        return null;
      }

      /**
       * 跑一次安装。`approvedBuilds` 是"用户同意执行这些构建脚本"时带回去的清单。
       */
      function startInstall(approvedBuilds) {
        var problem = specProblem(spec);
        if (problem !== null) {
          setError(problem);
          setPhase("idle");
          return;
        }
        var trimmed = spec.trim();
        var requestId = newRequestId();
        requestRef.current = requestId;
        setError("");
        setMessage("");
        setPendingBuilds([]);
        setPhase("checking");

        var registryArg = registry.length > 0 ? registry : undefined;

        manager.inspect(trimmed, { registry: registryArg }).then(function (checked) {
          if (disposedRef.current || requestRef.current !== requestId) return;
          if (!checked.ok) {
            setPhase("idle");
            setError(checked.error);
            setPendingBuilds(Array.isArray(checked.registries) ? checked.registries : []);
            return;
          }
          setPhase("installing");
          return manager.installBundle(trimmed, {
            enabled: true,
            requestId: requestId,
            registry: registryArg,
            approvedBuilds: approvedBuilds,
          }).then(function (installed) {
            if (disposedRef.current || requestRef.current !== requestId) return;
            requestRef.current = null;
            if (!installed.ok) {
              // 回应丢了：把同一个任务的结果问回来，问不到就是"结果不明"，绝不谎报。
              return manager.waitForInstall(requestId).then(function (recovered) {
                if (disposedRef.current || requestRef.current !== requestId) return;
                requestRef.current = null;
                if (!recovered.ok) {
                  setPhase("unknown");
                  setError(recovered.error);
                  return;
                }
                settle(recovered.result, installed.error);
              });
            }
            settle(installed.result, null);
          });
        }).then(null, function (failure) {
          if (disposedRef.current || requestRef.current !== requestId) return;
          requestRef.current = null;
          setPhase("idle");
          setError(errorText(failure) || t("installFailed"));
        });
      }

      /** 一次安装的结局落地。`fallbackError` 是"回应丢了"时那条原始错误。 */
      function settle(result, fallbackError) {
        if (result === null || result === undefined) {
          setPhase("unknown");
          setError(fallbackError || t("installUnknown"));
          return;
        }
        if (result.application === "cancelled") {
          setPhase("done");
          setMessage(t("installCancelled"));
          return;
        }
        if (result.application === "failed") {
          setPhase("failed");
          setError(result.error || fallbackError || t("installFailed"));
          if (Array.isArray(result.pendingBuilds) && result.pendingBuilds.length > 0) {
            setPendingBuilds(result.pendingBuilds);
          }
          return;
        }
        if (result.application === "success" || result.application === "restart-required") {
          setPhase("done");
          setMessage(result.application === "restart-required" ? t("installDoneRestart") : t("installDone"));
          setSpec("");
          if (typeof onInstalled === "function") onInstalled();
          return;
        }
        // unknown：不谎报成功
        setPhase("unknown");
        setError(fallbackError || t("installUnknown"));
      }

      function cancel() {
        var requestId = requestRef.current;
        if (requestId === null) return;
        setPhase("cancelling");
        manager.cancelInstall(requestId).then(function (answer) {
          if (disposedRef.current) return;
          if (!answer.ok) {
            setPhase("installing");
            setError(answer.error);
            return;
          }
          // too-late = 已经装完了，让它自己跑完；cancelled 就收工。
          if (answer.status === "cancelled") {
            requestRef.current = null;
            setPhase("done");
            setMessage(t("installCancelled"));
          } else {
            setPhase("installing");
          }
        }, function (failure) {
          if (disposedRef.current) return;
          setPhase("installing");
          setError(errorText(failure));
        });
      }

      var busy = phase === "checking" || phase === "installing" || phase === "cancelling";

      var statusNodes = [];
      if (phase === "checking") {
        statusNodes.push(jsx("p", { key: "s", className: "pis-note", children: t("installChecking") }, "s"));
      } else if (phase === "installing") {
        statusNodes.push(jsx("p", { key: "s", className: "pis-note", children: t("installRunning") }, "s"));
      } else if (phase === "cancelling") {
        statusNodes.push(jsx("p", { key: "s", className: "pis-note", children: t("installCancelling") }, "s"));
      } else if (message.length > 0) {
        statusNodes.push(jsx("p", { key: "s", className: "pis-ok", children: message }, "s"));
      }
      if (error.length > 0) {
        statusNodes.push(jsx("p", { key: "e", className: "pis-error", children: error }, "e"));
      }
      if (pendingBuilds.length > 0) {
        statusNodes.push(jsx("p", { key: "b", className: "pis-note", children: t("installPendingBuilds") }, "b"));
        statusNodes.push(jsx("ul", {
          key: "bl",
          className: "pis-builds",
          children: pendingBuilds.map(function (name, index) {
            return jsx("li", { children: typeof name === "string" ? name : errorText(name) }, "b" + index);
          }),
        }, "bl"));
      }

      var actions = [];
      if (busy) {
        actions.push(jsx("button", {
          key: "cancel",
          type: "button",
          className: "pis-btn",
          disabled: phase === "cancelling",
          onClick: cancel,
          children: t("installCancel"),
        }, "cancel"));
      } else {
        if (pendingBuilds.length > 0) {
          actions.push(jsx("button", {
            key: "approve",
            type: "button",
            className: "pis-btn",
            onClick: function () { startInstall(pendingBuilds); },
            children: t("installApproveBuilds"),
          }, "approve"));
        }
        actions.push(jsx("button", {
          key: "go",
          type: "button",
          className: "pis-btn",
          disabled: !canInstall,
          onClick: function () { startInstall(undefined); },
          children: phase === "done" || phase === "failed" || phase === "unknown"
            ? t("installAgain")
            : t("install"),
        }, "go"));
      }

      return jsxs("div", {
        className: "pis-install",
        "data-pis-install": phase,
        children: [
          jsxs("div", {
            key: "head",
            className: "pis-installHead",
            children: [
              jsx("span", { className: "pis-groupTitle", children: t("installTitle") }, "title"),
              busy ? jsx("span", { className: "pis-spin", "aria-hidden": "true" }, "spin") : null,
            ],
          }),
          jsx("p", { key: "hint", className: "pis-note", children: t("installHint") }, "hint"),
          jsxs("div", {
            key: "row",
            className: "pis-installRow",
            children: [
              jsx("input", {
                className: "pis-input",
                type: "text",
                value: spec,
                disabled: busy,
                placeholder: t("installPlaceholder"),
                "aria-label": t("installTitle"),
                "data-invalid": error.length > 0 && specProblem(spec) !== null ? "1" : undefined,
                onChange: function (event) {
                  setSpec(event && event.target ? event.target.value : "");
                  if (error.length > 0) setError("");
                },
                onKeyDown: function (event) {
                  if (event && event.key === "Enter" && !busy) startInstall(undefined);
                },
              }, "input"),
              registries.length > 0
                ? jsx("select", {
                    className: "pis-select",
                    disabled: busy,
                    value: registry,
                    "aria-label": t("registryLabel"),
                    onChange: function (event) {
                      setRegistry(event && event.target ? event.target.value : "");
                    },
                    children: [
                      jsx("option", { key: "", value: "", children: t("registryDefault") }, ""),
                    ].concat(registries.map(function (item) {
                      return jsx("option", { key: item.id, value: item.value, children: item.label }, item.id);
                    })),
                  }, "registry")
                : null,
              jsx("span", { className: "pis-actions", children: actions }, "actions"),
            ],
          }),
          statusNodes.length > 0
            ? jsx("div", { key: "status", className: "pis-status", children: statusNodes }, "status")
            : null,
          jsx("p", { key: "trust", className: "pis-note", children: t("installTrust") }, "trust"),
        ],
      });
    }

    /**
     * 「插件管理」标签页本体。
     *
     * 单组件设计：所有 hook 都在同一个实例上，展开/刷新不会改变 hook 顺序。
     * 任何一步失败都收敛成可读文字，**绝不抛**（抛了会把整个设置面板打崩）。
     */
    function PluginManagerTab(props) {
      var t = props.t;
      var manager = props.manager;

      var stateStore = React.useState({ status: "loading", official: [], installed: [], error: "" });
      var state = stateStore[0];
      var setState = stateStore[1];
      var busyStore = React.useState(null);
      var busy = busyStore[0];
      var setBusy = busyStore[1];
      var actionErrorStore = React.useState("");
      var actionError = actionErrorStore[0];
      var setActionError = actionErrorStore[1];

      /** 读一次列表。`silent` 为真时不清空已有内容（刷新期间列表不闪）。 */
      var load = React.useCallback(function (silent) {
        if (manager === null || !manager.available()) {
          setState({ status: "unavailable", official: [], installed: [], error: "" });
          return;
        }
        if (!silent) setState(function (prev) { return { ...prev, status: prev.status === "ready" ? "ready" : "loading" }; });
        manager.load().then(function (result) {
          if (result.ok) {
            setState({
              status: "ready",
              official: result.groups.official,
              installed: result.groups.installed,
              error: "",
            });
          } else {
            setState(function (prev) {
              // 已经读到过内容就保留着，只在下面显示一条错误（和官方「刷新失败保留旧列表」一致）
              return { ...prev, status: prev.status === "ready" ? "ready" : "error", error: result.error };
            });
          }
        }, function (error) {
          setState(function (prev) {
            return { ...prev, status: prev.status === "ready" ? "ready" : "error", error: errorText(error) };
          });
        });
      }, [manager]);

      React.useEffect(function () {
        load(true);
        return function () {
          if (manager !== null) manager.dispose();
        };
      }, [load, manager]);

      /** 跑一个管理动作：成功后重读，失败则显示一行错误。 */
      var run = React.useCallback(function (key, operation) {
        setBusy(key);
        setActionError("");
        operation().then(function (result) {
          setBusy(null);
          if (result.ok) { load(true); return; }
          setActionError(result.error || t("toggleFailed"));
        }, function (error) {
          setBusy(null);
          setActionError(errorText(error) || t("toggleFailed"));
        });
      }, [load, t]);

      if (state.status === "unavailable") {
        return jsxs("div", {
          className: "pis-unavailable",
          "data-pis-state": "unavailable",
          children: [
            jsx("h3", { className: "pis-title", children: t("unavailableTitle") }),
            jsx("p", { className: "pis-desc", children: t("unavailableBody") }),
            jsx("div", {
              className: "pis-cardHead",
              children: [
                jsx("span", { className: "pis-spacer" }, "spacer"),
                jsx("button", {
                  type: "button",
                  className: "pis-btn",
                  onClick: function () { load(false); },
                  children: t("retry"),
                }, "retry"),
              ],
            }),
          ],
        });
      }

      var groups = [];
      if (state.official.length > 0) {
        groups.push({ key: "official", title: t("official"), entries: state.official });
      }
      if (state.installed.length > 0) {
        groups.push({ key: "installed", title: t("installed"), entries: state.installed });
      }

      return jsxs("div", {
        className: "pis-root",
        "data-pis-state": state.status,
        children: [
          jsxs("div", {
            key: "bar",
            className: "pis-bar",
            children: [
              jsx("p", { className: "pis-note", children: t("runtimeNote") }),
              jsx("button", {
                type: "button",
                className: "pis-btn",
                disabled: busy !== null,
                onClick: function () { load(true); },
                children: busy !== null ? t("refreshing") : t("refresh"),
              }, "refresh"),
            ],
          }),
          jsx(InstallPanel, {
            key: "install",
            t: t,
            manager: manager,
            onInstalled: function () { load(true); },
          }),
          state.error.length > 0
            ? jsx("p", { key: "error", className: "pis-error", children: state.error })
            : null,
          actionError.length > 0
            ? jsx("p", { key: "actionError", className: "pis-error", children: actionError })
            : null,
          state.status === "loading"
            ? jsx("p", { key: "loading", className: "pis-empty", children: t("loading") })
            : null,
          groups.length === 0 && state.status !== "loading"
            ? jsx("p", { key: "empty", className: "pis-empty", children: t("empty") })
            : null,
          groups.map(function (group) {
            return jsxs("div", {
              className: "pis-group",
              "data-pis-group": group.key,
              children: [
                jsx("h3", { className: "pis-groupTitle", children: group.title }, "title"),
                jsx("ul", {
                  className: "pis-cards",
                  children: group.entries.map(function (entry) {
                    return jsx(BundleCard, {
                      entry: entry,
                      t: t,
                      busy: busy !== null,
                      onToggle: function (target, enabled) {
                        run("bundle:" + target.name, function () {
                          return manager.setBundleEnabled(target.name, enabled);
                        });
                      },
                      onUninstall: function (target) {
                        run("bundle:" + target.name, function () {
                          return manager.removeBundle(target.name);
                        });
                      },
                      onToggleRow: function (bundle, row, enabled) {
                        run("row:" + row.id, function () {
                          return manager.setPluginEnabled(row.id, enabled);
                        });
                      },
                    }, group.key + ":" + entry.name);
                  }),
                }, "cards"),
              ],
            }, group.key);
          }),
        ],
      });
    }

    /* ════════════════════════════ 注册 ════════════════════════════ */

    /**
     * 本插件需要的全部服务。
     *
     * 关键的一条是 `remote.pluginManager`：它由官方 `ui-plugin-manager` 的
     * `dsh-plugin-manager` 宿主半边暴露。**如果那个插件没装/被关掉**，
     * 本插件不会停在 PENDING（那会连累整棵插件树）—— `slots`/`locale` 是硬依赖，
     * 而 `remote.pluginManager` 通过 `ctx.get()` 软探测，认不出就显示"暂不可用"。
     */
    var inject = ["slots", "locale"];

    var NS = "pluginsInSettings";

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: ZH, en: EN });
      }, "plugins-in-settings: dictionaries");

      var t = ctx.locale.bind(NS);

      /** 软探测 pluginManager 远程命名空间：拿不到就是 null，绝不抛。 */
      function remoteOf() {
        try {
          var remote = ctx.get("remote");
          if (!remote || typeof remote !== "object") return null;
          var manager = remote.pluginManager;
          if (!manager || typeof manager.listBundles !== "function") return null;
          return manager;
        } catch (error) {
          return null;
        }
      }

      installStyles();

      ctx.slots.inject(SLOT_NAME, function () {
        return ctx.slots.register({
          name: SLOT_NAME,
          id: TAB_ID,
          order: TAB_ORDER,
          label: function () { return t("tab"); },
          locale: NS,
        }, function TabContent(props) {
          /**
           * 每次挂载时重新探测远程命名空间。
           *
           * **不能**把探测结果永久缓存：远程命名空间可能在本标签页已经被渲染过之后
           * 才就绪（例如官方插件面板随后才启用）。缓存住一个"不可用"的 view，
           * 会让这一页永远停在"暂不可用"，即使能力早就到位了。
           * 因此 useMemo 的依赖是 `available` 这个布尔值本身 —— 只要可用性一变，
           * 就换一个新的 view；返回 null 的边界也一并由 createManagerView 兜住。
           */
          var available = React.useMemo(function () {
            return remoteOf() !== null;
          }, []);
          var manager = React.useMemo(function () {
            return createManagerView(remoteOf());
          }, [available]);
          return jsx(PluginManagerTab, { t: props.t, manager: manager });
        });
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    // 离线测试用的接缝（纯函数 + 组件本身）。运行时无副作用。
    exports.__internals = {
      CSS: CSS,
      SLOT_NAME: SLOT_NAME,
      TAB_ID: TAB_ID,
      TAB_ORDER: TAB_ORDER,
      ZH: ZH,
      EN: EN,
      PluginManagerTab: PluginManagerTab,
      InstallPanel: InstallPanel,
      BundleCard: BundleCard,
      createManagerView: createManagerView,
      splitBundles: splitBundles,
      normalizeEntry: normalizeEntry,
      normalizeRows: normalizeRows,
      normalizeInstallResult: normalizeInstallResult,
      normalizeRegistries: normalizeRegistries,
      toEntries: toEntries,
      errorText: errorText,
      installStyles: installStyles,
    };

    return module.exports;
  },
});
