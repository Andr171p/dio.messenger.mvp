import sqlalchemy as sa
from alembic import op

revision = "l2f3a4b5c6d7"
down_revision = "k1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "poll_vote_operations",
        sa.Column("poll_id", sa.Uuid(), sa.ForeignKey("polls.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("voter_id", sa.Uuid(), primary_key=True),
        sa.Column("operation_id", sa.Uuid(), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("poll_vote_operations")
