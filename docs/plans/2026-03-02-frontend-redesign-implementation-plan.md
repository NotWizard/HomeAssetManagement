# Frontend Redesign (shadcn + Tailwind) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将现有前端统一重构为现代金融专业风 UI，采用 shadcn/ui + Tailwind，并保持业务功能完整。

**Architecture:** 保留现有数据接口与页面路由，替换 Ant Design 组件为 shadcn 风格基础组件和 Tailwind 原子样式。使用统一设计变量（颜色、间距、圆角、阴影）驱动整站视觉一致性。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui 组件模式, ECharts, TanStack Query, Zustand

---

### Task 1: UI 基础设施

**Files:**
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/index.css`
- Create: `frontend/src/lib/cn.ts`
- Create: `frontend/src/components/ui/*`

**Step 1: Write the failing check**
- Run: `npm --prefix frontend run build`
- Expected: 现有 UI 仍为旧体系，作为改版前基线。

**Step 2: Implement minimal foundation**
- 安装 Tailwind/shadcn 依赖。
- 注入 design tokens 与基础组件(Button/Card/Input/Badge/Table/Sheet)。

**Step 3: Verify**
- Run: `npm --prefix frontend run build`
- Expected: 编译通过。

### Task 2: 应用壳层重构

**Files:**
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/layout/*`

**Steps:**
1. 重构侧边栏 + 顶栏 + 内容容器。
2. 加入响应式布局与移动端抽屉导航。
3. 构建验证通过。

### Task 3: 页面重构（总览/分析/录入/导入/设置）

**Files:**
- Modify: `frontend/src/pages/*.tsx`
- Modify: `frontend/src/components/charts/*.tsx`

**Steps:**
1. 逐页迁移到新组件体系。
2. 增加空态/加载态/错误态。
3. 保持所有业务交互可用。
4. 构建验证通过。

### Task 4: 样式与体验打磨

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/*`

**Steps:**
1. 统一字体、颜色层级、阴影、圆角与动画。
2. 修正可访问性（焦点态、对比度、触控尺寸）。
3. 构建验证通过。

### Task 5: 验证与交付

**Files:**
- Modify: `frontend/README.md`

**Steps:**
1. 执行 `npm --prefix frontend run build`。
2. 更新运行说明与设计说明。
3. 输出改版结果摘要。
