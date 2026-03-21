# macOS DMG Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为桌面端补齐可分发的未签名 macOS DMG 发布链路，稳定产出 `arm64` 与 `x64` 两套安装包，并附带品牌化图标与 DMG 安装引导资源。

**Architecture:** 继续沿用现有 `Electron Forge + React dist + PyInstaller sidecar` 方案，不切换打包器。发布链路改为“按架构分别构建后端 sidecar，再由 Electron Forge 分别生成对应架构的 `.app/.dmg/.zip`”，通过独立发布脚本串联前端构建、后端构建、资源暂存、Forge 制品收集与重命名。由于当前 sidecar 为 PyInstaller 二进制，本次不做单个 universal 包，而是稳定产出 `arm64` 与 `x64` 双套 DMG。

**Tech Stack:** Electron Forge, Electron Packager, PyInstaller, Node.js scripts, Node test runner, pytest, macOS iconutil/sips

---

### Task 1: 后端桌面二进制改为按架构输出

**Files:**
- Modify: `backend/build_desktop.py`
- Modify: `backend/tests/test_desktop_build.py`

**Step 1: Write the failing test**

补充测试，验证：
- 构建输出目录变为 `backend/dist-desktop/<arch>/hbs-backend`
- work/cache 目录也按架构隔离
- 未传入架构时会按宿主机架构归一化到 `arm64` 或 `x64`

**Step 2: Run test to verify it fails**

Run: `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/python -m pytest backend/tests/test_desktop_build.py -q`

Expected: FAIL，旧实现仍写死到单一路径。

**Step 3: Write minimal implementation**

实现：
- 解析目标架构并做标准化
- PyInstaller 输出目录、缓存目录按架构隔离
- CLI 支持 `--arch=arm64|x64`

**Step 4: Run test to verify it passes**

Run: `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/python -m pytest backend/tests/test_desktop_build.py -q`

Expected: PASS

### Task 2: 为桌面构建脚本补齐双架构编排与失败提示

**Files:**
- Modify: `desktop/scripts/build-backend.mjs`
- Modify: `desktop/scripts/stage-resources.mjs`
- Create: `desktop/scripts/make-macos-release.mjs`
- Create: `desktop/tests/build-backend-script.test.ts`
- Create: `desktop/tests/make-macos-release.test.ts`

**Step 1: Write the failing test**

补充 Node 测试，验证：
- `build-backend.mjs` 能解析目标架构，并按优先级选择 `HBS_DESKTOP_PYTHON_<ARCH>`、`.venv-<arch>`、宿主 `.venv`
- 构建非宿主架构但缺少专用 Python 时，会给出明确错误
- `stage-resources.mjs` 会复制对应架构的后端目录
- 发布脚本能根据版本号和架构生成确定性的产物文件名

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/build-backend-script.test.ts desktop/tests/make-macos-release.test.ts`

Expected: FAIL，相关导出函数与行为尚不存在。

**Step 3: Write minimal implementation**

实现：
- 为脚本暴露纯函数，便于测试
- 新增 `make-macos-release.mjs` 串联前端构建、后端构建、TS 构建、资源暂存、Forge make 与产物整理
- 默认支持 `--arch=all`，产出 `arm64` 与 `x64` 两套文件

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/build-backend-script.test.ts desktop/tests/make-macos-release.test.ts`

Expected: PASS

### Task 3: 为 Forge 配置补齐 DMG 视觉资源与发布脚本入口

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/forge.config.ts`
- Create: `desktop/tests/forge-config.test.ts`

**Step 1: Write the failing test**

补充测试，验证：
- Forge 配置引用固定图标与 DMG 背景
- DMG maker 启用了覆盖写入、窗口尺寸与拖入 `Applications` 的布局
- `package.json` 存在面向 `arm64`、`x64`、`all` 的发布脚本

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/forge-config.test.ts`

Expected: FAIL，当前配置只有最小 `maker-dmg`。

**Step 3: Write minimal implementation**

实现：
- 调整 Forge 配置，接入 `icon.icns`、`dmg-background.png`
- 增加明确的发布脚本，如 `make:dmg:arm64`、`make:dmg:x64`、`make:dmg`

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/forge-config.test.ts`

Expected: PASS

### Task 4: 补齐品牌化图标、DMG 背景与文档说明

**Files:**
- Create: `desktop/assets/icon.svg`
- Create: `desktop/assets/icon.icns`
- Create: `desktop/assets/dmg-background.svg`
- Create: `desktop/assets/dmg-background.png`
- Modify: `README.md`

**Step 1: Prepare assets**

新增：
- 一个简洁的家庭财务图标源文件
- 一个用于 DMG 窗口的安装指引背景图

**Step 2: Integrate docs**

更新 README，说明：
- 未签名 DMG 的使用方式
- 双架构发布命令
- `x64` 构建所需 Python 环境约束

**Step 3: Verify assets are wired**

Run: `node --test desktop/tests/forge-config.test.ts`

Expected: PASS，并确认资源路径真实存在。

### Task 5: 运行完整验证并实际产出 arm64 安装包

**Files:**
- Verify only

**Step 1: Run focused test suite**

Run:
- `/Users/mac/Downloads/Projects/AICode/HouseholdBalanceSheet/.venv/bin/python -m pytest backend/tests/test_desktop_build.py -q`
- `node --test desktop/tests/*.test.ts`
- `npm --prefix desktop run typecheck`

Expected:
- 后端桌面构建测试通过
- 桌面 Node 测试通过
- 桌面 TypeScript 检查通过

**Step 2: Run packaging verification**

Run:
- `npm --prefix frontend run build`
- `npm --prefix desktop run make:dmg:arm64`

Expected:
- 前端构建成功
- `desktop/out/release/` 出现 arm64 的 `.dmg` 与 `.zip`

**Step 3: Optional dual-arch verification**

Run: `npm --prefix desktop run make:dmg:x64`

Expected:
- 如果存在 `HBS_DESKTOP_PYTHON_X64` 或 `.venv-x64`，则成功产出 x64 制品
- 否则输出清晰错误，告诉维护者需要补齐 x64 Python 环境
