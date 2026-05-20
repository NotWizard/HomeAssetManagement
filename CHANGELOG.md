# Changelog

本文件记录本仓库的所有重要代码变更。

格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本 SemVer 2.0.0](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- 新增项目级 Claude Code subagent：`security-reviewer`（安全审查专员，覆盖鉴权/CORS/上传解析/Electron webPreferences/桌面更新链路等敏感面）与 `migration-guard`（迁移与数据生命周期守门人，覆盖 alembic 链路、模型/迁移一致性、导入导出回滚、桌面 DB 路径漂移）。位于 `.claude/agents/`。
- Add project-scoped Claude Code subagents `security-reviewer` and `migration-guard` under `.claude/agents/` to guard security-sensitive surfaces and database migration / data-lifecycle changes.
- 新增 `backend/requirements.lock`：完整 transitive 依赖锁定文件，与 `requirements.txt` 配套，保证可复现构建。
- Add `backend/requirements.lock` capturing the full transitive dependency lock alongside the human-edited `requirements.txt` for reproducible builds.

### Changed

- `backend/requirements.txt` 与 `backend/requirements-desktop.txt` 全部依赖改为精确版本 pin（`fastapi==0.136.1`、`sqlalchemy==2.0.49`、`pyinstaller==6.20.0` 等），消除"任意一次重装都可能拉到含 CVE / 破坏性更新版本"的风险。
- Pin every dependency in `backend/requirements.txt` and `backend/requirements-desktop.txt` to exact versions so reinstalls cannot silently pull a vulnerable or breaking release.

### Fixed

### Removed

### Deprecated

### Security
