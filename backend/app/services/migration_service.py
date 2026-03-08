import hashlib
import json
import shutil
import tempfile
import zipfile
from collections.abc import Iterable, Iterator
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, BinaryIO

from sqlalchemy import delete
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import format_utc_iso_z
from app.core.clock import normalize_utc_naive
from app.core.clock import utc_now_naive
from app.core.exceptions import AppError
from app.models.category import Category
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.models.settings import SettingsModel
from app.models.snapshot_daily import SnapshotDaily
from app.services.category_service import CategoryService
from app.services.common import get_default_family
from app.services.settings_service import DEFAULT_FX_PROVIDER

PACKAGE_TYPE = "ham_migration"
SCHEMA_VERSION = 1
DOMAIN_SPECS = [
    ("family", "family.json", "json"),
    ("settings", "settings.json", "json"),
    ("members", "members.json", "json"),
    ("holdings", "holdings.ndjson", "ndjson"),
    ("daily_snapshots", "daily_snapshots.ndjson", "ndjson"),
]
NDJSON_DOMAINS = {"holdings", "daily_snapshots"}


class MigrationService:
    @staticmethod
    def export_package(session: Session) -> tuple[str, str, str]:
        family = get_default_family(session)
        settings = session.scalar(
            select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
        )
        members = list(
            session.scalars(
                select(Member)
                .where(Member.family_id == family.id)
                .order_by(Member.id.asc())
            )
        )
        holdings_rows = session.scalars(
            select(HoldingItem)
            .where(HoldingItem.family_id == family.id, HoldingItem.is_deleted.is_(False))
            .order_by(HoldingItem.id.asc())
        )
        snapshot_rows = session.scalars(
            select(SnapshotDaily)
            .where(SnapshotDaily.family_id == family.id)
            .order_by(SnapshotDaily.snapshot_date.asc())
        )

        export_dir = Path(tempfile.mkdtemp(prefix="ham-migration-export-"))

        try:
            category_cache: dict[int, Category | None] = {}

            def category_name(category_id: int) -> str:
                if category_id not in category_cache:
                    category_cache[category_id] = session.get(Category, category_id)
                category = category_cache[category_id]
                if category is None:
                    raise AppError(4002, f"分类不存在: {category_id}")
                return category.name

            file_paths: dict[str, Path] = {
                "family.json": export_dir / "family.json",
                "settings.json": export_dir / "settings.json",
                "members.json": export_dir / "members.json",
                "holdings.ndjson": export_dir / "holdings.ndjson",
                "daily_snapshots.ndjson": export_dir / "daily_snapshots.ndjson",
            }

            _write_json_file(
                file_paths["family.json"],
                {
                    "name": family.name,
                    "created_at": format_utc_iso_z(family.created_at),
                    "updated_at": format_utc_iso_z(family.updated_at),
                },
            )
            _write_json_file(
                file_paths["settings.json"],
                {
                    "base_currency": settings.base_currency if settings else "CNY",
                    "timezone": settings.timezone if settings else "Asia/Shanghai",
                    "rebalance_threshold_pct": (
                        settings.rebalance_threshold_pct if settings else 5.0
                    ),
                },
            )
            _write_json_file(
                file_paths["members.json"],
                [
                    {
                        "id": member.id,
                        "name": member.name,
                        "created_at": format_utc_iso_z(member.created_at),
                        "updated_at": format_utc_iso_z(member.updated_at),
                    }
                    for member in members
                ],
            )

            holdings_count = _write_ndjson_file(
                file_paths["holdings.ndjson"],
                (
                    {
                        "id": row.id,
                        "member_id": row.member_id,
                        "type": row.type,
                        "name": row.name,
                        "currency": row.currency,
                        "amount_original": str(row.amount_original),
                        "amount_base": str(row.amount_base),
                        "target_ratio": (
                            str(row.target_ratio) if row.target_ratio is not None else None
                        ),
                        "source": row.source,
                        "is_deleted": bool(row.is_deleted),
                        "created_at": format_utc_iso_z(row.created_at),
                        "updated_at": format_utc_iso_z(row.updated_at),
                        "category_l1_name": category_name(row.category_l1_id),
                        "category_l2_name": category_name(row.category_l2_id),
                        "category_l3_name": category_name(row.category_l3_id),
                    }
                    for row in holdings_rows
                ),
            )
            snapshots_count = _write_ndjson_file(
                file_paths["daily_snapshots.ndjson"],
                (
                    {
                        "snapshot_date": row.snapshot_date.isoformat(),
                        "created_at": format_utc_iso_z(row.created_at),
                        "payload": json.loads(row.payload_json),
                    }
                    for row in snapshot_rows
                ),
            )

            domain_metadata = {
                "family": {
                    "file": "family.json",
                    "format": "json",
                    "row_count": 1,
                    "checksum": _file_checksum(file_paths["family.json"]),
                },
                "settings": {
                    "file": "settings.json",
                    "format": "json",
                    "row_count": 1,
                    "checksum": _file_checksum(file_paths["settings.json"]),
                },
                "members": {
                    "file": "members.json",
                    "format": "json",
                    "row_count": len(members),
                    "checksum": _file_checksum(file_paths["members.json"]),
                },
                "holdings": {
                    "file": "holdings.ndjson",
                    "format": "ndjson",
                    "row_count": holdings_count,
                    "checksum": _file_checksum(file_paths["holdings.ndjson"]),
                },
                "daily_snapshots": {
                    "file": "daily_snapshots.ndjson",
                    "format": "ndjson",
                    "row_count": snapshots_count,
                    "checksum": _file_checksum(file_paths["daily_snapshots.ndjson"]),
                },
            }

            manifest = {
                "package_type": PACKAGE_TYPE,
                "schema_version": SCHEMA_VERSION,
                "minimum_supported_version": SCHEMA_VERSION,
                "exported_at": format_utc_iso_z(),
                "domains": [
                    {
                        "name": domain_name,
                        "file": domain_metadata[domain_name]["file"],
                        "format": domain_metadata[domain_name]["format"],
                        "row_count": domain_metadata[domain_name]["row_count"],
                        "checksum": domain_metadata[domain_name]["checksum"],
                    }
                    for domain_name, _, _ in DOMAIN_SPECS
                ],
            }
            _write_json_file(export_dir / "manifest.json", manifest)

            filename = f"ham-migration-{utc_now_naive().strftime('%Y-%m-%dT%H-%M-%S')}.zip"
            archive_path = export_dir / filename
            with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
                for file_path in sorted(export_dir.iterdir()):
                    if file_path.name == filename:
                        continue
                    archive.write(file_path, arcname=file_path.name)

            return filename, str(archive_path), str(export_dir)
        except Exception:
            shutil.rmtree(export_dir, ignore_errors=True)
            raise

    @staticmethod
    def import_package(session: Session, file_obj: BinaryIO, filename: str) -> dict[str, Any]:
        import_dir = Path(tempfile.mkdtemp(prefix="ham-migration-import-"))
        archive_path = import_dir / (Path(filename).name or "migration.zip")

        try:
            if hasattr(file_obj, "seek"):
                file_obj.seek(0)
            with archive_path.open("wb") as target:
                shutil.copyfileobj(file_obj, target, length=1024 * 1024)

            package = _load_package(archive_path, filename)
            _validate_package(session, package)

            try:
                return _restore_package(session, package)
            except AppError:
                session.rollback()
                raise
            except Exception as exc:  # noqa: BLE001
                session.rollback()
                raise AppError(4002, f"迁移包导入失败: {exc}") from exc
        finally:
            shutil.rmtree(import_dir, ignore_errors=True)


def _load_package(archive_path: Path, filename: str) -> dict[str, Any]:
    if not archive_path.exists() or archive_path.stat().st_size == 0:
        raise AppError(4001, "迁移包内容为空")
    if not filename.lower().endswith(".zip"):
        raise AppError(4001, "迁移包必须是 zip 文件")

    try:
        with zipfile.ZipFile(archive_path) as archive:
            names = set(archive.namelist())
            if "manifest.json" not in names:
                raise AppError(4002, "迁移包缺少 manifest.json")

            manifest_bytes = archive.read("manifest.json")
            manifest = json.loads(manifest_bytes)
            if manifest.get("package_type") != PACKAGE_TYPE:
                raise AppError(4002, "迁移包类型不受支持")
            if manifest.get("schema_version") != SCHEMA_VERSION:
                raise AppError(4002, "迁移包版本不受支持")

            domain_entries = {domain["name"]: domain for domain in manifest.get("domains", [])}
            package: dict[str, Any] = {
                "manifest": manifest,
                "archive_path": str(archive_path),
                "domain_entries": domain_entries,
            }

            for domain_name, file_name, expected_format in DOMAIN_SPECS:
                if file_name not in names:
                    raise AppError(4002, f"迁移包缺少文件: {file_name}")
                domain = domain_entries.get(domain_name)
                if domain is None:
                    raise AppError(4002, f"迁移包缺少域定义: {domain_name}")
                if domain.get("file") != file_name or domain.get("format") != expected_format:
                    raise AppError(4002, f"迁移包域定义不正确: {domain_name}")

                if expected_format == "json":
                    payload_bytes = archive.read(file_name)
                    if domain.get("checksum") != _bytes_checksum(payload_bytes):
                        raise AppError(4002, f"迁移包校验失败: {domain_name}")
                    payload = json.loads(payload_bytes)
                    row_count = 1 if domain_name in {"family", "settings"} else len(payload)
                    if row_count != domain.get("row_count"):
                        raise AppError(4002, f"迁移包行数不匹配: {domain_name}")
                    package[domain_name] = payload
                else:
                    row_count, checksum = _ndjson_stats_from_archive(archive_path, file_name)
                    if domain.get("checksum") != checksum:
                        raise AppError(4002, f"迁移包校验失败: {domain_name}")
                    if row_count != domain.get("row_count"):
                        raise AppError(4002, f"迁移包行数不匹配: {domain_name}")

            return package
    except zipfile.BadZipFile as exc:
        raise AppError(4001, "迁移包格式不正确") from exc


def _validate_package(session: Session, package: dict[str, Any]) -> None:
    family = package["family"]
    if not str(family.get("name", "")).strip():
        raise AppError(4002, "家庭名称不能为空")
    _parse_datetime(family.get("created_at"))
    _parse_datetime(family.get("updated_at"))

    settings = package["settings"]
    if not str(settings.get("base_currency", "")).strip():
        raise AppError(4002, "基准币种不能为空")
    if not str(settings.get("timezone", "")).strip():
        raise AppError(4002, "时区不能为空")
    threshold = float(settings.get("rebalance_threshold_pct"))
    if threshold <= 0 or threshold >= 100:
        raise AppError(4002, "再平衡阈值应在 0 到 100 之间")

    members = package["members"]
    if not isinstance(members, list):
        raise AppError(4002, "成员数据格式不正确")
    member_ids: set[int] = set()
    for member in members:
        member_id = int(member["id"])
        if member_id in member_ids:
            raise AppError(4002, "成员 ID 不能重复")
        member_ids.add(member_id)
        if not str(member.get("name", "")).strip():
            raise AppError(4002, "成员名称不能为空")
        _parse_datetime(member.get("created_at"))
        _parse_datetime(member.get("updated_at"))

    holding_ids: set[int] = set()
    for row in _iter_ndjson_records(Path(package["archive_path"]), "holdings.ndjson"):
        holding_id = int(row["id"])
        if holding_id in holding_ids:
            raise AppError(4002, "持仓 ID 不能重复")
        holding_ids.add(holding_id)

        member_id = int(row["member_id"])
        if member_id not in member_ids:
            raise AppError(4002, f"持仓关联成员不存在: {member_id}")

        holding_type = str(row.get("type", "")).strip()
        if holding_type not in {"asset", "liability"}:
            raise AppError(4002, "持仓类型不正确")

        if not str(row.get("name", "")).strip():
            raise AppError(4002, "持仓名称不能为空")

        currency = str(row.get("currency", "")).strip().upper()
        if len(currency) < 3:
            raise AppError(4002, "持仓币种格式不正确")

        amount_original = Decimal(str(row["amount_original"]))
        amount_base = Decimal(str(row["amount_base"]))
        if amount_original <= 0 or amount_base <= 0:
            raise AppError(4002, "持仓金额必须大于 0")

        target_ratio = row.get("target_ratio")
        if holding_type == "asset":
            if target_ratio is None:
                raise AppError(4002, "资产必须包含期望占比")
            target_value = Decimal(str(target_ratio))
            if target_value < 0 or target_value > 100:
                raise AppError(4002, "资产期望占比必须在 0 到 100 之间")
        elif target_ratio is not None:
            raise AppError(4002, "负债不应包含期望占比")

        if bool(row.get("is_deleted", False)):
            raise AppError(4002, "迁移包不应包含已删除持仓")

        CategoryService.resolve_path_by_name(
            session,
            holding_type,
            str(row["category_l1_name"]),
            str(row["category_l2_name"]),
            str(row["category_l3_name"]),
        )
        _parse_datetime(row.get("created_at"))
        _parse_datetime(row.get("updated_at"))

    for snapshot in _iter_ndjson_records(Path(package["archive_path"]), "daily_snapshots.ndjson"):
        _parse_date(snapshot.get("snapshot_date"))
        _parse_datetime(snapshot.get("created_at"))
        payload = snapshot.get("payload")
        if not isinstance(payload, dict):
            raise AppError(4002, "每日快照 payload 格式不正确")

        totals = payload.get("totals")
        holdings = payload.get("holdings")
        if not isinstance(totals, dict):
            raise AppError(4002, "每日快照 totals 格式不正确")
        if not isinstance(holdings, list):
            raise AppError(4002, "每日快照 holdings 格式不正确")

        for key in ("total_asset", "total_liability", "net_asset"):
            if key not in totals:
                raise AppError(4002, f"每日快照 totals 缺少字段: {key}")

        for item in holdings:
            if not isinstance(item, dict):
                raise AppError(4002, "每日快照持仓项格式不正确")
            if "member_id" in item and int(item["member_id"]) not in member_ids:
                raise AppError(4002, f"每日快照引用成员不存在: {item['member_id']}")
            if "id" in item and int(item["id"]) not in holding_ids:
                raise AppError(4002, f"每日快照引用持仓不存在: {item['id']}")


def _restore_package(session: Session, package: dict[str, Any]) -> dict[str, Any]:
    archive_path = Path(package["archive_path"])
    family = get_default_family(session)
    family_payload = package["family"]
    family.name = str(family_payload["name"]).strip()
    family.created_at = _parse_datetime(family_payload.get("created_at")) or family.created_at
    family.updated_at = _parse_datetime(family_payload.get("updated_at")) or family.updated_at
    session.flush()

    session.execute(delete(SnapshotDaily).where(SnapshotDaily.family_id == family.id))
    session.execute(delete(HoldingItem).where(HoldingItem.family_id == family.id))
    session.execute(delete(Member).where(Member.family_id == family.id))
    session.execute(delete(SettingsModel).where(SettingsModel.family_id == family.id))
    session.flush()

    settings_payload = package["settings"]
    session.add(
        SettingsModel(
            family_id=family.id,
            base_currency=str(settings_payload["base_currency"]).upper(),
            timezone=str(settings_payload["timezone"]),
            rebalance_threshold_pct=float(settings_payload["rebalance_threshold_pct"]),
            fx_provider=DEFAULT_FX_PROVIDER,
        )
    )

    members = package["members"]
    for member_payload in members:
        session.add(
            Member(
                id=int(member_payload["id"]),
                family_id=family.id,
                name=str(member_payload["name"]).strip(),
                created_at=_parse_datetime(member_payload.get("created_at")) or utc_now_naive(),
                updated_at=_parse_datetime(member_payload.get("updated_at")) or utc_now_naive(),
            )
        )
    session.flush()

    holdings_count = 0
    for row in _iter_ndjson_records(archive_path, "holdings.ndjson"):
        l1, l2, l3 = CategoryService.resolve_path_by_name(
            session,
            str(row["type"]),
            str(row["category_l1_name"]),
            str(row["category_l2_name"]),
            str(row["category_l3_name"]),
        )
        session.add(
            HoldingItem(
                id=int(row["id"]),
                family_id=family.id,
                member_id=int(row["member_id"]),
                type=str(row["type"]),
                name=str(row["name"]).strip(),
                category_l1_id=l1.id,
                category_l2_id=l2.id,
                category_l3_id=l3.id,
                currency=str(row["currency"]).upper(),
                amount_original=Decimal(str(row["amount_original"])),
                amount_base=Decimal(str(row["amount_base"])),
                target_ratio=(
                    Decimal(str(row["target_ratio"]))
                    if row.get("target_ratio") is not None
                    else None
                ),
                source=str(row.get("source") or "manual"),
                is_deleted=False,
                created_at=_parse_datetime(row.get("created_at")) or utc_now_naive(),
                updated_at=_parse_datetime(row.get("updated_at")) or utc_now_naive(),
            )
        )
        holdings_count += 1
    session.flush()

    snapshots_count = 0
    for snapshot_payload in _iter_ndjson_records(archive_path, "daily_snapshots.ndjson"):
        session.add(
            SnapshotDaily(
                family_id=family.id,
                snapshot_date=_parse_date(snapshot_payload["snapshot_date"]),
                payload_json=json.dumps(snapshot_payload["payload"], ensure_ascii=False),
                created_at=_parse_datetime(snapshot_payload.get("created_at")) or utc_now_naive(),
            )
        )
        snapshots_count += 1

    session.flush()
    return {
        "family_name": family.name,
        "members_count": len(members),
        "holdings_count": holdings_count,
        "daily_snapshots_count": snapshots_count,
    }


def _write_json_file(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _write_ndjson_file(path: Path, items: Iterable[dict[str, Any]]) -> int:
    count = 0
    with path.open("w", encoding="utf-8") as handle:
        for item in items:
            if count > 0:
                handle.write("\n")
            handle.write(json.dumps(item, ensure_ascii=False))
            count += 1
    return count


def _file_checksum(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            hasher.update(chunk)
    return f"sha256:{hasher.hexdigest()}"


def _bytes_checksum(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def _ndjson_stats_from_archive(archive_path: Path, file_name: str) -> tuple[int, str]:
    hasher = hashlib.sha256()
    count = 0
    with zipfile.ZipFile(archive_path) as archive:
        with archive.open(file_name) as handle:
            for raw_line in handle:
                hasher.update(raw_line)
                if raw_line.strip():
                    count += 1
    return count, f"sha256:{hasher.hexdigest()}"


def _iter_ndjson_records(archive_path: Path, file_name: str) -> Iterator[dict[str, Any]]:
    with zipfile.ZipFile(archive_path) as archive:
        with archive.open(file_name) as handle:
            for raw_line in handle:
                if not raw_line.strip():
                    continue
                yield json.loads(raw_line.decode("utf-8"))


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return normalize_utc_naive(datetime.fromisoformat(text))


def _parse_date(value: Any) -> date:
    if value in (None, ""):
        raise AppError(4002, "快照日期不能为空")
    return date.fromisoformat(str(value))
