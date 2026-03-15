import uvicorn

from app.main import app
from app.main import settings


def main() -> None:
    uvicorn.run(
        app,
        host=settings.app_host,
        port=settings.app_port,
        reload=False,
    )


if __name__ == "__main__":
    main()
