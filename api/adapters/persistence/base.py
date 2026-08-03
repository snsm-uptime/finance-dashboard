"""Declarative base — ORM models register on this metadata."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
