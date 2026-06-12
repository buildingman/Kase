import OpenAI from "openai";
import type { KaseConfig } from "../config/index.js";
import type { CaseIR } from "../lint/types.js";
import { fuzzifyTarget } from "./postprocess.js";

/** 把 IR 序列化为给 AI 看的紧凑文本。
 *  注意：
 *  - 对 `inputText target+value`：把 target 改写为模糊正则（去掉装饰字符并用 .* 包裹），
 *    让 AI 原样写入 YAML 的 tapOn，这样 BDD 里的提示文案不必和 UI 上一字不差。
 *  - 对带 selector 的动作（如 `点击图标` / `点击位置`）：把 selector 的 kind+value 透传，
 *    并不再输出 target 字段（避免 AI 误解）。
 *  - 对 `waitFor` / `waitForGone` 带 timeoutMs：把毫秒值透传给 AI。
 */
export function serializeIR(ir: CaseIR): string {
  const fmt = (label: string, actions: CaseIR["given"]): string => {
    if (actions.length === 0) return "";
    const items = actions
      .map((a) => {
        const parts: string[] = [a.type];
        if (a.selector) {
          // 结构化定位优先于 target 文本
          parts.push(`selector.kind=${a.selector.kind}`);
          parts.push(`selector.value="${a.selector.value}"`);
        } else if (a.target) {
          // inputText 带 target 时，target 仅用于定位输入框，应模糊匹配
          const t = a.type === "inputText" ? fuzzifyTarget(a.target) : a.target;
          parts.push(`target="${t}"`);
        }
        if (a.value) parts.push(`value="${a.value}"`);
        if (a.direction) parts.push(`direction=${a.direction}`);
        if (a.timeoutMs) parts.push(`timeoutMs=${a.timeoutMs}`);
        return "  " + parts.join(" ");
      })
      .join("\n");
    return `${label}:\n${items}`;
  };
  return [
    fmt("given", ir.given),
    fmt("when", ir.when),
    fmt("then", ir.then),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 调用 OpenAI 兼容网关（Kilo Gateway / OpenRouter / 自建）将 IR 编译为 Maestro YAML。
 * 通过 config.baseUrl + config.apiKey + config.model 解耦具体供应商。
 */
export async function compileWithAI(
  ir: CaseIR,
  systemPrompt: string,
  config: KaseConfig,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error(
      `缺少 API Key（provider=${config.provider}）。请在 .env 中配置 KASE_API_KEY 或对应供应商的 key`,
    );
  }
  if (!config.baseUrl) {
    throw new Error("缺少 baseUrl，请在 .env 中配置 KASE_BASE_URL 或选择已知 provider");
  }
  if (!config.model) {
    throw new Error("缺少模型 ID，请在 .env 中配置 KASE_MODEL");
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.compile.timeoutMs,
  });

  const userContent = `请将以下 BDD 用例 IR 编译为 Maestro YAML：\n\n${serializeIR(ir)}`;

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: config.compile.temperature,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  return cleanYamlOutput(text);
}

/** 清理 AI 输出：去掉可能的 markdown 代码块包裹 */
export function cleanYamlOutput(text: string): string {
  let t = text.trim();
  // 去掉 ```yaml ... ``` 或 ``` ... ```
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  return t.trim() + "\n";
}
