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
ARG UV_SYNC_ARGS=--no-dev
# shell form — do NOT use exec-form RUN with unexpanded/unsplit args
RUN uv sync --frozen ${UV_SYNC_ARGS}

COPY domain ./domain
COPY application ./application
COPY adapters ./adapters
COPY api ./api
COPY alembic.ini ./
COPY scripts ./scripts

RUN chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

CMD ["python", "-m", "scripts.entrypoint"]
