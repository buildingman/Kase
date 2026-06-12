import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { KaseConfig } from "../config/index.js";
import { lintCaseFile } from "../lint/parser.js";
import { compileWithAI } from "./ai.js";
import { validateMaestroYaml } from "./validate.js";
import { log } from "../utils/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CompileResult {
  ok: boolean;
  /** 固化后的 yaml 路径 */
  outputPath?: string;
  /** 是否命中缓存 */
  cached?: boolean;
  errors?: string[];
}

/** 读取 system prompt 文件 */
function loadSystemPrompt(config: KaseConfig): string {
  // prompts 目录在项目根，相对 dist/src 向上找
  const candidates = [
    join(process.cwd(), config.dirs.prompts, "compile-system.txt"),
    join(__dirname, "../../prompts/compile-system.txt"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error("找不到 prompts/compile-system.txt");
}

/** 计算缓存 key：case内容 + DSL版本 + model */
function computeHash(content: string, config: KaseConfig): string {
  // 把 provider/baseUrl 也算进 hash，避免切换供应商时复用旧缓存
  return createHash("sha256")
    .update(content)
    .update(config.dslVersion)
    .update(config.provider)
    .update(config.baseUrl)
    .update(config.model)
    .digest("hex")
    .slice(0, 12);
}

/** 固化文件路径：compiled/<caseName>.yaml */
function outputPathFor(casePath: string, config: KaseConfig): string {
  const name = basename(casePath).replace(/\.case$/, "");
  return join(process.cwd(), config.dirs.compiled, `${name}.yaml`);
}

/** 给固化 YAML 加元信息头 */
function withMeta(yaml: string, casePath: string, hash: string, model: string): string {
  const meta = [
    `# === Kase 固化产物（请勿手改，由 .case 编译生成）===`,
    `# source: ${casePath}`,
    `# hash:   ${hash}`,
    `# model:  ${model}`,
    `# time:   ${new Date().toISOString()}`,
    "",
  ].join("\n");
  return meta + yaml;
}

/** 从固化文件读取已记录的 hash */
function readCachedHash(outputPath: string): string | null {
  if (!existsSync(outputPath)) return null;
  const content = readFileSync(outputPath, "utf8");
  const m = content.match(/^#\s*hash:\s*(\w+)/m);
  return m ? m[1] : null;
}

/**
 * 编译单个 .case：lint → (缓存命中?) → AI 编译 → YAML 校验 → 固化。
 */
export async function compileCase(
  casePath: string,
  config: KaseConfig,
): Promise<CompileResult> {
  if (!existsSync(casePath)) {
    return { ok: false, errors: [`文件不存在：${casePath}`] };
  }

  // 1. lint
  const { ir, errors: lintErrors } = lintCaseFile(casePath);
  if (lintErrors.length > 0) {
    return {
      ok: false,
      errors: lintErrors.map(
        (e) => `[${e.line > 0 ? "第" + e.line + "行" : "结构"}] ${e.message}`,
      ),
    };
  }

  const rawContent = readFileSync(casePath, "utf8");
  const hash = computeHash(rawContent, config);
  const outputPath = outputPathFor(casePath, config);

  // 2. 缓存命中检查
  if (readCachedHash(outputPath) === hash) {
    log.success(`命中缓存，跳过 AI 编译：${outputPath}`);
    return { ok: true, outputPath, cached: true };
  }

  // 3. AI 编译
  log.step(`调用 AI 编译（model=${config.model}）...`);
  const systemPrompt = loadSystemPrompt(config);
  let yaml: string;
  try {
    yaml = await compileWithAI(ir, systemPrompt, config);
  } catch (e) {
    return { ok: false, errors: [`AI 编译失败：${(e as Error).message}`] };
  }

  // 4. YAML 校验（防幻觉）
  const validation = validateMaestroYaml(yaml);
  if (!validation.ok) {
    return {
      ok: false,
      errors: ["AI 生成的 YAML 未通过校验：", ...validation.errors],
    };
  }

  // 5. 固化
  mkdirSync(join(process.cwd(), config.dirs.compiled), { recursive: true });
  writeFileSync(outputPath, withMeta(yaml, casePath, hash, config.model), "utf8");
  log.success(`已固化：${outputPath}`);
  return { ok: true, outputPath, cached: false };
}
