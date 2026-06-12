import { config as loadEnv } from "dotenv";

loadEnv();

/**
 * 支持的 AI Provider。Kase 通过 baseUrl + apiKey 抽象，
 * 任何 OpenAI 兼容网关都可工作（Kilo Gateway / OpenRouter / 自建代理 等）。
 */
export type Provider = "kilo" | "openrouter" | "custom";

/** 各 provider 的默认 baseUrl */
const PROVIDER_DEFAULTS: Record<Provider, { baseUrl: string; defaultModel: string }> = {
  kilo: {
    baseUrl: "https://api.kilo.ai/api/gateway",
    defaultModel: "anthropic/claude-sonnet-4.5",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "deepseek/deepseek-v4-flash",
  },
  custom: {
    baseUrl: "",
    defaultModel: "",
  },
};

/** Kase 全局配置 */
export interface KaseConfig {
  /** AI 供应商（决定 baseUrl 与默认模型） */
  provider: Provider;
  /** AI Gateway base URL（OpenAI 兼容） */
  baseUrl: string;
  /** AI API Key */
  apiKey: string;
  /** 模型 ID（provider/model 格式） */
  model: string;
  /** 目标 App bundleId */
  appId: string;
  /** iOS 模拟器 UDID（空字符串表示使用当前已启动的模拟器） */
  simulatorUdid: string;
  /** 目录约定 */
  dirs: {
    cases: string;
    compiled: string;
    reports: string;
    prompts: string;
  };
  /** AI 编译相关 */
  compile: {
    temperature: number;
    maxRetries: number;
    timeoutMs: number;
  };
  /** Maestro 执行相关 */
  maestro: {
    /** 默认等待超时(ms) */
    defaultWaitTimeoutMs: number;
  };
  /** DSL 版本（参与缓存 hash，规则变更时递增） */
  dslVersion: string;
}

function resolveProvider(): Provider {
  const raw = (process.env.KASE_PROVIDER ?? "kilo").toLowerCase();
  if (raw === "kilo" || raw === "openrouter" || raw === "custom") return raw;
  return "kilo";
}

/**
 * API Key 解析：优先级 KASE_API_KEY > 各 provider 专属 key。
 * 这样 .env 里既可以用统一的 KASE_API_KEY，也可以保留旧的 OPENROUTER_API_KEY。
 */
function resolveApiKey(provider: Provider): string {
  if (process.env.KASE_API_KEY) return process.env.KASE_API_KEY;
  if (provider === "kilo" && process.env.KILO_API_KEY) return process.env.KILO_API_KEY;
  if (provider === "openrouter" && process.env.OPENROUTER_API_KEY)
    return process.env.OPENROUTER_API_KEY;
  return "";
}

/** 从环境变量与默认值构建配置 */
export function loadConfig(): KaseConfig {
  const provider = resolveProvider();
  const defaults = PROVIDER_DEFAULTS[provider];
  return {
    provider,
    baseUrl: process.env.KASE_BASE_URL || defaults.baseUrl,
    apiKey: resolveApiKey(provider),
    model: process.env.KASE_MODEL || defaults.defaultModel,
    appId: process.env.KASE_APP_ID ?? "",
    simulatorUdid: process.env.KASE_SIMULATOR_UDID ?? "",
    dirs: {
      cases: "cases",
      compiled: "compiled",
      reports: "reports",
      prompts: "prompts",
    },
    compile: {
      temperature: 0,
      maxRetries: 2,
      timeoutMs: 60_000,
    },
    maestro: {
      defaultWaitTimeoutMs: 10_000,
    },
    dslVersion: "1",
  };
}
