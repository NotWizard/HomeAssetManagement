# Entry Form Searchable Select Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化资产负债录入弹窗，使用可搜索下拉承载三级分类路径与币种选择，并限制金额输入为最多两位小数。

**Architecture:** 保持现有后端 API 不变，仅改前端录入弹窗交互。新增一个通用的可搜索下拉组件，复用在分类路径和币种字段；继续使用后端返回的分类树构造路径选项；在提交前做两位小数校验，并在金额输入区增加文案提示。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn-style UI components

---

### Task 1: 新增可搜索下拉组件

**Files:**
- Create: `frontend/src/components/ui/searchable-select.tsx`
- Modify: `frontend/src/components/ui/input.tsx`（仅在组件复用需要时）

**Step 1: Write the failing check**
- 在 `EntryPage` 中先引用新组件但暂不实现。
- Run: `npm --prefix frontend run build`
- Expected: FAIL，提示组件不存在或类型不匹配。

**Step 2: Write minimal implementation**
- 实现支持：展示当前值、输入过滤、点击选择、空结果提示、禁用状态。
- 选项结构与现有 `SelectOption` 保持兼容，额外允许 `searchText` 字段。

**Step 3: Verify**
- Run: `npm --prefix frontend run build`
- Expected: 重新通过或进入下一处失败。

### Task 2: 改造录入弹窗字段

**Files:**
- Modify: `frontend/src/pages/EntryPage.tsx`

**Step 1: Replace category path field**
- 用可搜索下拉替换“三级分类路径”字段。
- 选项标签展示完整路径：`一级 / 二级 / 三级`。
- 输入时按整条路径模糊搜索。

**Step 2: Replace currency field**
- 用可搜索下拉替换“币种”文本框。
- 提供常见币种选项，标签格式为 `CNY（人民币）`。
- 提交值仍为英文代码，如 `CNY`。

**Step 3: Tighten amount field**
- 增加“仅支持输入两位小数”的提示文案。
- 输入框增加 `step=0.01`、输入过滤与提交校验。

### Task 3: 构建验证

**Files:**
- No additional files unless fixes are required.

**Step 1: Run verification**
- Run: `npm --prefix frontend run build`
- Expected: PASS。

**Step 2: Manual sanity checklist**
- 分类路径可搜索并选择。
- 币种下拉展示 `英文代码（中文名）`。
- 金额输入最多两位小数，错误提示清晰。
