# Category Taxonomy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将后端默认资产/负债三级分类从占位树替换为面向中国家庭用户的精简版正式分类，并修正资产现金分类中的三级项为“美元现金”。

**Architecture:** 保持现有 `Category` 三层树模型与 `/api/v1/categories` 接口不变，仅替换启动播种数据。测试通过分类 API 验证整棵树的用户可见结构，并更新依赖旧占位分类名的导入测试数据。

**Tech Stack:** FastAPI, SQLAlchemy, pytest

---

### Task 1: 分类树回归测试

**Files:**
- Create: `backend/tests/test_categories_api.py`

**Step 1: Write the failing test**
- 通过 `/api/v1/categories?type=asset` 和 `/api/v1/categories?type=liability` 读取树。
- 断言资产和负债顶级分类名称与精简版方案一致。
- 断言资产 `现金与存款 -> 现金 -> 美元现金` 存在，且 `外币现钞` 不存在。
- 断言旧占位分类 `默认一级/默认二级/默认三级` 不再出现。

**Step 2: Run test to verify it fails**
- Run: `source .venv/bin/activate && python -m pytest backend/tests/test_categories_api.py -q`
- Expected: FAIL，因为当前仍播种默认占位分类。

### Task 2: 实现正式分类播种

**Files:**
- Modify: `backend/app/services/bootstrap.py`

**Step 1: Write minimal implementation**
- 提取资产/负债正式分类常量。
- 用统一 helper 递归创建三级分类，按 `sort_order` 保持展示顺序。
- 仅在分类表为空时播种，保持现有项目数据行为不变。

**Step 2: Run test to verify it passes**
- Run: `source .venv/bin/activate && python -m pytest backend/tests/test_categories_api.py -q`
- Expected: PASS。

### Task 3: 更新受影响测试数据

**Files:**
- Modify: `backend/tests/test_import_service.py`

**Step 1: Replace legacy placeholder categories**
- 将 CSV 示例里的 `默认一级/默认二级/默认三级` 替换成新的有效分类路径。

**Step 2: Run targeted tests**
- Run: `source .venv/bin/activate && python -m pytest backend/tests/test_import_service.py backend/tests/test_holdings_api.py -q`
- Expected: PASS。

### Task 4: 最终验证

**Files:**
- No code changes required unless verification fails.

**Step 1: Run focused verification**
- Run: `source .venv/bin/activate && python -m pytest backend/tests/test_categories_api.py backend/tests/test_import_service.py backend/tests/test_holdings_api.py backend/tests/test_settings_api.py -q`
- Expected: all pass.

**Step 2: If failures appear**
- 修复最小必要代码并重新运行相同命令。
