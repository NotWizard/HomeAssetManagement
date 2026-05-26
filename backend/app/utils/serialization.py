from decimal import Decimal
from typing import Any

import orjson


# Centralized conversion helper for Decimal in JSON payloads.
def decimal_to_float(value: Decimal | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _orjson_default(obj: Any) -> Any:
    """orjson 默认不支持 Decimal；snapshot payload 已用 decimal_to_float 抹平了，
    这里仅作兜底，遇到漏掉的 Decimal 也以字符串编码而不是 raise。"""
    if isinstance(obj, Decimal):
        return str(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def dumps(obj: Any) -> str:
    """orjson 等价 json.dumps(obj, ensure_ascii=False)：返回 UTF-8 str。"""
    return orjson.dumps(obj, default=_orjson_default).decode("utf-8")


def dumps_bytes(obj: Any) -> bytes:
    """直接返回 orjson 的原生 bytes，写文件 / zip entry 时可以避免一次 decode/encode。"""
    return orjson.dumps(obj, default=_orjson_default)


def loads(data: str | bytes | bytearray | memoryview) -> Any:
    return orjson.loads(data)
