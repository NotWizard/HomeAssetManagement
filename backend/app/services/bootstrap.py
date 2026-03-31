from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import engine
from app.models.category import Category
from app.models.family import Family
from app.models.holding_item import HoldingItem
from app.models.settings import SettingsModel


ASSET_CATEGORY_TREE = [
    {
        "name": "现金与存款",
        "children": [
            {"name": "现金", "children": ["人民币现金", "美元现金"]},
            {"name": "银行存款", "children": ["活期存款", "定期存款", "大额存单"]},
            {"name": "支付账户", "children": ["支付宝余额", "微信余额", "其他支付余额"]},
        ],
    },
    {
        "name": "稳健投资",
        "children": [
            {"name": "货币类", "children": ["货币基金", "现金管理类理财"]},
            {"name": "固收类", "children": ["银行理财", "债券基金", "国债/债券"]},
        ],
    },
    {
        "name": "权益投资",
        "children": [
            {"name": "股票", "children": ["A股", "港股", "美股/海外股票"]},
            {"name": "基金", "children": ["指数基金/ETF", "主动权益基金", "REITs"]},
        ],
    },
    {
        "name": "保障与储备",
        "children": [
            {"name": "保险", "children": ["寿险现金价值", "年金险现金价值", "万能险账户价值"]},
            {"name": "长期账户", "children": ["住房公积金", "个人养老金", "养老保险个人账户"]},
        ],
    },
    {
        "name": "不动产",
        "children": [
            {"name": "住宅", "children": ["自住房", "投资住宅"]},
            {"name": "商业及附属", "children": ["商铺/写字楼", "车位/车库"]},
        ],
    },
    {
        "name": "实物资产",
        "children": [
            {"name": "车辆", "children": ["家用汽车", "其他车辆"]},
            {"name": "贵重物品", "children": ["黄金贵金属", "珠宝奢侈品", "收藏品"]},
        ],
    },
    {
        "name": "经营与往来",
        "children": [
            {"name": "经营资产", "children": ["公司股权", "合伙份额", "经营设备"]},
            {"name": "应收资产", "children": ["亲友借出款", "应收账款", "押金保证金"]},
        ],
    },
]

LIABILITY_CATEGORY_TREE = [
    {
        "name": "房屋相关负债",
        "children": [
            {"name": "住房贷款", "children": ["商业房贷", "公积金贷款", "组合贷款"]},
            {"name": "房产抵押贷款", "children": ["抵押经营贷", "抵押消费贷", "装修贷"]},
        ],
    },
    {
        "name": "消费负债",
        "children": [
            {"name": "信用卡", "children": ["已出账单", "未出账单", "分期余额"]},
            {"name": "互联网消费信贷", "children": ["花呗/白条类", "其他平台消费贷"]},
            {"name": "银行消费贷", "children": ["个人信用贷", "教育/医疗/装修消费贷"]},
        ],
    },
    {
        "name": "车辆及耐用品负债",
        "children": [
            {"name": "车贷", "children": ["新车贷款", "二手车贷款"]},
            {"name": "分期付款", "children": ["手机数码分期", "家电家具分期"]},
        ],
    },
    {
        "name": "经营负债",
        "children": [
            {"name": "经营贷款", "children": ["小微经营贷", "流动资金贷款", "对公借款"]},
            {"name": "经营应付款", "children": ["应付货款", "应付租金", "其他经营应付款"]},
        ],
    },
    {
        "name": "投资杠杆负债",
        "children": [
            {"name": "融资类", "children": ["融资融券", "质押借款"]},
            {"name": "其他杠杆", "children": ["配资/其他杠杆融资"]},
        ],
    },
    {
        "name": "往来及其他负债",
        "children": [
            {"name": "亲友借款", "children": ["短期借款", "长期借款"]},
            {"name": "其他应付款", "children": ["医疗欠款", "学费欠款", "税费及其他欠款"]},
        ],
    },
]

LEGACY_CATEGORY_NAMES = {"默认一级", "默认二级", "默认三级"}


def init_database() -> None:
    ensure_database_schema()
    with Session(engine) as session:
        ensure_seed_data(session)
        session.commit()


def ensure_database_schema() -> None:
    from app.services.schema_migration import run_database_migrations

    run_database_migrations(str(engine.url))


def ensure_seed_data(session: Session) -> None:
    _ensure_default_family(session)
    _ensure_default_settings(session)
    _ensure_default_categories(session)


def _ensure_default_family(session: Session) -> Family:
    family = session.scalar(select(Family).limit(1))
    if family:
        return family
    family = Family(name="我的家庭")
    session.add(family)
    session.flush()
    return family


def _ensure_default_settings(session: Session) -> None:
    settings = get_settings()
    family = _ensure_default_family(session)
    exists = session.scalar(
        select(SettingsModel).where(SettingsModel.family_id == family.id).limit(1)
    )
    if exists:
        return
    session.add(
        SettingsModel(
            family_id=family.id,
            base_currency=settings.base_currency,
            timezone=settings.timezone,
            rebalance_threshold_pct=settings.rebalance_threshold_pct,
            fx_provider="frankfurter",
        )
    )


def _ensure_default_categories(session: Session) -> None:
    existing = list(session.scalars(select(Category).order_by(Category.level.asc(), Category.id.asc())))

    if not existing:
        _seed_category_tree(session, "asset", ASSET_CATEGORY_TREE)
        _seed_category_tree(session, "liability", LIABILITY_CATEGORY_TREE)
        return

    if _should_replace_legacy_categories(session, existing):
        for row in sorted(existing, key=lambda item: item.level, reverse=True):
            session.delete(row)
        session.flush()
        _seed_category_tree(session, "asset", ASSET_CATEGORY_TREE)
        _seed_category_tree(session, "liability", LIABILITY_CATEGORY_TREE)
        return

    _ensure_curated_category_tree(session, "asset", ASSET_CATEGORY_TREE)
    _ensure_curated_category_tree(session, "liability", LIABILITY_CATEGORY_TREE)


def _should_replace_legacy_categories(session: Session, categories: list[Category]) -> bool:
    if not categories:
        return True

    if any(category.name not in LEGACY_CATEGORY_NAMES for category in categories):
        return False

    holding_exists = session.scalar(select(HoldingItem.id).limit(1))
    return holding_exists is None


def _ensure_curated_category_tree(session: Session, category_type: str, tree: list[dict]) -> None:
    existing_root_names = set(
        session.scalars(
            select(Category.name).where(Category.type == category_type, Category.level == 1)
        )
    )

    for root_index, root_node in enumerate(tree, start=1):
        if root_node["name"] in existing_root_names:
            continue
        _seed_category_subtree(session, category_type, root_node, root_index)


def _seed_category_tree(session: Session, category_type: str, tree: list[dict]) -> None:
    for l1_index, l1_node in enumerate(tree, start=1):
        _seed_category_subtree(session, category_type, l1_node, l1_index)



def _seed_category_subtree(session: Session, category_type: str, l1_node: dict, l1_sort_order: int) -> None:
    l1 = Category(
        type=category_type,
        level=1,
        parent_id=None,
        name=l1_node["name"],
        sort_order=l1_sort_order,
    )
    session.add(l1)
    session.flush()

    for l2_index, l2_node in enumerate(l1_node["children"], start=1):
        l2 = Category(
            type=category_type,
            level=2,
            parent_id=l1.id,
            name=l2_node["name"],
            sort_order=l2_index,
        )
        session.add(l2)
        session.flush()

        for l3_index, l3_name in enumerate(l2_node["children"], start=1):
            session.add(
                Category(
                    type=category_type,
                    level=3,
                    parent_id=l2.id,
                    name=l3_name,
                    sort_order=l3_index,
                )
            )
