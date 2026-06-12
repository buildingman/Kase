import { existsSync } from "node:fs";
import { lintCaseFile } from "./parser.js";
import type { CaseIR } from "./types.js";
import { log } from "../utils/log.js";

/** 把 IR 摘要打印出来，便于人工确认解析结果 */
function printSummary(ir: CaseIR): void {
  const sections: Array<[string, typeof ir.given]> = [
    ["前提", ir.given],
    ["当", ir.when],
    ["那么", ir.then],
  ];
  for (const [name, actions] of sections) {
    if (actions.length === 0) continue;
    log.dim(`  ${name}:`);
    for (const a of actions) {
      const extra = [
        a.target ? `target="${a.target}"` : "",
        a.value ? `value="${a.value}"` : "",
        a.direction ? `dir=${a.direction}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      log.dim(`    - ${a.type}${extra ? " " + extra : ""}`);
    }
  }
}

/** 执行 lint，返回是否通过 */
export function runLint(casePath: string): boolean {
  log.title(`Lint: ${casePath}`);

  if (!existsSync(casePath)) {
    log.error(`文件不存在：${casePath}`);
    return false;
  }

  const { ir, errors } = lintCaseFile(casePath);

  if (errors.length > 0) {
    for (const e of errors) {
      const loc = e.line > 0 ? `第 ${e.line} 行` : "结构";
      log.error(`[${loc}] ${e.message}`);
      if (e.raw) log.dim(`   ↳ ${e.raw}`);
    }
    log.warn(`校验未通过，共 ${errors.length} 个问题。`);
    return false;
  }

  const total = ir.given.length + ir.when.length + ir.then.length;
  printSummary(ir);
  log.success(`校验通过，共解析 ${total} 个动作。`);
  return true;
}

export { lintCaseFile } from "./parser.js";
export type { CaseIR } from "./types.js";
