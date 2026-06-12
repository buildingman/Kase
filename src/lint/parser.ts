import { readFileSync } from "node:fs";
import {
  loadSelectorsTable,
  resolveIconSelector,
  resolvePointSelector,
  type SelectorsTable,
} from "./selectors.js";
import type {
  Action,
  ActionType,
  CaseIR,
  LintError,
  SwipeDirection,
} from "./types.js";

/** 提取一行中所有被双引号包裹的片段，支持中文引号 “” 与英文引号 "" */
function extractQuoted(line: string): string[] {
  const result: string[] = [];
  const re = /[“”]([^“”]*)[“”]|"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    result.push(m[1] ?? m[2] ?? "");
  }
  return result;
}

/** 段落标记：去掉行首列表符号与空白后判断 */
function stripBullet(line: string): string {
  return line.replace(/^\s*[-*]\s*/, "").trim();
}

const SWIPE_MAP: Record<string, SwipeDirection> = {
  上: "UP",
  下: "DOWN",
  左: "LEFT",
  右: "RIGHT",
};

interface ParseLineResult {
  action?: Action;
  error?: LintError;
}

interface ParseContext {
  selectors: SelectorsTable;
}

/** 把"最多等待 N 秒 直到 ..." 这种前缀里的秒数提取出来；不匹配则返回 undefined。 */
function extractWaitTimeoutSec(text: string): number | undefined {
  // 支持："最多等待 60 秒"/"最多等待60秒"，秒可写"秒"或"s"
  const m = text.match(/最多等待\s*(\d+)\s*(秒|s)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** 把单行动作文本解析为 Action（已去掉 bullet） */
function parseActionLine(
  text: string,
  line: number,
  ctx: ParseContext,
): ParseLineResult {
  const raw = text;
  const quoted = extractQuoted(text);

  // 前提类
  if (text.includes("清空应用数据并启动")) {
    return { action: { type: "clearStateAndLaunch", line, raw } };
  }
  if (text.includes("直接启动应用")) {
    return { action: { type: "launchApp", line, raw } };
  }

  // 输入：
  //   - 带目标：在 "输入框" 中输入 "内容" → tapOn target 后 inputText
  //   - 无目标：输入 "内容"               → 仅 inputText（用于上一步已激活输入框的场景）
  if (text.includes("输入")) {
    if (quoted.length === 0) {
      return {
        error: {
          line,
          raw,
          message: '输入动作至少需要一个双引号片段：输入 "内容" 或 在 "输入框" 中输入 "内容"',
        },
      };
    }
    if (quoted.length === 1) {
      return { action: { type: "inputText", value: quoted[0], line, raw } };
    }
    return {
      action: { type: "inputText", target: quoted[0], value: quoted[1], line, raw },
    };
  }

  // 等待类（必须在"点击"之前判定，因为消歧成本低）：
  //   - 等待 "X" 出现
  //   - 等待 "X" 消失
  //   - 最多等待 N 秒 直到 "X" 出现
  //   - 最多等待 N 秒 直到 "X" 消失
  if (text.includes("等待")) {
    if (quoted.length < 1) {
      return {
        error: {
          line,
          raw,
          message:
            '等待动作需要一个双引号目标：等待 "文本" 出现 / 等待 "文本" 消失',
        },
      };
    }
    const isGone = text.includes("消失") || text.includes("不见");
    const type: ActionType = isGone ? "waitForGone" : "waitFor";
    const sec = extractWaitTimeoutSec(text);
    const action: Action = { type, target: quoted[0], line, raw };
    if (sec !== undefined) action.timeoutMs = sec * 1000;
    return { action };
  }

  // 清空：清空 "X"
  if (text.includes("清空") && quoted.length >= 1) {
    return { action: { type: "eraseText", target: quoted[0], line, raw } };
  }

  // 滑动：向[上/下/左/右]滑动
  if (text.includes("滑动")) {
    const dirChar = Object.keys(SWIPE_MAP).find((d) => text.includes(d));
    if (!dirChar) {
      return {
        error: { line, raw, message: "滑动动作需指明方向：向[上/下/左/右]滑动" },
      };
    }
    return { action: { type: "swipe", direction: SWIPE_MAP[dirChar], line, raw } };
  }

  // 返回上一页
  if (text.includes("返回")) {
    return { action: { type: "back", line, raw } };
  }

  // 断言：检查屏幕不包含 "X" / 检查屏幕包含 "X"
  if (text.includes("检查屏幕")) {
    if (quoted.length < 1) {
      return {
        error: { line, raw, message: '断言需要一个双引号目标：检查屏幕包含 "文本"' },
      };
    }
    const type: ActionType = text.includes("不包含")
      ? "assertNotVisible"
      : "assertVisible";
    return { action: { type, target: quoted[0], line, raw } };
  }

  // 点击图标：点击图标 "别名 或 id:xxx"（必须先于普通"点击"判定）
  if (text.includes("点击图标")) {
    if (quoted.length < 1) {
      return {
        error: {
          line,
          raw,
          message: '点击图标需要一个双引号目标：点击图标 "别名" 或 点击图标 "id:xxx"',
        },
      };
    }
    const sel = resolveIconSelector(quoted[0], ctx.selectors);
    if (!sel) {
      return {
        error: {
          line,
          raw,
          message: `点击图标 "${quoted[0]}" 未在 selectors.yaml 中找到，且不是 "id:xxx" 或九宫格语义位（左上/右上/...）`,
        },
      };
    }
    return {
      action: { type: "tapOn", target: quoted[0], selector: sel, line, raw },
    };
  }

  // 点击位置：点击位置 "右上" 或 点击位置 "95%, 8%"（必须先于普通"点击"判定）
  if (text.includes("点击位置")) {
    if (quoted.length < 1) {
      return {
        error: {
          line,
          raw,
          message:
            '点击位置需要一个双引号目标：点击位置 "右上" 或 点击位置 "95%, 8%"',
        },
      };
    }
    const sel = resolvePointSelector(quoted[0]);
    if (!sel) {
      return {
        error: {
          line,
          raw,
          message: `点击位置 "${quoted[0]}" 不是合法格式（应为九宫格名"右上"等，或形如 "95%, 8%"）`,
        },
      };
    }
    return {
      action: { type: "tapOn", target: quoted[0], selector: sel, line, raw },
    };
  }

  // 点击：点击 "X"（按文本/a11y label 匹配）
  if (text.includes("点击")) {
    if (quoted.length < 1) {
      return {
        error: { line, raw, message: '点击动作需要一个双引号目标：点击 "文本"' },
      };
    }
    return { action: { type: "tapOn", target: quoted[0], line, raw } };
  }

  return {
    error: { line, raw, message: `无法识别的动作（不在 DSL 词典中）：${raw}` },
  };
}

type Section = "given" | "when" | "then" | null;

/** 创建一个空 case 块 */
function emptyCase(sourcePath: string, startLine: number, index: number): CaseIR {
  return { sourcePath, startLine, index, given: [], when: [], then: [] };
}

/**
 * 解析 .case 文件内容为多个 case 块。每次出现 `前提：` 即开启一个新 case，
 * 同一文件中可包含若干互相独立的 case（编译/执行时各自独立）。
 *
 * @param selectors 别名表（解析"点击图标"时使用）；调用方负责加载
 */
export function parseCaseFile(
  content: string,
  sourcePath: string,
  selectors: SelectorsTable = { loaded: false, map: {}, errors: [] },
): { cases: CaseIR[]; errors: LintError[] } {
  const lines = content.split("\n");
  const cases: CaseIR[] = [];
  const errors: LintError[] = [];
  const ctx: ParseContext = { selectors };

  // 把 selectors 加载阶段的错误也作为 lint 错误抛出（行号未知用 0）
  for (const msg of selectors.errors) {
    errors.push({ line: 0, message: msg });
  }

  let current: CaseIR | null = null;
  let section: Section = null;

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;

    // 段落头：前提：/ 当：/ 那么：
    const sectionMatch = trimmed.match(/^(前提|当|那么)\s*[:：]\s*(.*)$/);
    if (sectionMatch) {
      const head = sectionMatch[1];
      if (head === "前提") {
        current = emptyCase(sourcePath, lineNo, cases.length + 1);
        cases.push(current);
        section = "given";
      } else {
        if (current === null) {
          errors.push({
            line: lineNo,
            raw: trimmed,
            message: `「${head}：」出现在任何「前提：」之前`,
          });
          return;
        }
        section = head === "当" ? "when" : "then";
      }
      const inline = sectionMatch[2].trim();
      if (inline === "") return;
      const { action, error } = parseActionLine(inline, lineNo, ctx);
      if (error) errors.push(error);
      else if (action && current && section) current[section].push(action);
      return;
    }

    // 列表项动作行
    if (section === null || current === null) {
      errors.push({
        line: lineNo,
        raw: trimmed,
        message: "动作出现在任何段落（前提/当/那么）之前",
      });
      return;
    }
    const body = stripBullet(trimmed);
    if (body === "") return;
    const { action, error } = parseActionLine(body, lineNo, ctx);
    if (error) errors.push(error);
    else if (action) current[section].push(action);
  });

  // 文件级结构校验
  if (cases.length === 0) {
    errors.push({ line: 0, message: "缺少「前提：」段（文件中至少需要一个 case）" });
  }
  cases.forEach((c) => {
    const where = `第 ${c.index} 个 case（行 ${c.startLine}）`;
    if (c.given.length === 0) {
      errors.push({
        line: c.startLine ?? 0,
        message: `${where} 缺少「前提：」内容`,
      });
    }
    if (c.when.length === 0 && c.then.length === 0) {
      errors.push({
        line: c.startLine ?? 0,
        message: `${where} 「当：」与「那么：」至少需要一个`,
      });
    }
  });

  return { cases, errors };
}

/** 读取并解析 .case 文件，自动加载 cases/selectors.yaml（若存在） */
export function lintCaseFile(
  path: string,
): { cases: CaseIR[]; errors: LintError[] } {
  const content = readFileSync(path, "utf8");
  const selectors = loadSelectorsTable();
  return parseCaseFile(content, path, selectors);
}
