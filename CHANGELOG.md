# Changelog

本文件记录本仓库的所有重要代码变更。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 SemVer 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 新增项目级 Claude Code subagent：`security-reviewer`（安全审查专员，覆盖鉴权/CORS/上传解析/Electron webPreferences/桌面更新链路等敏感面）与 `migration-guard`（迁移与数据生命周期守门人，覆盖 alembic 链路、模型/迁移一致性、导入导出回滚、桌面 DB 路径漂移）。位于 `.claude/agents/`。
- Add project-scoped Claude Code subagents `security-reviewer` and `migration-guard` under `.claude/agents/` to guard security-sensitive surfaces and database migration / data-lifecycle changes.
- 新增 `backend/requirements.lock`：完整 transitive 依赖锁定文件，与 `requirements.txt` 配套，保证可复现构建。
- Add `backend/requirements.lock` capturing the full transitive dependency lock alongside the human-edited `requirements.txt` for reproducible builds.
- 新增 `.github/workflows/ci.yml`：在 push/PR 上跑 backend pytest、frontend typecheck+build+`node --test`、desktop typecheck+`node --test` 三个 job，作为最低门禁。
- Add `.github/workflows/ci.yml` to run backend pytest, frontend typecheck/build/`node --test`, and desktop typecheck/`node --test` as the minimum gate on every push and pull request.

### Changed

- `backend/requirements.txt` 与 `backend/requirements-desktop.txt` 全部依赖改为精确版本 pin（`fastapi==0.136.1`、`sqlalchemy==2.0.49`、`pyinstaller==6.20.0` 等），消除"任意一次重装都可能拉到含 CVE / 破坏性更新版本"的风险。
- Pin every dependency in `backend/requirements.txt` and `backend/requirements-desktop.txt` to exact versions so reinstalls cannot silently pull a vulnerable or breaking release.

### Fixed

- 后端 `/{full_path:path}` catch-all 不再吞掉 `/api/*`、`/docs`、`/openapi.json`、`/redoc`、`/health` 等保留前缀；拼写错误的 API 路径会返回 404 而不是静默回 200 + 前端 index。新增 `test_unmatched_api_paths_do_not_fall_through_to_frontend` 回归用例。
- Backend `/{full_path:path}` catch-all no longer swallows `/api/*`, `/docs`, `/openapi.json`, `/redoc`, or `/health`; mistyped API paths now correctly return 404 instead of silently 200 with the frontend index. Covered by a new regression test `test_unmatched_api_paths_do_not_fall_through_to_frontend`.

### Security

- 后端 CORS 收紧：`allow_methods` 与 `allow_headers` 改为显式白名单（GET/POST/PUT/PATCH/DELETE/OPTIONS；Accept/Authorization/Content-Type/X-Request-Id），不再使用 `*`+`allow_credentials=True` 反模式。允许的源通过 `HBS_CORS_ORIGINS`（逗号分隔）覆盖；空字符串则不挂载 CORS（适配桌面同源场景）。新增 `test_cors_policy.py` 4 个用例锁定行为。
- Backend CORS hardened: replace the `allow_methods=["*"]+allow_credentials=True` anti-pattern with explicit allow-lists for both methods and headers. Allowed origins are now overridable via `HBS_CORS_ORIGINS` (comma-separated); an empty value disables CORS entirely for the desktop same-origin packaging case. Covered by four new tests in `test_cors_policy.py`.

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
