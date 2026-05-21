# Changelog

本文件记录本仓库的所有重要代码变更。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 SemVer 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 资产负债录入页新增"按成员的目标占比配平"工作流：顶部用每位成员一张迷你卡片展示该成员资产 `target_ratio` 合计、状态徽章（已达标/未达标/已超出）、距离 100% 的差值与进度条；点击卡片可聚焦并把表格筛选到该成员；表格本身改为按成员分组渲染，每组组首显示合计/状态/折叠按钮，组内 `target_ratio` 列在超配时按贡献度染色。新增"一键归一化" Dialog：以现有比例为权重等比例缩放至合计 100%（全 0 时退化为 1/N 平均），逐条预览 `当前% → 建议%` 与变化量，确认后通过新接口 `POST /api/v1/holdings/bulk-update-target-ratio` 原子批量更新并刷新快照。配套 `entryPageLogic` 新增 `buildMemberAllocationSummaries` / `summarizeMemberAllocations` / `buildNormalizationPlan` 纯函数，单测扩到 8 例。
- Add a per-member target-ratio rebalancing workflow on the entry page: the overview replaces the family-wide single card with one mini card per member showing that member's asset `target_ratio` sum, status badge (balanced/under/over), distance from 100% and a progress bar. Clicking a card focuses the page and filters the table to that member. The holdings table now groups by member: each group header shows the running total, status badge, normalize action and collapse toggle, and the `target_ratio` column gets contribution-tinted in over-allocated groups. A new "one-click normalize" dialog scales every asset proportionally so the member's total becomes exactly 100% (degrading to 1/N when all current ratios are 0), previews `current% → proposed%` per row, and on confirm calls the new atomic backend endpoint `POST /api/v1/holdings/bulk-update-target-ratio` which validates 0–100 range, rejects non-asset rows, and triggers a snapshot refresh. Logic extracted into pure helpers in `entryPageLogic` (`buildMemberAllocationSummaries` / `summarizeMemberAllocations` / `buildNormalizationPlan`) covered by four new unit tests.
- 新增项目级 Claude Code subagent：`security-reviewer`（安全审查专员，覆盖鉴权/CORS/上传解析/Electron webPreferences/桌面更新链路等敏感面）与 `migration-guard`（迁移与数据生命周期守门人，覆盖 alembic 链路、模型/迁移一致性、导入导出回滚、桌面 DB 路径漂移）。位于 `.claude/agents/`。
- Add project-scoped Claude Code subagents `security-reviewer` and `migration-guard` under `.claude/agents/` to guard security-sensitive surfaces and database migration / data-lifecycle changes.
- 新增 `backend/requirements.lock`：完整 transitive 依赖锁定文件，与 `requirements.txt` 配套，保证可复现构建。
- Add `backend/requirements.lock` capturing the full transitive dependency lock alongside the human-edited `requirements.txt` for reproducible builds.
- 新增 `.github/workflows/ci.yml`：在 push/PR 上跑 backend pytest、frontend typecheck+build+`node --test`、desktop typecheck+`node --test` 三个 job，作为最低门禁。
- Add `.github/workflows/ci.yml` to run backend pytest, frontend typecheck/build/`node --test`, and desktop typecheck/`node --test` as the minimum gate on every push and pull request.

### Changed

- 应用图标整体重做为新设计的「双蓝 H」品牌标志：替换 `desktop/assets/icon.icns`、`desktop/assets/icon.svg`、`frontend/public/favicon.svg`，以及 `AppShell` 侧栏左上角原本占位的 lucide `WalletCards` 图标（同时移除该 import）。主图标 SVG 严格遵循 Apple HIG（macOS Sequoia/Tahoe）模板：1024×1024 画布，824×824 squircle 内容区居中，连续曲率半径 184（≈22.4%），白底配极轻 rim 高光与 H 标志的柔阴影；`icon.icns` 通过 `iconutil` 从完整 `desktop/assets/icon.iconset/` 重新打包，覆盖 16/32/128/256/512 五个逻辑尺寸的 1×/@2× 共 10 个 PNG。
- Rebrand the app icon to the newly designed dual-blue H mark across `desktop/assets/icon.icns`, `desktop/assets/icon.svg`, `frontend/public/favicon.svg`, and the placeholder `WalletCards` lucide icon in the `AppShell` sidebar (the now-unused import is dropped as well). The master SVG follows the Apple HIG template for macOS Sequoia/Tahoe — 1024×1024 canvas, 824×824 squircle content area centered with a continuous-curvature radius of 184 (~22.4%), pure white fill with a faint rim highlight and a soft drop shadow under the mark. `icon.icns` is regenerated with `iconutil` from a full `desktop/assets/icon.iconset/` covering all ten Apple-required PNGs (1×/@2× across 16/32/128/256/512).
- `backend/requirements.txt` 与 `backend/requirements-desktop.txt` 全部依赖改为精确版本 pin（`fastapi==0.136.1`、`sqlalchemy==2.0.49`、`pyinstaller==6.20.0` 等），消除"任意一次重装都可能拉到含 CVE / 破坏性更新版本"的风险。
- Pin every dependency in `backend/requirements.txt` and `backend/requirements-desktop.txt` to exact versions so reinstalls cannot silently pull a vulnerable or breaking release.
- 分析看板的相关性矩阵与资产波动率柱图改为按数据规模自适应：相关性矩阵的高度按资产数量动态计算（最低 420，最高 820），坐标轴字号、X 轴旋转角度随资产数收紧；当资产数 > 12 时关闭单元格内数值标签（数值仍保留在 tooltip 中）。波动率柱图按数据条目数动态调整高度（320/380/420）、X 轴标签字号与旋转角度。修复在 23+ 资产场景下两图标签严重重叠、单元格被压扁不可读的问题。
- Make the correlation heatmap and volatility bar chart on the analytics dashboard scale with the data set: heatmap height is now derived from the asset count (clamped between 420 and 820), axis label font size and X-axis rotation tighten as the count grows, and the in-cell numeric labels are hidden once asset count exceeds 12 (precise values remain in the tooltip). The volatility chart adopts the same approach for height and X-axis labels. Resolves the unreadable axis-label collision and squashed-cell rendering observed once the household held 20+ assets.
- 共用 `ECharts` 包装组件追加 `ResizeObserver`：父容器因 tab 切换、卡片折叠或窗口尺寸变化而 reflow 时，图表会自动调用 `resize()`，避免延用旧画布导致绘制区域被截断。
- The shared `ECharts` wrapper now installs a `ResizeObserver` on its host element so charts call `resize()` whenever the parent reflows (tab switches, card collapsing, viewport changes), preventing the previously observed clipped drawing region after layout updates.

### Removed

- 删除 `AppShell` 顶部条上未接通后端的占位组件：搜索框（无 `value/onChange`、`⌘K` 也未绑快捷键）、通知按钮（无 `onClick`、红点是写死 div）、用户身份卡（"HB / 本机用户"硬编码字符串）。本地优先 + 单用户定位下不会做登录与全局搜索，这些占位反而误导。桌面端整条 header 改为隐藏，主内容直接顶到顶端；移动端保留汉堡菜单 + 当前页名，作为唯一一处顶栏。
- Remove the unwired placeholder widgets from the top bar of `AppShell`: the search input (no `value/onChange`, no `⌘K` binding), the notification bell (no `onClick`, the red dot was a hard-coded div), and the user identity chip (`"HB / 本机用户"` hard-coded). Under the local-first single-user positioning we will not be adding login or global search, so these placeholders were misleading rather than helpful. The desktop header is now hidden entirely so page content reaches the top edge; mobile keeps a slim header with hamburger menu and current page name.

### Fixed

- 后端 `/{full_path:path}` catch-all 不再吞掉 `/api/*`、`/docs`、`/openapi.json`、`/redoc`、`/health` 等保留前缀；拼写错误的 API 路径会返回 404 而不是静默回 200 + 前端 index。新增 `test_unmatched_api_paths_do_not_fall_through_to_frontend` 回归用例。
- Backend `/{full_path:path}` catch-all no longer swallows `/api/*`, `/docs`, `/openapi.json`, `/redoc`, or `/health`; mistyped API paths now correctly return 404 instead of silently 200 with the frontend index. Covered by a new regression test `test_unmatched_api_paths_do_not_fall_through_to_frontend`.
- 后端 lifespan 启动副作用拆事务：`ensure_seed_data` 与 `create_daily_snapshot` 各自独立 session/事务；boot snapshot 与 scheduler 启动改为 best-effort，失败仅 `logger.warning` 记录，不再阻断整个应用上线。新增 `test_boot_snapshot_failure_is_swallowed_and_does_not_block_startup` 与 `test_scheduler_failure_does_not_block_startup`。
- Backend lifespan side effects now run in independent transactions: `ensure_seed_data` and `create_daily_snapshot` no longer share a session, and the boot snapshot / scheduler start are best-effort — failures log a warning instead of aborting application startup. Covered by two new tests.
- 前端波动率图修复 N/A 一致性：`volatility==null`（样本不足）保持为 `null`，ECharts 留空不画柱体，tooltip 提示"样本不足"；不再强转为 `0`，避免与"真零波动"在 UI 上无法区分。逻辑抽到 `volatilityValues.ts`，新增 `buildVolatilityValues` 与 `formatVolatilityTooltip`，并加单测覆盖。
- Frontend volatility chart now keeps `volatility==null` (insufficient sample) as `null` — ECharts skips the bar and the tooltip shows "样本不足" — instead of coercing to `0`, which previously made "true zero volatility" indistinguishable from "no data". Logic extracted to `volatilityValues.ts` and covered by a unit test.
- 前端 `apiClient` 加固：每个请求挂 `AbortController` + 默认 30s 超时（可配置 `timeoutMs`）；外部传入 `signal` 能与超时合并，超时以 `ApiTimeoutError` 抛出便于上层区分；非 JSON 响应（如反向代理 502 HTML）不再让 `response.json()` 抛 `SyntaxError`，而是统一封装为 `ApiError`（带 `status`/`code`/`message`/响应片段）。新增 `apiTransport.ts` 抽离纯网络底层，`apiClient.ts` 仅做组装；新增 5 个单测覆盖超时、外部取消、非 JSON、合法 JSON、空响应。
- Frontend `apiClient` hardened: every request now sets up an `AbortController` and a default 30 s timeout (overridable via `timeoutMs`); external signals are merged so user cancellation propagates, while timeouts surface as a distinguishable `ApiTimeoutError`. Non-JSON responses (e.g. a 502 HTML page from an upstream proxy) no longer throw `SyntaxError` — they're wrapped as `ApiError` carrying status / code / message / a snippet. The pure transport primitives are split into a new `apiTransport.ts` and covered by five new unit tests.
- 新增前端全局 `AppErrorBoundary`，分别包在 `AppShell` 外层与内部路由 `Suspense` 外层。任何 `React.lazy` chunk 加载失败、渲染期间未捕获异常都会被转为带"重试 / 重新加载"按钮的友好错误页，避免桌面 hash 路由整页白屏不可恢复。
- Add a global `AppErrorBoundary` wrapping both `AppShell` and the inner route `Suspense`. Any `React.lazy` chunk failure or uncaught render-time error now degrades to a friendly error page with retry / reload buttons, instead of leaving the desktop hash router stuck on a blank screen.

### Security

- 后端 CORS 收紧：`allow_methods` 与 `allow_headers` 改为显式白名单（GET/POST/PUT/PATCH/DELETE/OPTIONS；Accept/Authorization/Content-Type/X-Request-Id），不再使用 `*`+`allow_credentials=True` 反模式。允许的源通过 `HBS_CORS_ORIGINS`（逗号分隔）覆盖；空字符串则不挂载 CORS（适配桌面同源场景）。新增 `test_cors_policy.py` 4 个用例锁定行为。
- Backend CORS hardened: replace the `allow_methods=["*"]+allow_credentials=True` anti-pattern with explicit allow-lists for both methods and headers. Allowed origins are now overridable via `HBS_CORS_ORIGINS` (comma-separated); an empty value disables CORS entirely for the desktop same-origin packaging case. Covered by four new tests in `test_cors_policy.py`.
- 后端引入本机 API Token 鉴权：`Settings.require_auth=true` 时所有 `/api/v1/*` 端点必须携带 `X-HBS-Token` 头，使用 `hmac.compare_digest` 防时序攻击；`/health` 公开。桌面打包模式自动启用：Electron 主进程启动时随机生成 32 字节 token，通过环境变量注入 sidecar，并通过 preload 桥接的 `additionalArguments` 透给渲染端，每次后端调用自动附加。新增 `test_api_token_auth.py` 5 个用例与桌面 `preload-bridge` / `config` 共 4 个新用例。
- Add a local API token authentication layer: when `Settings.require_auth=true`, every `/api/v1/*` endpoint requires an `X-HBS-Token` header matched via `hmac.compare_digest`; `/health` stays public. Desktop packaging enables it automatically — Electron main generates a per-process 32-byte token, injects it into the sidecar env, and passes it through preload `additionalArguments` so the renderer sends `X-HBS-Token` on every backend call. Covered by five new backend tests and four new desktop tests.
- Electron 主窗口安全加固：`webPreferences` 显式启用 `sandbox: true`、`webSecurity: true`、`allowRunningInsecureContent: false`；新增 `wireNavigationGuards` 拦截 `web-contents-created`/`will-navigate`/`setWindowOpenHandler`，所有非 `file://` 与非 127.0.0.1 的导航被阻止，外链统一交 `shell.openExternal`；新增 `wireContentSecurityPolicy` 在 default session 注入显式 CSP（`default-src 'self'`、`connect-src 'self' http://127.0.0.1:* http://localhost:*`、禁用内联 script 与 object）。
- Hardened the Electron main window: `webPreferences` now explicitly enables `sandbox: true`, `webSecurity: true`, and `allowRunningInsecureContent: false`. New navigation guards (`web-contents-created` + `will-navigate` + `setWindowOpenHandler`) block any navigation outside `file://` or 127.0.0.1, redirecting external HTTP(S) URLs through `shell.openExternal`. A strict Content-Security-Policy is injected on the default session: `default-src 'self'`, `connect-src` limited to localhost sidecar, inline scripts and `object-src` denied.
- 桌面更新链路引入 SHA-256 完整性校验：每个 release 必须配套 `<assetName>.sha256` 文件；`pickUpdateCandidate` 解析后写入 `state.sha256AssetUrl`；下载阶段先取期望摘要，再用 `crypto.createHash('sha256')` 在流式写入磁盘的同时计算实际摘要，校验失败立刻删掉下载包并报错；缺少 `.sha256` 资产时直接拒绝下载（hard gate，防 MITM 注入恶意更新包）。新增 `parseSha256File`、`verifySha256`、`findSha256AssetUrl` 三个工具函数与 4 个单测。
- Add SHA-256 integrity verification to the desktop auto-update flow: every release must publish `<assetName>.sha256`; `pickUpdateCandidate` surfaces the URL on `state.sha256AssetUrl`. Downloads now stream-hash with `crypto.createHash('sha256')`, fetch the expected digest, and discard the file on mismatch. Releases without an `.sha256` companion are refused outright (hard gate against MITM-injected installers). Three new utilities (`parseSha256File`, `verifySha256`, `findSha256AssetUrl`) covered by four new tests.
- 桌面更新安装阶段改为 backup→swap→cleanup：旧 app 不再 `rm -rf` 后再 ditto，而是先 `mv` 到 `userData/updates/backup/previous-*.app`；新 app `ditto` 成功后才删备份；`ditto` 失败立刻从备份还原；只有常规路径完全失败才走 `osascript do shell script with administrator privileges` fallback。同时 `buildDetachedInstallScript` 接口新增必填 `backupPath`，新增回滚路径回归测试。
- The desktop installer no longer `rm -rf`s the old app before `ditto`. It now `mv`s the previous app into `userData/updates/backup/previous-*.app`, runs `ditto` to swap in the new build, and only deletes the backup on success. Any failure restores the previous app from backup; the admin-privileged fallback is reserved for the worst case. `buildDetachedInstallScript` now requires `backupPath` and is covered by a new rollback regression test.
- 后端 migration 导入新增 SQLite 文件级备份：在 `_restore_package` 删除并重建数据之前，先把当前 SQLite 数据库 best-effort 拷贝到 `Settings.storage_dir/backups/migration-<UTC>.db`，作为最后一道安全网；备份失败仅 `logger.warning`，不会阻塞导入主流程。新增 `_create_sqlite_backup_before_import` 工具与 2 个单测覆盖 db 存在 / db 不存在两种情况。
- Backend migration import now creates a file-level SQLite backup before tearing down and restoring data. The current database is best-effort copied to `Settings.storage_dir/backups/migration-<UTC>.db`; failures only log a warning and never block the import. Two new unit tests cover both the "db file exists" and "db file missing" paths.
- 后端 SQLite pragma 加固：连接时新增 `busy_timeout=5000`、`synchronous=NORMAL`，缓解 scheduler + http 并发写造成的 `SQLITE_BUSY`，并在 WAL 模式下保留崩溃安全的同时减少 fsync 频次。
- Harden the SQLite connection PRAGMAs: enable `busy_timeout=5000` and `synchronous=NORMAL` on top of `journal_mode=WAL` to reduce `SQLITE_BUSY` under concurrent scheduler + HTTP writes while keeping crash safety.
- 后端 APScheduler 配置：cron 作业增加 `misfire_grace_time=3600`、`coalesce=True`、`max_instances=1`，进程被休眠或断电后能至多补跑一次，且不会因为多次错过而雪崩重入；`stop_scheduler` 改为 `shutdown(wait=True)`，避免与 `SessionLocal` 关闭顺序竞态。
- Backend APScheduler hardening: cron jobs now declare `misfire_grace_time=3600`, `coalesce=True`, `max_instances=1` so a sleeping or powered-off machine catches up at most once without re-entrant flooding. `stop_scheduler` now uses `shutdown(wait=True)` to let in-flight jobs settle before the session is closed.
- 后端导入加固：CSV 解码改用 `_decode_csv_bytes` 兜底链（utf-8-sig → gb18030 → gbk → latin-1），Excel 中文导出不再 500；`/api/v1/imports/preview`、`/imports/commit`、`/migration/import` 的上传读取改为分块累加并加上限（CSV 32 MB / 迁移包 256 MB），超过即返回结构化错误。`migration_service._load_package` 新增 zip-bomb 防御：单条目解压上限 256 MB、压缩比上限 200x、整包总解压上限 512 MB；`manifest.json` 单独 1 MB 上限。新增 2 个解码兜底回归测试。
- Hardened backend imports: CSV decoding now falls back through `utf-8-sig → gb18030 → gbk → latin-1` so Excel-exported Chinese files no longer 500. The CSV and migration upload endpoints now stream into memory with hard size limits (32 MB / 256 MB) and reject anything larger with a structured error. `migration_service._load_package` enforces zip-bomb defenses: per-entry decompressed cap (256 MB), compression-ratio cap (200×), total uncompressed cap (512 MB), and a tighter 1 MB cap for `manifest.json`. Two new decoder fallback tests are included.
- 后端 FX 调用增加重试与细粒度超时：`httpx.Timeout(connect=5, read=5, write=5, pool=5)` 替代原来一刀切的 10 s；新增 `_fetch_with_retry` 包装器，最多 2 次退避重试（0.5 s → 1.0 s），失败抛最后一次异常给调用方累计判定降级。
- Backend FX calls now have per-phase timeouts (`connect/read/write/pool=5s`) and a small retry envelope (`_fetch_with_retry`) with two backoff attempts (0.5s → 1.0s) before bubbling the final error up to the caller for graceful degradation.
- `SettingsService.get_settings` 隐式创建路径加并发安全：`session.add + flush` 失败抛 `IntegrityError` 时回滚并重新 `SELECT`，避免两个请求同时落到该路径时撞 UNIQUE 约束或双写。
- `SettingsService.get_settings` now handles concurrent first-time creates safely: an `IntegrityError` triggers a rollback and a re-`SELECT` rather than failing or double-inserting.
- `CategoryService.resolve_path_by_name` 在每个层级 SELECT 上显式 `order_by(Category.id.asc()).limit(1)`，行为不再依赖 SQL 引擎隐式顺序。
- Make `CategoryService.resolve_path_by_name` deterministic by adding explicit `order_by(Category.id.asc()).limit(1)` to each level lookup.
- `app/core/logging.py` 改造：日志 root logger 仅初始化一次（`_logging_initialized` 守护），日志级别支持通过 `HBS_LOG_LEVEL` 环境变量覆盖（默认 `INFO`），不再每次 `get_logger` 调用 `basicConfig` 造成语义混乱。
- Refactor `app/core/logging.py`: initialize the root logger exactly once, honor the `HBS_LOG_LEVEL` env var (default `INFO`), and stop calling `basicConfig` from every `get_logger` invocation.
- 前端 `OverviewPage.holdingsQuery` 改用 `holdings.all()`，与 `EntryPage` 共用缓存，避免页面切换时各自重复请求；新增 `LIGHT_SETTINGS_QUERY_KEYS` / `invalidateLightSettingsQueries`，`SettingsPage` 在 `base_currency` 未变化（仅修改阈值）时使用轻量 invalidate，避免连带刷新 trend / volatility / correlation 等重端点。
- Frontend `OverviewPage.holdingsQuery` now uses the shared `holdings.all()` cache, eliminating duplicate fetches between Overview and Entry. Added `LIGHT_SETTINGS_QUERY_KEYS` and `invalidateLightSettingsQueries`; `SettingsPage` now invalidates only the settings cache when `base_currency` is unchanged so threshold-only edits no longer cascade into trend / volatility / correlation refetches.
- 前端新增 `validateDesktopBridgeShape`，在使用 `__HBS_DESKTOP__` 之前显式校验 `api.json/binary/form` 各方法是否可调用；preload 部分实现时调用方降级到 web fetch 路径，不再直接 TypeError。
- Add `validateDesktopBridgeShape` to runtime.ts; `__HBS_DESKTOP__` is rejected unless `api.json/binary/form` are fully callable, so a partial preload implementation degrades gracefully to the web fetch path instead of throwing TypeError.
- 抽出共享 `frontend/src/utils/formatError.ts`；`ImportPage` 把 `setError(String(e))` 替换为 `setError(formatError(e))`，错误提示不再带 `Error: ` 前缀。
- Add a shared `frontend/src/utils/formatError.ts`. `ImportPage` now formats mutation errors via `formatError(e)` instead of `String(e)`, removing the user-unfriendly `Error: ` prefix.
- 桌面端启动鲁棒性增强：`BACKEND_READY_TIMEOUT_MS` 由 15 s 调到 45 s（适配冷启动慢盘 + PyInstaller 解压）；sidecar 启动期 exit 通过 `rejectStartup` 立即上报真实退出码/信号，不再被 health 轮询超时吞掉；`backend-controller.stop` 在 SIGTERM 之外加 4 s 后 SIGKILL fallback，避免 PyInstaller 二进制忽略信号变僵尸。
- Desktop startup robustness: `BACKEND_READY_TIMEOUT_MS` raised from 15 s to 45 s for cold-disk + PyInstaller boot; sidecar exits during startup now bubble the real code/signal through `rejectStartup` instead of being swallowed by the health poll timeout; `backend-controller.stop` now schedules a SIGKILL fallback 4 s after SIGTERM so a stubborn PyInstaller binary cannot leak as a zombie.
- 桌面端启动期清理：`UpdateController.start` 现在删除 `userData/updates/` 下超过 7 天的 `install-update-*.sh` 临时脚本与 `backup/previous-*.app` 备份，长期使用不再无限堆积。
- Desktop startup cleanup: `UpdateController.start` now deletes `install-update-*.sh` scripts and `backup/previous-*.app` directories older than 7 days under `userData/updates/`, preventing unbounded accumulation over time.
- 后端 `Settings.app_version` 与 `/health` 暴露版本：`/health` 响应除 `status` 外现在还返回 `app_name / app_version / app_env`，便于桌面更新链路与运维做版本自检；`alembic env.py` 强制读 `Settings.database_url`，不再受 `alembic.ini` 中硬编码相对路径影响。
- Backend now exposes the application version through `/health` (`app_name / app_version / app_env`) and forces Alembic's `env.py` to use `Settings.database_url` instead of the hard-coded relative path in `alembic.ini`. Smoke / static-hosting / auth tests updated accordingly.
- 文档修正：`AGENTS.md` 删除了对不存在模型 `gpt-5.4` 的硬编码引用，改为遵循 harness/CLI 默认。
- Docs: remove the bogus `gpt-5.4` model pin from `AGENTS.md`; subagent model selection now follows the harness/CLI default.
- 杂项清理：`backend/app/api/v1/categories.py` 删除被 `Query.pattern` 已覆盖的死代码二次校验；`frontend/src/components/charts/ECharts.tsx` 默认开启 `notMerge` + `lazyUpdate`，分析筛选切换时不再残留旧 series；`.gitignore` 补全 `.venv-x64/`、`.coverage`、`htmlcov/`、`*.egg-info/`；`backend/pytest.ini` 加 `--strict-markers`、`testpaths=tests` 与 `-ra`，过滤无关 DeprecationWarning。
- Misc cleanup: drop unreachable second-pass validation in `categories.py` (already gated by `Query.pattern`); enable `notMerge` + `lazyUpdate` by default in the shared `ECharts` wrapper so analytics filter switches don't leave stale series; broaden `.gitignore` (`.venv-x64/`, `.coverage`, `htmlcov/`, `*.egg-info/`); expand `backend/pytest.ini` with `--strict-markers`, `testpaths=tests`, `-ra`, and a clean `filterwarnings`.
- 前端整体 UI/UX 重构（参考 OutcomeIQ 风格 dashboard 设计）：重写设计 tokens（浅冷灰背景、纯白卡片、柔和阴影、克制色彩、Inter 字体），扩展 Tailwind theme（`surface.subtle/strong`、`chart.1~6`、`shadow.card/elevated/ring`、新 keyframes）；`Card` 默认 `rounded-2xl` + 极浅边线 + `shadow-card`，`Button` 圆角 xl + focus ring 阴影 + 新增 subtle variant，`Input` focus 浅蓝阴影 ring，`Badge` 增加 `outline/warning` 等更现代的色卡。`AppShell` 重写为白色侧栏 + 主导航/系统分组 + 选中态浅蓝高亮 + 顶部搜索框（含 `⌘K` 提示）+ 通知按钮 + 用户身份 chip；新增 `PageHeader` 组件统一 6 个页面的标题区（eyebrow + 标题 + 描述 + actions），`OverviewPage` 的 `MetricCard` 改为大数字 + 颜色 chip 趋势 + accent 图标方块，再平衡预警 grid 改为悬浮抬升的 surface 卡。
- Major frontend UI/UX refresh (OutcomeIQ-style dashboard direction): rewrite design tokens (cool light-gray surface, pure white cards, soft shadows, restrained palette, Inter typeface) and extend the Tailwind theme (`surface.subtle/strong`, `chart.1~6`, `shadow.card/elevated/ring`, new keyframes). `Card` now defaults to `rounded-2xl` with a hairline border and `shadow-card`; `Button` gains focus-ring box-shadow and a subtle variant; `Input` shows a soft blue shadow on focus; `Badge` gets new `outline / warning` shapes. `AppShell` is rebuilt into a white sidebar with grouped Main / System nav, accent-blue active state, plus a top search bar (with `⌘K`), notification button, and an identity chip. A new `PageHeader` component unifies the title block (eyebrow + title + description + actions) across all six pages, and the Overview `MetricCard` is upgraded with large tabular numerals, colored delta chips, and an accent icon tile; rebalance alerts grid uses hoverable surface cards.

### Removed

### Deprecated

### Security

## [0.1.3] - 2026-04-01

### Added

- 桌面端：完整收口自动更新链路与候选下载流程。
- Desktop: finalize the auto-update workflow including release candidate download flow.
- 后端：快照 payload schema 引入版本号字段，便于后续兼容性识别。
- Backend: add a `schema_version` field to snapshot payload for forward-compatible parsing.

### Changed

- 后端：拆分启动副作用阶段（schema 初始化 / 默认数据 / 首日快照 / 调度器），各阶段独立可观察。
- Backend: split startup side effects (schema init, seed data, daily snapshot, scheduler) into independently observable stages.
- 后端：引入独立的 schema migration 体系（`backend/db_migrations/`）并拆分服务编排。
- Backend: introduce a dedicated schema migration framework under `backend/db_migrations/` and refactor service orchestration.
- 前端：统一查询键命名与缓存失效策略；拆分录入页与分析页主要展示区块。
- Frontend: unify React Query keys and invalidation strategy; split entry / analytics page sections.
- 桌面：收窄 preload bridge 暴露面，仅保留必要 API；细化健康检查超时与失败分类。
- Desktop: narrow the preload bridge surface to a minimal API and refine the health-check timeout / failure taxonomy.
- 测试：用行为测试替代部分脆弱的源码字符串断言。
- Tests: replace brittle source-string assertions with behavior-level tests.

### Fixed

- 桌面：更新候选逻辑边界与失败状态恢复。
- Desktop: tighten update-candidate boundary handling and recover from failed update states.
- 后端：收紧家庭范围过滤（family scope），补跨家庭隔离回归测试。
- Backend: tighten family-scope filtering and add cross-family isolation regression tests.
- 后端：拆解 CSV 导入错误报告与持仓重估值流程，避免一处失败连带回滚。
- Backend: split CSV import error reporting and holding revaluation flows so one failure no longer cascades.
- 时区：统一只读时区语义，避免 UI/调度/业务日期之间漂移。
- Timezone: unify the read-only timezone semantics across UI, scheduler, and business-date paths.

## [0.1.2] - 2026-03-22

### Added

- 录入页：压缩"目标占比摘要"区域并补完汇总展示。
- Entry page: compact the target-ratio summary area and complete the rollup view.
- 分析看板：完善时间快捷区间，新增"全时段"默认行为。
- Analytics dashboard: enrich quick date-range presets and default to a full-range view.

### Fixed

- 修正目标占比摘要的加载态与精度判断。
- Fix loading state and precision logic for the target-ratio summary.
- 修复分析看板日期选择器样式与交互。
- Fix layout and interaction of the analytics date picker.
- 修复分析看板默认全时段文案与边界逻辑。
- Fix copy and edge-case logic for the analytics default-full-range mode.
- 修复网页分析看板与桌面运行时模式下的若干差异问题。
- Fix various behavioral differences between web analytics and the desktop runtime.

### Changed

- README 更新桌面客户端优先使用说明。
- README: clarify the desktop-first end-user workflow.

## [0.1.1] - 2026-03-21

### Added

- 桌面端：新增 GitHub Release 更新检测与安装提醒。
- Desktop: add update detection through GitHub Releases with install prompts.
- 桌面端：完成 macOS DMG 发布链路与桌面桥接边界收敛。
- Desktop: finalize the macOS DMG release pipeline and tighten the desktop bridge boundary.

### Changed

- 统一"家庭资产负债表"产品命名并加固本地体验。
- Align the "Household Balance Sheet" naming and harden the local-first experience.
- 文档：更新 worktree 开发约束。
- Docs: update worktree workflow guidance.

## [0.1.0] - 2026-03-15

### Added

- 首个发版：本地优先的家庭资产负债管理系统（FastAPI + React + Electron）。
- First release: a local-first household balance-sheet management system (FastAPI + React + Electron).
- 录入：资产/负债录入流程、目标占比、目标偏差提示。
- Entry: asset / liability entry flow with target-ratio and deviation hints.
- 分析：总览、趋势、波动率、相关性矩阵、桑基图、币种概览。
- Analytics: overview, trend, volatility, correlation matrix, Sankey, and currency overview.
- 导入导出：CSV 导入与迁移包导入导出工作流。
- Import / export: CSV import and full migration-package import/export workflow.
- 数据：精选资产/负债类目树，支持时区只读、币种与汇率（frankfurter）。
- Data: curated asset / liability category tree, read-only timezone, currency and FX (frankfurter).
- 桌面：Electron 壳层，PyInstaller 打包后端 sidecar，启动加载页/错误页。
- Desktop: Electron shell with PyInstaller backend sidecar, startup loading and error pages.

### Fixed

- 修复成员删除与桑基图标签问题。
- Fix member deletion and Sankey label issues.
- 清理 UTC 处理与构建告警。
- Clean up UTC handling and build warnings.

### Changed

- 完成设置约束、时区统一与界面交互升级。
- Complete settings constraints, timezone unification, and UI/UX upgrades.
- 用 Tailwind + shadcn 风格重构前端 UI/UX。
- Rebuild frontend UI/UX in Tailwind + shadcn style.

[Unreleased]: https://github.com/NotWizard/HouseholdBalanceSheet/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/NotWizard/HouseholdBalanceSheet/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/NotWizard/HouseholdBalanceSheet/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/NotWizard/HouseholdBalanceSheet/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NotWizard/HouseholdBalanceSheet/releases/tag/v0.1.0
