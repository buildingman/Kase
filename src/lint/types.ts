/** .case 文件解析后的中间表示 (IR)，作为 AI 编译的结构化输入 */

/** 单条动作的类型 */
export type ActionType =
  | "launchApp"
  | "clearStateAndLaunch"
  | "tapOn"
  | "inputText"
  | "swipe"
  | "waitFor"
  | "eraseText"
  | "back"
  | "assertVisible"
  | "assertNotVisible";

export type SwipeDirection = "UP" | "DOWN" | "LEFT" | "RIGHT";

/** 一条解析后的动作 */
export interface Action {
  type: ActionType;
  /** 主目标（点击文本、断言文本、输入框定位等） */
  target?: string;
  /** 输入内容（仅 inputText 使用） */
  value?: string;
  /** 滑动方向（仅 swipe 使用） */
  direction?: SwipeDirection;
  /** 源文件行号（用于错误定位） */
  line: number;
  /** 原始文本（便于调试与 AI 上下文） */
  raw: string;
}

/** 解析后的整个用例 */
export interface CaseIR {
  /** 源文件路径 */
  sourcePath: string;
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
