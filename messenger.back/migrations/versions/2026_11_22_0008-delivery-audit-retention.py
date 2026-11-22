"""delivery receipts, audit log

Revision ID: h8b9c0d1e2f3
Revises: g7a8b9c0d1e2
Create Date: 2026-11-22 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "h8b9c0d1e2f3"
down_revision: str | Sequence[str] | None = "g7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conversation_members",
        sa.Column("last_delivered_message_seq", sa.BigInteger(), server_default="0", nullable=False),
    )
    op.execute(
        "UPDATE conversation_members SET last_delivered_message_seq = last_read_message_seq"
    )
    op.alter_column("conversation_members", "last_delivered_message_seq", server_default=None)

    op.create_table(
        "audit_events",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=128), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=True),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuid_generate_v7()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_organization_created", "audit_events", ["organization_id", "created_at"])
    op.create_index(
        "ix_audit_events_conversation_created",
        "audit_events",
        ["conversation_id", "created_at"],
        postgresql_where=sa.text("conversation_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_audit_events_conversation_created", table_name="audit_events")
    op.drop_index("ix_audit_events_organization_created", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_column("conversation_members", "last_delivered_message_seq")