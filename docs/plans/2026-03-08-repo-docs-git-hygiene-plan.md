# Repo Docs And Git Hygiene Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 更新仓库文档与协作规范，补齐忽略规则，移除不应纳入版本控制的前端构建状态文件，并提交一次结构化且清晰的 Git commit。

**Architecture:** 本次改动只涉及仓库文档与 Git 管理层，不改动业务代码。先更新 `README.md` 与 `AGENTS.md`，同步记录默认分支、环境文件与提交规范；再调整 `.gitignore` 并从索引中移除 `frontend/tsconfig.tsbuildinfo`；最后用 Git 状态与忽略规则命令做验证，再创建一次带正文的规范提交。

**Tech Stack:** Markdown、Git、`.gitignore`、Git tracked file cleanup

---

### Task 1: 更新文档说明

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

**Step 1:** 在 `README.md` 补充仓库协作约定，包括默认分支 `main`、`.env` 为本地配置且不可提交、提交说明应结构化清晰。

**Step 2:** 在 `AGENTS.md` 中同步补充默认分支与本地配置文件忽略要求，并保留已有的提交规范要求。

### Task 2: 清理版本控制噪音

**Files:**
- Modify: `.gitignore`
- Remove from Git index: `frontend/tsconfig.tsbuildinfo`

**Step 1:** 在 `.gitignore` 增加 `.env`、`.env.*` 和 `frontend/tsconfig.tsbuildinfo`。

**Step 2:** 将 `frontend/tsconfig.tsbuildinfo` 从 Git 索引移除，但保留工作区文件。

### Task 3: 验证与提交

**Files:**
- Verify: `README.md`
- Verify: `AGENTS.md`
- Verify: `.gitignore`

**Step 1:** 使用 `rg`、`git check-ignore -v` 和 `git status --short` 验证文档与忽略规则生效。

**Step 2:** 将本次改动分组暂存。

**Step 3:** 使用结构化提交说明创建一次提交，正文说明背景、关键改动和验证结果。
