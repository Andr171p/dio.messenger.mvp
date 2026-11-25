"""Group profiles and standalone group topics."""
import sqlalchemy as sa
from alembic import op

revision = "j0d1e2f3a4b5"
down_revision = "i9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("description", sa.String(1024)))
    op.add_column("conversations", sa.Column("avatar_url", sa.Text()))
    op.add_column("conversation_threads", sa.Column("event_seq", sa.BigInteger(), nullable=False, server_default="0"))
    op.execute("""
        UPDATE conversation_threads t SET event_seq = e.seq
        FROM conversation_events e
        WHERE e.conversation_id = t.conversation_id AND e.type = 'thread.created'
          AND e.payload->>'threadId' = t.id::text
    """)
    op.execute("""
        UPDATE conversation_threads t SET event_seq = m.created_seq
        FROM messages m WHERE t.event_seq = 0 AND t.root_message_id = m.id
    """)
    op.alter_column("conversation_threads", "root_message_id", nullable=True)


def downgrade() -> None:
    op.execute("UPDATE messages SET thread_id = NULL WHERE thread_id IN "
               "(SELECT id FROM conversation_threads WHERE root_message_id IS NULL)")
    op.execute("DELETE FROM conversation_threads WHERE root_message_id IS NULL")
    op.alter_column("conversation_threads", "root_message_id", nullable=False)
    op.drop_column("conversation_threads", "event_seq")
    op.drop_column("conversations", "avatar_url")
    op.drop_column("conversations", "description")
