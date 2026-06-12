#!/usr/bin/env bash
# Kase 一键环境安装脚本（macOS）
#
# 自动检测并安装：
#   - Homebrew （前置）
#   - OpenJDK 21 （Maestro 依赖）
#   - libimobiledevice （iOS 设备工具）
#   - Maestro CLI （执行引擎）
# 同时把 JAVA_HOME 写入用户 shell 配置（仅当未设置时）。
#
# 用法：
#   bash setup.sh             # 检测 + 安装缺失项
#   bash setup.sh --check     # 仅检测，不安装
#
# 退出码：0=全部就绪，1=有未就绪项

set -uo pipefail

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

# === 颜色 ===
if [[ -t 1 ]]; then
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; CYAN=$'\033[36m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  GREEN=""; YELLOW=""; RED=""; CYAN=""; DIM=""; RESET=""
fi

ok()    { echo "${GREEN}✔${RESET} $*"; }
warn()  { echo "${YELLOW}⚠${RESET} $*"; }
fail()  { echo "${RED}✖${RESET} $*"; }
step()  { echo "${CYAN}→${RESET} $*"; }
hint()  { echo "${DIM}   ↳ $*${RESET}"; }

# === 平台检测 ===
if [[ "$(uname)" != "Darwin" ]]; then
  fail "仅支持 macOS（Maestro iOS 自动化依赖 Xcode 模拟器）"
  exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  BREW_PREFIX="/opt/homebrew"
else
  BREW_PREFIX="/usr/local"
fi

ALL_OK=true
NEED_INSTALL=()

# === 1. Node.js ===
step "检查 Node.js (>=18)"
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  NODE_MAJOR="${NODE_VER%%.*}"
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    ok "Node.js v$NODE_VER"
  else
    fail "Node.js 版本过低 (v$NODE_VER)，需要 >=18"
    hint "升级方案：brew install node 或访问 https://nodejs.org"
    ALL_OK=false
  fi
else
  fail "未安装 Node.js"
  hint "安装方案：brew install node"
  ALL_OK=false
fi

# === 2. Xcode 命令行工具（含 xcrun） ===
step "检查 Xcode Command Line Tools"
if command -v xcrun >/dev/null 2>&1; then
  ok "$(xcrun --version | head -1)"
else
  fail "未安装 Xcode Command Line Tools"
  hint "安装方案：xcode-select --install"
  ALL_OK=false
fi

# === 3. Homebrew ===
step "检查 Homebrew"
if command -v brew >/dev/null 2>&1; then
  ok "Homebrew $(brew -v | head -1 | awk '{print $2}')"
else
  fail "未安装 Homebrew"
  hint "安装方案：/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  ALL_OK=false
  if [[ "$CHECK_ONLY" == false ]]; then
    fail "Homebrew 是后续依赖的前置，请先手动安装后重新运行 setup.sh"
    exit 1
  fi
fi

# === 4. OpenJDK 21 ===
step "检查 OpenJDK 21（Maestro 依赖）"
JAVA_HOME_PATH="${BREW_PREFIX}/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
if [[ -d "$JAVA_HOME_PATH" ]]; then
  ok "OpenJDK 21 已安装于 $JAVA_HOME_PATH"
else
  warn "未安装 OpenJDK 21"
  NEED_INSTALL+=("openjdk@21")
  ALL_OK=false
fi

# === 5. libimobiledevice ===
step "检查 libimobiledevice"
if command -v idevice_id >/dev/null 2>&1; then
  ok "libimobiledevice 已安装"
else
  warn "未安装 libimobiledevice"
  NEED_INSTALL+=("libimobiledevice")
  ALL_OK=false
fi

# === 6. Maestro ===
step "检查 Maestro CLI"
if command -v maestro >/dev/null 2>&1; then
  # maestro 命令需要 JAVA_HOME 才能跑出版本号，未配则只确认存在
  if [[ -d "$JAVA_HOME_PATH" ]]; then
    export JAVA_HOME="$JAVA_HOME_PATH"
    export PATH="$JAVA_HOME/bin:$PATH"
    MAESTRO_VER="$(MAESTRO_CLI_NO_ANALYTICS=1 maestro -v 2>/dev/null | tail -1 || echo unknown)"
    ok "Maestro $MAESTRO_VER"
  else
    ok "Maestro 已安装（版本待 JDK 就绪后确认）"
  fi
else
  warn "未安装 Maestro CLI"
  NEED_INSTALL+=("mobile-dev-inc/tap/maestro")
  ALL_OK=false
fi

# === 7. iOS 模拟器（不强制启动） ===
step "检查 iOS 模拟器"
if command -v xcrun >/dev/null 2>&1; then
  BOOTED="$(xcrun simctl list devices booted 2>/dev/null | grep -c '(Booted)' || true)"
  if [[ "$BOOTED" -gt 0 ]]; then
    ok "已启动模拟器：$BOOTED 台"
  else
    warn "当前没有已启动的模拟器（不强制要求，运行测试前手动启动即可）"
    hint "启动方法：open -a Simulator"
  fi
fi

# === --check 模式：仅汇报 ===
if [[ "$CHECK_ONLY" == true ]]; then
  echo ""
  if [[ "$ALL_OK" == true ]]; then
    ok "环境已就绪。"
    exit 0
  else
    warn "存在未就绪项，运行 \`bash setup.sh\` 自动安装。"
    exit 1
  fi
fi

# === 安装缺失项 ===
if [[ ${#NEED_INSTALL[@]} -gt 0 ]]; then
  echo ""
  step "需要通过 Homebrew 安装：${NEED_INSTALL[*]}"

  # Maestro tap 需要先 trust（新版 Homebrew 安全策略）
  for pkg in "${NEED_INSTALL[@]}"; do
    if [[ "$pkg" == "mobile-dev-inc/tap/maestro" ]]; then
      step "信任 mobile-dev-inc/tap"
      brew tap mobile-dev-inc/tap >/dev/null 2>&1 || true
      brew trust --formula mobile-dev-inc/tap/maestro 2>/dev/null || true
    fi
  done

  for pkg in "${NEED_INSTALL[@]}"; do
    step "安装 $pkg ..."
    if brew install "$pkg"; then
      ok "$pkg 安装完成"
    else
      fail "$pkg 安装失败"
      ALL_OK=false
    fi
  done
fi

# === 配置 JAVA_HOME（仅当用户 shell 配置中没有时） ===
JAVA_HOME_PATH="${BREW_PREFIX}/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
if [[ -d "$JAVA_HOME_PATH" ]]; then
  SHELL_RC=""
  case "${SHELL:-}" in
    */zsh)  SHELL_RC="$HOME/.zshrc" ;;
    */bash) SHELL_RC="$HOME/.bash_profile" ;;
  esac
  if [[ -n "$SHELL_RC" ]] && ! grep -q "JAVA_HOME.*openjdk@21" "$SHELL_RC" 2>/dev/null; then
    step "写入 JAVA_HOME 到 $SHELL_RC"
    {
      echo ""
      echo "# === Maestro / Java (added by Kase setup.sh) ==="
      echo "export JAVA_HOME=\"$JAVA_HOME_PATH\""
      echo "export PATH=\"\$JAVA_HOME/bin:\$PATH\""
    } >> "$SHELL_RC"
    ok "已写入 JAVA_HOME（请新开终端或 source $SHELL_RC 生效）"
  else
    if [[ -n "$SHELL_RC" ]]; then
      ok "JAVA_HOME 已在 $SHELL_RC 中配置"
    fi
  fi
fi

# === 总结 ===
echo ""
if [[ "$ALL_OK" == true ]]; then
  ok "环境已就绪。下一步："
  hint "1) 复制 .env.example 为 .env 并填入 KASE_API_KEY"
  hint "2) 启动 iOS 模拟器：open -a Simulator"
  hint "3) 运行：npm install && npm run kase -- doctor"
else
  warn "部分依赖未就绪，请按上方提示处理后重新运行：bash setup.sh --check"
  exit 1
fi
