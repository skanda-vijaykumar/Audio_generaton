"""Entry point — run with `python -m api.run` from the project root."""

import uvicorn

from api.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "api.server:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
