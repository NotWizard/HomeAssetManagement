# Desktop Update Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为桌面版增加 GitHub Release 更新检测、下载与安装提示流程，在首次启动与每 12 小时轮询一次新版本，并在左下角展示“有可用更新”入口。

**Architecture:** 更新能力完全放在 Electron 主进程中处理。主进程负责轮询 GitHub Release、匹配当前架构的 ZIP 资产、下载到本地、在需要时解压并通过独立安装脚本替换现有 `.app`。Renderer 只通过 preload bridge 读取更新状态、触发检查/下载/安装，并在左侧导航底部显示更新按钮与确认弹窗。

**Tech Stack:** Electron main/preload IPC, GitHub Releases API, React, local JSON persistence, Node test runner

---

### Task 1: 建立桌面更新领域模型与 GitHub Release 解析

**Files:**
- Create: `desktop/src/update-types.ts`
- Create: `desktop/src/update-service.ts`
- Create: `desktop/tests/update-service.test.ts`

**Step 1: Write the failing test**

为纯逻辑补测试，覆盖：
- 版本比较会忽略 `v` 前缀并正确判断 `0.2.0 > 0.1.9`
- 只接受当前架构对应的 ZIP 资产
- 当当前版本已是最新版本时返回“无更新”

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/update-service.test.ts`

Expected: FAIL，当前还没有更新服务模块。

**Step 3: Write minimal implementation**

实现：
- 更新状态类型
- 语义化版本比较函数
- GitHub Release 载荷解析
- ZIP 资产匹配逻辑（`HouseholdBalanceSheet-<version>-macos-<arch>.zip`）

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/update-service.test.ts`

Expected: PASS

### Task 2: 实现主进程更新轮询、持久化与下载状态机

**Files:**
- Modify: `desktop/src/main.ts`
- Create: `desktop/src/update-controller.ts`
- Create: `desktop/tests/update-controller.test.ts`

**Step 1: Write the failing test**

补测试，验证：
- 打包态启动时会立即触发一次更新检查
- 会每 12 小时继续轮询
- 下载状态会广播给窗口
- 若已下载但未安装，重启后仍能恢复“可安装”状态

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/update-controller.test.ts`

Expected: FAIL，当前主进程没有更新轮询与状态持久化。

**Step 3: Write minimal implementation**

实现：
- 更新状态 JSON 持久化到用户数据目录
- 首次启动立即检查 + `12h` 定时轮询
- GitHub API 请求
- 当前窗口状态广播
- 仅在 `app.isPackaged` 时启用更新服务

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/update-controller.test.ts`

Expected: PASS

### Task 3: 实现下载 ZIP、解压与安装脚本

**Files:**
- Modify: `desktop/src/update-controller.ts`
- Create: `desktop/tests/update-install.test.ts`

**Step 1: Write the failing test**

补测试，验证：
- 下载会写入用户数据目录下的更新缓存
- 安装阶段会为当前应用路径生成独立安装脚本
- 当当前应用位于只读挂载卷时，会回退到 `/Applications/HouseholdBalanceSheet.app`

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/update-install.test.ts`

Expected: FAIL，当前没有下载与安装逻辑。

**Step 3: Write minimal implementation**

实现：
- ZIP 下载与进度状态
- `ditto -x -k` 解压 ZIP
- 生成 detached 安装脚本，等待当前 PID 退出后替换 `.app`
- 必要时用管理员权限复制到目标目录

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/update-install.test.ts`

Expected: PASS

### Task 4: 通过 preload bridge 暴露更新 API

**Files:**
- Modify: `desktop/src/preload.ts`
- Modify: `desktop/tests/preload-bridge.test.ts`
- Modify: `frontend/src/config/runtime.ts`
- Modify: `frontend/src/types/runtime-config.d.ts`

**Step 1: Write the failing test**

补测试，验证 preload 暴露：
- `getUpdateState()`
- `checkForUpdates()`
- `downloadUpdate()`
- `installUpdate()`
- `onUpdateStateChanged(listener)`

**Step 2: Run test to verify it fails**

Run: `node --test desktop/tests/preload-bridge.test.ts`

Expected: FAIL，当前 bridge 还没有更新相关接口。

**Step 3: Write minimal implementation**

实现：
- `ipcMain.handle(...)` + preload bridge 方法
- renderer 类型声明
- 主进程到 renderer 的状态变更订阅能力

**Step 4: Run test to verify it passes**

Run: `node --test desktop/tests/preload-bridge.test.ts`

Expected: PASS

### Task 5: 在左下角加入更新入口与确认弹窗

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Create: `frontend/src/components/layout/DesktopUpdateNotice.tsx`
- Modify: `frontend/tests/appShell.test.ts`
- Modify: `frontend/tests/desktopBridge.test.ts`

**Step 1: Write the failing test**

补测试，验证：
- 左侧导航底部会渲染更新入口
- UI 会根据不同状态调用 `downloadUpdate()` / `installUpdate()`
- 桌面模式下会监听 `onUpdateStateChanged`

**Step 2: Run test to verify it fails**

Run: `cd frontend && node --test tests/appShell.test.ts tests/desktopBridge.test.ts`

Expected: FAIL，当前没有更新入口与状态监听。

**Step 3: Write minimal implementation**

实现：
- 左下角按钮与状态文案
- 下载确认弹窗
- 下载完成后的安装确认弹窗
- 下载中进度禁用状态

**Step 4: Run test to verify it passes**

Run: `cd frontend && node --test tests/appShell.test.ts tests/desktopBridge.test.ts`

Expected: PASS

### Task 6: 完整验证桌面更新流程

**Files:**
- Verify only

**Step 1: Run focused verification**

Run:
- `node --test desktop/tests/*.test.ts`
- `cd frontend && node --test tests/*.test.ts`
- `npm --prefix desktop run typecheck`
- `npm --prefix frontend run build`

Expected:
- 桌面测试全部通过
- 前端测试全部通过
- TypeScript 与前端构建通过

**Step 2: Run package smoke verification**

Run:
- `npm --prefix desktop run make:dmg`

Expected:
- 双架构未签名发布产物仍可生成
- 更新逻辑不会破坏现有打包流程
