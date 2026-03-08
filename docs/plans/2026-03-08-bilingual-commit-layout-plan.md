# Bilingual Commit Layout Rule Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库中的 Git commit 规范从“中英双语”进一步明确为“先完整中文，再完整英文”的布局方式，并创建一条符合该新格式的提交。

**Architecture:** 本次改动只涉及协作文档与 Git 提交流程，不修改业务代码。先在 `AGENTS.md` 中把双语提交的版式要求写清楚：主题行保持中文在前、英文在后；正文必须先写完整中文段落，再另起英文段落，禁止逐句中英交替。随后用命令验证文案与 diff，再创建一条符合新规则的 Git commit。

**Tech Stack:** Markdown、Git

---

### Task 1: 更新提交规则

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/plans/2026-03-08-bilingual-commit-layout-plan.md`

**Step 1:** 在 `AGENTS.md` 的提交规范段落中明确双语布局要求。

**Step 2:** 保存计划文档，记录本次规则调整背景与执行步骤。

### Task 2: 验证并提交

**Files:**
- Verify: `AGENTS.md`

**Step 1:** 使用 `rg`、`git diff --check`、`git status --short` 验证规则文本和改动范围。

**Step 2:** 创建一条符合“中文块在前、英文块在后”格式的新 Git commit。
