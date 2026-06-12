/** .case 文件解析后的中间表示 (IR)，作为 AI 编译的结构化输入 */

/** 单条动作的类型 */
export type ActionType =
  | "launchApp"
  | "clearStateAndLaunch"
  | "tapOn"
  | "inputText"
  | "swipe"
  | "waitFor"
  | "waitForGone"
  | "eraseText"
  | "back"
  | "assertVisible"
  | "assertNotVisible";

export type SwipeDirection = "UP" | "DOWN" | "LEFT" | "RIGHT";

/** 元素定位策略：
 *  - text  按可见文本 / a11y label 正则匹配（默认）
 *  - id    按 accessibility identifier 精确匹配
 *  - point 按屏幕百分比坐标（如 "95%, 8%"），用于纯图标/无 a11y label 元素的兜底
 */
export type SelectorKind = "text" | "id" | "point";

export interface Selector {
  kind: SelectorKind;
  value: string;
}

/** 一条解析后的动作 */
export interface Action {
  type: ActionType;
  /**
   * 主目标的字符串形式（点击文本、断言文本、输入框定位等）。
   * 当 selector 为 undefined 时，target 默认按 text 语义；当 selector 存在时优先使用 selector。
   * 保留 target 字段是为了兼容旧动作（如 assertVisible / waitFor 仍是文本语义）。
   */
  target?: string;
  /** 结构化定位（仅 tapOn 在使用 `点击图标` / `点击位置` 时填充） */
  selector?: Selector;
  /** 输入内容（仅 inputText 使用） */
  value?: string;
  /** 滑动方向（仅 swipe 使用） */
  direction?: SwipeDirection;
  /** 自定义超时（毫秒，仅 waitFor / waitForGone 使用，缺省走全局默认 10000ms） */
  timeoutMs?: number;
  /** 源文件行号（用于错误定位） */
  line: number;
  /** 原始文本（便于调试与 AI 上下文） */
  raw: string;
}

/**
 * 单个 case（一段 前提/当/那么）。
 * 一个 .case 文件可包含多个 case，以重复出现的 `前提：` 作为分隔。
 */
export interface CaseIR {
  /** 源文件路径 */
  sourcePath: string;
  /** 该 case 在源文件中的起始行号（即第一个 `前提：` 行；单 case 时为 0/未设置） */
  startLine?: number;
  /** 该 case 在文件内的序号（1-based，单 case 时为 1） */
  index?: number;
  /** given 段动作（前提） */
  given: Action[];
  /** when 段动作（当） */
  when: Action[];
  /** then 段动作（那么） */
  then: Action[];
}

/** 校验错误 */
export interface LintError {
  line: number;
  message: string;
  raw?: string;
}
