"""daily_totals slim aggregation table

为分析端点提供「单天汇总」的轻量副本，避免 series_builder cold path
反序列化 N 天 snapshot_daily.payload_json。snapshot_daily.payload_json
仍是 holding 粒度的真理源（sankey / rebalance / currency-overview 全靠它）。

Revision ID: 20260523_000001
Revises: 20260331_000001
Create Date: 2026-05-23 12:00:00
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa


revision = "20260523_000001"
down_revision = "20260331_000001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_totals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("family_id", sa.Integer(), sa.ForeignKey("family.id"), nullable=False, index=True),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("total_asset", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("total_liability", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("net_asset", sa.Numeric(20, 6), nullable=False, server_default="0"),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("family_id", "snapshot_date", name="uq_daily_totals"),
    )

    # 一次性从 snapshot_daily.payload_json.totals 回填存量数据，
    # 让 series_builder 立即可以从新表读历史。
    bind = op.get_bind()
    snapshot_rows = bind.execute(
        sa.text(
            "SELECT id, family_id, snapshot_date, payload_json, created_at "
            "FROM snapshot_daily ORDER BY id ASC"
        )
    ).fetchall()
    for row in snapshot_rows:
        try:
            payload = json.loads(row.payload_json)
        except (json.JSONDecodeError, TypeError):
            continue
        totals = payload.get("totals") or {}
        bind.execute(
            sa.text(
                "INSERT OR IGNORE INTO daily_totals "
                "(family_id, snapshot_date, total_asset, total_liability, net_asset, generated_at) "
                "VALUES (:family_id, :snapshot_date, :total_asset, :total_liability, :net_asset, :generated_at)"
            ),
            {
                "family_id": row.family_id,
                "snapshot_date": row.snapshot_date,
                "total_asset": float(totals.get("total_asset", 0.0) or 0.0),
                "total_liability": float(totals.get("total_liability", 0.0) or 0.0),
                "net_asset": float(totals.get("net_asset", 0.0) or 0.0),
                "generated_at": row.created_at,
            },
        )


def downgrade() -> None:
    op.drop_table("daily_totals")
