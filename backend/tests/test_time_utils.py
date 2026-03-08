from datetime import UTC
from datetime import datetime

from app.core.clock import format_utc_iso_z
from app.core.clock import normalize_utc_naive
from app.core.clock import utc_now
from app.core.clock import utc_now_naive
from app.services.migration_service import _parse_datetime


def test_utc_now_returns_timezone_aware_utc_datetime():
    current = utc_now()

    assert current.tzinfo is UTC


def test_utc_now_naive_returns_naive_datetime():
    current = utc_now_naive()

    assert current.tzinfo is None


def test_format_utc_iso_z_marks_naive_datetime_as_utc():
    value = datetime(2026, 3, 8, 1, 2, 3, 456789)

    assert format_utc_iso_z(value) == '2026-03-08T01:02:03.456789Z'


def test_normalize_utc_naive_converts_offset_datetime_to_naive_utc():
    value = datetime.fromisoformat('2026-03-08T09:00:00+08:00')

    assert normalize_utc_naive(value) == datetime(2026, 3, 8, 1, 0, 0)



def test_parse_datetime_treats_legacy_naive_values_as_naive_utc():
    value = _parse_datetime('2026-03-08T12:34:56')

    assert value is not None
    assert value.tzinfo is None
    assert value.isoformat() == '2026-03-08T12:34:56'
