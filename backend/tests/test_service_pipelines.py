from datetime import date
from decimal import Decimal

from app.core.database import SessionLocal
from app.models.settings import SettingsModel
from app.services.bootstrap import init_database
from app.services.import_service import ImportApplyResult
from app.services.import_service import ImportCommitContext
from app.services.import_service import ImportService
from app.services.fx_service import FXService
from app.services.settings_service import SettingsService



def test_import_commit_csv_uses_staged_pipeline(monkeypatch):
    init_database()
    parsed_rows = [object()]
    apply_result = ImportApplyResult(total=1, inserted=1, updated=0, failed=0)
    calls: list[tuple[str, object]] = []

    class DummyImportLog:
        id = 99

    def fake_parse(session, content):
        calls.append(("parse", content))
        return parsed_rows

    def fake_apply(session, parsed):
        calls.append(("apply", parsed))
        return apply_result

    def fake_create_log(session, *, family_id, filename, apply_result):
        calls.append(("log", family_id, filename, apply_result))
        return DummyImportLog()

    def fake_record_snapshots(session, filename):
        calls.append(("snapshots", filename))

    import app.services.import_service as import_module

    monkeypatch.setattr(import_module, "_parse_csv", fake_parse)
    monkeypatch.setattr(import_module, "_apply_parsed_rows", fake_apply)
    monkeypatch.setattr(import_module, "_create_import_log", fake_create_log)
    monkeypatch.setattr(import_module, "_record_import_snapshots", fake_record_snapshots)

    with SessionLocal() as session:
        data, parsed = ImportService.commit_csv(session, b"csv-data", "batch.csv")

    assert parsed is parsed_rows
    assert data == {
        "import_id": 99,
        "total_rows": 1,
        "updated_rows": 0,
        "inserted_rows": 1,
        "failed_rows": 0,
        "error_report_path": None,
    }
    assert calls[0] == ("parse", b"csv-data")
    assert calls[1] == ("apply", parsed_rows)
    assert calls[2][0:3] == ("log", 1, "batch.csv")
    assert calls[2][3] is apply_result
    assert calls[3] == ("snapshots", "batch.csv")



def test_update_settings_runs_base_currency_pipeline_only_when_currency_changes(monkeypatch):
    init_database()
    pipeline_calls: list[tuple[str, str, bool]] = []

    import app.services.settings_service as settings_module

    def fake_pipeline(session, next_base_currency: str, *, allow_rate_refresh: bool):
        pipeline_calls.append(("pipeline", next_base_currency, allow_rate_refresh))

    monkeypatch.setattr(settings_module, "_run_base_currency_change_pipeline", fake_pipeline)

    with SessionLocal() as session:
        settings = SettingsService.get_settings(session)
        settings.base_currency = "CNY"
        settings.rebalance_threshold_pct = 5
        settings.fx_provider = "frankfurter"
        session.flush()

        settings = SettingsService.update_settings(session, base_currency="USD", rebalance_threshold_pct=6)
        assert settings.base_currency == "USD"
        assert settings.rebalance_threshold_pct == 6
        assert pipeline_calls == [("pipeline", "USD", True)]

        pipeline_calls.clear()
        settings = SettingsService.update_settings(session, base_currency="USD", rebalance_threshold_pct=7)
        assert settings.base_currency == "USD"
        assert settings.rebalance_threshold_pct == 7
        assert pipeline_calls == []



def test_apply_settings_update_reports_base_currency_change():
    with SessionLocal() as session:
        session.query(SettingsModel).delete()
        session.flush()
        settings = SettingsService.get_settings(session)
        changed = __import__("app.services.settings_service", fromlist=["_apply_settings_update"])._apply_settings_update(
            settings,
            base_currency="USD",
            rebalance_threshold_pct=8,
        )
        assert changed is True
        assert settings.base_currency == "USD"
        assert settings.rebalance_threshold_pct == 8
        assert settings.fx_provider == "frankfurter"

        changed_again = __import__("app.services.settings_service", fromlist=["_apply_settings_update"])._apply_settings_update(
            settings,
            base_currency="USD",
            rebalance_threshold_pct=9,
        )
        assert changed_again is False
        assert settings.rebalance_threshold_pct == 9


def test_import_commit_csv_runs_prepare_apply_finalize_stages_in_order(monkeypatch):
    init_database()
    parsed_rows = [object()]
    context = ImportCommitContext(
        family_id=1,
        filename="batch.csv",
        parsed_rows=parsed_rows,
    )
    apply_result = ImportApplyResult(total=1, inserted=1, updated=0, failed=0)
    calls: list[tuple[object, ...]] = []

    class DummyImportLog:
        id = 101

    import app.services.import_service as import_module

    def fake_prepare(session, content, filename):
        calls.append(("prepare", content, filename))
        return context

    def fake_apply(session, commit_context):
        calls.append(("apply", commit_context))
        return apply_result

    def fake_finalize(session, commit_context, *, apply_result):
        calls.append(("finalize", commit_context, apply_result))
        return DummyImportLog()

    monkeypatch.setattr(import_module, "_prepare_import_commit", fake_prepare)
    monkeypatch.setattr(import_module, "_apply_import_commit_rows", fake_apply)
    monkeypatch.setattr(import_module, "_finalize_import_commit", fake_finalize)

    with SessionLocal() as session:
        data, parsed = ImportService.commit_csv(session, b"csv-data", "batch.csv")

    assert parsed is parsed_rows
    assert data == {
        "import_id": 101,
        "total_rows": 1,
        "updated_rows": 0,
        "inserted_rows": 1,
        "failed_rows": 0,
        "error_report_path": None,
    }
    assert calls == [
        ("prepare", b"csv-data", "batch.csv"),
        ("apply", context),
        ("finalize", context, apply_result),
    ]


def test_base_currency_change_pipeline_runs_revalue_and_snapshot_stages_in_order(monkeypatch):
    init_database()
    calls: list[tuple[object, ...]] = []

    import app.services.settings_service as settings_module

    def fake_revalue_holdings(session, next_base_currency: str, *, allow_rate_refresh: bool):
        calls.append(("holdings", next_base_currency, allow_rate_refresh))

    def fake_revalue_snapshots(session, next_base_currency: str, *, allow_rate_refresh: bool):
        calls.append(("snapshots", next_base_currency, allow_rate_refresh))

    def fake_record_snapshots(session, next_base_currency: str):
        calls.append(("record", next_base_currency))

    monkeypatch.setattr(settings_module, "_revalue_all_holdings", fake_revalue_holdings)
    monkeypatch.setattr(settings_module, "_revalue_all_snapshots", fake_revalue_snapshots)
    monkeypatch.setattr(settings_module, "_record_settings_change_snapshots", fake_record_snapshots)

    with SessionLocal() as session:
        settings_module._run_base_currency_change_pipeline(
            session,
            "USD",
            allow_rate_refresh=False,
        )

    assert calls == [
        ("holdings", "USD", False),
        ("snapshots", "USD", False),
        ("record", "USD"),
    ]


def test_refresh_rates_uses_fetch_and_upsert_stages(monkeypatch):
    init_database()
    calls: list[tuple[object, ...]] = []

    import app.services.fx_service as fx_module

    def fake_fetch(rate_date: date, base_currency: str):
        calls.append(("fetch", rate_date, base_currency))
        return "frankfurter", {"USD": Decimal("7.10")}

    def fake_upsert(
        session,
        *,
        rate_date: date,
        base_currency: str,
        provider_name: str,
        latest_rates: dict[str, Decimal],
    ):
        calls.append(
            ("upsert", rate_date, base_currency, provider_name, latest_rates)
        )
        return 2

    monkeypatch.setattr(fx_module, "_fetch_provider_rates", fake_fetch)
    monkeypatch.setattr(fx_module, "_upsert_daily_rates", fake_upsert)

    with SessionLocal() as session:
        count = FXService.refresh_rates(
            session,
            rate_date=date(2026, 4, 1),
            base_currency="CNY",
        )

    assert count == 2
    assert calls == [
        ("fetch", date(2026, 4, 1), "CNY"),
        (
            "upsert",
            date(2026, 4, 1),
            "CNY",
            "frankfurter",
            {"USD": Decimal("7.10")},
        ),
    ]
