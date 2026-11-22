"""message search fts (pg_trgm + tsvector)

Revision ID: g7a8b9c0d1e2
Revises: f6a7b8c9d0e1
Create Date: 2026-11-22 21:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "g7a8b9c0d1e2"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_SEARCH_TEXT_EXPR = "messenger_message_search_text(content)"
_SEARCH_VECTOR_EXPR = f"to_tsvector('russian', {_SEARCH_TEXT_EXPR})"


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION messenger_message_search_text(content jsonb)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE PARALLEL SAFE
        AS $$
          SELECT COALESCE(
            NULLIF(
              trim((
                SELECT string_agg(COALESCE(elem->>'text', ''), ' ' ORDER BY ordinality)
                FROM jsonb_array_elements(COALESCE(content->'blocks', '[]'::jsonb))
                  WITH ORDINALITY AS t(elem, ordinality)
                WHERE COALESCE(elem->>'type', '') = 'text'
              )),
              ''
            ),
            ''
          );
        $$;
        """
    )

    op.add_column(
        "messages",
        sa.Column(
            "search_text",
            sa.Text(),
            sa.Computed(_SEARCH_TEXT_EXPR, persisted=True),
            nullable=False,
        ),
    )
    op.add_column(
        "messages",
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(_SEARCH_VECTOR_EXPR, persisted=True),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_messages_search_vector_gin",
        "messages",
        ["search_vector"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_messages_search_text_trgm",
        "messages",
        ["search_text"],
        postgresql_using="gin",
        postgresql_ops={"search_text": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_messages_search_text_trgm", table_name="messages")
    op.drop_index("ix_messages_search_vector_gin", table_name="messages")
    op.drop_column("messages", "search_vector")
    op.drop_column("messages", "search_text")
    op.execute("DROP FUNCTION IF EXISTS messenger_message_search_text(jsonb)")