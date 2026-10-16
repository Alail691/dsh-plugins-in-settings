/**
 * dsh-plugins-in-settings — 离线断言套件（无第三方依赖：`node test/run.mjs`）
 *
 * 覆盖四块：
 *   1. 产物契约：bundle 头、require 面、导出面（宿主核对的就是这些）
 *   2. 纯函数：响应归一化 / 分组 / 错误文字（含各种畸形输入）
 *   3. 注册契约：注入的槽位名、id、order、locale、children、不抢占用
 *   4. 数据路径：加载、开关、卸载 —— 成功与失败两条路都不抛，失败变可读文字
 */
import { loadClient, createFakeCtx, spy } from "./harness.mjs";

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ name, detail });
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ───────────────────────── 1. 产物契约 ───────────────────────── */

const loaded = loadClient();
const client = loaded.exports;

eq("bundle id 与包名一致", loaded.descriptor.id, "dsh-plugins-in-settings");
check("导出 apply", typeof client.apply === "function");
check("导出 inject", Array.isArray(client.inject));

eq("inject 含 slots", client.inject.includes("slots"), true);
eq("inject 含 locale", client.inject.includes("locale"), true);
check("inject 不含 remote.pluginManager（软探测，避免 fiber 卡 PENDING）",
  !client.inject.includes("remote.pluginManager"));
check("inject 不含任何 remote.* 硬依赖",
  client.inject.every((name) => !String(name).startsWith("remote")));

check("导出离线接缝", typeof client.__internals === "object" && client.__internals !== null);

/* ───────────────────────── 2. 纯函数 ───────────────────────── */

const { splitBundles, normalizeEntry, normalizeRows, toEntries, errorText } = client.__internals;

// 2.1 标准回应：{ official: [...], installed: [...] }
const standard = splitBundles({
  official: [{ packageName: "@deepseek-ai/dsh-x", title: "X", enabled: false, official: true }],
  installed: [{ packageName: "dsh-y", enabled: true, plugins: [{ id: "row-a", enabled: true }] }],
});
eq("标准回应：official 数量", standard.official.length, 1);
eq("标准回应：installed 数量", standard.installed.length, 1);
eq("标准回应：official 名称", standard.official[0].name, "@deepseek-ai/dsh-x");
eq("标准回应：installed 行数", standard.installed[0].rows.length, 1);
eq("标准回应：行 id", standard.installed[0].rows[0].id, "row-a");

// 2.2 平铺数组：按 official 标记自行分组
const flat = splitBundles([
  { name: "a", official: true },
  { name: "b" },
  { name: "c", builtin: true },
]);
eq("平铺数组：official 分组", flat.official.map((e) => e.name), ["a", "c"]);
eq("平铺数组：installed 分组", flat.installed.map((e) => e.name), ["b"]);

// 2.3 { bundles: [...] } 形状
const wrapped = splitBundles({ bundles: [{ name: "w", official: true }] });
eq("bundles 包裹形状", wrapped.official.map((e) => e.name), ["w"]);

// 2.4 畸形输入一律退化成空，绝不抛
for (const bad of [null, undefined, 0, "", "x", [], {}, { official: "no" }, { installed: 42 }]) {
  const result = splitBundles(bad);
  check(`畸形输入安全：${JSON.stringify(bad)}`,
    Array.isArray(result.official) && Array.isArray(result.installed));
}

eq("normalizeEntry：无名字返回 null", normalizeEntry({ title: "x" }), null);
eq("normalizeEntry：null 返回 null", normalizeEntry(null), null);
eq("normalizeEntry：用 packageName", normalizeEntry({ packageName: "p" }).name, "p");
eq("normalizeEntry：退回 name", normalizeEntry({ name: "n" }).name, "n");
eq("normalizeEntry：title 退回包名", normalizeEntry({ packageName: "p" }).title, "p");
eq("normalizeEntry：removable 默认 true", normalizeEntry({ packageName: "p" }).removable, true);
eq("normalizeEntry：removable false 保留", normalizeEntry({ packageName: "p", removable: false }).removable, false);
eq("normalizeEntry：problem 转字符串", normalizeEntry({ packageName: "p", problem: 42 }).problem, "42");
eq("normalizeEntry：无 problem 为 null", normalizeEntry({ packageName: "p" }).problem, null);

eq("normalizeRows：无 id 的行被丢弃", normalizeRows([{ title: "x" }]).length, 0);
eq("normalizeRows：entryId 作为 id", normalizeRows([{ entryId: "e1" }])[0].id, "e1");
eq("normalizeRows：locked 由 removable 推出",
  normalizeRows([{ id: "a", removable: false }])[0].locked, true);
eq("normalizeRows：非数组安全", normalizeRows("nope").length, 0);

eq("toEntries：缺字段返回空", toEntries({}, "official").length, 0);
eq("toEntries：非对象安全", toEntries(null, "official").length, 0);

eq("errorText：字符串原样", errorText("boom"), "boom");
eq("errorText：Error 取 message", errorText(new Error("bad")), "bad");
eq("errorText：对象取 code", errorText({ code: "E_NOPE" }), "E_NOPE");
eq("errorText：null 为空串", errorText(null), "");

/* ──────────────────── 3. 数据访问层 ──────────────────── */

// 3.1 可用 + 读取成功
{
  const setBundleEnabled = spy(async () => ({ ok: true }));
  const remote = {
    listBundles: async () => ({
      official: [{ packageName: "o1", official: true }],
      installed: [{ packageName: "i1", enabled: true }],
    }),
    setBundleEnabled,
    setPluginEnabled: async () => ({ ok: true }),
    removeBundle: async () => ({ ok: true }),
  };
  const view = client.__internals.createManagerView(remote);
  eq("available：方法齐全时为 true", view.available(), true);
  const result = await view.load();
  eq("load：成功", result.ok, true);
  eq("load：official 数量", result.groups.official.length, 1);
  const toggled = await view.setBundleEnabled("i1", false);
  eq("setBundleEnabled：成功", toggled.ok, true);
  eq("setBundleEnabled：透传参数", setBundleEnabled.calls[0], ["i1", false]);
  view.dispose();
}

// 3.2 读取失败 → ok:false + 可读文字（不抛）
{
  const remote = { listBundles: async () => { throw new Error("host offline"); } };
  const view = client.__internals.createManagerView(remote);
  const result = await view.load();
  eq("load 失败：ok=false", result.ok, false);
  eq("load 失败：带原因", result.error, "host offline");
  view.dispose();
}

// 3.3 管理动作失败 → ok:false + 可读文字
{
  const remote = {
    listBundles: async () => ({}),
    setPluginEnabled: async () => { throw { code: "E_LOCKED" }; },
  };
  const view = client.__internals.createManagerView(remote);
  const result = await view.setPluginEnabled("row", true);
  eq("setPluginEnabled 失败：ok=false", result.ok, false);
  eq("setPluginEnabled 失败：code 变文字", result.error, "E_LOCKED");
  view.dispose();
}

// 3.4 缺失方法 → 明确的不可用，不抛
{
  const view = client.__internals.createManagerView({});
  eq("available：缺方法为 false", view.available(), false);
  const result = await view.load();
  eq("缺失 listBundles：ok=false", result.ok, false);
  check("缺失 listBundles：给出原因", result.error.includes("listBundles"));
  view.dispose();
}

// 3.5 null remote 安全
{
  const view = client.__internals.createManagerView(null);
  eq("null remote：available 为 false", view.available(), false);
  const result = await view.load();
  eq("null remote：load 不抛", result.ok, false);
  view.dispose();
}

// 3.6 dispose 之后不再调用远端
{
  const listBundles = spy(async () => ({}));
  const view = client.__internals.createManagerView({ listBundles });
  view.dispose();
  const result = await view.load();
  eq("dispose 后：ok=false", result.ok, false);
  eq("dispose 后：没有真的调用远端", listBundles.callCount(), 0);
}

/* ──────────────────── 4. 注册契约 ──────────────────── */

{
  const remote = { pluginManager: { listBundles: async () => ({}) } };
  const fake = createFakeCtx({ remote });
  client.apply(fake.ctx);

  eq("注册了字典", fake.localeRegisters.length, 1);
  eq("字典命名空间", fake.localeRegisters[0].ns, "pluginsInSettings");
  check("字典含中英文", Boolean(fake.localeRegisters[0].dicts.zh) && Boolean(fake.localeRegisters[0].dicts.en));

  eq("注入的槽位", fake.injections, ["settings.plugins.tab"]);
  eq("注册数量", fake.registrations.length, 1);

  const { registration, Component } = fake.registrations[0];
  eq("槽位名", registration.name, "settings.plugins.tab");
  eq("标签页 id 与官方 `all` 不同", registration.id, "manage");
  check("id 不是官方的 all", registration.id !== "all");
  eq("order 在官方清单（10）之前", registration.order, 5);
  eq("locale 命名空间", registration.locale, "pluginsInSettings");
  eq("label 可解析", registration.label(), "插件管理");
  check("没有 children（不改动官方子槽）", registration.children === undefined);
  check("没有 key（list 槽不需要）", registration.key === undefined);
  eq("组件可调用", typeof Component, "function");
}

/**
 * 把渲染结果里的 children 拍平。
 *
 * `jsxs(tag, {children: [...]})` 里的 children 允许是嵌套数组
 * （`groups.map(...)`、条件表达式返回 null 等），真 React 会照样接受。
 * 断言前先拍平一层层，才能按语义找到目标节点。
 */
function flatten(input) {
  if (!Array.isArray(input)) return input === undefined ? [] : [input];
  const out = [];
  for (const item of input) {
    if (Array.isArray(item)) out.push(...flatten(item));
    else out.push(item);
  }
  return out;
}

/**
 * 注册进去的是 `TabContent`，它返回 `<PluginManagerTab/>`（一层包装）。
 * 这里把包装层一路展开到"真正的界面根节点"（有 `data-pis-state` 的那个）。
 *
 * 传入 `session` 时复用同一个组件实例（hook 状态保留）——异步 setState 之后
 * 需要重新渲染来观察新状态，这条路径就是从这里走的。
 */
function renderTab(Component, t, session) {
  if (typeof Component !== "function") {
    throw new Error("renderTab: 注册项不是组件（注册契约已被破坏）");
  }

  if (session !== undefined) {
    // 复用内层组件实例（hook 状态保留），只换 props，观察异步 setState 之后的新状态。
    const node = loaded.rerender(session.instance, session.innerType, { ...session.innerProps, t });
    return { node, session };
  }

  const outer = loaded.render(Component, { t });
  let node = outer.output;
  let instance = outer.instance;
  let innerType = null;
  let innerProps = null;
  for (let depth = 0; depth < 8; depth += 1) {
    if (!node || typeof node.type !== "function") break;
    if (node.props && node.props["data-pis-state"] !== undefined) break;
    innerType = node.type;
    innerProps = node.props;
    const inner = loaded.render(innerType, innerProps);
    node = inner.output;
    instance = inner.instance;
  }
  return { node, session: { instance, innerType, innerProps } };
}

// 4.2 远程命名空间缺失时：仍然注册（显示"暂不可用"），但不抛
{
  const fake = createFakeCtx({ remote: null });
  let threw = null;
  try {
    client.apply(fake.ctx);
  } catch (error) {
    threw = error;
  }
  eq("无远程：apply 不抛", threw, null);
  eq("无远程：仍注册标签页", fake.registrations.length, 1);

  const { node } = renderTab(fake.registrations[0].Component, (k) => k);
  check("无远程：渲染出「暂不可用」", node?.props?.["data-pis-state"] === "unavailable");
}

// 4.3 远程存在但方法不全：同样按不可用处理，不抛
{
  const fake = createFakeCtx({ remote: { pluginManager: { listPlugins: async () => ({}) } } });
  let threw = null;
  try {
    client.apply(fake.ctx);
  } catch (error) {
    threw = error;
  }
  eq("远程不全：apply 不抛", threw, null);
  const { node } = renderTab(fake.registrations[0].Component, (k) => k);
  check("远程不全：渲染出「暂不可用」", node?.props?.["data-pis-state"] === "unavailable");
}

// 4.4 locale.bind 抛错时不能把 apply 打崩（键缺失的防御）
{
  const fake = createFakeCtx({ dictionaries: {} });
  // 用一份"任何键都缺失"的 bind 覆盖，验证 apply 不在注册期解析文案
  fake.ctx.locale.bind = () => () => {
    throw new Error("missing key");
  };
  let threw = null;
  try {
    client.apply(fake.ctx);
  } catch (error) {
    threw = error;
  }
  eq("bind 抛错：apply 仍不抛（label 延迟解析）", threw, null);
  eq("bind 抛错：注册照常发生", fake.registrations.length, 1);
}

/* ──────────────────── 5. 组件渲染（可用态） ──────────────────── */

{
  const remote = {
    pluginManager: {
      listBundles: async () => ({
        official: [{ packageName: "o1", official: true, title: "Official One" }],
        installed: [{ packageName: "i1", enabled: true, title: "Installed One", plugins: [{ id: "r1", enabled: true }] }],
      }),
    },
  };
  const fake = createFakeCtx({ remote });
  client.apply(fake.ctx);
  const { registration, Component } = fake.registrations[0];

  const first = renderTab(Component, (k) => k);
  // 首帧是 loading（读取在 effect 里发起），但必须已经渲染出根节点
  check("可用态：首帧可渲染", first.node !== null && first.node !== undefined);
  eq("可用态：首帧状态为 loading", first.node.props["data-pis-state"], "loading");

  // 让远程的 Promise 落地，然后复用同一实例重渲染观察 state 变化
  await new Promise((resolve) => setTimeout(resolve, 0));

  const { node: ready } = renderTab(Component, (k) => k, first.session);
  eq("可用态：读取后状态为 ready", ready.props["data-pis-state"], "ready");

  // 分组必须按 official / installed 落地，且卡片真的渲染出来了。
  // 注意：`groups.map(...)` 在 children 里是**一个数组元素**（不是展开的），
  // 所以这里要拍平一层再看 —— 真 React 同样接受嵌套数组。
  const children = flatten(ready.props.children);
  const groups = children.filter(
    (child) => child && child.props && child.props["data-pis-group"] !== undefined,
  );
  const groupKeys = groups.map((g) => g.props["data-pis-group"]);
  check("可用态：渲染出 official 分组", groupKeys.includes("official"));
  check("可用态：渲染出 installed 分组", groupKeys.includes("installed"));

  // 每个分组里必须有卡片，且卡片带着真实的包名 —— 这才说明数据真的走通了。
  // `<BundleCard/>` 在树里还是一个组件元素，要渲染一次才拿到它的 DOM 节点
  // （`data-pis-bundle` 就画在那里），所以这里先把卡片渲染出来再断言。
  const officialGroup = groups.find((g) => g.props["data-pis-group"] === "official");
  const cards = flattenSubtree(officialGroup?.props?.children).filter(
    (node) => typeof node.type === "function" && node.props && node.props.entry !== undefined,
  );
  check("可用态：official 分组里有卡片", cards.length === 1);
  if (cards.length === 1) {
    const rendered = loaded.render(cards[0].type, cards[0].props).output;
    eq("可用态：卡片画出真实包名", rendered.props["data-pis-bundle"], "o1");
    // 卡片里必须出现包名本身（标题回退到包名时也要看得见），
    // 且必须带一个"启用/停用"的动作按钮 —— 说明这一行真的是可操作的。
    const nodes = flattenSubtree(rendered.props.children);
    check("可用态：卡片上能看到包名",
      nodes.some((n) => n.props && (n.props.children === "o1" || n.props.title === "o1")));
    check("可用态：卡片上有可点的开关按钮",
      nodes.some((n) => n.type === "button" && typeof n.props.onClick === "function"));
  }
}

/**
 * 递归收集一棵渲染子树里的全部节点。
 * 只沿着 `props.children` 走 —— 那正是 React 的树边，不会误入普通数据字段。
 */
function flattenSubtree(input, out = []) {
  for (const node of flatten(input)) {
    if (node === null || node === undefined || typeof node !== "object") continue;
    if (node.props === undefined) continue;
    out.push(node);
    flattenSubtree(node.props.children, out);
  }
  return out;
}

/* ──────────────────── 6. 分隔线：宿主产物的静态核对 ──────────────────── */

{
  // 宿主半边要求产物里出现这些标志；这里直接对产物做同样的检查，
  // 官方改契约时先在这里炸，而不是等到装进真机才发现"标签页不见了"。
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const bundle = readFileSync(fileURLToPath(new URL("../lib/client.js", import.meta.url)), "utf8");
  for (const marker of [
    'id: "dsh-plugins-in-settings"',
    "__ModuleLoader__.load",
    "return module.exports",
    "settings.plugins.tab",
    "remote.pluginManager",
  ]) {
    check(`产物含标志：${marker}`, bundle.includes(marker));
  }
  check("产物导出 apply", /exports\.apply\s*=/.test(bundle));
  check("产物零第三方 require（只有 react 面）",
    [...bundle.matchAll(/require\("([^"]+)"\)/g)].every((m) => ["react", "react/jsx-runtime", "react-dom"].includes(m[1])));
}

/* ───────────────────────── 结果 ───────────────────────── */

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 项失败 / 共 ${passed + failures.length} 项\n`);
  for (const failure of failures) {
    console.error(`  · ${failure.name}`);
    if (failure.detail) console.error(`      ${failure.detail}`);
  }
  process.exit(1);
}

console.log(`✓ 全部通过：${passed} 项`);
