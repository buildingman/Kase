import { exec, commandExists } from "../utils/exec.js";
import { log } from "../utils/log.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  hint?: string;
}

/** 解析 `xcrun simctl list devices booted` 输出，返回已启动模拟器数量与首个名称 */
function parseBootedSimulators(output: string): { count: number; first?: string } {
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("(Booted)"));
  const first = lines[0]?.replace(/\s*\(Booted\)\s*$/, "");
  return { count: lines.length, first };
}

async function checkNode(): Promise<CheckResult> {
  const res = await exec("node", ["-v"]);
  const version = res.stdout.trim();
  const major = Number(version.replace(/^v/, "").split(".")[0] ?? "0");
  return {
    name: "Node.js",
    ok: res.code === 0 && major >= 18,
    detail: version || "未检测到",
    hint: major < 18 ? "需要 Node.js 18 及以上" : undefined,
  };
}

async function checkJava(): Promise<CheckResult> {
  const res = await exec("java", ["-version"]);
  // java -version 输出在 stderr
  const text = res.stderr || res.stdout;
  const match = text.match(/version "(\d+)(?:\.(\d+))?/);
  const major = match ? Number(match[1]) : 0;
  const versionLine = text.split("\n")[0]?.trim() ?? "未检测到";
  return {
    name: "Java (JDK)",
    ok: res.code === 0 && major >= 17,
    detail: versionLine,
    hint:
      major < 17
        ? "Maestro 需要 JDK 17+，推荐 21：brew install openjdk@21 并设置 JAVA_HOME"
        : undefined,
  };
}

async function checkMaestro(): Promise<CheckResult> {
  const exists = await commandExists("maestro");
  if (!exists) {
    return {
      name: "Maestro CLI",
      ok: false,
      detail: "未安装",
      hint: "brew install mobile-dev-inc/tap/maestro",
    };
  }
  const res = await exec("maestro", ["-v"], {
    env: { MAESTRO_CLI_NO_ANALYTICS: "1" },
  });
  const version = res.stdout.trim().split("\n").pop()?.trim() ?? "";
  return {
    name: "Maestro CLI",
    ok: res.code === 0 && /\d+\.\d+/.test(version),
    detail: version || "已安装（版本未知）",
  };
}

async function checkSimulator(): Promise<CheckResult> {
  const exists = await commandExists("xcrun");
  if (!exists) {
    return {
      name: "iOS 模拟器",
      ok: false,
      detail: "未检测到 xcrun（需安装 Xcode / Command Line Tools）",
    };
  }
  const res = await exec("xcrun", ["simctl", "list", "devices", "booted"]);
  const { count, first } = parseBootedSimulators(res.stdout);
  return {
    name: "iOS 模拟器",
    ok: count > 0,
    detail: count > 0 ? `${count} 台已启动：${first}` : "无已启动的模拟器",
    hint:
      count === 0
        ? "启动一个模拟器：open -a Simulator（或 xcrun simctl boot <UDID>）"
        : undefined,
  };
}

/** 运行全部环境检查，返回是否全部通过 */
export async function runDoctor(): Promise<boolean> {
  log.title("Kase 环境自检");

  const checks: CheckResult[] = await Promise.all([
    checkNode(),
    checkJava(),
    checkMaestro(),
    checkSimulator(),
  ]);

  for (const c of checks) {
    if (c.ok) {
      log.success(`${c.name}: ${c.detail}`);
    } else {
      log.error(`${c.name}: ${c.detail}`);
      if (c.hint) log.dim(`   ↳ ${c.hint}`);
    }
  }

  const allOk = checks.every((c) => c.ok);
  console.log("");
  if (allOk) {
    log.success("环境就绪，可以开始编译与执行。");
  } else {
    log.warn("部分环境未就绪，请按上方提示修复后重试。");
  }
  return allOk;
}
