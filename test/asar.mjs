/**
 * 极简 asar 读取器（无依赖），供预检对着**真实安装的官方产物**核对契约。
 *
 * asar 布局：
 *   UInt32LE(0)  = 4（该字段自身大小）
 *   UInt32LE(4)  = header pickle 载荷大小
 *   UInt32LE(8)  = header 字符串区大小（含 padding）
 *   UInt32LE(12) = JSON 目录树字节数
 *   [16, 16+jsonSize) = JSON 目录树
 *   数据区起点 = 8 + pickle 载荷大小
 */
import { readFileSync } from "node:fs";

/** 打开一个 asar，返回 { list(), read(path) }。 */
export function openAsar(file) {
  const buf = readFileSync(file);

  const picklePayload = buf.readUInt32LE(4);
  const jsonSize = buf.readUInt32LE(12);
  const dataStart = 8 + picklePayload;

  const raw = buf.subarray(16, 16 + jsonSize).toString("utf8");
  let tree;
  try {
    tree = JSON.parse(raw);
  } catch {
    // 尾部可能混入对齐填充：退回到最后一个 '}' 处截断再解析。
    tree = JSON.parse(raw.slice(0, raw.lastIndexOf("}") + 1));
  }

  const files = new Map();
  (function walk(node, prefix) {
    if (!node.files) return;
    for (const [name, child] of Object.entries(node.files)) {
      const path = prefix + "/" + name;
      if (child.files) walk(child, path);
      else files.set(path, child);
    }
  })(tree, "");

  return {
    has(path) {
      return files.has(normalize(path));
    },
    /** 读一个内部文件为 utf8 文本；不存在返回 null。 */
    read(path) {
      const entry = files.get(normalize(path));
      if (!entry) return null;
      const start = dataStart + Number(entry.offset);
      return buf.subarray(start, start + entry.size).toString("utf8");
    },
    /** 按子串找路径（调试用）。 */
    find(substring, limit = 20) {
      const out = [];
      for (const path of files.keys()) {
        if (path.includes(substring)) {
          out.push(path);
          if (out.length >= limit) break;
        }
      }
      return out;
    },
  };
}

function normalize(path) {
  return "/" + String(path).replace(/^\/+/, "");
}
