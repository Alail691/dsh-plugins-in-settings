/**
 * 迷你测试台：给 `lib/client.js` 一个够用的假宿主。
 *
 * 本机没有可离线使用的真 React（app.asar 里不带），所以这里做一份**保状态**的
 * React 桩 —— 只实现本插件真正用到的那几个 hook，语义对齐真 React：
 *   · useState   ：返回 [值, 设置函数]，设置函数接受值或 updater
 *   · useRef     ：稳定对象
 *   · useMemo    ：只算一次（依赖数组变化就重算）
 *   · useCallback：同上
 *   · useEffect  ：挂载后跑一次（依赖数组变化就清掉旧的再跑）
 *
 * 它不驱动重渲染（本插件的测试目标是**数据路径与注册契约**，不是渲染结果），
 * 但会让组件把"当前该渲染什么"算出来，供断言读取。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CLIENT_PATH = fileURLToPath(new URL("../lib/client.js", import.meta.url));

/** 记录每次调用的假函数。 */
export function spy(impl) {
  const calls = [];
  const fn = (...args) => {
    calls.push(args);
    return impl ? impl(...args) : undefined;
  };
  fn.calls = calls;
  fn.callCount = () => calls.length;
  return fn;
}

/** 一份够用的 React 桩。 */
function createReactStub() {
  let hookIndex = 0;
  let current = null;

  function beginRender(instance) {
    current = instance;
    hookIndex = 0;
    current.pendingEffects = [];
  }

  /**
   * 一次"提交"：跑掉本次渲染里登记过（或依赖变化过）的 effect。
   *
   * 真 React 在 DOM 提交之后跑 effect；setState 触发的重渲染由调度器在之后处理。
   * 这套桩不碰 DOM，所以把 effect 一个一个跑完；**在跑的期间**出现的重渲染请求
   * 留给调用方（render/rerender 的返回值）—— 组件函数返回后 `output` 已就绪。
   * 不在 effect 中间重入组件函数：那会让 hookIndex 在半途被重置，
   * 从而把"第二次渲染"的 hook 槽位写错，症状是状态对了、界面却是旧的。
   */
  function flushEffects(instance) {
    const pending = instance.pendingEffects ?? [];
    instance.pendingEffects = [];
    for (const effect of pending) effect();
  }

  /** 把挂起的重渲染排空（可重入安全：一次只跑一层，跑完再看有没有新的）。 */
  function drainRerenders(instance) {
    for (let round = 0; round < 16; round += 1) {
      const pending = instance.scheduleRerender;
      if (typeof pending !== "function") return;
      instance.scheduleRerender = null;
      pending();
    }
  }

  function nextSlot(create) {
    const index = hookIndex++;
    if (current.hooks.length <= index) current.hooks.push(create());
    return { index, slot: current.hooks[index] };
  }

  const React = {
    Fragment: Symbol("Fragment"),
    createElement: () => ({}),
    useState(initial) {
      const { slot } = nextSlot(() => ({
        value: typeof initial === "function" ? initial() : initial,
      }));
      const setter = (next) => {
        const value = typeof next === "function" ? next(slot.value) : next;
        // 真 React 里 Object.is 相等就不重渲染；这里对齐这个语义，
        // 也避免"setState 一个一模一样的对象"把测试引向假的失败。
        if (Object.is(value, slot.value)) return;
        slot.value = value;
        // setState 之后要重渲染：登记到提交阶段，让调用方 flush 时重跑组件。
        if (current !== null && typeof current.scheduleRerender === "function") {
          current.scheduleRerender();
        }
      };
      return [slot.value, setter];
    },
    useRef(initial) {
      const { slot } = nextSlot(() => ({ current: initial }));
      return slot;
    },
    useMemo(factory, deps) {
      const { slot } = nextSlot(() => ({ deps: undefined, value: undefined }));
      if (slot.deps === undefined || !sameDeps(slot.deps, deps)) {
        slot.deps = deps;
        slot.value = factory();
      }
      return slot.value;
    },
    useCallback(factory, deps) {
      const { slot } = nextSlot(() => ({ deps: undefined, value: undefined }));
      if (slot.deps === undefined || !sameDeps(slot.deps, deps)) {
        slot.deps = deps;
        slot.value = factory;
      }
      return slot.value;
    },
    useEffect(effect, deps) {
      const { slot } = nextSlot(() => ({ deps: undefined, cleanup: undefined }));
      if (slot.deps === undefined || !sameDeps(slot.deps, deps)) {
        if (typeof slot.cleanup === "function") slot.cleanup();
        slot.deps = deps;
        // 清理与执行都登记到"提交阶段"，和真 React 的时序一致。
        current.pendingEffects.push(() => {
          slot.cleanup = effect();
        });
      }
    },
    useId() {
      const { index } = nextSlot(() => ({}));
      return "stub-" + index;
    },
    useSyncExternalStore(subscribe, getSnapshot) {
      nextSlot(() => ({}));
      return getSnapshot();
    },
  };

  function sameDeps(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!Object.is(a[i], b[i])) return false;
    return true;
  }

  /** 手动"渲染"一次组件函数，返回它的结果与实例（供断言读 hook 状态）。 */
  function render(Component, props) {
    const instance = { hooks: [], pendingEffects: [], scheduleRerender: null, output: null };
    instance.scheduleRerender = () => {
      instance.scheduleRerender = null;
      beginRender(instance);
      instance.output = Component(props);
      flushEffects(instance);
    };
    beginRender(instance);
    instance.output = Component(props);
    flushEffects(instance);
    drainRerenders(instance);
    return { output: instance.output, instance };
  }

  /** 重新渲染同一个实例（hook 状态保留），用于观察 setState 之后的结果。 */
  function rerender(instance, Component, props) {
    instance.scheduleRerender = () => {
      instance.scheduleRerender = null;
      beginRender(instance);
      instance.output = Component(props);
      flushEffects(instance);
    };
    beginRender(instance);
    instance.output = Component(props);
    flushEffects(instance);
    drainRerenders(instance);
    return instance.output;
  }

  return { React, render, rerender };
}

/** 极简的假 DOM，够 installStyles 用。 */
export function createFakeDocument() {
  const head = { children: [] };
  const doc = {
    head,
    createElement(tag) {
      return {
        tagName: tag,
        attributes: {},
        textContent: "",
        setAttribute(k, v) {
          this.attributes[k] = v;
        },
        getAttribute(k) {
          return this.attributes[k] ?? null;
        },
      };
    },
    querySelector(selector) {
      const match = /data-plugin-css="([^"]+)"/.exec(selector);
      if (!match) return null;
      return head.children.find((el) => el.attributes["data-plugin-css"] === match[1]) ?? null;
    },
  };
  doc.createElement = doc.createElement.bind(doc);
  const originalAppend = Array.prototype.push;
  head.appendChild = (el) => originalAppend.call(head.children, el);
  return doc;
}

/**
 * 载入客户端产物，返回它的 exports。
 *
 * @param {object} options
 * @param {object} options.remote  假的 ctx.remote（默认带一个可用的 pluginManager）
 * @param {object} options.document
 * @param {(name: string) => unknown} options.require 覆盖默认 require
 */
export function loadClient(options = {}) {
  const source = readFileSync(CLIENT_PATH, "utf8");
  const { React, render, rerender } = createReactStub();
  const document = options.document ?? createFakeDocument();

  let registered = null;
  const loader = {
    load(descriptor) {
      if (registered !== null) throw new Error("duplicate module registration");
      registered = { descriptor, exports: null };
    },
  };

  const requireFn = (name) => {
    if (options.require) {
      const custom = options.require(name);
      if (custom !== undefined) return custom;
    }
    if (name === "react") return React;
    if (name === "react/jsx-runtime") {
      return {
        jsx: (type, props, key) => ({ type, props, key }),
        jsxs: (type, props, key) => ({ type, props, key }),
        Fragment: React.Fragment,
      };
    }
    if (name === "react-dom") return { createPortal: (node) => node };
    throw new Error("unexpected require: " + name);
  };

  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = { __ModuleLoader__: loader };
  globalThis.document = document;

  try {
    // 产物是加载器 bundle，靠 window.__ModuleLoader__.load 注册自己。
    // eslint-disable-next-line no-new-func
    new Function("window", "document", source)(globalThis.window, globalThis.document);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }

  if (registered === null) throw new Error("bundle did not register itself");
  const exportsObject = registered.descriptor.factory(requireFn);
  return { exports: exportsObject, descriptor: registered.descriptor, render, rerender };
}

/** 造一个假的 cordis 客户端 ctx，记录注册与调用。 */
export function createFakeCtx(options = {}) {
  const registrations = [];
  const effects = [];
  const localeRegisters = [];
  const injections = [];

  const dictionaries = { ...(options.dictionaries ?? {}) };

  const ctx = {
    get(name) {
      if (name === "remote") return options.remote ?? null;
      return options.services?.[name] ?? null;
    },
    effect(factory, label) {
      const dispose = factory();
      effects.push({ label, dispose });
      return () => {
        if (typeof dispose === "function") dispose();
      };
    },
    locale: {
      register(ns, dicts) {
        localeRegisters.push({ ns, dicts });
        // 真引擎里只有**当前语言**那一份生效；测试默认中文（与 profile 的
        // `locale.preference: zh` 一致），所以 zh 覆盖 en，而不是反过来。
        if (options.localePreference === "en") Object.assign(dictionaries, dicts.en ?? {});
        else Object.assign(dictionaries, dicts.zh ?? {});
        return () => {};
      },
      bind(ns) {
        const actualNs = typeof ns === "string" ? ns : ns?.ns;
        return (key) => {
          const value = (options.locale ?? dictionaries)[key];
          if (value === undefined) throw new Error(`missing locale key ${actualNs}.${key}`);
          return value;
        };
      },
      resolveText: (text) => text,
      getSnapshot: () => ({ revision: 1 }),
      subscribe: () => () => {},
    },
    slots: {
      inject(name, callback) {
        injections.push(name);
        const dispose = callback();
        return () => {
          if (typeof dispose === "function") dispose();
        };
      },
      register(registration, Component) {
        registrations.push({ registration, Component });
        return () => {};
      },
      entries: () => [],
      getVersion: () => 0,
      subscribe: () => () => {},
    },
    logger: { info: () => {}, error: () => {} },
  };

  return { ctx, registrations, effects, localeRegisters, injections };
}

export { createReactStub };
