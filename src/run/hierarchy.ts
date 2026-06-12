/**
 * `kase hierarchy [keyword]` 调试子命令。
 *
 * 调用 `maestro hierarchy` 抓取当前模拟器页面的视图层级，并以人类可读的形式打印；
 * 给定 keyword 时仅保留 a11y 文本/标识中包含该关键字的元素，便于写 BDD 用例时
 * 快速核实图标真实的可定位文本（accessibility label）或 id。
 *
 * 用法示例：
 *   npm run kase -- hierarchy                # 打印全部可点击/可见元素的关键属性
 *   npm run kase -- hierarchy 设置           # 仅打印 text/label/id 含"设置"的元素
 */

import type { KaseConfig } from "../config/index.js";
import { exec } from "../utils/exec.js";
import { envWithJavaHome } from "../utils/java.js";
import { log } from "../utils/log.js";

interface AnyNode {
  attributes?: Record<string, unknown>;
  children?: AnyNode[];
  // Maestro 旧版本可能使用扁平字段，做兼容
  [key: string]: unknown;
}

interface FlatElement {
  type: string;
  text: string;
  resourceId: string;
  hintText: string;
  bounds: string;
  enabled: string;
  selected: string;
}

/** 把 Maestro hierarchy JSON 平铺成 element 列表，提取我们关心的字段 */
function flatten(node: AnyNode | undefined, out: FlatElement[]): void {
  if (!node || typeof node !== "object") return;
  // 兼容两种结构：{ attributes: {...}, children: [...] } 与 直接平铺
  const attrs: Record<string, unknown> =
    (node.attributes as Record<string, unknown>) ?? (node as Record<string, unknown>);
  const get = (k: string): string => {
    const v = attrs[k];
    return typeof v === "string" ? v : "";
  };
  const e: FlatElement = {
    type: get("class") || get("type") || "",
    text: get("text") || get("label") || get("accessibilityText") || "",
    resourceId: get("resource-id") || get("id") || "",
    hintText: get("hintText") || get("hint") || "",
    bounds: get("bounds") || get("frame") || "",
    enabled: get("enabled"),
    selected: get("selected"),
  };
  // 仅保留至少有一个识别属性的元素，避免大量空容器干扰
  if (e.text || e.resourceId || e.hintText) {
    out.push(e);
  }
  const children = (node.children as AnyNode[]) ?? [];
  for (const c of children) flatten(c, out);
}

/** 简单包含匹配（不区分大小写） */
function matches(e: FlatElement, keyword: string): boolean {
  const k = keyword.toLowerCase();
  return (
    e.text.toLowerCase().includes(k) ||
    e.resourceId.toLowerCase().includes(k) ||
    e.hintText.toLowerCase().includes(k)
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export interface HierarchyOptions {
  keyword?: string;
  /** 最多打印多少个元素，避免溢出终端 */
  limit?: number;
}

/** 入口：调用 maestro hierarchy，解析、过滤、打印 */
export async function runHierarchy(
  config: KaseConfig,
  opts: HierarchyOptions = {},
): Promise<boolean> {
  const args: string[] = [];
  if (config.simulatorUdid) args.push("--udid", config.simulatorUdid);
  args.push("hierarchy");

  log.step(`执行：maestro ${args.join(" ")}`);
  const res = await exec("maestro", args, { env: envWithJavaHome() });
  if (res.code !== 0) {
    log.error(`maestro hierarchy 退出码 ${res.code}`);
    if (res.stderr) log.dim(res.stderr.trim());
    return false;
  }

  // Maestro 在 stdout 中夹杂日志行 + 一个 JSON 体；找到第一个 `{` 起的 JSON 段
  const stdout = res.stdout;
  const start = stdout.indexOf("{");
  if (start < 0) {
    log.error("未在 maestro hierarchy 输出中找到 JSON");
    return false;
  }
  let parsed: AnyNode;
  try {
    parsed = JSON.parse(stdout.slice(start));
  } catch (e) {
    log.error(`hierarchy JSON 解析失败：${(e as Error).message}`);
    return false;
  }

  const all: FlatElement[] = [];
  flatten(parsed, all);

  const limit = opts.limit ?? 200;
  const filtered = opts.keyword
    ? all.filter((e) => matches(e, opts.keyword as string))
    : all;

  if (filtered.length === 0) {
    log.warn(
      opts.keyword
        ? `未找到含 "${opts.keyword}" 的元素（共扫描 ${all.length} 个节点）`
        : "未抓取到任何元素",
    );
    return true;
  }

  log.title(
    opts.keyword
      ? `匹配 "${opts.keyword}" 的元素（${filtered.length}/${all.length}）：`
      : `共 ${all.length} 个元素：`,
  );
  log.dim(
    `  ${pad("type", 22)} ${pad("text/label", 28)} ${pad("id", 30)} bounds`,
  );
  for (const e of filtered.slice(0, limit)) {
    console.log(
      `  ${pad(e.type, 22)} ${pad(e.text, 28)} ${pad(e.resourceId, 30)} ${e.bounds}`,
    );
  }
  if (filtered.length > limit) {
    log.dim(`  ... 还有 ${filtered.length - limit} 个未显示，请加更精确的 keyword`);
  }
  return true;
}
