import { existsSync } from "node:fs";

/** Maestro 依赖的 brew openjdk@21 默认路径（Apple Silicon） */
const DEFAULT_JAVA_HOME =
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";
/** Intel Mac 路径 */
const INTEL_JAVA_HOME =
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home";

/**
 * 解析 JAVA_HOME：
 * 1. 优先使用已设置的 process.env.JAVA_HOME
 * 2. 否则尝试 brew openjdk@21 的默认路径（Apple Silicon / Intel）
 * 3. 都找不到返回空串（调用方根据需要决定是否报错）
 */
export function resolveJavaHome(): string {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) {
    return process.env.JAVA_HOME;
  }
  if (existsSync(DEFAULT_JAVA_HOME)) return DEFAULT_JAVA_HOME;
  if (existsSync(INTEL_JAVA_HOME)) return INTEL_JAVA_HOME;
  return "";
}

/** 构造一个含 JAVA_HOME / 更新过 PATH 的环境变量集 */
export function envWithJavaHome(extra: Record<string, string> = {}): Record<string, string> {
  const javaHome = resolveJavaHome();
  const env: Record<string, string> = {
    MAESTRO_CLI_NO_ANALYTICS: "1",
    ...extra,
  };
  if (javaHome) {
    env.JAVA_HOME = javaHome;
    env.PATH = `${javaHome}/bin:${process.env.PATH ?? ""}`;
  }
  return env;
}
