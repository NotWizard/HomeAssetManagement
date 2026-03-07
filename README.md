# Home Asset Management

本项目是一个本地运行的家庭资产管理系统（Web），基于 `FastAPI + React + ECharts`。

## 已实现能力（V1）

- 单家庭、多成员角色管理
- 资产/负债录入（固定三级分类）
- 多币种金额录入与汇率折算（自动获取当日汇率，失败回退历史可用）
- CSV 预检与导入（覆盖更新 + 新增）
- 自动事件快照 + 每日日频快照
- 分析看板：趋势、波动率、相关性矩阵、桑基图、再平衡提醒
- 设置页：基准币、时区、全局偏离阈值、汇率提供方
- 迁移包导出/导入：支持导出家庭信息、系统设置、成员、资产负债与每日日快照，并在新环境中一键恢复

## 目录

- `backend/` FastAPI 后端
- `frontend/` React 前端
- `docs/plans/` PRD、技术方案与实施计划

## 快速启动

### 1) 后端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend
```

### 2) 前端

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

前端默认地址：`http://127.0.0.1:5173`  
后端默认地址：`http://127.0.0.1:8000`

## 测试与构建

```bash
source .venv/bin/activate
python -m pytest backend/tests -q
npm --prefix frontend run build
```


## 迁移包

- 入口：设置页中的`数据迁移 / 备份`卡片
- 导出内容：`family`、`settings`、`members`、当前有效 `holdings`、`daily_snapshots`
- 导入格式：ZIP 迁移包（包含 `manifest.json` 与分域数据文件）
- 导入行为：会清空当前环境中的系统设置、成员、资产负债与每日日快照，再恢复迁移包内容

## CSV 模板字段

必须包含字段：

- `name`
- `type` (`asset` / `liability`)
- `member`
- `category_l1`
- `category_l2`
- `category_l3`
- `currency`
- `amount_original`

资产还应提供：

- `target_ratio`

## 说明

- V1 为本地单机无登录模式。
- 三级分类已固定，当前默认内置占位分类（`默认一级/默认二级/默认三级`），可后续替换为你的正式分类清单。
