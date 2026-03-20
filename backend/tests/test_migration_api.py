import hashlib
import io
import json
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy import select

from app.core.database import SessionLocal
from app.main import app
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.models.settings import SettingsModel
from app.models.snapshot_daily import SnapshotDaily
from app.services.snapshot_service import SnapshotService


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
        family = session.scalar(select(Family).limit(1))
        settings = session.scalar(select(SettingsModel).limit(1))
        members = list(session.scalars(select(Member).order_by(Member.id.asc())))
        holdings = list(
            session.scalars(
                select(HoldingItem)
                .where(HoldingItem.is_deleted.is_(False))
                .order_by(HoldingItem.id.asc())
            )
        )
        snapshots = list(
            session.scalars(select(SnapshotDaily).order_by(SnapshotDaily.snapshot_date.asc()))
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
