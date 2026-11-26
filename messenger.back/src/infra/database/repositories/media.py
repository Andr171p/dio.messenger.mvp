from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import get_constraint_name, is_unique_violation
from sqlalchemy import String, cast, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.media.dtos import MediaGalleryKeyDTO, MediaGalleryPositionDTO
from src.domain.media import MediaAsset, MediaObject, MediaObjectRole, MediaStatus, UploadTargetType
from src.infra.database.models import MediaAssetOrm, MediaObjectOrm, MessageMediaOrm, MessageOrm


class MediaMapper:
    @staticmethod
    def to_model(entity: MediaAsset) -> MediaAssetOrm:
        return MediaAssetOrm(
            id=entity.id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            deleted_at=entity.deleted_at,
            organization_id=entity.organization_id,
            owner_id=entity.owner_id,
            filename=entity.filename,
            content_type=entity.content_type,
            size=entity.size,
            status=entity.status.value,
            target_type=entity.target_type.value,
            conversation_id=entity.conversation_id,
            meta=entity.meta,
        )

    @staticmethod
    def from_model(model: MediaAssetOrm, objects: list[MediaObjectOrm] | None = None) -> MediaAsset:
        object_rows = objects or []
        return MediaAsset(
            id=model.id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            deleted_at=model.deleted_at,
            organization_id=model.organization_id,
            owner_id=model.owner_id,
            filename=model.filename,
            content_type=model.content_type,
            size=model.size,
            status=MediaStatus(model.status),
            target_type=UploadTargetType(model.target_type),
            conversation_id=model.conversation_id,
            meta=model.meta,
            objects=[
                MediaObject(
                    id=item.id,
                    asset_id=item.asset_id,
                    role=MediaObjectRole(item.role),
                    key=item.key,
                    content_type=item.content_type,
                    size=item.size,
                )
                for item in object_rows
            ],
        )


class SqlAlchemyMediaRepository(SqlAlchemyRepository[MediaAsset, MediaAssetOrm]):
    model = MediaAssetOrm
    data_mapper = MediaMapper()

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session)

    async def _load_objects(self, asset_id: UUID) -> list[MediaObjectOrm]:
        stmt = select(MediaObjectOrm).where(MediaObjectOrm.asset_id == asset_id)
        result = await self._session.scalars(stmt)
        return list(result.all())

    async def read(self, uid: UUID) -> MediaAsset | None:
        model = await self._session.get(MediaAssetOrm, uid)
        if model is None:
            return None
        objects = await self._load_objects(uid)
        return MediaMapper.from_model(model, objects)

    async def create(self, entity: MediaAsset) -> MediaAsset:
        try:
            self._session.add(MediaMapper.to_model(entity))
            for item in entity.objects:
                self._session.add(
                    MediaObjectOrm(
                        id=item.id,
                        asset_id=item.asset_id,
                        role=item.role.value,
                        key=item.key,
                        content_type=item.content_type,
                        size=item.size,
                    )
                )
            await self._session.flush()
        except IntegrityError as exc:
            constraint = get_constraint_name(exc)
            if is_unique_violation(exc):
                raise UniqueConstraintViolationError(
                    f"Unique constraint violation error: {constraint}.",
                ) from exc
            raise
        return entity

    async def update(self, entity: MediaAsset) -> None:
        await self._session.merge(MediaMapper.to_model(entity))
        await self._session.execute(delete(MediaObjectOrm).where(MediaObjectOrm.asset_id == entity.id))
        for item in entity.objects:
            self._session.add(
                MediaObjectOrm(
                    id=item.id,
                    asset_id=item.asset_id,
                    role=item.role.value,
                    key=item.key,
                    content_type=item.content_type,
                    size=item.size,
                )
            )
        await self._session.flush()

    async def link_to_message(self, *, message_id: UUID, asset_ids: list[UUID], start_position: int = 0) -> None:
        for position, asset_id in enumerate(asset_ids, start=start_position):
            self._session.add(
                MessageMediaOrm(
                    message_id=message_id,
                    asset_id=asset_id,
                    position=position,
                )
            )
        await self._session.flush()

    async def get_attached_message_seq(self, asset_id: UUID) -> int | None:
        stmt = (
            select(MessageOrm.created_seq)
            .join(MessageMediaOrm, MessageMediaOrm.message_id == MessageOrm.id)
            .where(MessageMediaOrm.asset_id == asset_id)
            .order_by(MessageOrm.created_seq.asc())
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def get_gallery_position(
        self, *, conversation_id: UUID, asset_id: UUID, message_id: UUID,
        history_from_seq: int, media_kind: str,
    ) -> MediaGalleryPositionDTO | None:
        order = (MessageOrm.created_seq, MessageMediaOrm.position)
        sent_as_file = MessageOrm.content["blocks"].contains(
            func.jsonb_build_array(
                func.jsonb_build_object(
                    "type", "media", "assetId", cast(MessageMediaOrm.asset_id, String),
                    "presentation", "file",
                )
            )
        )
        gallery = (
            select(
                MessageMediaOrm.asset_id,
                MessageMediaOrm.message_id,
                MessageOrm.sender_id,
                MessageOrm.created_at.label("sent_at"),
                func.row_number().over(order_by=order).label("position"),
                func.count().over().label("total"),
                func.lag(MessageMediaOrm.asset_id).over(order_by=order).label("previous_asset"),
                func.lag(MessageMediaOrm.message_id).over(order_by=order).label("previous_message"),
                func.lead(MessageMediaOrm.asset_id).over(order_by=order).label("next_asset"),
                func.lead(MessageMediaOrm.message_id).over(order_by=order).label("next_message"),
            )
            .select_from(MessageMediaOrm)
            .join(MessageOrm, MessageOrm.id == MessageMediaOrm.message_id)
            .join(MediaAssetOrm, MediaAssetOrm.id == MessageMediaOrm.asset_id)
            .where(
                MessageOrm.conversation_id == conversation_id,
                MessageOrm.created_seq >= history_from_seq,
                MessageOrm.deleted_at.is_(None),
                MediaAssetOrm.status == MediaStatus.READY.value,
                MediaAssetOrm.deleted_at.is_(None),
                MediaAssetOrm.content_type.startswith(f"{media_kind}/"),
                MediaAssetOrm.organization_id == MessageOrm.organization_id,
                ~func.coalesce(sent_as_file, False),
            )
            .subquery()
        )
        result = await self._session.execute(select(gallery).where(
            gallery.c.asset_id == asset_id, gallery.c.message_id == message_id,
        ))
        row = result.mappings().one_or_none()
        if row is None:
            return None
        return MediaGalleryPositionDTO(
            position=row["position"], total=row["total"],
            sender_id=row["sender_id"], sent_at=row["sent_at"],
            previous=MediaGalleryKeyDTO(
                asset_id=row["previous_asset"], message_id=row["previous_message"],
            ) if row["previous_asset"] else None,
            next=MediaGalleryKeyDTO(
                asset_id=row["next_asset"], message_id=row["next_message"],
            ) if row["next_asset"] else None,
        )

    async def claim_for_scanning(self, *, limit: int = 10) -> list[MediaAsset]:
        stmt = (
            select(MediaAssetOrm)
            .where(
                MediaAssetOrm.status.in_(
                    (MediaStatus.UPLOADED.value, MediaStatus.SCANNING.value),
                )
            )
            .order_by(MediaAssetOrm.created_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        )
        rows = list((await self._session.scalars(stmt)).all())
        if not rows:
            return []

        claimed: list[MediaAsset] = []
        for model in rows:
            objects = await self._load_objects(model.id)
            asset = MediaMapper.from_model(model, objects)
            asset.mark_scanning()
            model.status = asset.status.value
            await self._session.flush()
            claimed.append(asset)
        return claimed
