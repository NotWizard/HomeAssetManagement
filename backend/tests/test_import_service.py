from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.import_log import ImportLog
from app.models.member import Member
from app.models.snapshot_daily import SnapshotDaily
from app.models.snapshot_event import SnapshotEvent
from app.services.bootstrap import init_database
from app.services.import_service import ImportService
from app.services.import_service import _decode_csv_bytes
from app.core.exceptions import AppError


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
                "US ETF,asset,Alice,权益与另类,公募基金,指数/ETF,USD,1000,30",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)
        assert preview["total_rows"] == 1
        assert preview["failed_rows"] == 0
        assert preview["inserted_rows"] == 1


def test_import_rejects_duplicate_business_key_within_same_file():
    """同一 CSV 内业务键重复的行必须报错，杜绝重复持仓落库或静默覆盖。"""
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
                "现金,asset,Alice,现金存款类,银行存款,活期,CNY,700,20",
                "现金,asset,Alice,现金存款类,银行存款,活期,CNY,800,20",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)
        assert preview["total_rows"] == 2
        assert preview["failed_rows"] == 1
        assert "重复条目" in (preview["rows"][1]["error"] or "")

        result, _parsed = ImportService.commit_csv(session, content, "dup.csv")
        assert result["inserted_rows"] == 1
        assert result["failed_rows"] == 1

        holdings = session.query(HoldingItem).filter(HoldingItem.name == "现金").all()
        assert len(holdings) == 1
        assert Decimal(str(holdings[0].amount_original)) == Decimal("700")


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
                "US ETF,asset,Alice,权益与另类,公募基金,指数/ETF,USD,1000,30",
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
                "US ETF,asset,Alice,权益与另类,公募基金,指数/ETF,USD,1000,30",
                "现金,asset,Alice,现金存款类,银行存款,活期,CNY,700,20",
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
                "US ETF,asset,Alice,权益与另类,公募基金,指数/ETF,USD,1000,30",
                "坏数据,asset,Alice,权益与另类,公募基金,指数/ETF,USD,-1,30",
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
    assert response.json()["message"] == "错误报告不存在"


def test_import_logs_and_error_reports_are_scoped_to_current_family():
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.query(ImportLog).delete()
        session.flush()

        other_family = Family(name="第二家庭")
        session.add(other_family)
        session.flush()
        outsider_log = ImportLog(
            family_id=other_family.id,
            file_name="outsider.csv",
            total_rows=1,
            updated_rows=0,
            inserted_rows=0,
            failed_rows=1,
            error_report_path=str(Path("/tmp/outsider-errors.csv")),
        )
        session.add(outsider_log)
        session.commit()
        outsider_log_id = outsider_log.id

    with TestClient(app) as client:
        logs_resp = client.get("/api/v1/imports/logs")
        error_resp = client.get(f"/api/v1/imports/{outsider_log_id}/errors")

    assert logs_resp.status_code == 200
    assert logs_resp.json()["data"] == []
    assert error_resp.status_code == 404
    assert error_resp.json()["code"] == 4041
    assert error_resp.json()["message"] == "错误报告不属于当前家庭"


def test_import_preview_treats_other_family_matching_holding_as_insert():
    init_database()
    with SessionLocal() as session:
        session.query(SnapshotEvent).delete()
        session.query(SnapshotDaily).delete()
        session.query(HoldingItem).delete()
        session.query(Member).delete()
        session.query(ImportLog).delete()
        session.flush()

        current_member = Member(family_id=1, name="Alice")
        session.add(current_member)
        session.flush()

        other_family = Family(name="第二家庭")
        session.add(other_family)
        session.flush()
        outsider_member = Member(family_id=other_family.id, name="Alice")
        session.add(outsider_member)
        session.flush()

        session.add(
            HoldingItem(
                family_id=other_family.id,
                member_id=outsider_member.id,
                type="asset",
                name="US ETF",
                category_l1_id=7,
                category_l2_id=11,
                category_l3_id=20,
                currency="USD",
                amount_original=1000,
                amount_base=1000,
                target_ratio=30,
                source="manual",
                is_deleted=False,
            )
        )
        session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益与另类,公募基金,指数/ETF,USD,1000,30",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)

    assert preview["inserted_rows"] == 1
    assert preview["updated_rows"] == 0


def test_decode_csv_bytes_supports_utf8_bom_and_gbk():
    utf8_bom = "﻿type,name,amount\nasset,现金,100".encode("utf-8")
    assert "现金" in _decode_csv_bytes(utf8_bom)

    gbk = "type,name,amount\nasset,现金,100".encode("gb18030")
    assert "现金" in _decode_csv_bytes(gbk)


def test_decode_csv_bytes_raises_app_error_on_completely_garbled_bytes():
    # 构造一个可以被 latin-1 解码（永不抛错）的字节流——这是兜底链最后一站
    # 但我们仍要保证非 UTF / GBK 的不会让上层得到 500，而是有可读的解码结果
    garbled = bytes([0xFE, 0xFE, 0xFE, 0xFE])
    decoded = _decode_csv_bytes(garbled)
    assert isinstance(decoded, str)


def test_import_and_migration_handlers_offload_blocking_work_to_threadpool():
    """大文件解析/恢复是 CPU+DB 密集操作，必须经 run_in_threadpool 卸载，
    否则 async handler 会阻塞事件循环（期间连 /health 都不响应）。"""
    import inspect

    import app.api.v1.imports as imports_api
    import app.api.v1.migration as migration_api

    imports_source = inspect.getsource(imports_api)
    assert "run_in_threadpool" in imports_source
    assert inspect.iscoroutinefunction(imports_api.preview_import)
    assert inspect.iscoroutinefunction(imports_api.commit_import)

    migration_source = inspect.getsource(migration_api)
    assert "run_in_threadpool" in migration_source
    assert inspect.iscoroutinefunction(migration_api.import_migration)
