/**
 * 发布前自检：能不能安全地推到 GitHub / 发到市场。
 *
 * `test/preflight.mjs` 查的是"我们和官方契约对不对得上"；
 * 这个脚本查的是"**这个包本身够不够格被发布**"：
 *   · package.json 的必填项与市场收录要求（topic / keyword）
 *   · 仓库不该带出去的东西（private、运行时依赖、占位符）
 *   · `files` 白名单里的文件是否真的存在
 *   · lib/client.js 是否与 lib/index.js 的静态核对一致
 *
 * 用法：`node test/publish-check.mjs`
 *   有 **错误** → 退出码 1（发布前必须修）
 *   只有 **警告** → 退出码 0（可以发，但建议看一眼）
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const errors = [];
const warnings = [];
const passed = [];

function ok(name) { passed.push(name); }
function fail(name, detail) { errors.push({ name, detail }); }
function warn(name, detail) { warnings.push({ name, detail }); }

/* ── 1. 必填项 ── */
for (const field of ["name", "version", "description", "license"]) {
  if (typeof pkg[field] === "string" && pkg[field].length > 0) ok(`${field} 已填`);
  else fail(`${field} 缺失`, "插件市场与 npm 都会读这个字段");
}

if (pkg.main && existsSync(join(root, pkg.main))) ok("main 指向真实文件");
else fail("main 指向的文件不存在", String(pkg.main));

/* ── 2. DSH 插件必需声明 ── */
if (pkg.dsh?.bundle?.patch) {
  if (existsSync(join(root, pkg.dsh.bundle.patch))) ok("dsh.bundle.patch 指向真实文件");
  else fail("dsh.bundle.patch 指向的文件不存在", pkg.dsh.bundle.patch);
} else {
  fail("缺少 dsh.bundle.patch", "DSH 靠它把本包挂进组合包树");
}

if (pkg.dsh?.client?.platform === "web") ok("dsh.client.platform = web");
else fail("dsh.client.platform 不是 web", "浏览器半边不会被编进启动图");

const clientExport = pkg.exports?.["./client"];
if (clientExport !== undefined) ok("exports 暴露 ./client");
else fail("exports 里没有 ./client", "dsh-client-modules 靠它取浏览器半边");

/* ── 3. 不该带出去的东西 ── */
if (pkg.private === true) fail("package.json 里有 private: true", "npm 会拒绝发布、别人也装不了");
else ok("没有 private: true");

const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length === 0) ok("零运行时依赖");
else warn(`有 ${deps.length} 个运行时依赖`, "本插件设计为零依赖，加了之后接收方需要 pnpm install");

const placeholders = JSON.stringify(pkg).match(/REPLACE_WITH[A-Z_]*/g) ?? [];
if (placeholders.length === 0) ok("没有未替换的占位符");
else fail(`有 ${placeholders.length} 处未替换的占位符`, "把它们换成真实的 GitHub 用户名，否则 repository/homepage/bugs 全是坏的");

/* ── 4. 插件市场的收录要求 ── */
if ((pkg.keywords ?? []).includes("dsh-plugin")) ok("keywords 含 dsh-plugin");
else warn("keywords 不含 dsh-plugin", "建议加上，便于市场按关键词检索");

if (typeof pkg.repository?.url === "string" && pkg.repository.url.includes("github.com")) {
  ok("repository 指向 GitHub");
} else {
  warn("repository 不是 GitHub 地址", "市场按 GitHub 仓库收录，建议补全");
}

/* ── 5. files 白名单里的文件都得在 ── */
const missing = [];
for (const entry of pkg.files ?? []) {
  if (!existsSync(join(root, entry))) missing.push(entry);
}
if (missing.length === 0) ok(`files 白名单里的 ${(pkg.files ?? []).length} 项都存在`);
else fail("files 白名单里有不存在的文件", missing.join(", "));

// 关键文件必须在白名单里，否则别人装上会少东西
for (const required of ["lib/client.js", "lib/index.js", "cordis.patch.yml"]) {
  if ((pkg.files ?? []).includes(required)) ok(`${required} 在白名单里`);
  else fail(`${required} 不在 files 白名单里`, "发布后会缺文件");
}

/* ── 6. 产物与宿主核对的一致性 ── */
const clientPath = join(root, "lib", "client.js");
const hostPath = join(root, "lib", "index.js");
if (existsSync(clientPath) && existsSync(hostPath)) {
  const client = readFileSync(clientPath, "utf8");
  const host = readFileSync(hostPath, "utf8");
  const bundleId = `id: "${pkg.name}"`;
  if (client.includes(bundleId) || client.includes(`id:"${pkg.name}"`)) ok("产物 bundle id 与包名一致");
  else fail("产物 bundle id 与包名不一致", "boot 图会对不上，插件永远不会加载");

  // 宿主半边的核对清单必须都能在产物里找到（否则它一装就报"检查未通过"）
  const needles = [...host.matchAll(/needle:\s*"([^"]+)"/g)].map((m) => m[1]);
  const absent = needles.filter((n) => !client.includes(n));
  if (absent.length === 0) ok(`宿主核对的 ${needles.length} 个标志都在产物里`);
  else fail("宿主核对的标志在产物里找不到", absent.join(", "));

  if (/exports\.apply\s*=/.test(client)) ok("产物导出 apply");
  else fail("产物没有导出 apply", "插件永远不会被激活");
} else {
  fail("缺少 lib/client.js 或 lib/index.js", "两个半边都必须提交");
}

/* ── 7. 文档 ── */
for (const doc of ["README.md", "LICENSE"]) {
  if (existsSync(join(root, doc))) ok(`${doc} 存在`);
  else fail(`缺少 ${doc}`, "市场与使用者都会看");
}

/* ── 结果 ── */
if (warnings.length > 0) {
  console.log(`\n警告 ${warnings.length} 条（可以发布，但建议看一眼）：`);
  for (const w of warnings) console.log(`  ! ${w.name}\n      ${w.detail}`);
}

if (errors.length > 0) {
  console.error(`\n✗ 有 ${errors.length} 项必须先修 / 共 ${passed.length + errors.length} 项\n`);
  for (const e of errors) console.error(`  · ${e.name}\n      ${e.detail}`);
  process.exit(1);
}

console.log(`\n✓ 可以发布：${passed.length} 项检查通过${warnings.length > 0 ? `（另有 ${warnings.length} 条警告）` : ""}`);
