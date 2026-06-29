from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Household Balance Sheet"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8000
    # 与 frontend/package.json + desktop/package.json 同步；用于 /health 暴露给运维与桌面更新链路自检。
    app_version: str = "0.3.3"

    # Local SQLite database path.
    database_url: str = "sqlite:///./backend/data/app.db"

    base_currency: str = "CNY"
    timezone: str = "Asia/Shanghai"
    rebalance_threshold_pct: float = 5.0
    enable_scheduler: bool = True
    enable_bootstrap_snapshot: bool = True

    fx_primary_url: str = (
        "https://www.chinamoney.com.cn/ags/ms/cm-u-bk-ccpr/CcprHisNew"
    )
    fx_fallback_url: str = "https://api.frankfurter.dev/v1"

    storage_dir: str = "backend/data"
    frontend_dist_dir: str | None = None

    # CORS：默认仅允许本机 dev 前端；可通过 HBS_CORS_ORIGINS=逗号分隔列表 覆盖。
    # 留空字符串表示禁用 CORS（适用于桌面打包同源场景）。
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # 本机 API 鉴权：require_auth=True 时所有 /api/v1 端点都需要 X-HBS-Token 头匹配 api_token。
    # 桌面打包模式应启用；dev/test 默认关闭以减少摩擦。
    require_auth: bool = False
    api_token: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HBS_")

    def ensure_storage_dirs(self) -> None:
        Path(self.storage_dir).mkdir(parents=True, exist_ok=True)
        Path(self.storage_dir, "import_errors").mkdir(parents=True, exist_ok=True)

    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_storage_dirs()
    return settings
