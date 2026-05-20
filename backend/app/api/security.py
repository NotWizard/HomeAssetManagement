"""本机 API 鉴权依赖项。

当 `Settings.require_auth=True` 时，所有挂在受保护 router 下的端点都必须携带
`X-HBS-Token` 请求头，且其值与 `Settings.api_token` 完全一致。

`/health` 与前端静态文件路由不受影响 —— 它们不应用此依赖。
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status


def verify_api_token(x_hbs_token: str | None = Header(default=None)) -> None:
    # 在函数内部 import，使得测试中 reload(config_module) 能反映最新设置；
    # 顶层 import 会绑定到首次加载时的 get_settings 函数对象，导致后续 reload 失效。
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.require_auth:
        return

    expected = settings.api_token or ""
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="API token is not configured",
        )

    if x_hbs_token is None or not hmac.compare_digest(x_hbs_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API token",
            headers={"WWW-Authenticate": "Token"},
        )
