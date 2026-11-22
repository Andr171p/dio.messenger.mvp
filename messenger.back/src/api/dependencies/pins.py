from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.pins.repositories import PinRepository
from src.infra.database.repositories.pins import SqlAlchemyPinRepository


def get_pin_repository(session: DBSession) -> PinRepository:
    return SqlAlchemyPinRepository(session)


PinRepositoryDep = Annotated[PinRepository, Depends(get_pin_repository)]

__all__ = ["PinRepositoryDep"]