import logging
import os

_LOG_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"
_LOG_LEVEL_ENV = "HBS_LOG_LEVEL"
_logging_initialized = False


def _init_root_logging() -> None:
    """初始化根 logger，仅一次。后续 get_logger 调用复用同一份 handler。"""
    global _logging_initialized
    if _logging_initialized:
        return
    level_name = os.environ.get(_LOG_LEVEL_ENV, "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root = logging.getLogger()
    if not root.handlers:
        # 仅在尚未配置 handler 时才安装；避免与 uvicorn / pytest 内置 handler 重复
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_LOG_FORMAT))
        root.addHandler(handler)
    root.setLevel(level)
    _logging_initialized = True


def get_logger(name: str) -> logging.Logger:
    _init_root_logging()
    return logging.getLogger(name)
