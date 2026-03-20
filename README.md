# 家庭资产负债表 / Household Balance Sheet

一个面向家庭场景的本地资产管理应用，用来长期记录成员、资产、负债、汇率折算、快照与分析结果。

项目当前以 `Electron` 桌面应用为主要交付形态，适合交给非技术用户直接安装使用；开发阶段仍保留 `FastAPI + React + Vite` 的本地 Web 模式。

## 核心定位

家庭资产负债表解决的不是“交易执行”，而是“家庭资产台账管理”。

它的核心目标是：

- 把家庭成员名下的资产和负债统一沉淀到一个本地系统里
- 支持多币种录入，并统一折算到基准币种
- 持续生成快照，观察净资产变化趋势和风险结构
- 让非技术用户也能通过桌面安装包直接使用，而不需要手工启动命令

它不是什么：

- 不是券商交易软件
- 不是云端多人协作 SaaS
- 不是需要公网部署、账号登录、权限体系的企业系统

## 功能一览

当前左侧导航顺序固定为：

`总览 -> 分析看板 -> 资产负债录入 -> 成员管理 -> CSV导入 -> 设置`

### 1. 总览

用于快速查看家庭当前的资产全貌。

- 展示总资产、总负债、净资产等核心指标
- 帮助用户快速知道当前家庭整体财务状态
- 适合作为日常打开应用后的第一个查看页面

### 2. 分析看板

用于观察资产变化趋势、风险暴露和结构分布。

- 查看净资产趋势变化
- 查看波动率、相关性矩阵、桑基图、币种总览、再平衡提醒
- 通过时间区间筛选器切换分析范围
- 适合做阶段复盘、风险观察和资产配置检查

### 3. 资产负债录入

用于新增、编辑和维护家庭里的资产与负债条目。

- 支持资产与负债两种类型
- 支持多币种原币金额录入
- 支持按成员归属管理
- 资产可设置目标占比，用于后续再平衡提醒

### 4. 成员管理

用于维护家庭成员信息。

- 新增或删除家庭成员
- 录入资产和负债时可关联到具体成员
- 方便按成员维度管理和理解资产归属

### 5. CSV导入

用于把已有台账批量导入到系统中。

- 支持先预检，再正式导入
- 支持“覆盖更新 + 新增”
- 导入失败时可查看错误明细
- 适合从 Excel、旧系统或历史表格迁移数据

### 6. 设置

用于维护全局配置和数据迁移。

- 设置基准币种
- 查看当前时区与固定汇率来源
- 配置再平衡阈值
- 导出迁移包做备份
- 导入迁移包恢复数据

## 如何使用

### 面向普通用户

推荐直接使用桌面安装包。

1. 获取 `DMG` 安装包并安装到“应用程序”
2. 双击打开 `家庭资产负债表`
3. 如果 macOS 因未签名阻止打开，按提示到“系统设置 -> 隐私与安全性”里允许打开一次
4. 应用启动后会先显示加载页，等待本地服务准备完成
5. 进入应用后，建议按下面顺序开始使用：

- 先到 `成员管理` 创建家庭成员
- 再到 `资产负债录入` 手工录入，或去 `CSV导入` 批量导入历史数据
- 回到 `总览` 查看整体结果
- 到 `分析看板` 观察趋势、结构和风险变化
- 到 `设置` 导出迁移包，定期备份

### 面向开发者

项目也支持本地 Web 开发模式，适合调试接口和前端页面。

开发模式默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- API Base：`http://127.0.0.1:8000/api/v1`

## 部署与构建

### 本地开发启动

1. 启动后端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir backend
```

2. 启动前端

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

3. 可选验证

```bash
curl http://127.0.0.1:8000/health
```

### 构建桌面安装包

当前桌面版为 macOS 优先方案。

1. 安装桌面打包依赖

```bash
source .venv/bin/activate
pip install -r backend/requirements-desktop.txt
npm --prefix desktop install
```

2. 执行打包

```bash
npm --prefix desktop run make
```

3. 打包结果

- 前端会先执行生产构建
- 后端会通过 `PyInstaller onedir` 生成本地 sidecar
- `Electron Forge` 会生成 macOS `DMG` 和 `ZIP`

默认产物目录：

- `desktop/out/make/`

### 环境配置

后端通过仓库根目录 `.env` 读取配置，变量前缀统一为 `HBS_`。

常见配置示例：

```env
HBS_APP_HOST=127.0.0.1
HBS_APP_PORT=8000
HBS_DATABASE_URL=sqlite:///./backend/data/app.db
HBS_BASE_CURRENCY=CNY
HBS_TIMEZONE=Asia/Shanghai
HBS_REBALANCE_THRESHOLD_PCT=5.0
HBS_ENABLE_SCHEDULER=true
HBS_STORAGE_DIR=backend/data
```

前端开发模式可选：

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

补充说明：

- `.env` 与 `.env.*` 仅用于本地环境，不应提交到 Git
- 桌面打包模式下，前端 API 地址由 Electron 运行时注入；同源托管时也会自动回退到当前窗口 origin

## 技术栈

### 桌面端

- `Electron`
- `Electron Forge`
- `PyInstaller`

### 前端

- `React 18`
- `Vite`
- `TypeScript`
- `React Router`
- `@tanstack/react-query`
- `Tailwind CSS`
- `ECharts + echarts-for-react`
- `zustand`

### 后端

- `FastAPI`
- `SQLAlchemy`
- `Pydantic Settings`
- `APScheduler`
- `HTTPX`
- `SQLite`
