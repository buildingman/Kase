/**
 * 编译辅助：把"输入框定位"用的提示文案转成 Maestro 可用的模糊正则。
 *
 * 背景：Maestro 的 `tapOn: "..."` 默认按完整正则匹配可见文本。用户在 .case 里写
 *   `在 "请输入手机号..." 中输入 "13800000000"`
 * 时，UI 上真实占位符可能是 `请输入手机号…`(单字符省略号 U+2026) 或 `请输入手机号 (选填)`，
 * 精确字符串往往匹配不上。
 *
 * 策略：把目标文案首尾的"提示性装饰字符"剥掉，对正则元字符转义，再用 `.*` 包裹，
 * 形成形如 `.*请输入手机号.*` 的模糊正则；对全是装饰字符的退化情况，原样返回。
 *
 * 该函数在 IR → AI 输入的序列化阶段使用，确保只针对 `inputText target+value`
 * 这种"先点击输入框再输入"的动作做模糊化，而不会污染普通的 `tapOn`。
 */

/** 需要从首尾剥掉的"提示性"字符（占位符常见装饰） */
const TRIM_CHARS_RE = /^[\s.…?？!！,，。:：;；\-_]+|[\s.…?？!！,，。:：;；\-_]+$/g;

/** 正则元字符转义 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把一段 target 文案转成模糊匹配的正则字符串 */
export function fuzzifyTarget(target: string): string {
  const core = target.replace(TRIM_CHARS_RE, "");
  if (core.length === 0) return target; // 全是装饰字符，放弃改写
  return `.*${escapeRegExp(core)}.*`;
}
