/**
 * 推送助手：把"接远程 → 推 → 打 tag → 推 tag"这几步做掉，
 * 并在每一步之前**核实前置条件**，失败时给出人能照做的下一步。
 *
 * 用法：
 *   node scripts/push.mjs              # 接远程并推送（需要仓库已存在）
 *   node scripts/push.mjs --check      # 只检查前置条件，不动任何东西
 *   node scripts/push.mjs --tag v1.0.0 # 推送后额外打并推送这个 tag
 *
 * 为什么需要它：desktop profile 的插件在别的机器上装，最省事的方式是
 * `github:<user>/<repo>`，所以仓库地址、分支、tag 三者必须一致且都对。
 * 手工敲这几条命令很容易漏掉 tag，或者把远程地址敲错。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import https from "node:https";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const tagIndex = args.indexOf("--tag");
const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

/** 从 package.json 的 repository.url 里取 owner/repo。 */
function ownerRepo() {
  const url = pkg.repository?.url ?? "";
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function git(gitArgs, options = {}) {
  // capture:false 时用 inherit（直接接终端），否则管道取输出。
  try {
    return execFileSync("git", gitArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    // 沙箱禁止 Node 创建管道子进程时，给一条能照做的命令，而不是抛裸 EPERM。
    if (error.code === "EPERM") {
      fail(
        "无法启动 git（受限沙箱禁止 Node 创建管道子进程）",
        "在你自己的终端里跑这条命令即可：\n" +
        `  git ${gitArgs.join(" ")}\n` +
        "（本脚本在普通终端下工作正常。）",
      );
    }
    // 其余失败：把 git 自己说的话带出来。
    // 少了这一段，调用方只会看到一个 "Command failed" 的堆栈，
    // 而真正的原因（例如 "No such remote 'origin'"）就藏在 stderr 里被丢掉了。
    const stderr = typeof error.stderr === "string" ? error.stderr.trim() : "";
    const stdout = typeof error.stdout === "string" ? error.stdout.trim() : "";
    const detail = stderr || stdout || error.message;
    const wrapped = new Error(`git ${gitArgs.join(" ")} 失败：${detail}`);
    wrapped.gitArgs = gitArgs;
    wrapped.gitDetail = detail;
    wrapped.exitCode = error.status;
    throw wrapped;
  }
}

/** 查 GitHub API（用 Node 的 https —— 本机 curl 的 schannel 会失败）。 */
function api(path) {
  return new Promise((resolve) => {
    const request = https.get(
      { host: "api.github.com", path, headers: { "user-agent": "dsh-push-helper", accept: "application/vnd.github+json" } },
      (response) => {
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, body }));
      },
    );
    request.on("error", (error) => resolve({ status: 0, error: error.code || error.message }));
    request.setTimeout(15000, () => { resolve({ status: 0, error: "timeout" }); request.destroy(); });
  });
}

function say(message) { console.log(`  ${message}`); }
function fail(message, next) {
  console.error(`\n✗ ${message}`);
  if (next) console.error(`\n下一步：\n${next}\n`);
  process.exit(1);
}

console.log(`\n=== dsh-plugins-in-settings 推送助手 ===`);
say(`仓库目录：${root}`);
say(`包名    ：${pkg.name}`);
say(`版本    ：${pkg.version}`);
say(`模式    ：${checkOnly ? "只检查" : "推送"}${tag ? `（并打 tag ${tag}）` : ""}`);

/* ── 1. 远程地址 ── */
const target = ownerRepo();
if (target === null) {
  fail("package.json 的 repository.url 里认不出 owner/repo", "补成 git+https://github.com/<owner>/<repo>.git");
}
const slug = `${target.owner}/${target.repo}`;
say(`远程仓库：${slug}`);

/* ── 2. 本地状态 ── */
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "main") {
  fail(`当前分支是 ${branch}，不是 main`, "git branch -M main");
}
say(`分支    ：${branch}`);

const dirty = git(["status", "--porcelain"]);
if (dirty.length > 0) {
  fail("有未提交的改动", `git add -A && git commit -m "..."\n（未提交的文件不会被推送，先处理掉）`);
}
say("工作区  ：干净");

/**
 * 跑一条 git 命令，**允许它失败**，返回 `{ ok, out }`。
 *
 * 用来问那些"没有是正常状态"的问题 —— 例如 `git remote get-url origin`
 * 在没有 origin 时以退出码 2 失败（`error: No such remote 'origin'`）。
 * 直接当普通命令调会在**首次推送**这个最常见的情形下崩掉，
 * 而这恰恰是脚本最该帮上忙的时候。
 */
function gitTry(gitArgs) {
  try {
    return { ok: true, out: git(gitArgs) };
  } catch {
    return { ok: false, out: "" };
  }
}

const commits = git(["rev-list", "--count", "HEAD"]);
say(`提交数  ：${commits}`);

const remoteQuery = gitTry(["remote", "get-url", "origin"]);
const existingRemote = remoteQuery.ok && remoteQuery.out.length > 0 ? remoteQuery.out : null;
say(`origin  ：${existingRemote ?? "(未设置，推送时会自动加上)"}`);

/* ── 3. 仓库是否已在 GitHub 上存在 ── */
const repo = await api(`/repos/${slug}`);
if (repo.status === 0) {
  fail(`连不上 GitHub API（${repo.error}）`, "确认网络后重试；本脚本用 Node 的 https，不走 curl");
}
if (repo.status === 404) {
  fail(
    `GitHub 上还没有 ${slug}`,
    `git push 不会替你创建仓库，先去建：\n` +
    `  https://github.com/new\n` +
    `    名字：${target.repo}\n` +
    `    公开；**不要**勾 README / .gitignore / license（本地已有）`,
  );
}
if (repo.status !== 200) {
  fail(`查询仓库失败（HTTP ${repo.status}）`, String(repo.body).slice(0, 200));
}
const info = JSON.parse(repo.body);
say(`仓库    ：已存在（创建于 ${info.created_at}，默认分支 ${info.default_branch}）`);

/* ── 4. topic（市场收录入口）── */
const topics = await api(`/repos/${slug}/topics`);
let topicList = [];
try { topicList = JSON.parse(topics.body).names ?? []; } catch { /* 忽略 */ }
if (topicList.includes("dsh-plugin")) {
  say(`topic   ：含 dsh-plugin ✓`);
} else {
  console.log("");
  console.log("  ⚠️  缺 `dsh-plugin` topic —— 插件市场靠它自动收录，没加就不会被收录。");
  console.log("     GitHub 的 topic 没有文件可提交，只能在页面上加：");
  console.log(`       https://github.com/${slug} → 右上角 ⚙️ (About) → Topics`);
  console.log("     要填：dsh-plugin, dsh, deepseek-harness, plugin-manager, settings");
}

if (checkOnly) {
  console.log("\n（--check：只检查，什么都没动）\n");
  process.exit(0);
}

/* ── 5. 推送 ── */
if (existingRemote === null) {
  git(["remote", "add", "origin", `https://github.com/${slug}.git`]);
  say(`已设置 origin → https://github.com/${slug}.git`);
} else if (!existingRemote.includes(slug)) {
  say(`origin 已指向 ${existingRemote}，按 package.json 改写成 ${slug}`);
  git(["remote", "set-url", "origin", `https://github.com/${slug}.git`]);
}

say("正在推送 main…");
try {
  git(["push", "-u", "origin", "main"], { capture: false });
} catch {
  fail(
    "推送失败",
    "若是认证问题：HTTPS 需要 Personal Access Token（不是账号密码），\n" +
    "或改用 SSH：\n" +
    `  git remote set-url origin git@github.com:${slug}.git`,
  );
}
say("main 已推送 ✓");

/* ── 6. tag ── */
if (tag !== null) {
  const existing = git(["tag", "--list", tag]);
  if (existing.length > 0) {
    say(`tag ${tag} 已存在，跳过创建`);
  } else {
    git(["tag", "-a", tag, "-m", `${pkg.name} ${tag}`]);
    say(`已创建 tag ${tag}`);
  }
  say(`正在推送 tag ${tag}…`);
  try {
    git(["push", "origin", tag], { capture: false });
  } catch {
    fail(`推送 tag ${tag} 失败`, `git push origin ${tag}`);
  }
  say(`${tag} 已推送 ✓`);
  console.log(`\n下一步：去 GitHub 基于 ${tag} 建一个 Release。`);
}

console.log(`\n✓ 完成。仓库地址：https://github.com/${slug}\n`);
