/**
 * Selectors 别名表加载与解析。
 *
 * 用途：让 BDD 用例里写"点击图标 \"右上角设置\""时，能把"右上角设置"这个中文别名
 * 映射到结构化的定位（accessibility id 或屏幕百分比坐标），保持用例文本干净。
 *
 * 来源：项目根的 `cases/selectors.yaml`（不存在则跳过，没有别名也不报错）。
 * 格式（每个键是用例里写的别名，值是定位策略）：
 *
 *   右上角设置: { id: "homeSettingsButton" }
 *   关闭弹窗:   { id: "ic_close" }
 *   悬浮添加按钮: { point: "50%, 95%" }
 *
 * 同时此模块导出"屏幕九宫格语义位"的预置坐标，供 `点击位置 "右上"` 这种短写法解析。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Selector } from "./types.js";

/** 屏幕九宫格语义位 → 百分比坐标（与 Maestro 的 point 表达式一致） */
export const SCREEN_REGIONS: Record<string, string> = {
  左上: "5%, 8%",
  正上: "50%, 8%",
  右上: "95%, 8%",
  左中: "5%, 50%",
  中: "50%, 50%",
  右中: "95%, 50%",
  左下: "5%, 92%",
  正下: "50%, 92%",
  右下: "95%, 92%",
};

/** selectors.yaml 中可写入的项（用 yaml 表达式写 { id: "xxx" } 或 { point: "x%, y%" }） */
interface RawSelectorEntry {
  id?: string;
  point?: string;
  text?: string;
}

export interface SelectorsTable {
  /** 文件存在与否（不存在不算错） */
  loaded: boolean;
  /** 解析后的别名 → selector 字典 */
  map: Record<string, Selector>;
  /** 加载过程中收集的错误（如格式非法），调用方可决定是否阻断 lint */
  errors: string[];
}

/** 解析单条 selectors 配置项为结构化 Selector */
function toSelector(name: string, raw: unknown, errors: string[]): Selector | null {
  if (typeof raw !== "object" || raw === null) {
    errors.push(
      `selectors.yaml 中别名 "${name}" 的值必须是对象，例如 { id: "xxx" } 或 { point: "x%, y%" }`,
    );
    return null;
  }
  const entry = raw as RawSelectorEntry;
  // id 优先级最高；其次 point；最后 text
  if (typeof entry.id === "string" && entry.id.length > 0) {
    return { kind: "id", value: entry.id };
  }
  if (typeof entry.point === "string" && entry.point.length > 0) {
    return { kind: "point", value: entry.point };
  }
  if (typeof entry.text === "string" && entry.text.length > 0) {
    return { kind: "text", value: entry.text };
  }
  errors.push(
    `selectors.yaml 中别名 "${name}" 缺少有效字段，请至少填 id / point / text 之一`,
  );
  return null;
}

/**
 * 从 cwd 加载 cases/selectors.yaml（路径可由调用方覆盖）。
 * 不存在直接返回空表，不视为错误。
 */
export function loadSelectorsTable(
  casesDir = "cases",
  fileName = "selectors.yaml",
): SelectorsTable {
  const path = join(process.cwd(), casesDir, fileName);
  if (!existsSync(path)) {
    return { loaded: false, map: {}, errors: [] };
  }
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, "utf8"));
  } catch (e) {
    return {
      loaded: true,
      map: {},
      errors: [`selectors.yaml 解析失败：${(e as Error).message}`],
    };
  }
  if (parsed === null || typeof parsed !== "object") {
    return {
      loaded: true,
      map: {},
      errors: ["selectors.yaml 内容应是 别名→定位 的字典"],
    };
  }
  const map: Record<string, Selector> = {};
  for (const [name, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const sel = toSelector(name, raw, errors);
    if (sel) map[name] = sel;
  }
  return { loaded: true, map, errors };
}

/**
 * 把"点击图标"参数解析为 Selector。
 * 规则：
 *   - 以 "id:" 开头：直接作为 accessibility id（不查别名表）
 *   - 命中预置九宫格名字：解析为 point（少见，但允许 `点击图标 "右上"` 也能工作）
 *   - 命中 selectors.yaml 别名：返回别名对应的 Selector
 *   - 否则返回 null（lint 报错）
 */
export function resolveIconSelector(
  raw: string,
  table: SelectorsTable,
): Selector | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("id:")) {
    const id = trimmed.slice(3).trim();
    if (id.length === 0) return null;
    return { kind: "id", value: id };
  }
  if (SCREEN_REGIONS[trimmed]) {
    return { kind: "point", value: SCREEN_REGIONS[trimmed] };
  }
  return table.map[trimmed] ?? null;
}

/**
 * 把"点击位置"参数解析为 Selector。
 * 规则：
 *   - 命中 9 个语义位：用预置百分比
 *   - 形如 `数字%, 数字%`：原样作为 point
 *   - 其它一律失败
 */
export function resolvePointSelector(raw: string): Selector | null {
  const trimmed = raw.trim();
  if (SCREEN_REGIONS[trimmed]) {
    return { kind: "point", value: SCREEN_REGIONS[trimmed] };
  }
  // 接受形如 "95%, 8%" / "95% , 8%" / "10%,90%"
  if (/^\s*\d{1,3}\s*%\s*,\s*\d{1,3}\s*%\s*$/.test(trimmed)) {
    // 规范化空白
    return {
      kind: "point",
      value: trimmed.replace(/\s+/g, "").replace(",", ", "),
    };
  }
  return null;
}
