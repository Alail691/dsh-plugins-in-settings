/**
 * 预检：把本插件对着**真实安装**的 DSH 产物核一遍契约。
 *
 * 离线单测（`node test/run.mjs`）验的是"我们自己的形状对不对"；
 * 这里验的是"我们挂的那个地方还在不在" —— 官方的槽位名、注册形状、
 * 标签页 id 有没有被人占用。官方升级改掉这些时，先在这里炸，
 * 而不是等装进真机才发现"设置里空的"。
 *
 * 用法：`node test/preflight.mjs`
 *   自动在 DSH_HOME（默认 ~/.dsh）下找 profile 的 node_modules 与 app.asar；
 *   找不到就**跳过**并把跳过的项如实打印出来（退出码仍是 0）。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openAsar } from "./asar.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));

let passed = 0;
const failures = [];
const skipped = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ name, detail });
}

function skip(name, why) {
  skipped.push({ name, why });
}

const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || "", ".dsh");
const profilesDir = join(dshHome, "profiles");

/** 找一个真实存在的 profile 目录。 */
function findProfile() {
  if (!existsSync(profilesDir)) return null;
  for (const name of readdirSync(profilesDir)) {
    const dir = join(profilesDir, name);
    if (existsSync(join(dir, "package.json"))) return { name, dir };
  }
  return null;
}

const profile = findProfile();

/* ── 1. 本包自己的清单 ── */
check("package.json 有 name", typeof pkg.name === "string" && pkg.name.length > 0);
check("name 与产物里的 bundle id 一致（boot 图靠它对上）",
  readFileSync(join(here, "..", "lib", "client.js"), "utf8").includes(`id: "${pkg.name}"`));
check("声明了 dsh.bundle.patch（组合包必需）",
  typeof pkg.dsh?.bundle?.patch === "string" && pkg.dsh.bundle.patch.length > 0);
check("声明了 dsh.client.platform = web",
  pkg.dsh?.client?.platform === "web");
check("patch 文件真的存在",
  existsSync(join(here, "..", pkg.dsh.bundle.patch)));
check("exports 里有 ./client",
  typeof pkg.exports?.["./client"] === "object" || typeof pkg.exports?.["./client"] === "string");
check("main 指向存在的文件",
  existsSync(join(here, "..", pkg.main)));
check("keywords 带 dsh-plugin（插件市场按 topic/keyword 收录）",
  Array.isArray(pkg.keywords) && pkg.keywords.includes("dsh-plugin"));
check("没有 private:true（发 npm / 被别人装时不能锁住）", pkg.private !== true);
check("没有运行时 dependencies（零依赖，装上即用）",
  pkg.dependencies === undefined || Object.keys(pkg.dependencies).length === 0);

/* ── 2. 目标槽位在官方产物里还在不在 ── */

/**
 * 官方包有两处可能的落点：
 *   1. profile 的 node_modules（被显式装进来的情况）；
 *   2. 应用的 app.asar（DSH 自带的情况 —— 这是最常见的）。
 * 两处都找一遍，谁先有内容就用谁。找不到就跳过（如实打印）。
 */
function locateBundle(packageDir) {
  const inner = `dsh/node_modules/@deepseek-ai/${packageDir}/lib/client.js`;

  // 先看 profile 的 node_modules
  if (profile) {
    const path = join(profile.dir, "node_modules", "@deepseek-ai", packageDir, "lib", "client.js");
    if (existsSync(path)) return { kind: "file", path, text: readFileSync(path, "utf8") };
  }

  // 再看应用目录里的 app.asar
  for (const asarPath of candidateAsars()) {
    try {
      const asar = openAsar(asarPath);
      const text = asar.read(inner);
      if (text !== null) return { kind: "asar", path: `${asarPath}::${inner}`, text };
    } catch {
      /* 这个 asar 打不开就换下一个 */
    }
  }

  return null;
}

/** 猜测应用把 app.asar 放在哪。 */
function candidateAsars() {
  const out = [];
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const roots = [
    localAppData && join(localAppData, "Programs", "DeepSeek Harness", "resources"),
    programFiles && join(programFiles, "DeepSeek Harness", "resources"),
  ].filter(Boolean);
  for (const root of roots) {
    const asar = join(root, "app.asar");
    if (existsSync(asar)) out.push(asar);
  }
  // 也可以用 DSH_ASAR 显式指定（CI / 非标准安装位置）
  if (process.env.DSH_ASAR && existsSync(process.env.DSH_ASAR)) out.push(process.env.DSH_ASAR);
  return out;
}

const settingsPlugins = locateBundle("dsh-client-ui-settings-plugins");
if (settingsPlugins !== null) {
  const bundle = settingsPlugins.text;
  check("官方设置页仍声明 settings.plugins.tab", bundle.includes("settings.plugins.tab"));
  check("官方设置页仍注册在 settings.section 下", bundle.includes("settings.section"));
  check("官方设置页的槽位是 list 类型（可叠加多个标签页）", bundle.includes("list"));
} else {
  skip("官方设置页契约", "没在 profile node_modules 或 app.asar 里找到 ui-settings-plugins");
}

/*
 * 官方只读清单（`ui-settings-plugin-inventory`）是 `settings.plugins.tab` 里
 * **唯一一个已存在的占用者**，它的 id 是 `all` —— 本插件用 `manage`，
 * 刻意不撞它。这个包是独立的一份产物，所以单独定位。
 */
const inventory = locateBundle("dsh-client-ui-settings-plugin-inventory");
if (inventory !== null) {
  const bundle = inventory.text;
  check("官方只读清单仍挂在 settings.plugins.tab", bundle.includes("settings.plugins.tab"));
  check("官方只读清单仍占用 id all（本插件必须避开）", bundle.includes('"all"'));
  check("本插件没有占用官方 id all", !readFileSync(join(here, "..", "lib", "client.js"), "utf8").includes('id: "all"'));
} else {
  skip("官方只读清单契约", "没找到 ui-settings-plugin-inventory");
}

/* ── 3. pluginManager 远程命名空间是否可达（决定内嵌能不能取到数） ── */
const pluginManager = locateBundle("dsh-client-ui-plugin-manager");
if (pluginManager !== null) {
  const bundle = pluginManager.text;
  check("官方插件面板仍走 remote.pluginManager", bundle.includes("remote.pluginManager"));
  for (const method of ["listBundles", "setBundleEnabled", "setPluginEnabled", "removeBundle"]) {
    check(`官方插件面板仍提供 ${method}`, bundle.includes(method));
  }
  // 安装链路：本插件的「添加插件」表单直接调这四个方法
  for (const method of ["inspect", "installBundle", "waitForInstall", "cancelInstall"]) {
    check(`官方插件面板仍提供安装方法 ${method}`, bundle.includes(method));
  }
  // 结局字段：本插件按 application 判断成功 / 失败 / 取消 / 未知
  for (const outcome of ["success", "restart-required", "failed", "cancelled"]) {
    check(`官方仍使用 install application 取值 ${outcome}`, bundle.includes(`"${outcome}"`));
  }
  check("官方仍用 ok/value 信封包住远程回应", bundle.includes(".ok") && bundle.includes(".value"));
  // 本插件依赖 pnpm 构建脚本待批的清单，用来给「同意并重试」
  check("官方仍回报 pendingBuilds（本插件的「同意并重试」依赖它）", bundle.includes("pendingBuilds"));
  check("官方仍接受 approvedBuilds 参数", bundle.includes("approvedBuilds"));
} else {
  skip("pluginManager 远程契约", "没在 profile node_modules 或 app.asar 里找到 ui-plugin-manager");
}

/* ── 4. 本插件是否已经装进某个 profile ── */
if (profile) {
  const manifestPath = join(profile.dir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const inDeps = Boolean(manifest.dependencies?.[pkg.name]);
  const inBundles = Array.isArray(manifest.dsh?.profile?.bundles)
    && manifest.dsh.profile.bundles.includes(pkg.name);
  const linked = existsSync(join(profile.dir, "node_modules", pkg.name));
  if (inDeps || inBundles || linked) {
    check(`profile "${profile.name}"：已写入依赖`, inDeps);
    check(`profile "${profile.name}"：已加入 bundles`, inBundles);
    check(`profile "${profile.name}"：node_modules 里已链接`, linked);
  } else {
    skip(`profile "${profile.name}" 的安装状态`, "本插件尚未装进这个 profile（用 install.cmd 安装）");
  }
} else {
  skip("profile", `没找到任何 profile（${profilesDir}）`);
}

/* ── 结果 ── */
if (skipped.length > 0) {
  console.log(`\n跳过 ${skipped.length} 项：`);
  for (const item of skipped) console.log(`  – ${item.name}：${item.why}`);
}

if (failures.length > 0) {
  console.error(`\n✗ 预检失败 ${failures.length} 项 / 共 ${passed + failures.length} 项\n`);
  for (const failure of failures) {
    console.error(`  · ${failure.name}`);
    if (failure.detail) console.error(`      ${failure.detail}`);
  }
  process.exit(1);
}

console.log(`\n✓ 预检通过：${passed} 项`);
