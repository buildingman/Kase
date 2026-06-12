import { readFileSync } from "node:fs";
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
  const re = /[""]([^""]*)[""]|"([^"]*)"/g;
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

/** 把单行动作文本解析为 Action（已去掉 bullet），section 用于上下文 */
function parseActionLine(text: string, line: number): ParseLineResult {
  const raw = text;
  const quoted = extractQuoted(text);

  // 前提类
  if (text.includes("清空应用数据并启动")) {
    return { action: { type: "clearStateAndLaunch", line, raw } };
  }
  if (text.includes("直接启动应用")) {
    return { action: { type: "launchApp", line, raw } };
  }

  // 输入：在 "X" 中输入 "Y"
  if (text.includes("输入")) {
    if (quoted.length < 2) {
      return {
        error: {
          line,
          raw,
          message: '输入动作需要两个双引号片段：在 "输入框" 中输入 "内容"',
        },
      };
    }
    return {
      action: { type: "inputText", target: quoted[0], value: quoted[1], line, raw },
    };
  }

  // 等待：等待 "X" 出现
  if (text.includes("等待")) {
    if (quoted.length < 1) {
      return {
        error: { line, raw, message: '等待动作需要一个双引号目标：等待 "文本" 出现' },
      };
    }
    return { action: { type: "waitFor", target: quoted[0], line, raw } };
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

  // 点击：点击 "X"
  if (text.includes("点击")) {
    if (quoted.length < 1) {
      return {
        error: { line, raw, message: '点击动作需要一个双引号目标：点击 "文本或ID"' },
      };
    }
    return { action: { type: "tapOn", target: quoted[0], line, raw } };
  }

  return {
    error: { line, raw, message: `无法识别的动作（不在 DSL 词典中）：${raw}` },
  };
}

type Section = "given" | "when" | "then" | null;

/** 解析 .case 文件内容为 IR，同时收集校验错误 */
export function parseCase(
  content: string,
  sourcePath: string,
): { ir: CaseIR; errors: LintError[] } {
  const lines = content.split("\n");
  const ir: CaseIR = { sourcePath, given: [], when: [], then: [] };
  const errors: LintError[] = [];
  let section: Section = null;

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;

    // 段落头：前提：/ 当：/ 那么：（支持中英文冒号，且行内可能直接跟内容）
    const sectionMatch = trimmed.match(/^(前提|当|那么)\s*[:：]\s*(.*)$/);
    if (sectionMatch) {
      const head = sectionMatch[1];
      section = head === "前提" ? "given" : head === "当" ? "when" : "then";
      const inline = sectionMatch[2].trim();
      if (inline === "") return; // 内容在后续列表行
      const { action, error } = parseActionLine(inline, lineNo);
      if (error) errors.push(error);
      else if (action) ir[section].push(action);
      return;
    }

    // 列表项动作行
    if (section === null) {
      errors.push({
        line: lineNo,
        raw: trimmed,
        message: "动作出现在任何段落（前提/当/那么）之前",
      });
      return;
    }
    const body = stripBullet(trimmed);
    if (body === "") return;
    const { action, error } = parseActionLine(body, lineNo);
    if (error) errors.push(error);
    else if (action) ir[section].push(action);
  });

  // 结构校验
  if (ir.given.length === 0) {
    errors.push({ line: 0, message: "缺少「前提：」段（必须有初始化动作）" });
  }
  if (ir.when.length === 0 && ir.then.length === 0) {
    errors.push({ line: 0, message: "「当：」与「那么：」至少需要一个" });
  }

  return { ir, errors };
}

/** 读取并解析 .case 文件 */
export function lintCaseFile(path: string): { ir: CaseIR; errors: LintError[] } {
  const content = readFileSync(path, "utf8");
  return parseCase(content, path);
}
