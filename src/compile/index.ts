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
import type { CaseIR } from "../lint/types.js";
import { compileWithAI } from "./ai.js";
import { validateMaestroYaml } from "./validate.js";
import { log } from "../utils/log.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CompileResult {
  ok: boolean;
  /** 每个 case 对应的固化 yaml 路径（与源文件中的 case 顺序一致） */
  outputPaths?: string[];
  /** 是否全部命中缓存 */
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

/** 计算缓存 key：单个 case 的 IR 内容 + DSL版本 + provider + model */
function computeHash(ir: CaseIR, config: KaseConfig): string {
  // 基于 IR 内容稳定序列化做 hash，文件中其他 case 的改动不会让本 case 失效
  const irKey = JSON.stringify({
    given: ir.given.map((a) => ({ ...a, line: undefined, raw: undefined })),
    when: ir.when.map((a) => ({ ...a, line: undefined, raw: undefined })),
    then: ir.then.map((a) => ({ ...a, line: undefined, raw: undefined })),
  });
  return createHash("sha256")
    .update(irKey)
    .update(config.dslVersion)
    .update(config.provider)
    .update(config.baseUrl)
    .update(config.model)
    .digest("hex")
    .slice(0, 12);
}

/**
 * 固化文件路径：
 *   - 单 case：compiled/<caseName>.yaml
 *   - 多 case：compiled/<caseName>__<idx>.yaml（idx 从 1 开始）
 */
function outputPathFor(
  casePath: string,
  config: KaseConfig,
  index: number,
  total: number,
): string {
  const name = basename(casePath).replace(/\.case$/, "");
  const suffix = total > 1 ? `__${index}` : "";
  return join(process.cwd(), config.dirs.compiled, `${name}${suffix}.yaml`);
}

/** 给固化 YAML 加元信息头 */
function withMeta(
  yaml: string,
  casePath: string,
  hash: string,
  model: string,
  caseIndex: number,
  caseTotal: number,
): string {
  const meta = [
    `# === Kase 固化产物（请勿手改，由 .case 编译生成）===`,
    `# source: ${casePath}`,
    `# case:   ${caseIndex}/${caseTotal}`,
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
 * 编译单个 .case 文件中的所有 case：lint → 对每个 case (缓存命中?) → AI 编译 → YAML 校验 → 固化。
 * 任何一个 case 失败即整体失败（早期返回，避免后续浪费 AI 调用）。
 */
export async function compileCase(
  casePath: string,
  config: KaseConfig,
): Promise<CompileResult> {
  if (!existsSync(casePath)) {
    return { ok: false, errors: [`文件不存在：${casePath}`] };
  }

  // 1. lint —— 一次性解析整个文件，可能产出多个 case
  const { cases, errors: lintErrors } = lintCaseFile(casePath);
  if (lintErrors.length > 0) {
    return {
      ok: false,
      errors: lintErrors.map(
        (e) => `[${e.line > 0 ? "第" + e.line + "行" : "结构"}] ${e.message}`,
      ),
    };
  }
  if (cases.length === 0) {
    return { ok: false, errors: ["未解析到任何 case"] };
  }

  mkdirSync(join(process.cwd(), config.dirs.compiled), { recursive: true });

  const systemPrompt = loadSystemPrompt(config);
  const outputPaths: string[] = [];
  let allCached = true;

  for (let i = 0; i < cases.length; i++) {
    const ir = cases[i];
    const idx1 = i + 1;
    const outputPath = outputPathFor(casePath, config, idx1, cases.length);
    const hash = computeHash(ir, config);
    const tag = cases.length > 1 ? `[case ${idx1}/${cases.length}] ` : "";

    // 2. 缓存命中检查
    if (readCachedHash(outputPath) === hash) {
      log.success(`${tag}命中缓存，跳过 AI 编译：${outputPath}`);
      outputPaths.push(outputPath);
      continue;
    }

    // 3. AI 编译
    log.step(`${tag}调用 AI 编译（model=${config.model}）...`);
    let yaml: string;
    try {
      yaml = await compileWithAI(ir, systemPrompt, config);
    } catch (e) {
      return {
        ok: false,
        errors: [`${tag}AI 编译失败：${(e as Error).message}`],
      };
    }

    // 4. YAML 校验（防幻觉）
    const validation = validateMaestroYaml(yaml);
    if (!validation.ok) {
      return {
        ok: false,
        errors: [
          `${tag}AI 生成的 YAML 未通过校验：`,
          ...validation.errors,
        ],
      };
    }

    // 5. 固化
    writeFileSync(
      outputPath,
      withMeta(yaml, casePath, hash, config.model, idx1, cases.length),
      "utf8",
    );
    log.success(`${tag}已固化：${outputPath}`);
    outputPaths.push(outputPath);
    allCached = false;
  }

  return { ok: true, outputPaths, cached: allCached };
}
