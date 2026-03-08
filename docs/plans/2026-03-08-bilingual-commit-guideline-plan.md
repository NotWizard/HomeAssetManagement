# Bilingual Commit Guideline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库协作规范更新为 Git commit 标题与正文使用中英双语撰写，并完成一次符合新规范的提交后推送到 `origin/main`。

**Architecture:** 本次改动只涉及仓库协作文档与 Git 流程，不修改业务代码。先在 `AGENTS.md` 的提交规范段落中明确中英双语要求，再用命令核验规则文本与工作区状态，最后创建一条中英双语提交并推送到远端 `origin/main`。

**Tech Stack:** Markdown、Git、GitHub 远端

---

### Task 1: 更新协作规范

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/plans/2026-03-08-bilingual-commit-guideline-plan.md`

**Step 1:** 在 `AGENTS.md` 的提交规范段落中保留结构化要求，并明确标题与正文需要中英双语。

**Step 2:** 保存计划文档，记录本次规则变更与提交目标。

### Task 2: 验证并提交

**Files:**
- Verify: `AGENTS.md`

**Step 1:** 使用 `rg` 和 `git status --short` 核验规则文本与本次改动范围。

**Step 2:** 创建一条中英双语的 Git commit，正文说明背景、关键改动与验证结果。

### Task 3: 推送远端

**Files:**
- Modify: remote refs on `origin`

**Step 1:** 将当前 `main` 分支推送到 `origin`。

**Step 2:** 使用 `git remote show origin` 与 `git status --short` 核验推送后状态。
