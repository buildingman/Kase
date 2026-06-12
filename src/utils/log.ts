import pc from "picocolors";

/** 统一日志输出（带颜色与图标） */
export const log = {
  info(msg: string): void {
    console.log(`${pc.blue("›")} ${msg}`);
  },
  success(msg: string): void {
    console.log(`${pc.green("✔")} ${msg}`);
  },
  warn(msg: string): void {
    console.log(`${pc.yellow("⚠")} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${pc.red("✖")} ${msg}`);
  },
  step(msg: string): void {
    console.log(`${pc.cyan("→")} ${msg}`);
  },
  dim(msg: string): void {
    console.log(pc.dim(msg));
  },
  title(msg: string): void {
    console.log(`\n${pc.bold(msg)}`);
  },
};
