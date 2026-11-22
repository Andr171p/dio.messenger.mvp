from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.polls import Poll, PollOption
from src.infra.database.models.polls import PollOptionOrm, PollOrm, PollVoteOrm


class SqlAlchemyPollRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, entity: Poll) -> Poll:
        try:
            self._session.add(
                PollOrm(
                    id=entity.id,
                    created_at=entity.created_at,
                    updated_at=entity.updated_at,
                    deleted_at=entity.deleted_at,
                    message_id=entity.message_id,
                    conversation_id=entity.conversation_id,
                    organization_id=entity.organization_id,
                    question=entity.question,
                    allows_multiple=entity.allows_multiple,
                    is_closed=entity.is_closed,
                    created_by=entity.created_by,
                    closed_at=entity.closed_at,
                    closed_by=entity.closed_by,
                )
            )
            for opt in entity.options:
                self._session.add(
                    PollOptionOrm(
                        id=opt.id,
                        created_at=entity.created_at,
                        updated_at=entity.updated_at,
                        poll_id=entity.id,
                        position=opt.position,
                        label=opt.label,
                    )
                )
            await self._session.flush()
        except IntegrityError as exc:
            if is_unique_violation(exc):
                raise UniqueConstraintViolationError(
                    f"Unique constraint violation: {get_constraint_name(exc)}.",
                ) from exc
            raise
        return entity

    async def read(self, poll_id: UUID) -> Poll | None:
        stmt = select(PollOrm).where(PollOrm.id == poll_id, PollOrm.deleted_at.is_(None))
        model = await self._session.scalar(stmt)
        if model is None:
            return None
        return await self._load_poll(model)

    async def get_by_message(self, message_id: UUID) -> Poll | None:
        stmt = select(PollOrm).where(PollOrm.message_id == message_id, PollOrm.deleted_at.is_(None))
        model = await self._session.scalar(stmt)
        if model is None:
            return None
        return await self._load_poll(model)

    async def update(self, entity: Poll) -> None:
        stmt = select(PollOrm).where(PollOrm.id == entity.id)
        model = await self._session.scalar(stmt)
        if model is None:
            return
        model.is_closed = entity.is_closed
        model.closed_at = entity.closed_at
        model.closed_by = entity.closed_by
        model.updated_at = entity.updated_at
        await self._session.flush()

    async def add_vote(self, *, poll_id: UUID, option_id: UUID, voter_id: UUID) -> None:
        try:
            vote = PollVoteOrm(poll_id=poll_id, option_id=option_id, voter_id=voter_id)
            self._session.add(vote)
            await self._session.flush()
        except IntegrityError as exc:
            if is_unique_violation(exc):
                raise UniqueConstraintViolationError(
                    f"Unique constraint violation: {get_constraint_name(exc)}.",
                ) from exc
            raise

    async def remove_votes_for_voter(self, *, poll_id: UUID, voter_id: UUID) -> None:
        stmt = delete(PollVoteOrm).where(
            PollVoteOrm.poll_id == poll_id,
            PollVoteOrm.voter_id == voter_id,
        )
        await self._session.execute(stmt)

    async def count_votes_for_option(self, *, poll_id: UUID, option_id: UUID) -> int:
        stmt = select(func.count()).select_from(PollVoteOrm).where(
            PollVoteOrm.poll_id == poll_id,
            PollVoteOrm.option_id == option_id,
        )
        return int(await self._session.scalar(stmt) or 0)

    async def list_votes_for_poll(self, poll_id: UUID) -> list[tuple[UUID, UUID]]:
        stmt = select(PollVoteOrm.option_id, PollVoteOrm.voter_id).where(PollVoteOrm.poll_id == poll_id)
        rows = (await self._session.execute(stmt)).all()
        return [(row[0], row[1]) for row in rows]

    async def _load_poll(self, model: PollOrm) -> Poll:
        opt_stmt = (
            select(PollOptionOrm)
            .where(PollOptionOrm.poll_id == model.id, PollOptionOrm.deleted_at.is_(None))
            .order_by(PollOptionOrm.position)
        )
        options = [
            PollOption(
                id=opt.id,
                poll_id=opt.poll_id,
                position=opt.position,
                label=opt.label,
            )
            for opt in (await self._session.scalars(opt_stmt)).all()
        ]
        return Poll(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            message_id=model.message_id,
            conversation_id=model.conversation_id,
            organization_id=model.organization_id,
            question=model.question,
            allows_multiple=model.allows_multiple,
            is_closed=model.is_closed,
            created_by=model.created_by,
            closed_at=model.closed_at,
            closed_by=model.closed_by,
            options=options,
        )