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
npm run kase -- run cases/demo.case
```

`cases/demo.case` 是一份覆盖**所有 DSL 能力**的演示用例，目标 app 是 iOS Photos
（`com.apple.mobileslideshow`），里面 5 个 case 由浅入深：

| Case | 演示能力 |
|---|---|
| 1   | 点击 + 断言（含 a11y label 命中无文字图标） |
| 2   | 滑动 + 等待出现（默认 10 秒） |
| 3   | 模糊匹配输入框 + 已激活直接输入 |
| 4   | 自定义超时的等待出现 / 等待消失 |
| 5a  | 图标定位 — 用 accessibility id |
| 5b  | 图标定位 — 用项目级别名表（`selectors.yaml`） |
| 5c  | 图标定位 — 屏幕百分比坐标 / 九宫格语义位 |

预期输出（共 7 个 case 全部通过）：

```
→ [case 1/7] 调用 AI 编译...  ✔ 已固化：compiled/demo__1.yaml
... (略)
→ [case 1/7] 开始执行：compiled/demo__1.yaml
[Passed] demo__1 (5s)
... (略)
执行汇总（7 个 case）
  ✔ case 1: compiled/demo__1.yaml
  ...
  ✔ case 7: compiled/demo__7.yaml
```

打开 `cases/demo.case` 是最快上手 DSL 的方式：每个 case 顶部注释说明它演示什么、如何组合。

---

## 📖 使用指南

### CLI 命令

```bash
kase doctor                          # 环境自检
kase lint <case>                     # 仅校验语法（不调 AI）
kase compile <case>                  # 仅编译固化（命中缓存则跳过）
kase run <case>                      # 编译 + 模拟器执行 + 出报告
kase hierarchy [关键字]              # 抓取当前模拟器页面的视图层级（调试用）
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

#### 一个文件可包含多个 case

每出现一次 `前提：` 就开启一个新 case，case 之间互相独立（独立编译、独立执行、独立报告）。
建议把"同一功能的多个相关场景"放进同一个 `.case` 文件，便于集中维护：

```gherkin
# Case 1: 登录成功
前提：清空应用数据并启动
当：
  - 在 "手机号" 中输入 "13800000000"
  - 点击 "提交"
那么：
  - 检查屏幕包含 "登录成功"

# Case 2: 登录失败提示
前提：清空应用数据并启动
当：
  - 在 "手机号" 中输入 "0"
  - 点击 "提交"
那么：
  - 检查屏幕包含 "号码不合法"
```

编译产物：
- 单 case 文件 → `compiled/<name>.yaml`
- 多 case 文件 → `compiled/<name>__1.yaml`、`compiled/<name>__2.yaml`、…

执行时按顺序逐个跑，**任一 case 失败整体返回非零码**，但其余 case 仍会继续执行；
缓存按"单个 case"粒度计算，只改其中一个 case 不会让其他 case 失效重编。

### DSL 词典

| 中文写法 | 含义 | Maestro 映射 |
|---|---|---|
| `前提：清空应用数据并启动` | 清空 app 数据再启动 | `clearState` + `launchApp` |
| `前提：直接启动应用` | 直接启动 | `launchApp` |
| `点击 "X"` | 按可见文本 / a11y label 点击 | `tapOn: "X"` |
| `点击图标 "别名 或 id:xxx"` | 按结构化定位点击图标（无文字元素） | `tapOn: { id: "..." }` 或 `{ point: "..." }` |
| `点击位置 "右上"` 或 `点击位置 "95%, 8%"` | 按屏幕百分比坐标点击（最后兜底） | `tapOn: { point: "95%, 8%" }` |
| `在 "提示文案" 中输入 "内容"` | 先点击输入框再输入（提示文案走模糊匹配） | `tapOn` + `inputText` |
| `输入 "内容"` | 在已激活输入框直接输入 | `inputText` |
| `等待 "X" 出现` | 等待元素可见（默认 10 秒超时） | `extendedWaitUntil { visible }` |
| `等待 "X" 消失` | 等待元素从屏幕消失（用于 loading 文案结束） | `extendedWaitUntil { notVisible }` |
| `最多等待 N 秒 直到 "X" 出现` | 自定义超时的等待出现 | `extendedWaitUntil { visible, timeout: N*1000 }` |
| `最多等待 N 秒 直到 "X" 消失` | 自定义超时的等待消失（适合 AI 生图等长任务） | `extendedWaitUntil { notVisible, timeout: N*1000 }` |
| `向[上/下/左/右]滑动` | 滑动 | `swipe` |
| `清空 "X"` | 清空输入 | `tapOn` + `eraseText` |
| `返回上一页` | 返回 | `back` |
| `检查屏幕包含 "X"` | 断言可见 | `assertVisible` |
| `检查屏幕不包含 "X"` | 断言不可见 | `assertNotVisible` |

> 注：`在 "X" 中输入 "Y"` 中的 `X` 用于定位输入框，编译后会被自动改写为模糊正则
> （形如 `.*X.*`，并去掉首尾的 `…` `...` 等装饰字符），所以 BDD 里写大概意思即可，
> 不必和 UI 上的占位符一字不差。

#### 异步等待 / 等到 loading 完成

UI 里常见的"任务进行中→任务完成"的场景（如 AI 生图、上传、刷新等），关键是
**等到进度文案消失**，再做后续断言。Kase 提供两种"等待消失"语义和自定义超时。

```gherkin
# 例：等到生图任务完成（最多等 90 秒），再确认结果出现
前提：直接启动应用
当：
  - 点击 "Redesign"
  - 最多等待 90 秒 直到 "Redesigning" 消失
那么：
  - 检查屏幕包含 "NEW"
```

要点：
- 不带"最多等待 N 秒"前缀时，超时为 **10 秒**
- 进度文本本身就是要消失的对象时，**用"消失"而不是"出现"**
- 可同时用"等待消失"+"等待出现"做双重确认（更稳）

#### 图标 / 无文字元素如何定位

Maestro 的 `tapOn: "X"` 不只是按可见文本，还会匹配元素的 **Accessibility Label**
（屏幕阅读器念出来的那段）。所以很多看起来"没文字"的图标其实可以直接用中文/英文文本命中：

```gherkin
- 点击 "搜索"      # 放大镜图标在 iOS 中文系统下 a11y label 是"搜索"，能直接命中
```

**确实没有 a11y label 的纯图标**才需要走结构化定位。Kase 提供两种写法：

1. **`点击图标 "别名"`** —— 推荐。在项目根 `cases/selectors.yaml` 里集中维护别名表：

   ```yaml
   # cases/selectors.yaml
   右上角设置: { id: "homeSettingsButton" }
   关闭弹窗:   { id: "ic_close" }
   悬浮添加按钮: { point: "50%, 95%" }   # 拿不到 id 时退到坐标
   ```

   用例里就只写人话：

   ```gherkin
   - 点击图标 "右上角设置"
   ```

2. **`点击图标 "id:xxx"`** —— 偶发使用，临时绕过别名表，直接用 accessibility identifier。

3. **`点击位置 "右上"` / `点击位置 "95%, 8%"`** —— 最后兜底。预置 9 个语义位
   `左上 / 正上 / 右上 / 左中 / 中 / 右中 / 左下 / 正下 / 右下`，
   分别对应 `5%/50%/95%` × `8%/50%/92%`；也支持自定义百分比。

定位优先级建议：**a11y label / 文本 → id（别名表） → 百分比坐标**。坐标兜底最不稳，
分辨率/布局变化都会破坏，能加 `accessibilityIdentifier` 就推开发加。

#### 调试：用 `kase hierarchy` 查图标真实属性

写 BDD 前不确定图标该用什么文本/ id 能命中？跑 hierarchy 看真值：

```bash
# 抓当前页面所有可识别元素（截断到 200 个）
npm run kase -- hierarchy

# 关键字过滤：只看 text/label/id 含"设置"的元素
npm run kase -- hierarchy 设置
```

输出形如：

```
type                   text/label                   id                             bounds
XCUIElementTypeButton  搜索                         -                              [660,720][740,800]
XCUIElementTypeButton  -                            homeSettingsButton             [700,140][740,180]
```

`text/label` 列就是 `点击 "X"` 能命中的文本，`id` 列就是 `点击图标 "id:X"` 能命中的标识。

### 目录约定

```
project/
├── cases/
│   ├── *.case            # 你写的 BDD 源文件
│   └── selectors.yaml    # 可选：图标别名 → id/坐标 的映射表
├── compiled/             # AI 编译固化的 Maestro YAML（多 case 时形如 <name>__N.yaml）
├── reports/              # 执行报告（按时间戳归档）
├── prompts/              # System Prompt 与 few-shot 样例
└── .env                  # 你的 API Key 与配置
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
  - 目标元素文本与 BDD 里写的不完全一致 → 跑 `npm run kase -- hierarchy <关键字>` 看真值
  - **Unicode 字符差异**：例如 UI 上是单字符省略号 `…`(U+2026)，BDD 里写成三个 ASCII 点 `...`，Maestro 默认按正则匹配会失败。可在 `hierarchy` 输出里复制原始字符。
  - **多余的 tapOn**：上一步已经把焦点放进输入框（如 iOS Photos 点击"搜索" tab 后），就不要再用 `在 "X" 中输入 "Y"` 去匹配占位符，改用无目标的 `输入 "Y"`。
  - **元素是图标且没有 a11y label** → 改用 `点击图标 "别名"`（在 `cases/selectors.yaml` 里登记 id/坐标），或最后兜底 `点击位置 "右上"`。详见 [图标 / 无文字元素如何定位](#图标--无文字元素如何定位)。

### 异步任务（loading / 生图）测试用例不稳定
- 现象：任务还没完成就跑到了断言行，看到 loading 文字仍在屏幕上。
- 解决：改用 `等待 "X" 消失` + 自定义超时：
  ```gherkin
  - 点击 "Redesign"
  - 最多等待 90 秒 直到 "Redesigning" 消失
  - 检查屏幕包含 "结果"
  ```
- 默认 `等待 "X" 出现/消失` 的超时是 10 秒，长任务必须显式写"最多等待 N 秒"。

### 缓存没命中
- `compiled/<name>(__<idx>).yaml` 头部 hash 与当前 `单个 case 的 IR 内容 + DSL版本 + provider + baseUrl + model` 不一致时会重编。
- hash 按"单个 case"粒度计算：同一文件中只改其中一个 case，其他 case 仍会命中缓存。
- 切换 provider / 模型 / 修改 case 都会失效，是预期行为。

---

## 📄 许可证

MIT — 详见 [LICENSE](./LICENSE)
