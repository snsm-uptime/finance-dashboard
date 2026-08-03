FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    UV_SYSTEM_PYTHON=1 \
    PATH="/app/.venv/bin:$PATH"

RUN pip install --no-cache-dir uv \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin appuser

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY domain ./domain
COPY application ./application
COPY adapters ./adapters
COPY api ./api
COPY alembic.ini ./
COPY scripts ./scripts

USER appuser
EXPOSE 8000

CMD ["python", "-m", "scripts.entrypoint"]
