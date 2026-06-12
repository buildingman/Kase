import OpenAI from "openai";
import type { KaseConfig } from "../config/index.js";
import type { CaseIR } from "../lint/types.js";

/** 把 IR 序列化为给 AI 看的紧凑文本 */
export function serializeIR(ir: CaseIR): string {
  const fmt = (label: string, actions: CaseIR["given"]): string => {
    if (actions.length === 0) return "";
    const items = actions
      .map((a) => {
        const parts: string[] = [a.type];
        if (a.target) parts.push(`target="${a.target}"`);
        if (a.value) parts.push(`value="${a.value}"`);
        if (a.direction) parts.push(`direction=${a.direction}`);
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
