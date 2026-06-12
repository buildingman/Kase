import type { KaseConfig } from "../config/index.js";
import { compileCase } from "../compile/index.js";
import { executeFlow } from "./executor.js";
import { log } from "../utils/log.js";

export interface RunResult {
  ok: boolean;
}

/** 全流程：编译（命中缓存则跳过）→ 模拟器执行 → 报告 */
export async function runCase(
  casePath: string,
  config: KaseConfig,
): Promise<RunResult> {
  // 1. 编译（含 lint + 缓存）
  log.title(`Run: ${casePath}`);
  const compiled = await compileCase(casePath, config);
  if (!compiled.ok || !compiled.outputPath) {
    for (const e of compiled.errors ?? []) log.error(e);
    return { ok: false };
  }

  // 2. 执行
  const result = await executeFlow(compiled.outputPath, config);
  return { ok: result.ok };
}
