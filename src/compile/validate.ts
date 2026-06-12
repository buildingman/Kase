import { parse as parseYaml } from "yaml";

/** Maestro 允许的命令白名单（与 DSL 词典对应） */
const ALLOWED_COMMANDS = new Set([
  "launchApp",
  "clearState",
  "tapOn",
  "inputText",
  "swipe",
  "extendedWaitUntil",
  "eraseText",
  "back",
  "assertVisible",
  "assertNotVisible",
]);

export interface ValidateResult {
  ok: boolean;
  errors: string[];
}

/**
 * 校验 AI 生成的 Maestro YAML：
 * 1. 能被解析为 header + 命令列表两段（以 --- 分隔）
 * 2. header 含 appId
 * 3. 每个命令在白名单内
 */
export function validateMaestroYaml(yamlText: string): ValidateResult {
  const errors: string[] = [];

  // Maestro 用 --- 分隔 header 与 flow，是多文档 YAML
  const parts = yamlText.split(/^---\s*$/m);
  if (parts.length < 2) {
    errors.push("YAML 缺少 `---` 分隔符（header 与命令列表）");
    return { ok: false, errors };
  }

  const headerText = parts[0];
  const flowText = parts.slice(1).join("\n---\n");

  // 校验 header
  let header: unknown;
  try {
    header = parseYaml(headerText);
  } catch (e) {
    errors.push(`header 解析失败：${(e as Error).message}`);
    return { ok: false, errors };
  }
  if (
    typeof header !== "object" ||
    header === null ||
    !("appId" in (header as Record<string, unknown>))
  ) {
    errors.push("header 缺少 appId 字段");
  }

  // 校验 flow（命令列表）
  let flow: unknown;
  try {
    flow = parseYaml(flowText);
  } catch (e) {
    errors.push(`命令列表解析失败：${(e as Error).message}`);
    return { ok: false, errors };
  }
  if (!Array.isArray(flow)) {
    errors.push("命令列表不是 YAML 数组");
    return { ok: false, errors };
  }

  for (const step of flow) {
    let cmd: string | undefined;
    if (typeof step === "string") {
      cmd = step;
    } else if (typeof step === "object" && step !== null) {
      cmd = Object.keys(step as Record<string, unknown>)[0];
    }
    if (!cmd) {
      errors.push(`无法识别的命令项：${JSON.stringify(step)}`);
      continue;
    }
    if (!ALLOWED_COMMANDS.has(cmd)) {
      errors.push(`命令 "${cmd}" 不在白名单内（可能是 AI 幻觉）`);
    }
  }

  return { ok: errors.length === 0, errors };
}
