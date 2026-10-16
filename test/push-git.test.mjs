/**
 * 直接测 scripts/push.mjs 里**真 git() 函数**的返回值与错误处理。
 *
 * 为什么需要单独一份：`test/push-logic.test.mjs` 把整个 git() 换成假的，
 * 好专注于决策分支 —— 但那也意味着**真 git() 自己一行都没被测到**。
 * 真机上就栽在这里：
 *
 *   git push 打印了 `* [new branch] main -> main`（成功），
 *   但 execFileSync 在 stdio:'inherit' 下返回 **null**，
 *   紧接着的 `.trim()` 抛 TypeError，被 catch 当成"推送失败"报出去 ——
 *   把一个成功的推送说成失败，还把人往认证问题上带。
 *
 * 这里用**猴补丁**把 node:child_process 的 execFileSync 换掉再 import 真脚本，
 * 所以断言的是真代码，不是复制品。
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
 * 造一份"只保留 git() 与它的依赖"的最小脚本，并把 execFileSync 换成假实现。
 * 只抽出 git() 而不是跑整个脚本，是为了不触发后面的推送流程 ——
 * 我们要测的是这个函数本身的行为。
 */
function buildGitProbe() {
  const gitFn = /function git\(gitArgs, options = \{\}\) \{[\s\S]*?\n\}/.exec(source)[0];
  // git() 里调用 fail() 处理 EPERM；抽一份最小实现（记录而不是退出）
  const preamble = `
let __FAILED__ = null;
function fail(message, next) { __FAILED__ = { message, next }; throw new Error("__FAIL__" + message); }
const root = ${JSON.stringify(realRoot)};
export { __FAILED__ };
export const __git__ = (execImpl) => {
  const execFileSync = execImpl;
  ${gitFn}
  return git;
};
`;
  const dir = mkdtempSync(join(tmpdir(), "gitprobe-"));
  const file = join(dir, "gitprobe.mjs");
  writeFileSync(file, preamble, "utf8");
  return { dir, file };
}

const { dir, file } = buildGitProbe();
const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
const makeGit = mod.__git__;

/* ── 1. inherit 模式：execFileSync 返回 null → 必须归一化成空串，不能崩 ── */
{
  const git = makeGit(() => null);
  let threw = null;
  let result;
  try {
    result = git(["push", "-u", "origin", "main"], { capture: false });
  } catch (error) {
    threw = error;
  }
  check("inherit 返回 null：不抛异常（这正是真机上的崩点）", threw === null,
    threw && `${threw.name}: ${threw.message}`);
  check("inherit 返回 null：归一化成空串", result === "", `got ${JSON.stringify(result)}`);
}

/* ── 2. inherit 模式：undefined 同样处理 ── */
{
  const git = makeGit(() => undefined);
  let threw = null;
  let result;
  try { result = git(["push"], { capture: false }); } catch (error) { threw = error; }
  check("inherit 返回 undefined：不抛异常", threw === null, threw && threw.message);
  check("inherit 返回 undefined：归一化成空串", result === "", `got ${JSON.stringify(result)}`);
}

/* ── 3. 捕获模式：正常返回字符串并按预期 trim ── */
{
  const git = makeGit(() => "  main  \n");
  check("捕获模式：trim 掉首尾空白", git(["rev-parse", "--abbrev-ref", "HEAD"]) === "main");
}

/* ── 4. 失败时把 git 自己的 stderr 带进错误信息（而不是丢成裸 Command failed） ── */
{
  const git = makeGit(() => {
    const error = new Error("Command failed: git remote get-url origin");
    error.stderr = "error: No such remote 'origin'\n";
    error.stdout = "";
    error.status = 2;
    throw error;
  });
  let threw = null;
  try { git(["remote", "get-url", "origin"]); } catch (error) { threw = error; }
  check("失败：抛出了错误", threw !== null);
  check("失败：错误信息含 git 自己的话（No such remote）",
    threw && threw.message.includes("No such remote"), threw && threw.message);
  check("失败：附带 exitCode", threw && threw.exitCode === 2, threw && String(threw.exitCode));
}

/* ── 5. inherit 模式失败且没有捕获到 stderr → 退回退出码，不是一句空话 ── */
{
  const git = makeGit(() => {
    const error = new Error("Command failed: git push");
    error.status = 128;
    throw error;
  });
  let threw = null;
  try { git(["push"], { capture: false }); } catch (error) { threw = error; }
  check("inherit 失败：错误信息非空",
    threw && typeof threw.message === "string" && threw.message.length > 0, threw && threw.message);
  check("inherit 失败：带上退出码",
    threw && threw.message.includes("128"), threw && threw.message);
}

/* ── 6. EPERM（沙箱禁止管道子进程）走 fail 而不是抛裸错 ── */
{
  const git = makeGit(() => {
    const error = new Error("spawnSync git EPERM");
    error.code = "EPERM";
    throw error;
  });
  let threw = null;
  try { git(["status", "--porcelain"]); } catch (error) { threw = error; }
  check("EPERM：给出可照做的提示", mod.__FAILED__ !== null, "fail() 没被调用");
  check("EPERM：提示里含可直接跑的命令",
    mod.__FAILED__ && String(mod.__FAILED__.next).includes("git status --porcelain"),
    mod.__FAILED__ && String(mod.__FAILED__.next));
}

rmSync(dir, { recursive: true, force: true });

console.log("");
if (failures.length > 0) {
  console.error(`✗ ${failures.length} 项失败 / 共 ${passed + failures.length} 项\n`);
  for (const f of failures) {
    console.error(`  · ${f.name}`);
    if (f.detail) console.error(`      ${String(f.detail).split("\n").slice(0, 6).join("\n      ")}`);
  }
  process.exit(1);
}
console.log(`✓ 真 git() 的返回值与错误处理：${passed} 项全过`);
