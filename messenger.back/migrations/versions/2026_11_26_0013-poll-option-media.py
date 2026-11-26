import sqlalchemy as sa
from alembic import op

revision = "m3a4b5c6d7e8"
down_revision = "l2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("polls", sa.Column("description", sa.String(1000)))
    op.add_column("poll_options", sa.Column("link", sa.String(2083)))
    op.add_column("poll_options", sa.Column("asset_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_poll_options_asset", "poll_options", "media_assets", ["asset_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_poll_options_asset", "poll_options", type_="foreignkey")
    op.drop_column("poll_options", "asset_id")
    op.drop_column("poll_options", "link")
    op.drop_column("polls", "description")
