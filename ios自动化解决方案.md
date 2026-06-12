# 🚀 智能 iOS BDD 真机自动化架构方案

### 核心设计思想
**“Write Once, Compile by AI, Run Everywhere natively.”**
测试人员只编写 BDD 规范的自然语言，系统通过大模型将其**单次编译**为 Maestro 可执行的 YAML 脚本并缓存固化。后续的所有真机执行均脱离 AI，直接运行固化脚本，保障绝对的稳定性和极高的执行效率。

---

## 阶段一：定义 BDD 语法规范 (DSL)

为了剥离“幻觉”，我们必须对自然语言进行强约束。所有的测试用例文件（假设后缀为 `.case`）必须严格遵循 `前提-当-那么` 结构，并且**操作目标必须用双引号 `""` 强包裹**。

**【规范词典】**
*   **前提 (Given)**：用于初始化状态。
    *   `前提：清空应用数据并启动` -> 映射: `clearState` + `launchApp`
    *   `前提：直接启动应用` -> 映射: `launchApp`
*   **当 (When)**：用于用户行为。
    *   `当：点击 "文本或ID"` -> 映射: `tapOn`
    *   `当：在 "输入框提示文案" 中输入 "内容"` -> 映射: `inputText`
    *   `当：向[上/下/左/右]滑动` -> 映射: `swipe`
    *   `当：等待 "目标文本" 出现` -> 映射: `extendedWaitUntil`
*   **那么 (Then)**：用于结果断言。
    *   `那么：检查屏幕包含 "期望文本"` -> 映射: `assertVisible`
    *   `那么：检查屏幕不包含 "期望文本"` -> 映射: `assertNotVisible`

**【BDD 用例范例】 (`login.case`)**
```gherkin
前提：清空应用数据并启动
当：
  - 点击 "我的"
  - 点击 "立即登录"
  - 在 "请输入手机号" 中输入 "13800000000"
  - 点击 "获取验证码"
  - 在 "请输入验证码" 中输入 "1234"
  - 点击 "同意用户协议"
  - 点击 "提交"
那么：
  - 检查屏幕包含 "登录成功"
```

---

## 技术栈与关键决策

| 项目 | 选型 |
| --- | --- |
| 实现语言 | **Node.js / TypeScript** |
| AI 编译网关 | **Kilo Gateway**（OpenAI 兼容，主用；可切 OpenRouter / 自建） |
| 执行引擎 | **Maestro CLI 2.6.0** |
| 运行目标 | **iOS 模拟器**（见下方「真机限制说明」） |
| JDK | **OpenJDK 21**（Maestro 推荐 17/21，已落地） |
| 缓存固化 | 基于 `.case` 内容 hash，内容不变跳过 AI，直接复用固化 YAML |

> 设计红线：**AI 只在「编译」环节出现一次**。执行链路绝不调用 AI，只跑固化后的 YAML，保证稳定性与可重复性。

> ⚠️ **真机限制说明**：Maestro 稳定版**官方不支持 iOS 真机**（`maestro test` 仅支持模拟器，无 `--apple-team-id` 入口）。因此本方案落地为 **iOS 模拟器** 执行。注意：企业签名 App（如真机上的 `com.txjzrx.cloudmusicstreamer0506`）需有对应的**模拟器构建**才能安装运行；若仅有真机 ipa，则需另行评估 Appium + WebDriverAgent 路线。

---

## 整体数据流

```
 cases/*.case (BDD自然语言)
      │
      │  ① 语法校验 (Linter)            ← 非法格式直接拦截，不浪费 token
      ▼
 ② AI 编译 (Kilo Gateway)             ← 命中缓存则跳过
      │
      │  ③ YAML 校验 (schema + dry-run)
      ▼
 compiled/*.yaml (Maestro脚本, 固化)
      │
       │  ④ Maestro 模拟器执行          ← 完全脱离 AI
      ▼
 reports/* (日志 / 截图 / 通过失败)
```

---

## 阶段二：DSL 词典补全（消除歧义）

阶段一已给出基础映射，这里补全实现所需的全部细节，作为 AI 编译的「唯一事实来源」。

**【完整映射表】**

| BDD 写法 | Maestro 命令 | 备注 |
| --- | --- | --- |
| `前提：清空应用数据并启动` | `clearState` + `launchApp` | 需配置 `appId` |
| `前提：直接启动应用` | `launchApp` | |
| `当：点击 "X"` | `tapOn: "X"` | X 可为文本或 accessibility id |
| `当：在 "提示文案" 中输入 "内容"` | `tapOn: "提示文案"` + `inputText: "内容"` | 先聚焦再输入 |
| `当：向上滑动` | `swipe: { direction: UP }` | 下/左/右 同理 → DOWN/LEFT/RIGHT |
| `当：等待 "X" 出现` | `extendedWaitUntil: { visible: "X", timeout: 10000 }` | 默认超时可配置 |
| `当：清空 "提示文案"` | `tapOn` + `eraseText` | 扩展操作 |
| `当：返回上一页` | `back` | 扩展操作 |
| `那么：检查屏幕包含 "X"` | `assertVisible: "X"` | |
| `那么：检查屏幕不包含 "X"` | `assertNotVisible: "X"` | |

**【格式约束（Linter 规则）】**
1. 文件必须包含 `前提：` 段，`当：` 与 `那么：` 至少出现一个。
2. 所有操作目标必须用英文双引号 `""` 包裹，禁止裸文本。
3. 段落顺序固定为 `前提 → 当 → 那么`。
4. 每个动作必须能匹配上表中的某一条模板，否则报错并指出行号。
5. 输入类动作必须同时给出「定位目标」与「输入内容」两个引号片段。

---

## 阶段三：AI 编译引擎（核心，仅此处用 AI）

**目标**：把校验通过的 `.case` 单次编译为合法 Maestro YAML 并固化。

1. **Prompt 设计**
   - System Prompt 内嵌完整 DSL 映射表 + Maestro YAML 输出范例 + 严格约束（"只输出 YAML，不要解释，不得发明命令"）。
   - 采用 few-shot：附 1~2 个 `.case → .yaml` 标准样例，进一步压制幻觉。
2. **AI 网关接入（OpenAI 兼容）**
   - 通过 `KASE_PROVIDER` 切换 `kilo` / `openrouter` / `custom`，对应不同 `baseUrl`。
   - 默认 Kilo Gateway（`https://api.kilo.ai/api/gateway`，模型 `anthropic/claude-sonnet-4.5`）。
   - 读取 `KASE_API_KEY`，统一用 OpenAI SDK 调用，`temperature=0`（确定性输出）。
   - 失败重试 + 超时控制。
3. **输出后校验（双保险）**
   - YAML 语法解析校验（解析失败直接判编译失败）。
   - 命令白名单校验：生成的每个 Maestro 命令必须在允许集合内。
   - 可选 `maestro test --dry-run` 做静态校验。
4. **缓存固化**
   - key = `hash(case内容 + DSL版本 + model)`；命中则跳过 AI，直接读 `compiled/`。
   - 固化文件含元信息头（源 case 路径、编译时间、model、hash）。

---

## 阶段四：执行引擎（脱离 AI，运行于模拟器）

1. **环境搭建（已完成 ✅）**
   - 安装 Maestro CLI（`brew install mobile-dev-inc/tap/maestro`，已装 2.6.0）。
   - 安装 OpenJDK 21 并设置 `JAVA_HOME`（Maestro 依赖 JVM，已写入 `~/.zshrc`）。
   - 启动 iOS 模拟器（`open -a Simulator` / `xcrun simctl boot <UDID>`）。
   - `kase doctor` 自检脚本已实现（检查 Node / Java / Maestro / 模拟器）。
2. **执行调度**
   - 封装 `maestro --udid <sim> test compiled/xxx.yaml`，支持单用例 / 批量。
   - 采集 stdout/stderr、退出码、Maestro 自动截图。
3. **结果与报告**
   - 汇总为 JUnit XML（便于 CI）+ 可读 HTML（含失败截图）。
   - 输出 `reports/` 目录，按时间戳归档。

---

## 阶段五：工程化与工具链

1. **CLI 入口**（一条命令串起全流程）
   - `kase compile <case>`：仅编译固化。
   - `kase run <case>`：编译（命中缓存则跳过）→ 模拟器执行 → 出报告。
   - `kase lint <case>`：仅语法校验。
   - `kase doctor`：环境自检。
2. **目录结构约定**
   ```
   project/
   ├── cases/        # BDD 源文件 (*.case)
   ├── compiled/     # AI 固化后的 Maestro YAML (*.yaml)
   ├── reports/      # 执行报告与截图
   ├── prompts/      # System Prompt 与 few-shot 样例
   ├── src/
   │   ├── cli.ts          # CLI 入口 (commander)
   │   ├── config/         # 配置加载 (.env + 默认值)
   │   ├── lint/           # M2 语法校验
   │   ├── compile/        # M3 AI 编译 (Kilo Gateway，OpenAI 兼容)
   │   ├── run/            # M4 执行 + doctor 自检
   │   ├── report/         # M6 报告
   │   └── utils/          # log / exec 等工具
   ├── .env(.example)      # OPENROUTER_API_KEY / model / appId
   ├── package.json
   └── tsconfig.json
   ```
3. **配置与密钥**：`OPENROUTER_API_KEY` 等敏感信息走 `.env`；其余默认值在 `src/config/`。
4. **错误处理**：编译失败/校验失败/执行失败分级退出码，便于 CI 判定。

---

## 落地里程碑（建议实现顺序）

1. **M1 项目骨架**：TS 工程、目录结构、配置加载、CLI 框架。 ✅ 已完成
2. **M2 Linter**：`.case` 解析 + 语法校验（纯本地，无 AI）。 ✅ 已完成
3. **M3 AI 编译**：Kilo Gateway 接入 + Prompt + YAML 校验 + 缓存固化。 ✅ 已完成
4. **M4 执行引擎**：Maestro 模拟器调度 + 结果采集（JUnit + 截图）。 ✅ 已完成
5. **M5 环境搭建**：Maestro / JDK21 / 模拟器链路打通 + `doctor` 自检。 ✅ 已完成
6. **M6 报告**：HTML 可视化报告（JUnit XML + 截图嵌入）。 ⏳ 待做

---

## 当前进度（端到端已跑通）

**环境（M5 ✅）**
- Maestro 2.6.0、OpenJDK 21、libimobiledevice 均已安装；`JAVA_HOME` 已写入 `~/.zshrc`。
- iOS 模拟器已验证：iPhone 17 上 `launchApp` + `assertVisible`，全程 `COMPLETED`。

**框架（M1-M4 ✅）**
- `kase doctor` / `lint` / `compile` / `run` 四个命令全部可用。
- `npm run typecheck` 零错误。
- AI 网关：默认 **Kilo Gateway**，模型 `anthropic/claude-sonnet-4.5`；通过 `KASE_PROVIDER` 一键切换 OpenRouter / 自建网关。
- 缓存固化：基于 `case内容 + DSL版本 + provider + baseUrl + model` 的 hash，切换供应商不会复用旧缓存。

**端到端验证（Photos demo）**
- 输入：`cases/photos_demo.case`（中文 BDD：启动 Photos → 点击「搜索」→ 断言屏幕）
- 编译：Kilo Gateway / Claude Sonnet 4.5 → 4 步 Maestro YAML（零幻觉）
- 执行：iPhone 17 模拟器上 **Passed (6s)**
- 报告：`reports/<时间戳>/report.xml`（JUnit）+ 自动截图

> 下一步：按需推进 M6（HTML 报告）；或扩展 DSL 词典（长按、滚动到、键盘隐藏）；或加 `kase run cases/` 批量执行。