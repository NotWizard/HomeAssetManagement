from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.category import Category
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.member import Member
from app.services.bootstrap import _ensure_default_categories


def test_ensure_default_categories_seeds_curated_tree_beside_legacy_tree_when_holdings_exist():
    engine = create_engine('sqlite:///:memory:', future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)

    with SessionLocal() as session:
        family = Family(name='测试家庭')
        session.add(family)
        session.flush()

        member = Member(family_id=family.id, name='Alice')
        session.add(member)
        session.flush()

        asset_l1 = Category(type='asset', level=1, parent_id=None, name='默认一级', sort_order=1)
        session.add(asset_l1)
        session.flush()
        asset_l2 = Category(type='asset', level=2, parent_id=asset_l1.id, name='默认二级', sort_order=1)
        session.add(asset_l2)
        session.flush()
        asset_l3 = Category(type='asset', level=3, parent_id=asset_l2.id, name='默认三级', sort_order=1)
        session.add(asset_l3)
        session.flush()

        liability_l1 = Category(type='liability', level=1, parent_id=None, name='默认一级', sort_order=1)
        session.add(liability_l1)
        session.flush()
        liability_l2 = Category(type='liability', level=2, parent_id=liability_l1.id, name='默认二级', sort_order=1)
        session.add(liability_l2)
        session.flush()
        liability_l3 = Category(type='liability', level=3, parent_id=liability_l2.id, name='默认三级', sort_order=1)
        session.add(liability_l3)
        session.flush()

        session.add(
            HoldingItem(
                family_id=family.id,
                member_id=member.id,
                type='asset',
                name='旧资产',
                category_l1_id=asset_l1.id,
                category_l2_id=asset_l2.id,
                category_l3_id=asset_l3.id,
                currency='CNY',
                amount_original=Decimal('100'),
                amount_base=Decimal('100'),
                target_ratio=Decimal('10'),
                source='manual',
                is_deleted=False,
            )
        )
        session.flush()

        _ensure_default_categories(session)
        session.flush()

        asset_root_names = list(
            session.scalars(
                select(Category.name).where(Category.type == 'asset', Category.level == 1).order_by(Category.id.asc())
            )
        )
        liability_root_names = list(
            session.scalars(
                select(Category.name).where(Category.type == 'liability', Category.level == 1).order_by(Category.id.asc())
            )
        )

        assert '默认一级' in asset_root_names
        assert '现金与存款' in asset_root_names
        assert '房屋相关负债' in liability_root_names
