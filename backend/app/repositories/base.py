from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class Repository(Generic[ModelT]):
    def __init__(self, session: Session, model: type[ModelT]) -> None:
        self.session = session
        self.model = model

    def add(self, entity: ModelT) -> ModelT:
        self.session.add(entity)
        self.session.flush()
        return entity

    def get(self, entity_id: object) -> ModelT | None:
        return self.session.get(self.model, entity_id)

    def list(self, *, limit: int = 100, offset: int = 0) -> list[ModelT]:
        statement = select(self.model).offset(offset).limit(limit)
        return list(self.session.scalars(statement))

    def delete(self, entity: ModelT) -> None:
        self.session.delete(entity)
        self.session.flush()

