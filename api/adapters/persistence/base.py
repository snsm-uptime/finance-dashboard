"""Declarative base — domain models land in later stories."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
