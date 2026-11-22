from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.itsm.repositories import ContextLinkRepository
from src.infra.database.repositories import SqlAlchemyContextLinkRepository
from src.infra.itsm import DioDeskItsmAdapter
from src.infra.services.diodesk import DioDeskTicketsClient

_tickets_client = DioDeskTicketsClient()
_itsm_adapter = DioDeskItsmAdapter(_tickets_client)


def get_context_link_repository(session: DBSession) -> ContextLinkRepository:
    return SqlAlchemyContextLinkRepository(session)


def get_itsm_adapter() -> DioDeskItsmAdapter:
    return _itsm_adapter


def get_diodesk_tickets_client() -> DioDeskTicketsClient:
    return _tickets_client


ContextLinkRepositoryDep = Annotated[ContextLinkRepository, Depends(get_context_link_repository)]
ItsmAdapterDep = Annotated[DioDeskItsmAdapter, Depends(get_itsm_adapter)]

__all__ = [
    "ContextLinkRepositoryDep",
    "ItsmAdapterDep",
    "get_diodesk_tickets_client",
    "get_itsm_adapter",
]
