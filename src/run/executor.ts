import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { KaseConfig } from "../config/index.js";
import { exec } from "../utils/exec.js";
import { envWithJavaHome } from "../utils/java.js";
import { log } from "../utils/log.js";

export interface ExecuteResult {
  ok: boolean;
  exitCode: number;
  reportDir: string;
}

/**
 * 在 iOS 模拟器上执行固化的 Maestro YAML。
 * 完全脱离 AI，只调用 maestro CLI。
 */
export async function executeFlow(
  yamlPath: string,
  config: KaseConfig,
): Promise<ExecuteResult> {
  if (!config.appId) {
    log.error("缺少 APP_ID，请在 .env 配置 KASE_APP_ID");
    return { ok: false, exitCode: -1, reportDir: "" };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = join(process.cwd(), config.dirs.reports, stamp);
  mkdirSync(reportDir, { recursive: true });

  const args: string[] = [];
  if (config.simulatorUdid) {
    args.push("--udid", config.simulatorUdid);
  }
  args.push(
    "test",
    yamlPath,
    "-e",
    `APP_ID=${config.appId}`,
    "--format",
    "JUNIT",
    "--output",
    join(reportDir, "report.xml"),
    "--test-output-dir",
    reportDir,
  );

  log.step(`执行 Maestro：maestro ${args.join(" ")}`);
  log.dim(`   APP_ID=${config.appId}  设备=${config.simulatorUdid || "当前模拟器"}`);

  const res = await exec("maestro", args, {
    inherit: true,
    env: envWithJavaHome(),
  });

  const ok = res.code === 0;
  if (ok) {
    log.success(`执行通过，报告目录：${reportDir}`);
  } else {
    log.error(`执行失败（退出码 ${res.code}），报告目录：${reportDir}`);
  }
  return { ok, exitCode: res.code, reportDir };
}
