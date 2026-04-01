# EntryPage Split And Frontend Behavior Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 继续推进整改清单中尚未完成的 `P1-2 EntryPage.tsx 拆分` 与 `P2-3 用行为测试替代源码字符串断言型测试`。

**Architecture:** 将 `EntryPage` 与 `AnalyticsPage` 中的页面级状态推导、默认值选择、表单校验与日期范围修正逻辑抽成纯函数模块，再把 `EntryPage` 的三个对话框拆成独立组件。页面主文件只保留查询编排、mutation 调用和页面装配职责；测试改为直接导入这些纯函数验证行为，而不是读取源码做正则匹配。

**Tech Stack:** React 18、TypeScript、TanStack Query、Node `--test`

---

### Task 1: 抽离 EntryPage 页面控制逻辑

**Files:**
- Create: `frontend/src/components/entry/entryPageController.ts`
- Modify: `frontend/src/pages/EntryPage.tsx`
- Test: `frontend/tests/entryPageController.test.ts`

**Step 1: 写失败测试**

覆盖这些行为：
- 新建表单默认成员与默认类型
- 编辑表单回填
- 分类路径过滤旧默认分类
- 删除成员弹窗默认成员选择
- 表单校验失败信息
- 成功生成 `HoldingPayload`

**Step 2: 跑测试确认失败**

Run: `node --test frontend/tests/entryPageController.test.ts`
Expected: FAIL，因为控制器模块尚不存在。

**Step 3: 写最小实现**

在 `entryPageController.ts` 中实现：
- `INITIAL_ENTRY_FORM`
- `buildCreateEntryForm`
- `buildEditEntryForm`
- `resolvePathOptions`
- `resolveDefaultMemberDeleteId`
- `validateEntryForm`
- `buildHoldingPayload`

**Step 4: 跑测试确认通过**

Run: `node --test frontend/tests/entryPageController.test.ts`
Expected: PASS

### Task 2: 拆分 EntryPage 对话框组件

**Files:**
- Create: `frontend/src/components/entry/EntryHoldingFormDialog.tsx`
- Create: `frontend/src/components/entry/EntryBulkDeleteDialogs.tsx`
- Modify: `frontend/src/pages/EntryPage.tsx`
- Test: `frontend/tests/entryPage.test.ts`

**Step 1: 先保留页面现有行为**

让新组件只接收 props，不自行发请求。

**Step 2: 最小改造 EntryPage**

页面保留：
- queries / mutations
- 打开关闭弹窗
- 过滤状态与选中状态

页面移出：
- 三个 `Dialog` 的 JSX
- 表单字段渲染
- 删除摘要卡片渲染

**Step 3: 跑既有行为测试**

Run: `node --test frontend/tests/entryPage.test.ts`
Expected: PASS

### Task 3: 抽离 AnalyticsPage 状态纯函数并替换部分源码断言测试

**Files:**
- Create: `frontend/src/components/analytics/analyticsPageState.ts`
- Modify: `frontend/src/pages/AnalyticsPage.tsx`
- Create: `frontend/tests/analyticsPageState.test.ts`
- Modify: `frontend/tests/hardening.test.ts`
- Modify: `frontend/tests/analyticsDateRangePicker.test.ts`

**Step 1: 写失败测试**

覆盖这些行为：
- 未初始化时回退后端 date bounds
- 开始日期晚于结束日期时自动收口
- 结束日期早于开始日期时自动收口
- 币种视图切换时默认选择首个有效币种
- 币种列表为空时清空选择

**Step 2: 跑测试确认失败**

Run: `node --test frontend/tests/analyticsPageState.test.ts`
Expected: FAIL，因为状态模块尚不存在。

**Step 3: 写最小实现并回接页面**

让 `AnalyticsPage.tsx` 调用纯函数，而不是在组件内部堆叠条件逻辑。

**Step 4: 删除对应源码字符串断言**

从 `hardening.test.ts` 和 `analyticsDateRangePicker.test.ts` 删除已经被行为测试覆盖的页面级源码正则断言，保留仍有价值的轻量结构校验。

**Step 5: 跑相关测试**

Run: `node --test frontend/tests/hardening.test.ts frontend/tests/analyticsDateRangePicker.test.ts frontend/tests/analyticsPageState.test.ts`
Expected: PASS

### Task 4: 完整验证

**Files:**
- Modify: none
- Test: `frontend/tests/*.test.ts`

**Step 1: 跑前端轻量测试**

Run: `node --test frontend/tests/*.test.ts`
Expected: PASS

**Step 2: 跑前端构建**

Run: `npm --prefix frontend run build`
Expected: PASS
