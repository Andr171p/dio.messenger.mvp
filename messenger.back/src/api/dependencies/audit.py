from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.audit.repositories import AuditRepository
from src.infra.database.repositories.audit import SqlAlchemyAuditRepository


def get_audit_repository(session: DBSession) -> AuditRepository:
    return SqlAlchemyAuditRepository(session)


AuditRepositoryDep = Annotated[AuditRepository, Depends(get_audit_repository)]
