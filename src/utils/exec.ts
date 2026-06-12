import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  cwd?: string;
  /** 额外环境变量（会与 process.env 合并） */
  env?: Record<string, string>;
  /** 是否实时透传子进程输出到当前终端 */
  inherit?: boolean;
}

/**
 * 执行外部命令（如 maestro），返回退出码与输出。
 * 不使用 shell，避免注入问题；参数以数组形式传入。
 */
export function exec(
  command: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.inherit ? "inherit" : "pipe",
    });

    let stdout = "";
    let stderr = "";

    if (!options.inherit) {
      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
    }

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** 检查某个命令是否存在于 PATH 中 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const res = await exec("which", [command]);
    return res.code === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
