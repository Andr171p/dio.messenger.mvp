import sqlalchemy as sa
from alembic import op

revision = "k1e2f3a4b5c6"
down_revision = "j0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("show_voters", "allows_revoting"):
        op.add_column("polls", sa.Column(name, sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        "conversation_read_advances",
        sa.Column("membership_id", sa.Uuid(), sa.ForeignKey("conversation_members.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("through_seq", sa.BigInteger(), primary_key=True),
        sa.Column("after_seq", sa.BigInteger(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("conversation_read_advances")
    op.drop_column("polls", "allows_revoting")
    op.drop_column("polls", "show_voters")
