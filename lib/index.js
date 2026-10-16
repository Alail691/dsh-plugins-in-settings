/**
 * dsh-plugins-in-settings — 宿主半边（零依赖、空逻辑）
 *
 * 这个插件的全部功能都在客户端半边（`lib/client.js`）。宿主半边存在的唯一理由是
 * **让这个包成为 cordis 树上的一行**：`dsh.client` 的客户端 bundle 是靠
 * 「宿主 Loader 的条目里有这个包」被 `dsh-client-modules` 扫出来、编进
 * `window.__DSH_BOOT__` 的。没有宿主条目，客户端产物永远不会被加载。
 *
 * 三条纪律（沿用 DSH 生态里已被事故验证过的形状）：
 *   1. **apply() 绝不抛错**：同步抛错会让该条目的 fiber 失败，启动审计会把它报成
 *      「Failed to load plugins」。这里除了静态核对什么都不做，所以也没有可抛的东西。
 *   2. **inject 不声明任何服务**：本插件宿主半边不需要宿主能力。申明一个从未被
 *      provide 的服务会让 fiber 停在 PENDING，从而拖累整棵插件树。
 *   3. **不打日志噪音**：加载成功不值得写一行日志；出问题时该看的是界面。
 *      因此这里只在客户端产物缺失/不匹配时告警一次 —— 那是唯一一种
 *      「插件装了但设置里不会有东西」的宿主侧可观测故障。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PACKAGE_ID = "dsh-plugins-in-settings";

/** 客户端产物里必须出现的标志。少任何一个都意味着「装了但界面不会有东西」。 */
const REQUIRED_MARKERS = [
  // 模块加载器的注册头：id 必须与本包名一致，否则 boot 图对不上
  { needle: `id: "${PACKAGE_ID}"`, alt: `id:"${PACKAGE_ID}"`, why: "bundle id 不匹配" },
  // 必须是模块加载器 bundle，而不是被打包成 ESM 的普通文件
  { needle: "__ModuleLoader__.load", why: "不是模块加载器 bundle" },
  // 工厂必须交出 exports，否则 apply 永远不会被调用
  { needle: "return module.exports", why: "工厂没有交出 exports" },
  // 目标插槽：本插件的立足点就是设置里的这个标签页槽
  { needle: "settings.plugins.tab", why: "没有声明目标插槽 settings.plugins.tab" },
  // 官方插件的能力面：内嵌面板就是靠它取数的
  { needle: "remote.pluginManager", why: "没有声明 pluginManager 远程依赖" },
  // 安装链路：少了这些，"添加插件"会静默变成只能看不能装
  { needle: "installBundle", why: "没有实现安装（installBundle）" },
  { needle: "waitForInstall", why: "没有实现安装结果找回（waitForInstall）" },
  { needle: /exports\.apply\s*=/, why: "没有导出 apply" },
];

/**
 * 静态核对客户端产物：只读文件、查关键标志，**不执行**产物。
 * 任何问题只告警，绝不阻断启动（这份产物坏了，坏的也只是设置里的一个标签页）。
 *
 * @param {(message: string) => void} log - 已绑定好命名空间的日志函数
 */
function auditClientBundle(log) {
  try {
    const bundle = readFileSync(fileURLToPath(new URL("./client.js", import.meta.url)), "utf8");
    const problems = [];
    for (const marker of REQUIRED_MARKERS) {
      const hit = typeof marker.needle === "string"
        ? bundle.includes(marker.needle) || (marker.alt !== undefined && bundle.includes(marker.alt))
        : marker.needle.test(bundle);
      if (!hit) problems.push(marker.why);
    }
    if (problems.length > 0) {
      log(`客户端产物 lib/client.js 检查未通过（设置里可能不会出现「插件管理」标签页）：${problems.join("；")}`);
      return;
    }
    log(`客户端产物 lib/client.js 就绪（${Buffer.byteLength(bundle, "utf8")} 字节，静态检查通过）`);
  } catch (error) {
    log(`客户端产物 lib/client.js 不可读（设置里不会出现「插件管理」标签页）：${String(error)}`);
  }
}

/**
 * @param ctx 宿主 cordis 上下文（本插件不使用它的任何能力）
 */
export function apply(ctx) {
  try {
    const candidate = ctx?.logger;
    const sink = typeof candidate === "function" ? candidate(PACKAGE_ID) : candidate;
    const log = (message) => {
      try {
        if (sink && typeof sink.info === "function") sink.info(`[${PACKAGE_ID}] ${message}`);
        else console.info(`[${PACKAGE_ID}] ${message}`);
      } catch {
        /* 连日志都不能抛 */
      }
    };
    auditClientBundle(log);
  } catch {
    /* 审计本身失败也必须让 apply 静默成功 */
  }
}

export default { apply };
