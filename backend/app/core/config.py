from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Home Asset Management"
    app_env: str = "dev"
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    # Local SQLite database path.
    database_url: str = "sqlite:///./backend/data/app.db"

    base_currency: str = "CNY"
    timezone: str = "Asia/Shanghai"
    rebalance_threshold_pct: float = 5.0
    enable_scheduler: bool = True

    fx_primary_url: str = "https://api.frankfurter.app"
    fx_fallback_url: str = "https://api.exchangerate.host"

    storage_dir: str = "backend/data"
    frontend_dist_dir: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_prefix="HAM_")

    def ensure_storage_dirs(self) -> None:
        Path(self.storage_dir).mkdir(parents=True, exist_ok=True)
        Path(self.storage_dir, "import_errors").mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_storage_dirs()
    return settings
