# Kase

> 智能 iOS BDD 自动化：用中文写测试，AI 编译为 Maestro YAML，模拟器一键执行。

**核心思想**：`Write Once, Compile by AI, Run Everywhere natively.`
测试人员只编写中文 BDD 用例，系统通过大模型**单次编译**为 Maestro 可执行的 YAML 并固化缓存。后续真机/模拟器执行完全脱离 AI，直接运行固化脚本，保障稳定性与执行效率。

```
.case (中文 BDD)
   ↓  ① 语法校验 (本地，零成本)
   ↓  ② AI 编译 (Kilo Gateway，命中缓存则跳过)
   ↓  ③ YAML 校验 (白名单，防幻觉)
   ↓  ④ Maestro 模拟器执行 (完全脱离 AI)
   ↓  ⑤ JUnit XML + 截图报告
```

---

## ✨ 特性

- ✅ **中文 BDD 用例**：`点击 "登录"`、`检查屏幕包含 "成功"`，业务人员可读可写
- ✅ **AI 单次编译 + 缓存固化**：内容不变就不再调 AI，零额外成本
- ✅ **零幻觉**：解析校验 + YAML 命令白名单双保险
- ✅ **多供应商可切**：Kilo Gateway（默认）/ OpenRouter / 自建 OpenAI 兼容网关
- ✅ **iOS 模拟器执行**：基于 Maestro，含 JUnit XML 报告 + 失败自动截图
- ✅ **环境一键安装**：`bash setup.sh` 自动装齐 Maestro + JDK21 + 工具链

---

## 📋 系统要求

- **macOS**（iOS 自动化必须，Maestro 真机 / 模拟器都跑在 macOS 上）
- **Xcode** + Command Line Tools（提供 iOS 模拟器）
- **Node.js 18+**

非必需的运行时依赖（`setup.sh` 自动安装）：
- Homebrew
- OpenJDK 21（Maestro 依赖 JVM）
- libimobiledevice（iOS 设备工具）
- Maestro CLI 2.6+

---

## 🚀 快速开始（5 分钟）

### 1. 拉取代码

```bash
git clone <你们的内部仓库地址> kase
cd kase
```

### 2. 一键安装环境

```bash
bash setup.sh
```

脚本会：
- 检测 Node.js / Xcode / Homebrew
- 自动通过 brew 安装 OpenJDK 21、libimobiledevice、Maestro CLI
- 把 `JAVA_HOME` 写入你的 `~/.zshrc`（或 `~/.bash_profile`）

> 想只检测不安装？`bash setup.sh --check`

### 3. 安装 Node 依赖

```bash
npm install
```

`npm install` 会自动触发 `prepare` 脚本编译 TS 到 `dist/`。

### 4. 配置 API Key

```bash
cp .env.example .env
```

编辑 `.env` 填入：

```env
KASE_PROVIDER=kilo
KASE_API_KEY=你的_kilo_api_key            # https://app.kilo.ai 获取
KASE_MODEL=anthropic/claude-sonnet-4.5
KASE_APP_ID=com.apple.mobileslideshow      # 目标 App 的 bundleId
KASE_SIMULATOR_UDID=                       # 留空则用当前已启动的模拟器
```

### 5. 启动 iOS 模拟器

```bash
open -a Simulator
```

或指定设备：`xcrun simctl boot "iPhone 17"`

### 6. 验证环境

```bash
npm run kase -- doctor
```

预期看到 4 项全绿：

```
✔ Node.js: v26.x
✔ Java (JDK): openjdk version "21.x"
✔ Maestro CLI: 2.6.0
✔ iOS 模拟器: 1 台已启动：iPhone 17
✔ 环境就绪，可以开始编译与执行。
```

### 7. 跑通 demo

```bash
npm run kase -- run cases/photos_demo.case
```

预期输出：

```
✔ 已固化：compiled/photos_demo.yaml
→ 执行 Maestro：...
[Passed] photos_demo (6s)
✔ 执行通过，报告目录：reports/<时间戳>/
```

---

## 📖 使用指南

### CLI 命令

```bash
kase doctor                          # 环境自检
kase lint <case>                     # 仅校验语法（不调 AI）
kase compile <case>                  # 仅编译固化（命中缓存则跳过）
kase run <case>                      # 编译 + 模拟器执行 + 出报告
```

> 项目内开发可用 `npm run kase -- <command>`，全局安装后用 `kase <command>`（`npm link` 或 `npm install -g .`）。

### 编写 BDD 用例（`.case` 文件）

文件遵循 `前提 → 当 → 那么` 的固定结构，**所有操作目标必须用双引号 `""` 包裹**。

```gherkin
前提：清空应用数据并启动
当：
  - 点击 "我的"
  - 在 "请输入手机号" 中输入 "13800000000"
  - 点击 "提交"
那么：
  - 检查屏幕包含 "登录成功"
```

### DSL 词典

| 中文写法 | 含义 | Maestro 映射 |
|---|---|---|
| `前提：清空应用数据并启动` | 清空 app 数据再启动 | `clearState` + `launchApp` |
| `前提：直接启动应用` | 直接启动 | `launchApp` |
| `点击 "X"` | 点击文本/ID | `tapOn` |
| `在 "提示文案" 中输入 "内容"` | 输入文本 | `tapOn` + `inputText` |
| `等待 "X" 出现` | 等待元素可见 | `extendedWaitUntil` |
| `向[上/下/左/右]滑动` | 滑动 | `swipe` |
| `清空 "X"` | 清空输入 | `tapOn` + `eraseText` |
| `返回上一页` | 返回 | `back` |
| `检查屏幕包含 "X"` | 断言可见 | `assertVisible` |
| `检查屏幕不包含 "X"` | 断言不可见 | `assertNotVisible` |

### 目录约定

```
project/
├── cases/         # 你写的 BDD 源文件 (*.case)
├── compiled/      # AI 编译固化的 Maestro YAML（含 hash 元信息头）
├── reports/       # 执行报告（按时间戳归档）
├── prompts/       # System Prompt 与 few-shot 样例
└── .env           # 你的 API Key 与配置
```

---

## ⚙️ 配置参考

| 环境变量 | 说明 | 默认 |
|---|---|---|
| `KASE_PROVIDER` | AI 供应商：`kilo` / `openrouter` / `custom` | `kilo` |
| `KASE_API_KEY` | API Key（统一入口） | — |
| `KASE_MODEL` | 模型 ID（`provider/model` 格式） | `anthropic/claude-sonnet-4.5` |
| `KASE_BASE_URL` | 自定义网关 URL（`provider=custom` 时） | — |
| `KASE_APP_ID` | 目标 App bundleId | — |
| `KASE_SIMULATOR_UDID` | 模拟器 UDID，留空用当前 booted | — |

### 切换到 OpenRouter

```env
KASE_PROVIDER=openrouter
KASE_API_KEY=sk-or-...
KASE_MODEL=deepseek/deepseek-v4-flash
```

### 自建 OpenAI 兼容网关

```env
KASE_PROVIDER=custom
KASE_BASE_URL=https://your-gateway.example.com/v1
KASE_API_KEY=...
KASE_MODEL=...
```

---

## 🏗️ 架构

详见 [`ios自动化解决方案.md`](./ios自动化解决方案.md)。简版：

| 模块 | 文件 | 职责 |
|---|---|---|
| Linter | `src/lint/` | `.case` → 结构化 IR + 行号校验 |
| AI 编译 | `src/compile/` | IR → Maestro YAML（OpenAI 兼容客户端） |
| 校验 | `src/compile/validate.ts` | YAML 命令白名单（防幻觉） |
| 缓存 | `src/compile/index.ts` | hash(case + DSL版本 + provider + model) |
| 执行 | `src/run/executor.ts` | 调用 `maestro test`，输出 JUnit + 截图 |
| Doctor | `src/run/doctor.ts` | 环境自检 |

---

## 🛠️ 故障排查

### `kase doctor` 报 Java 未安装
- 运行 `bash setup.sh` 会自动装。
- 已装但仍报错：检查 `echo $JAVA_HOME` 是否指向 `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`，新开终端使 `.zshrc` 生效。

### Maestro 报 `Apple account team ID must be specified`
- 这是 Maestro 在尝试连接 **iOS 真机**。Maestro 当前**官方不支持真机**。
- 解决方案：使用 iOS 模拟器（`open -a Simulator`），或明确指定 `KASE_SIMULATOR_UDID`。

### AI 编译报 `403 This model is not available in your region`
- 模型在你的网络区域不可用。
- 解决方案：换可用模型（如 `anthropic/claude-sonnet-4.5` / `deepseek/deepseek-v4-flash`），或挂代理。

### 测试失败「Element not found」
- Maestro 在屏幕上找不到指定文本。常见原因：
  - 软键盘把目标元素遮挡了 → 改用断言而非点击
  - 目标元素文本与 BDD 里写的不完全一致 → 用 `maestro --udid <UDID> hierarchy` 抓取真实文本
  - 元素是图标无文本 → 暂不支持，改用包含文本的祖先元素

### 缓存没命中
- `compiled/<name>.yaml` 第一行 hash 与当前 `case 内容 + DSL版本 + provider + baseUrl + model` 计算结果不同就会重新编译。
- 切换 provider / 模型 / 修改 case 都会失效，是预期行为。

---

## 📄 许可证

MIT — 详见 [LICENSE](./LICENSE)
