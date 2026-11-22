"""add conversation_policies for guest/ACL overrides

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-22 20:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: str | Sequence[str] | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversation_policies",
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("allow_external_members", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("allow_forwarding", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("allow_attachments", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("allow_ai", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("max_attachment_bytes", sa.BigInteger(), server_default="25000000", nullable=False),
        sa.Column("message_edit_window_seconds", sa.Integer(), server_default="900", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuid_generate_v7()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", name="uq_conversation_policies_conversation"),
    )


def downgrade() -> None:
    op.drop_table("conversation_policies")
