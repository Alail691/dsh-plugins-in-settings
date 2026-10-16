/**
 * 验证 scripts/push.mjs 的决策逻辑（无子进程、无网络、不碰真仓库）。
 *
 * 为什么不用子进程：受限沙箱禁止 Node 用管道 stdio 起子进程（EPERM），
 * `execFileSync` 会被直接杀掉。所以这里改成**把转换后的脚本写成文件再 import**
 * —— 同一个进程内执行，绕开那个限制，被测逻辑一行不改。
 *
 * 覆盖的是"脚本会不会在该继续时继续、该拦住时拦住"这几条真实分叉，
 * 尤其是**首次推送**（还没有 origin）这个最容易崩、也最常见的状态。
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const realRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(realRoot, "scripts", "push.mjs"), "utf8");

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) { passed += 1; return; }
  failures.push({ name, detail });
}

/**
 * 造一个场景脚本：把 git 与 GitHub API 换成假的，其余逻辑原样。
 * 假实现写进**生成的文件**里（同进程 import，不经 stdout 传递）。
 */
function buildScenario({ remote, repoStatus, topics, branch = "main", dirty = "", tagExists = "", reset = null, topicsStatus = 200 }) {
  let code = source;

  code = code.replace(
    /function git\(gitArgs, options = \{\}\) \{[\s\S]*?\n\}/,
    `function git(gitArgs, options = {}) {
  const key = gitArgs.join(" ");
  const answer = __FAKE_GIT__(key);
  if (answer === null) {
    const error = new Error("git " + key + " failed");
    error.gitDetail = "fake failure";
    throw error;
  }
  if (key.startsWith("push")) { globalThis.__PROBE__.pushed.push(key); return ""; }
  return answer;
}`,
  );

  code = code.replace(
    /function api\(path\) \{[\s\S]*?\n\}/,
    `function api(path) { return Promise.resolve(__FAKE_API__(path)); }`,
  );

  code = code.replace(/import https from "node:https";\n/, "");
  code = code.replace(/const root = .*?;/, `const root = ${JSON.stringify(realRoot)};`);
  // 不要真的 process.exit —— 那会杀掉跑测试的这个进程
  code = code.replace(/process\.exit\((\d+)\);/g, "throw new __ExitError__($1);");

  const preamble = `
export class __ExitError__ extends Error {
  constructor(code) { super("exit " + code); this.exitCode = code; }
}
const __FAKE_GIT__ = (key) => {
  if (key === "rev-parse --abbrev-ref HEAD") return ${JSON.stringify(branch)};
  if (key === "status --porcelain") return ${JSON.stringify(dirty)};
  if (key === "rev-list --count HEAD") return "5";
  if (key === "remote get-url origin") return ${JSON.stringify(remote)};
  if (key.startsWith("tag --list")) return ${JSON.stringify(tagExists)};
  if (key.startsWith("remote add") || key.startsWith("remote set-url")) { globalThis.__PROBE__.remoteSet = key; return ""; }
  if (key.startsWith("tag -a")) { globalThis.__PROBE__.tagged = key; return ""; }
  return "";
};
const __FAKE_API__ = (path) => {
  if (path.endsWith("/topics")) {
    if (${topicsStatus} !== 200) return { status: ${topicsStatus}, body: "{}", remaining: "0", reset: ${JSON.stringify(reset)} };
    return { status: 200, body: JSON.stringify({ names: ${JSON.stringify(topics)} }) };
  }
  if (${repoStatus} === 404) return { status: 404, body: "{}", remaining: "50", reset: null };
  if (${repoStatus} === 403) {
    return {
      status: 403,
      body: JSON.stringify({ message: "API rate limit exceeded" }),
      remaining: "0",
      reset: ${JSON.stringify(reset)},
    };
  }
  return {
    status: 200,
    body: JSON.stringify({ created_at: "2026-10-16T00:00:00Z", default_branch: "main" }),
    remaining: "50",
    reset: null,
  };
};
globalThis.__PROBE__ = { pushed: [], remoteSet: null, tagged: null };
`;

  const dir = mkdtempSync(join(tmpdir(), "pushcheck-"));
  const file = join(dir, "push.mjs");
  writeFileSync(file, preamble + code, "utf8");
  return { dir, file };
}

/** 在这个进程里跑一个场景，抓 stdout 与是否抛 __ExitError__。 */
async function run(file, args) {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const lines = [];
  let exitCode = 0;
  let thrown = null;

  process.argv = [process.execPath, file, ...args];
  console.log = (...a) => lines.push(a.join(" "));
  console.error = (...a) => lines.push(a.join(" "));
  // fail() 会调 process.exit；这里拦成抛异常，免得杀掉测试进程
  process.exit = (code) => { throw new Error("__PROCESS_EXIT__" + (code ?? 0)); };

  try {
    const url = pathToFileURL(file).href + `?t=${Date.now()}${Math.random()}`;
    await import(url);
  } catch (error) {
    thrown = error;
    if (error && typeof error.exitCode === "number") exitCode = error.exitCode;
    else if (String(error.message).startsWith("__PROCESS_EXIT__")) {
      exitCode = Number(String(error.message).slice("__PROCESS_EXIT__".length));
    } else {
      exitCode = -1; // 真异常
    }
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
  }

  // 生成的脚本在自己的前言里初始化 __PROBE__，所以要在**跑完之后**再读它
  // （跑之前设会被前言覆盖掉）。
  return { out: lines.join("\n"), exitCode, thrown, probe: globalThis.__PROBE__ ?? { pushed: [], remoteSet: null, tagged: null } };
}

/* ── 用例 ── */

// 1) 没有 origin（用户实际遇到的场景）：不该崩，应报告仓库不存在并给建仓指引
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 404, topics: [] });
  const r = await run(file, ["--check"]);
  check("无 origin：不崩（不是未捕获异常）", r.exitCode !== -1, r.thrown && r.thrown.message);
  check("无 origin：显示 (未设置，推送时会自动加上)",
    r.out.includes("(未设置"), r.out);
  check("无 origin：报告仓库还不存在", r.out.includes("还没有"), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// 2) 仓库存在 + 有 topic → --check 通过
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 200, topics: ["dsh-plugin", "dsh"] });
  const r = await run(file, ["--check"]);
  check("仓库存在+topic：退出 0", r.exitCode === 0, `exit=${r.exitCode}\n${r.out}`);
  check("仓库存在+topic：提示 topic ✓", r.out.includes("dsh-plugin"), r.out);
  rmSync(dir, { recursive: true, force: true });
}

// 3) 仓库存在但缺 topic → 提醒市场收录（但不阻断）
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 200, topics: ["dsh"] });
  const r = await run(file, ["--check"]);
  check("缺 topic：提醒不会被收录", r.out.includes("不会被收录"), r.out);
  check("缺 topic：--check 仍退出 0", r.exitCode === 0, `exit=${r.exitCode}`);
  rmSync(dir, { recursive: true, force: true });
}

// 4) 工作区脏 → 拦住
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 200, topics: ["dsh-plugin"], dirty: " M lib/client.js" });
  const r = await run(file, []);
  check("工作区脏：被拦住", r.exitCode !== 0 && r.out.includes("未提交"), `exit=${r.exitCode}\n${r.out}`);
  rmSync(dir, { recursive: true, force: true });
}

// 5) 分支不是 main → 拦住
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 200, topics: ["dsh-plugin"], branch: "master" });
  const r = await run(file, []);
  check("非 main 分支：被拦住", r.exitCode !== 0 && r.out.includes("不是 main"), `exit=${r.exitCode}\n${r.out}`);
  rmSync(dir, { recursive: true, force: true });
}

// 6) 全绿 + --tag → 推 main、打 tag、自动加 remote
{
  const { dir, file } = buildScenario({ remote: null, repoStatus: 200, topics: ["dsh-plugin"] });
  const r = await run(file, ["--tag", "v1.0.0"]);
  check("全绿：退出 0", r.exitCode === 0, `exit=${r.exitCode}\n${r.out}`);
  check("全绿：推送了 main",
    r.probe.pushed.some((c) => c.includes("push -u origin main")), JSON.stringify(r.probe.pushed));
  check("全绿：打了并推了 tag",
    typeof r.probe.tagged === "string" && r.probe.tagged.includes("v1.0.0"), String(r.probe.tagged));
  check("无 origin 时自动 remote add",
    String(r.probe.remoteSet).includes("remote add"), String(r.probe.remoteSet));
  rmSync(dir, { recursive: true, force: true });
}

// 7) 已有 origin 且指向别处 → 应改写而不是报错
{
  const { dir, file } = buildScenario({
    remote: "https://github.com/someone/other.git", repoStatus: 200, topics: ["dsh-plugin"],
  });
  const r = await run(file, ["--tag", "v1.0.0"]);
  check("origin 指向别处：被改写", String(r.probe.remoteSet).includes("set-url"), String(r.probe.remoteSet));
  check("origin 指向别处：仍能推完", r.exitCode === 0, `exit=${r.exitCode}\n${r.out}`);
  rmSync(dir, { recursive: true, force: true });
}

// 8) API 限流（403）→ **不该拦住推送**（用户实际撞上的情形）
//    未认证调用每小时 60 次且按出口 IP 共享，很容易撞上；
//    仓库存不存在只影响提示，git push 本身不需要它。
{
  const reset = String(Math.floor(Date.now() / 1000) + 600); // 10 分钟后恢复
  const { dir, file } = buildScenario({ remote: null, repoStatus: 403, topics: [], reset });
  const r = await run(file, ["--tag", "v1.0.0"]);
  check("API 限流：不崩、不误报成仓库问题", r.exitCode === 0, `exit=${r.exitCode}\n${r.out}`);
  check("API 限流：说明这是限流", r.out.includes("限流"), r.out);
  check("API 限流：给出恢复等待时间", r.out.includes("分钟（到") || r.out.includes("秒"), r.out);
  check("API 限流：说明多久后恢复", r.out.includes("后恢复"), r.out);
  check("API 限流：提示按出口 IP 共享", r.out.includes("出口 IP"), r.out);
  check("API 限流：提示怎么绕开（gh auth / GITHUB_TOKEN）",
    r.out.includes("gh auth login") && r.out.includes("GITHUB_TOKEN"), r.out);
  check("API 限流：仍照常推送 main",
    r.probe.pushed.some((c) => c.includes("push -u origin main")), JSON.stringify(r.probe.pushed));
  check("API 限流：仍照常打 tag",
    typeof r.probe.tagged === "string" && r.probe.tagged.includes("v1.0.0"), String(r.probe.tagged));
  rmSync(dir, { recursive: true, force: true });
}

// 9) 仓库存在但读 topic 时被限流 → 降级成"请自己确认"，不误报成"缺 topic"
{
  const reset = String(Math.floor(Date.now() / 1000) + 120);
  const { dir, file } = buildScenario({
    remote: null, repoStatus: 200, topics: [], topicsStatus: 403, reset,
  });
  const r = await run(file, ["--check"]);
  check("topic 读取限流：不崩", r.exitCode === 0, `exit=${r.exitCode}\n${r.out}`);
  check("topic 读取限流：说「没能读到」而不是「缺 topic」",
    r.out.includes("没能读到"), r.out);
  check("topic 读取限流：仍给出页面设置指引",
    r.out.includes("Topics"), r.out);
  rmSync(dir, { recursive: true, force: true });
}

/* ── 结果 ── */
console.log("");
if (failures.length > 0) {
  console.error(`✗ ${failures.length} 项失败 / 共 ${passed + failures.length} 项\n`);
  for (const f of failures) {
    console.error(`  · ${f.name}`);
    if (f.detail) console.error(`      ${String(f.detail).split("\n").slice(-8).join("\n      ")}`);
  }
  process.exit(1);
}
console.log(`✓ push.mjs 决策逻辑：${passed} 项全过`);
