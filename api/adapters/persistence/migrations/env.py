import os
from logging.config import fileConfig

from adapters.persistence import models as _models  # noqa: F401 — register tables on metadata
from adapters.persistence.base import Base
from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

_DEFAULT_URL = "postgresql+psycopg://finance:finance_dev_change_me@localhost:5432/finance_helper"


def get_url() -> str:
    env_url = (os.environ.get("DATABASE_URL") or "").strip()
    if env_url:
        return env_url
    ini_url = (config.get_main_option("sqlalchemy.url") or "").strip()
    if ini_url and not ini_url.startswith("driver://"):
        return ini_url
    return _DEFAULT_URL


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
