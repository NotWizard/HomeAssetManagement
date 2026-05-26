"""holding_item composite indexes

热路径 SELECT holding_item 都是 (family_id, is_deleted, …) 形式：
list_holdings ORDER BY updated_at DESC、build_snapshot_payload 全量加载、
EntryPage filter by member 等。原 baseline 给的 ix_holding_item_is_deleted
和 ix_holding_item_type 都是单列、过滤 selectivity 极低（is_deleted 几乎
都 False，type 只 2 个值），SQLite query planner 实际用不上；改为
(family_id, is_deleted, updated_at) 与 (family_id, member_id, is_deleted)
两条复合索引，前者命中 list_holdings 主排序，后者命中按成员过滤场景。

Revision ID: 20260526_000001
Revises: 20260523_000001
Create Date: 2026-05-26 09:00:00
"""

from __future__ import annotations

from alembic import op


revision = "20260526_000001"
down_revision = "20260523_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_holding_item_is_deleted", table_name="holding_item")
    op.drop_index("ix_holding_item_type", table_name="holding_item")
    op.create_index(
        "ix_holding_item_family_deleted_updated",
        "holding_item",
        ["family_id", "is_deleted", "updated_at"],
        unique=False,
    )
    op.create_index(
        "ix_holding_item_family_member_deleted",
        "holding_item",
        ["family_id", "member_id", "is_deleted"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_holding_item_family_member_deleted", table_name="holding_item")
    op.drop_index("ix_holding_item_family_deleted_updated", table_name="holding_item")
    op.create_index("ix_holding_item_type", "holding_item", ["type"], unique=False)
    op.create_index("ix_holding_item_is_deleted", "holding_item", ["is_deleted"], unique=False)
