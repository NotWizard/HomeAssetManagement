# 家庭资产管理系统 V1 技术方案（本地 Web）

- 文档日期：2026-03-01
- 对应 PRD：`docs/plans/2026-03-01-home-asset-management-prd.md`
- 目标形态：本地 Web（单机、localhost、无登录）

## 1. 技术决策结论

1. 后端采用 Python：`FastAPI + SQLAlchemy + Alembic + APScheduler`。
2. 前端采用 React：`React + TypeScript + Vite + Ant Design`。
3. 图表采用 `Apache ECharts`（React 封装：`echarts-for-react`）。
4. 本地数据库采用 `SQLite`（启用 WAL，支持并发读写体验）。
5. 分析计算采用 `pandas + numpy`（波动率、相关性、再平衡偏离）。
6. 数据交换采用 REST API + JSON。

这套组合满足：
- 本地部署简单（无需外部中间件即可跑通）。
- 开发效率高（FastAPI 自动 OpenAPI 文档，React 生态成熟）。
- 图表能力完整（趋势、热力矩阵、桑基图均原生支持）。

---

## 2. 总体架构

采用“前后端分离 + 单体后端分层”架构。

### 2.1 架构分层

- **UI 层（React）**：页面渲染、交互、图表展示、输入校验。
- **API 层（FastAPI）**：请求鉴权（V1 可无登录）、参数校验、响应封装、错误码。
- **Domain 层（Service）**：成员管理、资产负债、CSV 导入、汇率、快照、再平衡。
- **Analytics 层**：收益率序列、波动率、相关性、偏离度计算。
- **Data 层（SQLAlchemy）**：持久化、事务、索引与查询。
- **Job 层（APScheduler）**：每日汇率拉取、日终快照生成。

### 2.2 运行方式

- 本机运行两个进程：
  - `frontend`：Vite Dev Server（开发）/静态文件服务（生产本地）
  - `backend`：Uvicorn + FastAPI
- 默认只绑定：`127.0.0.1`
- 数据文件：`backend/data/app.db`

---

## 3. 工程目录建议

```text
HomeAssetManagement/
  backend/
    app/
      api/v1/
        members.py
        categories.py
        holdings.py
        imports.py
        analytics.py
        settings.py
        snapshots.py
        fx.py
      core/
        config.py
        database.py
        logging.py
        exceptions.py
      models/
        family.py
        member.py
        category.py
        holding_item.py
        fx_rate_daily.py
        snapshot_event.py
        snapshot_daily.py
        settings.py
        import_log.py
      schemas/
      services/
        member_service.py
        holding_service.py
        import_service.py
        fx_service.py
        snapshot_service.py
        settings_service.py
      analytics/
        series_builder.py
        volatility.py
        correlation.py
        rebalance.py
        sankey_builder.py
      jobs/
        scheduler.py
        fx_jobs.py
        snapshot_jobs.py
      main.py
    alembic/
    tests/
    requirements.txt
  frontend/
    src/
      pages/
        Overview/
        Entry/
        Import/
        Analytics/
        Settings/
      components/
        charts/
          TrendChart.tsx
          VolatilityChart.tsx
          CorrelationHeatmap.tsx
          SankeyChart.tsx
        forms/
      services/
        apiClient.ts
        members.ts
        holdings.ts
        imports.ts
        analytics.ts
        settings.ts
      store/
      hooks/
      types/
      utils/
    package.json
  docs/plans/
```

---

## 4. 数据库与数据约束（SQLite）

> 与 PRD 数据模型一致，以下给出可执行约束。

### 4.1 核心表

1. `family`
- 单条默认记录。

2. `member`
- `family_id` 外键。
- 名称不能为空。

3. `category`
- 字段：`type(asset|liability)`、`level(1|2|3)`、`parent_id`。
- 强约束：仅允许三级；不允许第四级。

4. `holding_item`
- 字段：类型、名称、成员、三级分类、币种、原币金额、基准币金额、来源、更新时间。
- 资产项 `target_ratio` 必填；负债项必须为空。
- 软删除字段：`is_deleted`。

5. `fx_rate_daily`
- 唯一键：`(rate_date, base_currency, quote_currency)`。

6. `snapshot_event`
- 每次新增/编辑/导入提交后记录事件快照。

7. `snapshot_daily`
- 唯一键：`(family_id, snapshot_date)`。

8. `settings`
- 全局配置：`base_currency`、`timezone`、`rebalance_threshold_pct`、`fx_provider`。
- 阈值必须 > 0 且 < 100。

9. `import_log`
- 记录导入批次统计与错误报告路径。

### 4.2 索引建议

- `holding_item(family_id, type, updated_at)`
- `holding_item(member_id, updated_at)`
- `fx_rate_daily(base_currency, quote_currency, rate_date)`
- `snapshot_daily(family_id, snapshot_date)`
- `import_log(family_id, created_at)`

### 4.3 覆盖键（CSV Upsert）

逻辑覆盖键：`名称 + 成员 + 类型 + 三级分类路径`
- 命中则更新现有记录。
- 未命中则新增。

---

## 5. 后端详细设计

## 5.1 API 规范

- 前缀：`/api/v1`
- 响应：
```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "..."
}
```
- 错误码：
  - `4001` 参数错误
  - `4002` 业务校验失败
  - `4040` 资源不存在
  - `4090` 冲突（唯一键/版本冲突）
  - `5000` 系统错误

## 5.2 主要接口

### 成员
- `GET /members`
- `POST /members`
- `PUT /members/{id}`
- `DELETE /members/{id}`

### 分类（只读）
- `GET /categories?type=asset|liability`

### 资产负债
- `GET /holdings`
- `POST /holdings`
- `PUT /holdings/{id}`
- `DELETE /holdings/{id}`（软删除）

### CSV 导入
- `POST /imports/preview`
- `POST /imports/commit`
- `GET /imports/logs`
- `GET /imports/{id}/errors`

### 设置与汇率
- `GET /settings`
- `PUT /settings`
- `GET /fx/rates?date=YYYY-MM-DD`
- `POST /fx/refresh`（手动刷新，可选）

### 分析
- `GET /analytics/trend?window=30|90|180|365`
- `GET /analytics/volatility?window=90`
- `GET /analytics/correlation?window=90`
- `GET /analytics/sankey`
- `GET /analytics/rebalance`

### 快照
- `GET /snapshots/events`
- `GET /snapshots/daily`

## 5.3 事务边界

必须同事务提交：
1. `holding_item` 变更 + `snapshot_event` 写入。
2. `imports/commit` 内单行更新/新增与批次统计。

保证不出现“录入成功但快照缺失”。

## 5.4 服务实现要点

- `fx_service`
  - 当日汇率优先；失败则回退最近可用日期。
  - 记录 `is_estimated` 状态给前端提示。

- `holding_service`
  - 保存前统一折算 `amount_base`。
  - 校验资产/负债类型与 `target_ratio` 约束。

- `import_service`
  - preview 阶段仅校验不落库。
  - commit 阶段执行 upsert 并输出行级错误。

- `snapshot_service`
  - 事件快照：记录变更前后关键字段或全量聚合。
  - 日终快照：统一结构，供分析层直接消费。

---

## 6. 前端详细设计（React + ECharts）

## 6.1 页面与路由

- `/overview`
- `/entry`
- `/import`
- `/analytics`
- `/settings`

## 6.2 状态管理

- 服务端状态：`TanStack Query`
  - 优点：请求缓存、并发请求、失败重试、自动失效重取。
- 客户端轻状态：`Zustand`
  - 页面筛选器、表格列配置、图表时间窗口。

## 6.3 表单与校验

- `react-hook-form + zod`（或 Antd Form + rules）
- 校验规则：
  - 金额 > 0
  - 币种合法
  - 资产 `target_ratio` 必填且 0~100
  - 负债 `target_ratio` 禁止填写

## 6.4 ECharts 图表落地

1. 趋势图：`line`
- 系列：净资产、总资产、总负债
- 支持时间窗口切换

2. 波动率：`bar`
- 资产项年化波动率排序
- 支持按成员过滤

3. 相关性矩阵：`heatmap`
- 色阶 -1~1
- tooltip 展示资产对与相关系数

4. 桑基图：`sankey`
- 节点建议：成员 -> 一级/二级/三级 -> 资产/负债汇总端
- 边值：折算金额

5. 再平衡提醒：表格 + 色彩标识
- 列：资产名称、目标占比、当前占比、偏离度、状态（超配/低配）

## 6.5 交互策略

- 写操作后主动失效关键查询：`holdings`、`overview`、`analytics/*`。
- 异常统一消息组件：汇率回退、净资产非正、样本不足。
- 导入页面展示可下载错误报告。

---

## 7. 核心计算与算法实现

## 7.1 折算

`amount_base = amount_original * fx_rate(currency -> base_currency)`

- 若缺失当日汇率：
  - 查最近历史可用汇率；
  - 结果标记 `estimated=true`。

## 7.2 净资产与占比

- `total_asset = sum(asset.amount_base)`
- `total_liability = sum(liability.amount_base)`
- `net_asset = total_asset - total_liability`

资产当前占比：
- `current_ratio = asset.amount_base / net_asset`
- 若 `net_asset <= 0`：停止计算并返回不可用状态。

## 7.3 偏离度与提醒

- `deviation = current_ratio - target_ratio`
- 触发条件：`abs(deviation) >= rebalance_threshold_pct`
- 标签：
  - `deviation > 0` -> 超配
  - `deviation < 0` -> 低配

## 7.4 波动率

- 基于 `snapshot_daily` 构建每个资产的日频净值/金额序列。
- 日收益率：`r_t = v_t / v_(t-1) - 1`
- 年化波动率：`std(r_t) * sqrt(252)`
- 样本不足（<30）返回 `insufficient_data=true`。

## 7.5 相关性矩阵

- 取同窗口各资产收益率向量。
- 采用 Pearson 相关系数。
- 输出 NxN 矩阵（资产数 N）。

## 7.6 桑基图数据构建

- 输出结构：`nodes[]`, `links[]`
- 以“成员 -> 分类层级 -> 条目”或“成员 -> 分类层级 -> 资产/负债汇总端”建边。
- 数值字段统一使用 `amount_base`。

---

## 8. 定时任务与后台作业

## 8.1 APScheduler 任务

1. `daily_fx_fetch_job`
- 执行时间：每日早晨（如 06:00）
- 行为：拉取主要币种对基准币汇率，写入 `fx_rate_daily`

2. `daily_snapshot_job`
- 执行时间：每日 23:55
- 行为：聚合全量资产负债生成 `snapshot_daily`

## 8.2 失败与重试

- 网络失败：指数退避重试 3 次。
- 任务失败写日志，并在总览显示“任务异常”提示。

---

## 9. 外部依赖与接口策略

## 9.1 汇率源

建议抽象 `FxProvider` 接口：
- `get_rates(date, base_currency, quote_currencies)`

实现策略：
1. `provider_a`（主）
2. `provider_b`（备）
3. 本地缓存回退（历史最近可用）

## 9.2 离线可用性

- 若无网络，系统仍可录入与分析。
- 汇率不可更新时沿用最近汇率并明显提示“估算值”。

---

## 10. 安全、数据与本地运行边界

1. 默认仅 `localhost` 绑定，不对外网暴露。
2. V1 无登录，适用于单人单机；共享设备存在数据暴露风险。
3. 建议增加本地备份功能（导出 SQLite + 导出 CSV）。
4. 输入校验与 SQL 参数化由 ORM 层保证，避免注入风险。

---

## 11. 性能目标与优化点

1. 列表查询（<=1000 条）<1s。
2. CSV 导入（<=5000 行）可在可接受时间内完成。
3. 图表接口采用按需计算 + 可选结果缓存（window 维度缓存）。
4. 分析计算在后端完成，前端仅渲染，降低浏览器负担。

---

## 12. 测试策略

## 12.1 后端

- 单元测试：
  - 偏离度计算
  - 波动率计算
  - 相关性矩阵
  - 汇率回退逻辑
- 集成测试：
  - holdings 新增/编辑后快照联动
  - imports preview/commit 行为
  - settings 更新后提醒阈值生效

## 12.2 前端

- 组件测试：表单校验、错误提示、图表参数转换。
- 页面联调测试：导入流程三步、分析页窗口切换、提醒列表一致性。

## 12.3 端到端（可选）

- Playwright 场景：
  1. 新增资产 -> 查看趋势变化 -> 查看再平衡提醒。
  2. 导入 CSV -> 预检 -> 提交 -> 查看日志。

---

## 13. 发布与运行

## 13.1 开发模式

- 后端：`uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- 前端：`vite --host 127.0.0.1 --port 5173`

## 13.2 本地生产模式（建议）

1. 前端打包为静态文件。
2. 后端可挂载静态目录并统一由 FastAPI 提供访问（简化双进程）。
3. 数据库文件与日志文件放入 `backend/data`、`backend/logs`。

---

## 14. 实施里程碑（技术视角）

1. **M1：数据底座与录入链路**
- 建表、成员/分类/资产负债 API、事件快照。

2. **M2：CSV 导入与汇率体系**
- 导入预检+提交、错误报告、汇率拉取与回退。

3. **M3：分析引擎**
- 日终快照、趋势、波动率、相关性 API。

4. **M4：可视化与提醒闭环**
- ECharts（趋势/热力/桑基）、再平衡提醒、设置页联动。

---

## 15. 关键风险与应对

1. 汇率源波动/限制
- 应对：多提供方抽象 + 历史回退 + 明确估算标识。

2. 分类清单尚未最终给定
- 应对：先实现固定三级结构与只读接口，后续补充种子数据即可。

3. 无登录导致本地数据暴露风险
- 应对：默认 localhost、提供数据库备份与本地设备加密建议。

4. 统计样本不足导致指标不稳定
- 应对：样本阈值保护（<30 不展示）+ UI 透明提示。

---

## 16. 结论

你的判断是正确的：
- **后端用 Python（FastAPI）+ 前端用 React** 是这个本地家庭资产管理系统的最优平衡方案。
- 图表层使用 **ECharts** 可以完整承载趋势、相关性矩阵、桑基图和再平衡展示。

该技术方案可直接进入开发实施阶段。
