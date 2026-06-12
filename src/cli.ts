#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig } from "./config/index.js";
import { runDoctor } from "./run/doctor.js";
import { runLint } from "./lint/index.js";
import { compileCase } from "./compile/index.js";
import { runCase } from "./run/index.js";
import { log } from "./utils/log.js";

const program = new Command();

program
  .name("kase")
  .description("智能 iOS BDD 自动化：BDD(.case) → AI 编译 → Maestro YAML → 模拟器执行")
  .version("0.1.0");

program
  .command("doctor")
  .description("环境自检：检查 Node / Java / Maestro / 模拟器 是否就绪")
  .action(async () => {
    const ok = await runDoctor();
    process.exit(ok ? 0 : 1);
  });

program
  .command("lint")
  .argument("<case>", ".case 文件路径")
  .description("仅做 BDD 语法校验，不调用 AI")
  .action((casePath: string) => {
    const ok = runLint(casePath);
    process.exit(ok ? 0 : 1);
  });

program
  .command("compile")
  .argument("<case>", ".case 文件路径")
  .description("AI 编译为 Maestro YAML 并固化（命中缓存则跳过）")
  .action(async (casePath: string) => {
    const config = loadConfig();
    log.title(`Compile: ${casePath}`);
    const result = await compileCase(casePath, config);
    if (!result.ok) {
      for (const e of result.errors ?? []) log.error(e);
      process.exit(1);
    }
    process.exit(0);
  });

program
  .command("run")
  .argument("<case>", ".case 文件路径")
  .description("编译（命中缓存则跳过）→ 模拟器执行 → 生成报告")
  .action(async (casePath: string) => {
    const config = loadConfig();
    const result = await runCase(casePath, config);
    process.exit(result.ok ? 0 : 1);
  });

// 预加载配置以尽早暴露配置错误（当前仅校验可加载）
loadConfig();

program.parseAsync(process.argv);
