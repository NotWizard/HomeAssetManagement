# README Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 根据当前仓库的真实实现状态，完整重写根目录 `README.md`，让新读者能快速理解项目能力、技术栈、目录结构、启动方式、配置约定、测试命令与迁移功能，并提交一次结构化 Git commit。

**Architecture:** 本次改动只更新文档，不修改业务代码。先从后端入口、前端页面、配置文件和现有说明文档中提取事实，再按“项目简介 → 能力 → 技术架构 → 目录 → 快速开始 → 配置 → 常见操作”结构重写 `README.md`，最后通过命令校验 README 内容与仓库现状一致，并创建带正文的提交。

**Tech Stack:** Markdown、Git、FastAPI、React + Vite、项目静态扫描（`rg`/`find`）

---

### Task 1: 盘点项目事实

**Files:**
- Inspect: `backend/app/main.py`
- Inspect: `backend/app/core/config.py`
- Inspect: `backend/app/api/v1/*.py`
- Inspect: `frontend/package.json`
- Inspect: `frontend/src/pages/*.tsx`
- Inspect: `backend/README.md`
- Inspect: `frontend/README.md`

**Step 1:** 提取技术栈、启动命令、配置项、页面与主要功能。

**Step 2:** 确认默认分支、忽略规则、本地运行约束与测试命令。

### Task 2: 重写 README

**Files:**
- Modify: `README.md`

**Step 1:** 设计新的 README 章节顺序与信息密度。

**Step 2:** 按当前实现状态写清项目价值、核心能力、模块结构、运行方式、配置约定、数据迁移与开发协作说明。

### Task 3: 验证并提交

**Files:**
- Verify: `README.md`

**Step 1:** 用命令复核 README 中提到的关键命令、路径和约定是否存在。

**Step 2:** 检查工作区状态与本次 diff。

**Step 3:** 创建一次结构化且清晰的 Git commit。
