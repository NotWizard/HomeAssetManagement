import hashlib
import io
import json
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy import select
from sqlalchemy.orm import undefer

from app.core.database import SessionLocal
from app.main import app
from app.models.daily_total import DailyTotal
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.models.settings import SettingsModel
from app.models.snapshot_daily import SnapshotDaily
from app.services.snapshot_service import SnapshotService
from app.services.common import get_default_family


def _get_asset_path(client: TestClient) -> tuple[int, int, int]:
    response = client.get('/api/v1/categories', params={'type': 'asset'})
    assert response.status_code == 200
    tree = response.json()['data']
    l1 = tree[0]
    l2 = l1['children'][0]
    l3 = l2['children'][0]
    return l1['id'], l2['id'], l3['id']


def _seed_exportable_data(client: TestClient) -> dict:
    with SessionLocal() as session:
        family = session.scalar(select(Family).limit(1))
        assert family is not None
        session.execute(delete(DailyTotal).where(DailyTotal.family_id == family.id))
        session.execute(delete(SnapshotDaily).where(SnapshotDaily.family_id == family.id))
        session.execute(delete(HoldingItem).where(HoldingItem.family_id == family.id))
        session.execute(delete(Member).where(Member.family_id == family.id))
        session.execute(delete(SettingsModel).where(SettingsModel.family_id == family.id))
        family.name = '迁移家庭'
        session.commit()

    settings_resp = client.put(
        '/api/v1/settings',
        json={
            'base_currency': 'CNY',
            'rebalance_threshold_pct': 7,
        },
    )
    assert settings_resp.status_code == 200
    with SessionLocal() as session:
        settings = session.scalar(select(SettingsModel).limit(1))
        assert settings is not None
        settings.timezone = 'Asia/Tokyo'
        session.commit()

    alice_resp = client.post('/api/v1/members', json={'name': 'Alice'})
    bob_resp = client.post('/api/v1/members', json={'name': 'Bob'})
    assert alice_resp.status_code == 200
    assert bob_resp.status_code == 200
    alice_id = alice_resp.json()['data']['id']
    bob_id = bob_resp.json()['data']['id']

    l1_id, l2_id, l3_id = _get_asset_path(client)

    for member_id, name, amount, ratio in [
        (alice_id, '现金储备', '100.5', '12'),
        (bob_id, '指数基金', '250', '18'),
    ]:
        create_resp = client.post(
            '/api/v1/holdings',
            json={
                'member_id': member_id,
                'type': 'asset',
                'name': name,
                'category_l1_id': l1_id,
                'category_l2_id': l2_id,
                'category_l3_id': l3_id,
                'currency': 'CNY',
                'amount_original': amount,
                'target_ratio': ratio,
            },
        )
        assert create_resp.status_code == 200

    with SessionLocal() as session:
        SnapshotService.create_daily_snapshot(session)
        session.commit()
        snapshot = session.scalar(
            select(SnapshotDaily).order_by(SnapshotDaily.snapshot_date.desc()).limit(1)
        )
        assert snapshot is not None
        snapshot_payload = json.loads(snapshot.payload_json)

    return {
        'family_name': '迁移家庭',
        'member_names': ['Alice', 'Bob'],
        'holding_names': ['现金储备', '指数基金'],
        'snapshot_payload': snapshot_payload,
    }


def _read_zip_entries(content: bytes) -> tuple[list[str], dict, list[dict], dict]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names = sorted(archive.namelist())
        manifest = json.loads(archive.read('manifest.json'))
        members = json.loads(archive.read('members.json'))
        snapshots = [
            json.loads(line)
            for line in archive.read('daily_snapshots.ndjson').decode('utf-8').splitlines()
            if line.strip()
        ]
    return names, manifest, snapshots, {'members': members}


def _collect_state() -> dict:
    with SessionLocal() as session:
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
        holdings = list(
            session.scalars(
                select(HoldingItem)
                .where(
                    HoldingItem.family_id == family.id,
                    HoldingItem.is_deleted.is_(False),
                )
                .order_by(HoldingItem.id.asc())
            )
        )
        snapshots = list(
            session.scalars(
                select(SnapshotDaily)
                .options(undefer(SnapshotDaily.payload_json))
                .where(SnapshotDaily.family_id == family.id)
                .order_by(SnapshotDaily.snapshot_date.asc())
            )
        )

    return {
        'family_name': family.name if family else None,
        'settings': {
            'base_currency': settings.base_currency if settings else None,
            'timezone': settings.timezone if settings else None,
            'rebalance_threshold_pct': settings.rebalance_threshold_pct if settings else None,
            'fx_provider': settings.fx_provider if settings else None,
        },
        'member_names': [member.name for member in members],
        'member_ids': [member.id for member in members],
        'holding_names': [holding.name for holding in holdings],
        'snapshot_payloads': [json.loads(snapshot.payload_json) for snapshot in snapshots],
    }


def _rewrite_zip(content: bytes, transform: dict[str, callable], *, update_manifest: bool = True) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(content)) as src, zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as dst:
        rewritten: dict[str, bytes] = {}
        for name in src.namelist():
            data = src.read(name)
            if name in transform:
                data = transform[name](data)
            rewritten[name] = data

        if update_manifest:
            manifest = json.loads(rewritten['manifest.json'])
            for domain in manifest['domains']:
                file_name = domain['file']
                if file_name in rewritten and file_name != 'manifest.json':
                    domain['checksum'] = f"sha256:{hashlib.sha256(rewritten[file_name]).hexdigest()}"
                    if domain['format'] == 'ndjson':
                        domain['row_count'] = len([
                            line for line in rewritten[file_name].decode('utf-8').splitlines() if line.strip()
                        ])
                    else:
                        payload = json.loads(rewritten[file_name])
                        domain['row_count'] = 1 if domain['name'] in {'family', 'settings'} else len(payload)
            rewritten['manifest.json'] = json.dumps(manifest, ensure_ascii=False).encode('utf-8')

        for name, data in rewritten.items():
            dst.writestr(name, data)
    return buffer.getvalue()


def test_export_migration_returns_zip_with_required_entries():
    with TestClient(app) as client:
        _seed_exportable_data(client)
        response = client.post('/api/v1/migration/export')

    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/zip'

    names, manifest, snapshots, payload = _read_zip_entries(response.content)

    assert names == [
        'daily_snapshots.ndjson',
        'family.json',
        'holdings.ndjson',
        'manifest.json',
        'members.json',
        'settings.json',
    ]
    assert manifest['package_type'] == 'ham_migration'
    assert manifest['schema_version'] == 1
    assert [domain['name'] for domain in manifest['domains']] == [
        'family',
        'settings',
        'members',
        'holdings',
        'daily_snapshots',
    ]
    assert payload['members'][0]['name'] == 'Alice'
    assert len(snapshots) >= 1


def test_import_migration_replaces_existing_data():
    with TestClient(app) as client:
        seed = _seed_exportable_data(client)
        export_response = client.post('/api/v1/migration/export')
        assert export_response.status_code == 200
        _, manifest, snapshots, _ = _read_zip_entries(export_response.content)

        with SessionLocal() as session:
            daily_totals = list(session.scalars(select(DailyTotal)))
            assert daily_totals
            for row in daily_totals:
                row.total_asset = 0
                row.total_liability = 0
                row.net_asset = 0
            session.commit()

        client.put(
            '/api/v1/settings',
            json={
                'base_currency': 'CNY',
                'rebalance_threshold_pct': 9,
            },
        )
        client.post('/api/v1/members', json={'name': 'Carol'})

        import_response = client.post(
            '/api/v1/migration/import',
            files={'file': ('migration.zip', export_response.content, 'application/zip')},
        )

    assert import_response.status_code == 200
    data = import_response.json()['data']
    assert data['family_name'] == seed['family_name']
    assert data['members_count'] == manifest['domains'][2]['row_count']
    assert data['holdings_count'] == manifest['domains'][3]['row_count']
    assert data['daily_snapshots_count'] == manifest['domains'][4]['row_count']

    state = _collect_state()
    assert state['family_name'] == seed['family_name']
    assert state['settings']['timezone'] == 'Asia/Tokyo'
    assert state['settings']['rebalance_threshold_pct'] == 7
    assert state['settings']['fx_provider'] == 'frankfurter'
    assert state['member_names'] == seed['member_names']
    assert state['holding_names'] == seed['holding_names']
    assert state['snapshot_payloads'][-1] == snapshots[-1]['payload']

    with SessionLocal() as session:
        daily_totals = list(
            session.scalars(select(DailyTotal).order_by(DailyTotal.snapshot_date.asc()))
        )
    assert len(daily_totals) == len(snapshots)
    assert float(daily_totals[-1].total_asset) == snapshots[-1]['payload']['totals']['total_asset']
    assert float(daily_totals[-1].total_liability) == snapshots[-1]['payload']['totals']['total_liability']
    assert float(daily_totals[-1].net_asset) == snapshots[-1]['payload']['totals']['net_asset']


def test_create_sqlite_backup_before_import_writes_file_to_storage_dir(tmp_path, monkeypatch):
    """直接测 _create_sqlite_backup_before_import：真实 sqlite db，验证备份目录、命名与内容可读。"""
    import importlib
    import sqlite3

    fake_db_file = tmp_path / "fake.db"
    conn = sqlite3.connect(str(fake_db_file))
    conn.execute("CREATE TABLE t (v TEXT)")
    conn.execute("INSERT INTO t VALUES ('hello')")
    conn.commit()
    conn.close()
    monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{fake_db_file}")
    monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))

    import app.core.config as config_module
    import app.services.migration_service as migration_module

    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(migration_module)

    try:
        backup_path = migration_module._create_sqlite_backup_before_import()
        assert backup_path is not None, "应该成功生成备份"
        assert backup_path.exists()
        assert backup_path.parent == tmp_path / "backups"
        assert backup_path.name.startswith("migration-")
        assert backup_path.name.endswith(".db")
        backup_conn = sqlite3.connect(str(backup_path))
        try:
            assert backup_conn.execute("SELECT v FROM t").fetchall() == [("hello",)]
        finally:
            backup_conn.close()
    finally:
        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(migration_module)


def test_create_sqlite_backup_includes_latest_wal_commits(tmp_path, monkeypatch):
    """WAL 未 checkpoint 时备份也必须包含最新提交（shutil.copy2 时代会缺）。"""
    import importlib
    import sqlite3

    db_file = tmp_path / "wal.db"
    source = sqlite3.connect(str(db_file))
    source.execute("PRAGMA journal_mode=WAL")
    source.execute("CREATE TABLE t (v TEXT)")
    source.execute("INSERT INTO t VALUES ('wal-only')")
    source.commit()
    # 源连接保持打开，WAL 不会自动 checkpoint，最新提交仍只在 -wal 文件里
    assert (tmp_path / "wal.db-wal").exists()
    assert (tmp_path / "wal.db-wal").stat().st_size > 0

    monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{db_file}")
    monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))

    import app.core.config as config_module
    import app.services.migration_service as migration_module

    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(migration_module)

    try:
        backup_path = migration_module._create_sqlite_backup_before_import()
        assert backup_path is not None
        backup_conn = sqlite3.connect(str(backup_path))
        try:
            assert backup_conn.execute("SELECT v FROM t").fetchall() == [("wal-only",)]
        finally:
            backup_conn.close()
    finally:
        source.close()
        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(migration_module)


def test_create_sqlite_backup_before_import_returns_none_when_db_missing(tmp_path, monkeypatch):
    """db 文件不存在时不抛错，返回 None，避免阻塞主流程。"""
    import importlib

    monkeypatch.setenv("HBS_DATABASE_URL", f"sqlite:///{tmp_path}/no-such.db")
    monkeypatch.setenv("HBS_STORAGE_DIR", str(tmp_path))

    import app.core.config as config_module
    import app.services.migration_service as migration_module

    config_module.get_settings.cache_clear()
    importlib.reload(config_module)
    importlib.reload(migration_module)

    try:
        assert migration_module._create_sqlite_backup_before_import() is None
    finally:
        config_module.get_settings.cache_clear()
        importlib.reload(config_module)
        importlib.reload(migration_module)


def test_import_migration_rolls_back_on_invalid_package():
    with TestClient(app) as client:
        _seed_exportable_data(client)
        baseline = _collect_state()
        export_response = client.post('/api/v1/migration/export')
        assert export_response.status_code == 200

        tampered_content = _rewrite_zip(
            export_response.content,
            {
                'members.json': lambda _: b'[{"id":1,"name":"Alice","created_at":"2026-03-07T00:00:00","updated_at":"2026-03-07T00:00:00"}]',
            },
        )
        tampered_content = _rewrite_zip(
            tampered_content,
            {
                'manifest.json': lambda data: json.dumps(
                    {
                        **json.loads(data),
                        'domains': [
                            {
                                **domain,
                                'checksum': 'sha256:tampered'
                                if domain['name'] == 'members'
                                else domain['checksum'],
                            }
                            for domain in json.loads(data)['domains']
                        ],
                    },
                    ensure_ascii=False,
                ).encode('utf-8'),
            },
            update_manifest=False,
        )

        import_response = client.post(
            '/api/v1/migration/import',
            files={'file': ('migration.zip', tampered_content, 'application/zip')},
        )

    assert import_response.status_code == 400
    payload = import_response.json()
    assert payload['code'] != 0

    state = _collect_state()
    assert state == baseline


def test_import_migration_rejects_invalid_snapshot_payload_and_rolls_back():
    with TestClient(app) as client:
        _seed_exportable_data(client)
        baseline = _collect_state()
        export_response = client.post('/api/v1/migration/export')
        assert export_response.status_code == 200

        def break_snapshots(data: bytes) -> bytes:
            rows = [json.loads(line) for line in data.decode('utf-8').splitlines() if line.strip()]
            rows[-1]['payload'] = {
                'totals': {
                    'total_asset': 100,
                    'total_liability': 0,
                    'net_asset': 100,
                },
                'holdings': [
                    {
                        'id': 999999,
                        'member_id': 999999,
                        'name': '坏数据',
                    }
                ],
            }
            return '\n'.join(json.dumps(row, ensure_ascii=False) for row in rows).encode('utf-8')

        tampered_content = _rewrite_zip(
            export_response.content,
            {'daily_snapshots.ndjson': break_snapshots},
        )

        import_response = client.post(
            '/api/v1/migration/import',
            files={'file': ('migration.zip', tampered_content, 'application/zip')},
        )

    assert import_response.status_code == 400
    payload = import_response.json()
    assert payload['code'] != 0

    state = _collect_state()
    assert state == baseline


def test_import_migration_clears_snapshot_events_and_import_logs():
    """迁移恢复必须清掉导出包不含的域（snapshot_event / import_log），
    否则残留导入前旧家庭状态的“幽灵”历史。"""
    from sqlalchemy import func

    from app.models.import_log import ImportLog
    from app.models.snapshot_event import SnapshotEvent

    with TestClient(app) as client:
        _seed_exportable_data(client)
        export_response = client.post('/api/v1/migration/export')
        assert export_response.status_code == 200

        # 导出后制造幽灵历史：一条事件快照 + 一条导入日志
        with SessionLocal() as session:
            family = get_default_family(session)
            SnapshotService.create_event_snapshot(session, 'update', note='ghost')
            session.add(
                ImportLog(
                    family_id=family.id,
                    file_name='ghost.csv',
                    total_rows=1,
                    inserted_rows=1,
                )
            )
            session.commit()
            assert session.scalar(select(func.count()).select_from(SnapshotEvent)) > 0
            assert session.scalar(select(func.count()).select_from(ImportLog)) > 0

        import_response = client.post(
            '/api/v1/migration/import',
            files={'file': ('migration.zip', export_response.content, 'application/zip')},
        )
        assert import_response.status_code == 200

    with SessionLocal() as session:
        assert session.scalar(select(func.count()).select_from(SnapshotEvent)) == 0
        assert session.scalar(select(func.count()).select_from(ImportLog)) == 0
