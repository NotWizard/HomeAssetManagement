# Branch Main Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将仓库默认工作分支统一为 `main`，并同步更新本地跟踪关系、远端分支状态与仓库中的相关引用。

**Architecture:** 本次迁移分为三层：先核对仓库中是否存在旧默认分支的文本引用，再在本地统一分支命名并建立新的上游关系，最后在远端确认 `main` 为默认分支并清理旧远端分支。若 GitHub 默认分支设置无法通过当前终端会话修改，则保留证据并给出最小人工操作说明。

**Tech Stack:** Git、GitHub 远端、仓库文本扫描（`rg`）

---

### Task 1: 清点当前状态

**Files:**
- Create: `docs/plans/2026-03-08-branch-main-migration.md`
- Inspect: `.git/config`
- Inspect: repository text references via `rg`

**Step 1:** 检查当前本地分支、远端配置、跟踪关系。

**Step 2:** 扫描仓库内所有旧默认分支相关文本引用。

**Step 3:** 记录需要调整的配置或文档位置。

### Task 2: 迁移本地分支

**Files:**
- Modify: `.git/HEAD`
- Modify: `.git/config`
- Modify: local refs under `.git/refs`

**Step 1:** 将本地当前默认工作分支统一为 `main`。

**Step 2:** 确认本地当前分支、工作区和上游状态。

### Task 3: 迁移远端分支

**Files:**
- Modify: remote refs on `origin`

**Step 1:** 推送 `main` 到远端并建立 upstream。

**Step 2:** 清理旧远端分支。

**Step 3:** 校验远端 HEAD、默认分支与远端分支列表。

### Task 4: 收尾与验证

**Files:**
- Modify: any repository files that still reference the legacy branch if found

**Step 1:** 再次扫描仓库确认无旧默认分支遗留文本引用。

**Step 2:** 运行 `git branch -a -vv`、`git remote show origin` 等命令核验。

**Step 3:** 若 GitHub 默认分支仍需网页/API 修改，给出明确的最小后续步骤。
