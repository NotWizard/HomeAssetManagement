# 家庭资产负债表 / Household Balance Sheet

一个面向家庭场景的本地资产管理桌面应用，用来长期记录成员、资产、负债、汇率折算、快照与分析结果。

数据完全存在本机，不需要账号、不上云、不依赖联网（仅汇率刷新会调用 Frankfurter 公共 API）。

---

## 这是什么

家庭资产负债表解决的不是「交易执行」，而是「家庭资产台账管理」。它的核心目标是：

- 把家庭成员名下的资产和负债统一沉淀到一个本地系统里
- 支持多币种录入，并统一折算到基准币种
- 持续生成快照，观察净资产变化趋势和风险结构
- 让非技术用户通过桌面安装包直接使用，不需要手工启动命令

它不是：

- 不是券商交易软件
- 不是云端多人协作 SaaS
- 不是需要公网部署 / 账号登录 / 权限体系的企业系统

## 下载与安装

直接到 GitHub Releases 下载最新版本：

- **Releases 页面**：https://github.com/NotWizard/HouseholdBalanceSheet/releases
- **Apple Silicon Mac**（M1 / M2 / M3 / M4）：`HouseholdBalanceSheet-<version>-macos-arm64.dmg`

> 当前发布产物仅包含 Apple Silicon 版本。Intel Mac 用户如需安装包，请自行从源码构建（见末尾「面向开发者 · 构建桌面安装包」节）。

### 首次安装

1. 双击下载的 `.dmg`，把 `家庭资产负债表.app` 拖到 `应用程序` 文件夹
2. 第一次打开时 macOS Gatekeeper 可能提示「无法验证开发者」——到 `系统设置 → 隐私与安全性`，找到对应应用点「仍要打开」即可
3. 应用启动时会先显示加载页（等本地后端服务就绪），随后进入主界面

### 自动更新

桌面端会自动检测 GitHub 上的新版本，并在后台静默处理大部分流程：

- 启动时检查一次，之后每 12 小时再检查一次
- 发现新版本会**自动在后台下载**，下载阶段完全无感
- 下载完成后，左下角出现「有可用更新」入口
- 点击入口 → 看到「升级到 v X.Y.Z?」确认对话框 → 确认即触发应用退出并启动新版本
- 升级过程会自动剥离 macOS quarantine 标记，不会再次触发 Gatekeeper 二次授权
- 本地数据库与用户数据跟应用 bundle ID 绑定（位于 `~/Library/Application Support/com.householdbalancesheet.desktop/data/app.db`），升级不影响数据

## 推荐使用流程

打开应用后建议按这个顺序：

1. **成员管理**：先创建家庭成员（爸爸 / 妈妈 / 我 / 孩子 等）
2. **资产负债录入** 或 **CSV 导入**：手工录入每条资产负债，或从已有 Excel 批量导入
3. **总览**：检查整体资产 / 负债 / 净资产
4. **分析看板**：看趋势、结构、风险
5. **设置 → 导出迁移包**：定期备份（推荐每月一次）

## 功能一览

左侧导航固定顺序：**总览 → 分析看板 → 资产负债录入 → 成员管理 → CSV 导入 → 设置**

### 1. 总览

用于快速查看家庭当前的资产全貌：总资产、总负债、净资产等核心指标。日常打开应用后看的第一个页面。

### 2. 分析看板

观察资产变化趋势、风险暴露与结构分布，分为三个 tab：

- **整体概览**：净资产趋势线、各成员分布
- **风险与配置**：资产波动率柱图、相关性矩阵热力图、再平衡提醒
- **币种总览**：各币种资产负债对比、跨币种结构（统一按基准币折算）

可通过时间区间筛选器切换分析范围。

### 3. 资产负债录入

新增 / 编辑 / 删除每条资产或负债。

- 新增对话框内的「分类」选择器是渐进式的：
  - 顶部 tab 切换 **资产 (10)** / **负债 (6)**（type 由所选根分类自动决定，无需单独选）
  - 沿面包屑「一级 → 二级 → 三级」逐步缩范围（每屏只面对 ≤10 项）
  - 也可直接在搜索框输入名字（如 `BTC`、`活期`、`信用卡`），匹配 L1 / L2 / L3 任一段命中
  - 二级若只含 1 个三级会自动穿透到三级，少一击
- 支持多币种原币金额录入
- 资产可设置目标占比；超出 / 不足时录入列表会有徽章提示
- 按成员分组渲染，每组组首显示该成员 target_ratio 合计与达标状态
- 支持「一键归一化」把当前比例等比例缩放到合计 100%

### 4. 成员管理

新增 / 删除家庭成员。资产负债条目按成员归属管理，方便按人统计与配平。

### 5. CSV 导入

从 Excel / 旧系统批量迁移数据。

- 支持先预检看每行处理结果，再正式提交
- 支持「覆盖更新 + 新增」混合
- 导入失败的行可下载错误明细 CSV
- 适合从 Excel、旧系统或历史表格迁移数据

### 6. 设置

- 设置基准币种（默认 CNY）
- 查看当前时区与固定汇率来源（Frankfurter）
- 配置再平衡阈值
- 导出 / 导入迁移包做备份与恢复

## 资产负债分类体系

资产 10 大类、负债 6 大类，三层扁平结构，固定不可改。

### 资产（10 大类）

| 一级 | 涵盖范围 |
|---|---|
| 现金存款类 | 现金、银行存款、支付账户、货基 / T+0 理财 |
| 固定收益类 | 债券、固收基金、银行理财、信托与资管 |
| 权益与另类 | 股票（A股 / 港股 / 美股）、公募基金、REITs、另类投资（PE / 对冲 / 贵金属账户） |
| 数字资产 | 主流加密（BTC / ETH / 稳定币）、其他代币、NFT 与链上资产 |
| 退休与长期账户 | 法定养老、补充养老（年金 / 个人养老金）、公积金、教育储备 |
| 保险账户 | 寿险类、年金险、万能 / 投连 |
| 不动产 | 住宅、商业不动产、其他不动产（车位 / 土地 / 海外） |
| 车辆 | 家用车辆、其他车辆（商用 / 房车 / 游艇） |
| 其他实物 | 贵金属与珠宝（含金条实物）、艺术与收藏、其他高价值 |
| 经营资产 | 股权类、经营性实物、经营性账户 |

### 负债（6 大类）

| 一级 | 涵盖范围 |
|---|---|
| 住房负债 | 房屋按揭、房产抵押贷、装修与配套 |
| 经营负债 | 经营性贷款、对公借款 |
| 消费负债 | 信用卡、互联网消费信贷（花呗 / 白条）、银行消费贷 |
| 车辆与耐用品负债 | 车贷、耐用品分期 |
| 投资杠杆负债 | 证券融资、质押借款、其他杠杆（配资 / 加密杠杆） |
| 亲友借款 | 短期借款、长期借款、其他个人往来 |

**设计原则**：扁平、无金融 / 非金融顶层壳；每个一级类目都对应一个真实的家庭资产场景；删除「应收资产」「其他应付款」这些家庭场景用不上的会计概念；账户型黄金（如黄金 ETF）走「权益与另类 / 另类投资 / 贵金属账户」，金条实物走「其他实物 / 贵金属与珠宝 / 黄金实物」，资产形态清晰分流。

每个一级类下的二级 / 三级细分，进入「资产负债录入」点开分类选择器时可以逐层浏览。

---

## 面向开发者

> 普通用户无需阅读以下内容。本节面向想从源码运行、构建桌面安装包或贡献代码的开发者。

### 技术栈

**桌面端**

- `Electron`
- `Electron Forge`
- `PyInstaller`

**前端**

- `React 18`
- `Vite`
- `TypeScript`
- `React Router`
- `@tanstack/react-query`
- `Tailwind CSS`
- `ECharts + echarts-for-react`
- `zustand`

**后端**

- `FastAPI`
- `SQLAlchemy`
- `Pydantic Settings`
- `APScheduler`
- `HTTPX`
- `SQLite`

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

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`
- API Base：`http://127.0.0.1:8000/api/v1`

### 构建桌面安装包

当前桌面版为 macOS 优先方案。

1. 安装桌面打包依赖

```bash
source .venv/bin/activate
pip install -r backend/requirements-desktop.txt
npm --prefix frontend install
npm --prefix desktop install
```

2. 如需同时构建 Intel 与 Apple Silicon，两种方式任选其一：

- 准备额外的 x64 Python 环境，并放在仓库根目录 `.venv-x64`
- 或设置环境变量 `HBS_DESKTOP_PYTHON_X64=/path/to/x64/python`

说明：

- 当前仓库根目录 `.venv` 会被视为宿主机架构环境
- 在 Apple Silicon 机器上，通常可保留 `.venv` 为 `arm64`，再额外准备一个通过 Rosetta 创建的 `.venv-x64`
- 如果缺少 x64 Python，`make:dmg:x64` / `make:dmg` 会给出明确错误提示，不会静默产出错误安装包

3. 执行打包

```bash
npm --prefix desktop run make:dmg:arm64
npm --prefix desktop run make:dmg:x64
```

如需一键尝试同时产出两套安装包：

```bash
npm --prefix desktop run make:dmg
```

4. 产物目录

- 最终发布产物：`desktop/out/release/`
- Forge 原始产物：`desktop/out/make/`

### Release 发布

打 `v*` tag 即自动触发 GitHub Actions 构建并发布 release：

```bash
git tag -a v0.3.1 -m "release notes"
git push origin v0.3.1
```

`.github/workflows/release.yml` 会在 `macos-latest` runner 上跑 `make:dmg:arm64`，先对 `.app` 进行 Developer ID 签名与 notarization，再重新生成 DMG / ZIP / `.sha256` 并上传到 release，release notes 自动从 `CHANGELOG.md` 抠取对应版本段落。

发布 workflow 需要配置 macOS 签名证书与公证凭据：

- `HBS_MACOS_CERTIFICATE_P12`：Developer ID Application `.p12` 的 base64 内容
- `HBS_MACOS_CERTIFICATE_PASSWORD`：导出 `.p12` 时设置的密码
- `HBS_MACOS_KEYCHAIN_PASSWORD`：CI 临时 keychain 密码；可不设，workflow 会自动生成
- `HBS_MACOS_CODESIGN_IDENTITY`
- `HBS_MACOS_NOTARY_KEYCHAIN_PROFILE` + `HBS_MACOS_NOTARY_KEYCHAIN`
- 或 `HBS_MACOS_NOTARY_API_KEY` + `HBS_MACOS_NOTARY_API_KEY_ID` + `HBS_MACOS_NOTARY_API_ISSUER`
- 或 `HBS_MACOS_NOTARY_APPLE_ID` + `HBS_MACOS_NOTARY_APPLE_ID_PASSWORD` + `HBS_MACOS_NOTARY_TEAM_ID`

如果暂时没有 Apple Developer 账号，可以在手动触发 Release workflow 时把 `release_mode` 选为 `unsigned`。该模式会对 `.app` 做 ad-hoc 签名并运行 `codesign --verify --deep --strict`，用于避免产物因签名结构损坏而显示“已损坏，无法打开”。它不会进行 notarization，首次安装仍需要用户在 macOS 隐私与安全设置中手动放行。

x64 暂未在 workflow 中构建。如有 Intel Mac 用户反馈，可按上一节说明本地构建后用 `gh release upload v0.3.x ...` 追加上传。

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
