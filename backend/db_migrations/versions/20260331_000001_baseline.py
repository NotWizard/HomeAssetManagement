"""baseline schema

Revision ID: 20260331_000001
Revises:
Create Date: 2026-03-31 21:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260331_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("level in (1,2,3)", name="ck_category_level"),
        sa.ForeignKeyConstraint(["parent_id"], ["category.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_category_level", "category", ["level"], unique=False)
    op.create_index("ix_category_type", "category", ["type"], unique=False)

    op.create_table(
        "family",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "fx_rate_daily",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("base_currency", sa.String(length=10), nullable=False),
        sa.Column("quote_currency", sa.String(length=10), nullable=False),
        sa.Column("rate", sa.Numeric(precision=20, scale=8), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("is_estimated", sa.Boolean(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "rate_date", "base_currency", "quote_currency", name="uq_fx_rate_daily"
        ),
    )
    op.create_index("ix_fx_rate_daily_base_currency", "fx_rate_daily", ["base_currency"], unique=False)
    op.create_index("ix_fx_rate_daily_quote_currency", "fx_rate_daily", ["quote_currency"], unique=False)
    op.create_index("ix_fx_rate_daily_rate_date", "fx_rate_daily", ["rate_date"], unique=False)

    op.create_table(
        "member",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_member_family_id", "member", ["family_id"], unique=False)

    op.create_table(
        "settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("base_currency", sa.String(length=10), nullable=False),
        sa.Column("timezone", sa.String(length=50), nullable=False),
        sa.Column("rebalance_threshold_pct", sa.Float(), nullable=False),
        sa.Column("fx_provider", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", name="uq_settings_family"),
    )

    op.create_table(
        "snapshot_daily",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("family_id", "snapshot_date", name="uq_snapshot_daily"),
    )
    op.create_index("ix_snapshot_daily_family_id", "snapshot_daily", ["family_id"], unique=False)
    op.create_index("ix_snapshot_daily_snapshot_date", "snapshot_daily", ["snapshot_date"], unique=False)

    op.create_table(
        "snapshot_event",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("trigger_type", sa.String(), nullable=False),
        sa.Column("snapshot_at", sa.DateTime(), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_snapshot_event_family_id", "snapshot_event", ["family_id"], unique=False)
    op.create_index("ix_snapshot_event_snapshot_at", "snapshot_event", ["snapshot_at"], unique=False)

    op.create_table(
        "import_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("updated_rows", sa.Integer(), nullable=False),
        sa.Column("inserted_rows", sa.Integer(), nullable=False),
        sa.Column("failed_rows", sa.Integer(), nullable=False),
        sa.Column("error_report_path", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_import_log_created_at", "import_log", ["created_at"], unique=False)
    op.create_index("ix_import_log_family_id", "import_log", ["family_id"], unique=False)

    op.create_table(
        "holding_item",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("family_id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category_l1_id", sa.Integer(), nullable=False),
        sa.Column("category_l2_id", sa.Integer(), nullable=False),
        sa.Column("category_l3_id", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("amount_original", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("amount_base", sa.Numeric(precision=20, scale=6), nullable=False),
        sa.Column("target_ratio", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("source in ('manual','csv')", name="ck_holding_source"),
        sa.CheckConstraint("type in ('asset','liability')", name="ck_holding_type"),
        sa.ForeignKeyConstraint(["category_l1_id"], ["category.id"]),
        sa.ForeignKeyConstraint(["category_l2_id"], ["category.id"]),
        sa.ForeignKeyConstraint(["category_l3_id"], ["category.id"]),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"]),
        sa.ForeignKeyConstraint(["member_id"], ["member.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_holding_item_family_id", "holding_item", ["family_id"], unique=False)
    op.create_index("ix_holding_item_is_deleted", "holding_item", ["is_deleted"], unique=False)
    op.create_index("ix_holding_item_member_id", "holding_item", ["member_id"], unique=False)
    op.create_index("ix_holding_item_type", "holding_item", ["type"], unique=False)
    op.create_index("ix_holding_item_updated_at", "holding_item", ["updated_at"], unique=False)



def downgrade() -> None:
    op.drop_index("ix_holding_item_updated_at", table_name="holding_item")
    op.drop_index("ix_holding_item_type", table_name="holding_item")
    op.drop_index("ix_holding_item_member_id", table_name="holding_item")
    op.drop_index("ix_holding_item_is_deleted", table_name="holding_item")
    op.drop_index("ix_holding_item_family_id", table_name="holding_item")
    op.drop_table("holding_item")

    op.drop_index("ix_import_log_family_id", table_name="import_log")
    op.drop_index("ix_import_log_created_at", table_name="import_log")
    op.drop_table("import_log")

    op.drop_index("ix_snapshot_event_snapshot_at", table_name="snapshot_event")
    op.drop_index("ix_snapshot_event_family_id", table_name="snapshot_event")
    op.drop_table("snapshot_event")

    op.drop_index("ix_snapshot_daily_snapshot_date", table_name="snapshot_daily")
    op.drop_index("ix_snapshot_daily_family_id", table_name="snapshot_daily")
    op.drop_table("snapshot_daily")

    op.drop_table("settings")

    op.drop_index("ix_member_family_id", table_name="member")
    op.drop_table("member")

    op.drop_index("ix_fx_rate_daily_rate_date", table_name="fx_rate_daily")
    op.drop_index("ix_fx_rate_daily_quote_currency", table_name="fx_rate_daily")
    op.drop_index("ix_fx_rate_daily_base_currency", table_name="fx_rate_daily")
    op.drop_table("fx_rate_daily")

    op.drop_table("family")

    op.drop_index("ix_category_type", table_name="category")
    op.drop_index("ix_category_level", table_name="category")
    op.drop_table("category")
