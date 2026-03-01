from typing import Any


def ok(data: Any = None, message: str = "ok") -> dict[str, Any]:
    return {"code": 0, "message": message, "data": data, "trace_id": None}


def err(code: int, message: str) -> dict[str, Any]:
    return {"code": code, "message": message, "data": None, "trace_id": None}
