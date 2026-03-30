from pathlib import Path

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.holding_item import HoldingItem
from app.models.import_log import ImportLog
from app.models.member import Member
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.services.bootstrap import init_database
from app.services.import_service import ImportService


def test_import_preview_detects_insert_or_update_actions():
    init_database()
    with SessionLocal() as session:
        member = session.query(Member).filter(Member.name == "Alice").first()
        if member is None:
            member = Member(family_id=1, name="Alice")
            session.add(member)
            session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益投资,基金,指数基金/ETF,USD,1000,30",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)
        assert preview["total_rows"] == 1
        assert preview["failed_rows"] == 0
        assert preview["inserted_rows"] == 1


def test_import_preview_rejects_ambiguous_duplicate_member_names():
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.add_all(
            [
                Member(family_id=1, name="Alice"),
                Member(family_id=1, name="Alice"),
            ]
        )
        session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益投资,基金,指数基金/ETF,USD,1000,30",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)
        assert preview["failed_rows"] == 1
        assert "成员名称不唯一" in (preview["rows"][0]["error"] or "")


def test_commit_csv_creates_single_import_event_snapshot():
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.add(Member(family_id=1, name="Alice"))
        session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益投资,基金,指数基金/ETF,USD,1000,30",
                "现金,asset,Alice,现金与存款,银行存款,活期存款,CNY,700,20",
            ]
        ).encode("utf-8")

        result, parsed = ImportService.commit_csv(session, content, "batch.csv")

        assert result["inserted_rows"] == 2
        assert result["error_report_path"] is None
        assert session.query(SnapshotEvent).count() == 1
        assert session.query(SnapshotDaily).count() == 1
        assert len(parsed) == 2


def test_finalize_error_report_runs_after_import_commit():
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.query(ImportLog).delete()
        session.add(Member(family_id=1, name="Alice"))
        session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益投资,基金,指数基金/ETF,USD,1000,30",
                "坏数据,asset,Alice,权益投资,基金,指数基金/ETF,USD,-1,30",
            ]
        ).encode("utf-8")

        result, parsed = ImportService.commit_csv(session, content, "batch-errors.csv")
        session.commit()

        assert result["failed_rows"] == 1
        assert result["error_report_path"] is None

        error_report_path = ImportService.finalize_error_report(session, result["import_id"], parsed)
        session.commit()

        assert error_report_path is not None
        assert Path(error_report_path).exists()

        import_log = session.get(ImportLog, result["import_id"])
        assert import_log is not None
        assert import_log.error_report_path == error_report_path


def test_download_import_errors_uses_app_error_payload():
    with TestClient(app) as client:
        response = client.get("/api/v1/imports/999/errors")

    assert response.status_code == 404
    assert response.json()["code"] == 4040
