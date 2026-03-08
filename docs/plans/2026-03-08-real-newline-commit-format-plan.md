# Real Newline Commit Format Rule Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库中的 Git commit 规范进一步明确为使用真实换行、空行和缩进来组织提交信息，而不是在消息中写入字面量 `\n` 之类的转义文本，并创建一条符合该规范的示范提交。

**Architecture:** 本次改动只涉及协作文档与 Git 提交流程。先在 `AGENTS.md` 中补充规则：提交标题和正文继续遵循“先中文后英文”的双语布局，同时正文必须使用真实换行、空行和实际空格缩进，禁止用 `\n`、`\t` 等字面量模拟排版。随后验证规则文本与 diff，再用真实多行 commit message 创建一条新的提交。

**Tech Stack:** Markdown、Git

---

### Task 1: 更新提交排版规则

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/plans/2026-03-08-real-newline-commit-format-plan.md`

**Step 1:** 在 `AGENTS.md` 的提交规范段落中明确真实换行、空行和缩进的要求。

**Step 2:** 记录本次规则修订的计划文档。

### Task 2: 验证并提交

**Files:**
- Verify: `AGENTS.md`

**Step 1:** 使用 `rg`、`git diff --check`、`git status --short` 验证规则文本和改动范围。

**Step 2:** 使用真实多行正文创建一条符合新规范的 Git commit。
