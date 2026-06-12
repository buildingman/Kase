import type { KaseConfig } from "../config/index.js";
import { compileCase } from "../compile/index.js";
import { executeFlow } from "./executor.js";
import { log } from "../utils/log.js";

export interface RunResult {
  ok: boolean;
}

/** 全流程：编译（命中缓存则跳过）→ 模拟器执行 → 报告
 *  一个 .case 文件可能包含多个 case，这里按顺序逐个执行；任何一个失败即整体失败，
 *  但会继续跑完其余 case 以便一次跑完看到所有结果。
 */
export async function runCase(
  casePath: string,
  config: KaseConfig,
): Promise<RunResult> {
  log.title(`Run: ${casePath}`);

  // 1. 编译（含 lint + 缓存），可能产出多个 yaml
  const compiled = await compileCase(casePath, config);
  if (!compiled.ok || !compiled.outputPaths || compiled.outputPaths.length === 0) {
    for (const e of compiled.errors ?? []) log.error(e);
    return { ok: false };
  }

  const total = compiled.outputPaths.length;
  let allOk = true;
  const summary: Array<{ path: string; ok: boolean }> = [];

  // 2. 逐个 case 执行
  for (let i = 0; i < total; i++) {
    const yamlPath = compiled.outputPaths[i];
    const tag = total > 1 ? `[case ${i + 1}/${total}] ` : "";
    log.step(`${tag}开始执行：${yamlPath}`);
    const result = await executeFlow(yamlPath, config);
    summary.push({ path: yamlPath, ok: result.ok });
    if (!result.ok) allOk = false;
  }

  // 3. 多 case 时打印汇总
  if (total > 1) {
    log.title(`执行汇总（${total} 个 case）`);
    summary.forEach((s, i) => {
      const mark = s.ok ? "✔" : "✖";
      const fn = s.ok ? log.success : log.error;
      fn(`  ${mark} case ${i + 1}: ${s.path}`);
    });
  }

  return { ok: allOk };
}
