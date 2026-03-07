# Migration Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为当前家庭资产管理系统增加可长期演进的迁移包导出/导入能力，支持将 `family`、`settings`、`members`、`holdings`、`daily_snapshots` 打包导出，并在新环境中以“先清空再恢复”的方式原子导入。

**Architecture:** 后端新增独立 `migration` 资源域与 `MigrationService`，采用 ZIP 迁移包 + `manifest.json` + 小域 JSON / 大域 NDJSON 的格式。导出走服务端打包下载，导入先进行完整校验，再在单事务中清空旧数据并恢复；前端在设置页新增“数据迁移 / 备份”卡片承载导入导出交互。

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, pytest, Python `zipfile` / `json` / `hashlib`; React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, shadcn/ui 风格基础组件

---

### Task 1: 迁移包后端契约测试

**Files:**
- Create: `backend/tests/test_migration_api.py`
- Reference: `backend/tests/conftest.py`
- Reference: `backend/tests/test_holdings_api.py`

**Step 1: 写导出接口失败测试与成功结构测试**

```python
def test_export_migration_returns_zip_with_required_entries(client):
    response = client.post('/api/v1/migration/export')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/zip'
```

再补充断言 zip 内至少包含：
- `manifest.json`
- `family.json`
- `settings.json`
- `members.json`
- `holdings.ndjson`
- `daily_snapshots.ndjson`

**Step 2: 运行单测并确认红灯**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests/test_migration_api.py::test_export_migration_returns_zip_with_required_entries -q`

Expected: FAIL，报错为路由不存在或断言失败。

**Step 3: 写导入接口成功恢复测试与失败回滚测试**

```python
def test_import_migration_replaces_existing_data(client):
    ...

def test_import_migration_rolls_back_on_invalid_package(client):
    ...
```

覆盖点：
- 导出一份合法迁移包
- 造一批新环境脏数据
- 导入后确认被完全替换
- 构造损坏包后确认原数据不变

**Step 4: 运行单测并确认红灯**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests/test_migration_api.py -q`

Expected: FAIL，提示缺少 `migration` 路由/服务实现。

**Step 5: Commit**

```bash
git add backend/tests/test_migration_api.py
git commit -m "test: add migration package api coverage"
```

### Task 2: 实现后端迁移服务与路由

**Files:**
- Create: `backend/app/api/v1/migration.py`
- Create: `backend/app/services/migration_service.py`
- Modify: `backend/app/api/v1/__init__.py`
- Modify: `backend/app/services/common.py`
- Modify: `backend/app/models/family.py`
- Modify: `backend/app/models/holding_item.py`
- Modify: `backend/app/models/snapshot_daily.py`
- Modify: `backend/app/models/member.py`
- Test: `backend/tests/test_migration_api.py`

**Step 1: 实现最小导出能力**

在 `MigrationService` 中先实现：
- 导出 `family/settings/members/holdings/daily_snapshots`
- 生成 `manifest`
- 打成 zip 并返回 bytes

关键 API 建议：

```python
class MigrationService:
    @staticmethod
    def export_package(session: Session) -> tuple[str, bytes]:
        ...
```

**Step 2: 跑导出测试，确认绿灯**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests/test_migration_api.py::test_export_migration_returns_zip_with_required_entries -q`

Expected: PASS

**Step 3: 实现导入校验与恢复**

在 `MigrationService` 中继续实现：
- 解压 zip 到临时目录
- 校验 `manifest`、文件存在性、checksum、数据结构
- 使用默认家庭作为承载容器更新家庭信息
- 单事务清空并恢复 `settings/members/holdings/daily_snapshots`
- 持仓分类按名称解析，不按旧分类 ID 恢复

关键 API 建议：

```python
class MigrationService:
    @staticmethod
    def import_package(session: Session, content: bytes, filename: str) -> dict:
        ...
```

**Step 4: 跑导入测试，确认绿灯**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests/test_migration_api.py -q`

Expected: PASS

**Step 5: 做小幅重构**

整理：
- manifest 生成 helper
- checksum helper
- NDJSON 读写 helper
- 导入前校验 helper

保持测试全绿。

**Step 6: Commit**

```bash
git add backend/app/api/v1/migration.py backend/app/services/migration_service.py backend/app/api/v1/__init__.py backend/tests/test_migration_api.py
git commit -m "feat: add migration package backend support"
```

### Task 3: 前端迁移服务与设置页入口

**Files:**
- Create: `frontend/src/services/migration.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Test: `backend/tests/test_migration_api.py`

**Step 1: 先补最小前端契约类型**

在 `frontend/src/types/index.ts` 中新增导入结果类型，例如：

```ts
export type MigrationImportResult = {
  family_name: string;
  members_count: number;
  holdings_count: number;
  daily_snapshots_count: number;
};
```

**Step 2: 新增迁移服务封装**

在 `frontend/src/services/migration.ts` 中实现：
- `exportMigrationPackage()`
- `importMigrationPackage(file: File)`

其中导出不要复用 `getJSON`，而是直接处理二进制下载。

**Step 3: 设置页新增“数据迁移 / 备份”卡片**

要求：
- 增加“导出迁移包”按钮
- 增加 zip 上传入口
- 导入前明确警告“将清空当前环境数据”
- 导入成功后失效：`settings`、`members`、`holdings`、`trend`、`rebalance`、`volatility`、`correlation`、`sankey`

**Step 4: 跑后端测试，确认前端改动未破坏已有逻辑**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests/test_migration_api.py -q`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/services/migration.ts frontend/src/types/index.ts frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add migration controls to settings page"
```

### Task 4: 端到端回归与构建验证

**Files:**
- Modify: `docs/plans/2026-03-07-migration-package-design.md`
- Modify: `README.md`
- Test: `backend/tests/test_migration_api.py`

**Step 1: 运行后端测试集**

Run: `source /Users/mac/Downloads/Projects/AICode/HomeAssetManagement/.venv/bin/activate && python -m pytest backend/tests -q`

Expected: PASS

**Step 2: 运行前端构建**

Run: `npm --prefix frontend run build`

Expected: PASS

**Step 3: 更新说明文档**

在 `README.md` 中补充：
- 迁移包导出/导入能力
- 使用入口在设置页
- 导入会清空当前环境核心数据

**Step 4: 最终核对**

手工确认：
- 导出的 zip 文件名合理
- 导入成功后页面数据整体刷新
- 导入失败时有明确报错

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-07-migration-package-design.md
git commit -m "docs: document migration package workflow"
```
