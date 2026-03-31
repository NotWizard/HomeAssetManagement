from decimal import Decimal

from app.core.database import SessionLocal
from app.models.settings import SettingsModel
from app.services.bootstrap import init_database
from app.services.import_service import ImportApplyResult
from app.services.import_service import ImportService
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
