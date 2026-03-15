# Home Asset Management

一个面向家庭场景的本地化资产管理 Web 应用，帮助你统一记录成员、资产、负债、汇率换算、快照与分析数据。

项目采用 `FastAPI + React + Vite + SQLite + ECharts`，默认运行在本机 `127.0.0.1`，适合个人或家庭在单机环境中长期维护资产台账与观察资产变化趋势。

## 项目定位

- 面向**家庭资产负债台账**，不是券商交易系统，也不是云端多人 SaaS
- 以**本地单机运行**为前提，当前版本无登录、无多租户、无公网部署要求
- 覆盖**成员管理 → 录入资产负债 → 汇率折算 → 快照沉淀 → 分析看板 → 迁移备份**的完整闭环
- 以**可持续维护和可迁移**为目标，支持 CSV 导入与迁移包导出 / 导入

## 核心能力

### 1. 家庭与成员管理

- 默认初始化一个家庭（`我的家庭`）
- 支持独立的成员管理页面，统一维护家庭成员
- 资产与负债录入可绑定到具体成员，便于后续归属分析

### 2. 资产 / 负债录入

- 支持资产与负债两类条目
- 内置固定三级分类树，启动后自动初始化
- 支持多币种原币金额录入，并自动折算到基准币种
- 资产支持目标占比，用于再平衡提醒
- 录入、修改、删除会触发事件快照更新

### 3. 汇率与基准币

- 默认基准币种为 `CNY`
- 默认汇率源为 `frankfurter`，当前产品中固定为只读
- 后端支持汇率读取与手动刷新接口
- 前端默认请求 `http://127.0.0.1:8000/api/v1`，可通过 `VITE_API_BASE_URL` 覆盖

### 4. 快照与分析

- 应用启动时会自动初始化数据库、补齐默认设置与分类
- 启动时会尝试生成每日日快照，并启动定时任务调度器
- 提供趋势、波动率、相关性矩阵、桑基图、再平衡提醒、币种总览等分析能力
- 相关性矩阵中的缺失样本以 `null` 表达，前端应按“样本不足 / N/A”处理，而不是强行显示为 `0`

### 5. CSV 导入中心

- 支持 CSV 预检（preview）与正式导入（commit）
- 导入行为支持“覆盖更新 + 新增”
- 会记录导入日志，并在失败时生成错误明细文件
- 导入成功后会生成事件快照

### 6. 数据迁移 / 备份

- 支持从设置页导出完整迁移包（ZIP）
- 支持在新环境中导入迁移包恢复核心数据
- 导入时会清空当前环境中的设置、成员、资产负债与每日日快照，再恢复迁移包内容

## 当前页面

前端当前包含以下页面：

- `总览`：查看资产、负债、净资产及关键概览
- `资产与负债录入`：录入和维护资产 / 负债条目
- `成员管理`：单独维护成员信息
- `CSV 导入中心`：预检、提交、查看导入日志
- `分析看板`：查看趋势、波动率、相关性、桑基图、币种总览与再平衡提醒
- `系统设置`：维护基准币种、阈值，并进行迁移包导出 / 导入

## 技术栈

### 后端

- `FastAPI`
- `SQLAlchemy`
- `Pydantic Settings`
- `APScheduler`
- `HTTPX`
- `SQLite`

### 前端

- `React 18`
- `Vite`
- `TypeScript`
- `React Router`
- `@tanstack/react-query`
- `Tailwind CSS`
- `ECharts + echarts-for-react`
- `zustand`

## 系统结构

```text
frontend (React + Vite)
  ├─ 页面层：总览 / 录入 / 成员 / 导入 / 分析 / 设置
  ├─ 服务层：调用 /api/v1/*
  └─ 图表层：趋势、波动率、相关性、桑基图、币种拆解

backend (FastAPI)
  ├─ app/api/v1      HTTP 路由
  ├─ app/services    业务逻辑
  ├─ app/analytics   分析计算
  ├─ app/jobs        定时任务
  ├─ app/models      数据模型
  └─ app/schemas     请求/响应契约

storage (local)
  └─ backend/data    SQLite 数据、导入错误文件、迁移临时文件等
```

## 目录结构

```text
backend/
  app/
    api/v1/          API 路由
    analytics/       趋势、波动率、相关性、桑基图、再平衡等计算
    core/            配置、数据库、异常、时钟等基础设施
    jobs/            调度器与每日任务
    models/          SQLAlchemy 模型
    schemas/         Pydantic 契约
    services/        成员、持仓、导入、汇率、迁移、快照等服务
  tests/             pytest 测试

frontend/
  src/
    components/      布局、图表与基础 UI 组件
    pages/           页面级视图
    services/        API 调用封装
    types/           前后端共享类型

docs/plans/
  需求、设计与实施计划文档
```

## 快速开始

### 运行前准备

- 已安装 `Python 3`
- 已安装 `npm`
- 建议仅在本机 `127.0.0.1` 环境运行

### 1) 安装后端依赖并启动

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend
```

启动后可访问健康检查：

```bash
curl http://127.0.0.1:8000/health
```

### 2) 安装前端依赖并启动

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

默认访问地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- API Base：`http://127.0.0.1:8000/api/v1`

## 环境配置

后端通过仓库根目录 `.env` 读取配置，变量前缀统一为 `HAM_`。

示例：

```env
HAM_APP_ENV=dev
HAM_APP_HOST=127.0.0.1
HAM_APP_PORT=8000
HAM_DATABASE_URL=sqlite:///./backend/data/app.db
HAM_BASE_CURRENCY=CNY
HAM_TIMEZONE=Asia/Shanghai
HAM_REBALANCE_THRESHOLD_PCT=5.0
HAM_ENABLE_SCHEDULER=true
HAM_FX_PRIMARY_URL=https://api.frankfurter.app
HAM_FX_FALLBACK_URL=https://api.exchangerate.host
HAM_STORAGE_DIR=backend/data
```

前端可选环境变量：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

注意：

- `.env` 与 `.env.*` 仅用于本地环境，不应提交到 Git
- 默认数据文件位于 `backend/data/`
- 默认 SQLite 数据库为 `backend/data/app.db`

## 常用命令

### 后端

```bash
source .venv/bin/activate
python -m pytest backend/tests -q
```

### 前端

```bash
npm --prefix frontend run build
npm --prefix frontend run preview
npm --prefix frontend run typecheck
```

### 桌面版打包（macOS）

桌面版当前采用 `Electron + FastAPI sidecar` 方案，面向非技术用户分发时建议使用桌面安装包，而不是让用户手工启动前后端命令。

首次准备桌面打包环境：

```bash
source .venv/bin/activate
pip install -r backend/requirements-desktop.txt
npm --prefix desktop install
```

生成桌面安装包：

```bash
npm --prefix desktop run make
```

说明：

- 前端会先执行生产构建
- 后端会先通过 `PyInstaller` 生成 `backend/dist-desktop/ham-backend/ham-backend`
- Electron Forge 会读取 `desktop/.stage/` 中整理后的资源并产出 macOS 安装包
- 当前阶段未接入代码签名与 notarization，首次在用户机器打开时，可能需要按手册到系统设置中手动放行

## API 概览

后端统一挂载在 `/api/v1` 下，当前主要路由分组如下：

- `GET /members` / `POST /members` / `PUT /members/{id}` / `DELETE /members/{id}`
- `GET /categories`
- `GET /holdings` / `POST /holdings` / `PUT /holdings/{id}` / `DELETE /holdings/{id}`
- `POST /imports/preview` / `POST /imports/commit` / `GET /imports/logs` / `GET /imports/{id}/errors`
- `GET /settings` / `PUT /settings`
- `GET /fx/rates` / `POST /fx/refresh`
- `GET /snapshots/events` / `GET /snapshots/daily`
- `GET /analytics/trend`
- `GET /analytics/volatility`
- `GET /analytics/correlation`
- `GET /analytics/sankey`
- `GET /analytics/rebalance`
- `GET /analytics/currency-overview`
- `POST /migration/export` / `POST /migration/import`

接口响应统一采用：

```ts
{
  code: number;
  message: string;
  data: T;
  trace_id: string | null;
}
```

## CSV 导入格式

当前 CSV 必填字段：

- `name`
- `type`（`asset` / `liability`）
- `member`
- `category_l1`
- `category_l2`
- `category_l3`
- `currency`
- `amount_original`

补充说明：

- 资产类条目可额外提供 `target_ratio`
- CSV 为空或缺字段时，后端会直接返回预检错误
- 失败行会在导入日志中体现，并可下载错误明细文件

## 迁移包说明

迁移包由设置页发起导出，格式为 ZIP，当前包含：

- `manifest.json`
- `family.json`
- `settings.json`
- `members.json`
- `holdings.ndjson`
- `daily_snapshots.ndjson`

导出内容覆盖范围：

- 家庭信息
- 系统设置
- 成员数据
- 当前有效资产 / 负债条目
- 每日日快照

导入行为说明：

- 会校验迁移包类型与 schema 版本
- 会清空当前环境中的设置、成员、资产负债和每日日快照
- 恢复完成后返回成员数、资产负债数和快照数

## 默认初始化行为

应用启动时会自动：

- 创建数据库表
- 初始化默认家庭与系统设置
- 初始化资产 / 负债三级分类树
- 生成每日日快照
- 启动调度器

当前默认设置包括：

- 默认家庭名：`我的家庭`
- 默认基准币：`CNY`
- 默认时区：`Asia/Shanghai`
- 默认再平衡阈值：`5.0`
- 默认汇率源：`frankfurter`

## 开发与协作约定

- 默认工作分支为 `main`
- Git commit 说明应结构化且清晰：标题简洁，必要时补充正文，说明背景、关键改动与验证结果
- 不要提交本地配置或构建产物，例如 `.env`、`.env.*`、`.venv`、`frontend/node_modules`、SQLite 数据库、导入错误 CSV、`frontend/tsconfig.tsbuildinfo`
- 本项目当前默认仅在 localhost 运行

## 测试现状

当前后端测试位于 `backend/tests/`，覆盖内容包括：

- smoke / 健康检查
- 分类初始化
- 成员、持仓、设置 API
- 导入服务
- 分析与再平衡
- 时区与时间工具
- 迁移 API
- 错误码到 HTTP 状态映射

## 当前版本说明

- 当前版本为本地单机模式，无登录系统
- UI 中 `fx_provider` 固定为 `frankfurter`，不开放编辑
- 设置页中的时区当前为只读展示，默认使用浏览器 / 本地时区回填显示
- 相关性矩阵中的缺失值保留为缺失，不应被当作 `0`

如果你准备继续开发，建议先阅读：

- `AGENTS.md`
- `backend/README.md`
- `frontend/README.md`
- `docs/plans/`
