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
        "name": "现金存款类",
        "children": [
            {"name": "现金", "children": ["人民币现金", "外币现金"]},
            {"name": "银行存款", "children": ["活期", "定期", "大额存单", "通知存款"]},
            {"name": "支付账户", "children": ["支付宝", "微信", "数字人民币", "其他"]},
            {"name": "货基/T+0 理财", "children": ["货币基金", "现金管理类理财"]},
        ],
    },
    {
        "name": "固定收益类",
        "children": [
            {"name": "债券", "children": ["国债", "地方政府债", "企业债", "可转债"]},
            {"name": "固收基金", "children": ["纯债基金", "一级债基", "二级债基"]},
            {"name": "银行理财", "children": ["R1-R2 稳健", "R3 平衡", "结构性存款"]},
            {"name": "信托与资管", "children": ["集合信托", "资管计划", "私募固收"]},
        ],
    },
    {
        "name": "权益与另类",
        "children": [
            {"name": "股票", "children": ["A股", "港股", "美股海外"]},
            {"name": "公募基金", "children": ["指数/ETF", "主动权益", "混合型"]},
            {"name": "REITs", "children": ["公募 REITs", "海外 REITs"]},
            {"name": "另类投资", "children": ["PE/VC", "对冲", "商品期货", "贵金属账户"]},
        ],
    },
    {
        "name": "数字资产",
        "children": [
            {"name": "主流加密", "children": ["BTC", "ETH", "稳定币 USDT-USDC"]},
            {"name": "其他代币", "children": ["山寨币", "平台币", "DeFi"]},
            {"name": "NFT 与链上资产", "children": ["NFT", "GameFi"]},
        ],
    },
    {
        "name": "退休与长期账户",
        "children": [
            {"name": "法定养老", "children": ["社保个人账户"]},
            {"name": "补充养老", "children": ["企业年金", "职业年金", "个人养老金"]},
            {"name": "公积金", "children": ["住房公积金"]},
            {"name": "教育储备", "children": ["子女教育金"]},
        ],
    },
    {
        "name": "保险账户",
        "children": [
            {"name": "寿险类", "children": ["终身寿现金价值", "定期寿现金价值"]},
            {"name": "年金险", "children": ["传统年金", "分红型年金"]},
            {"name": "万能/投连", "children": ["万能险账户价值", "投连险账户价值"]},
        ],
    },
    {
        "name": "不动产",
        "children": [
            {"name": "住宅", "children": ["公寓", "别墅", "商品住宅", "自建房"]},
            {"name": "商业不动产", "children": ["商铺", "写字楼", "厂房"]},
            {"name": "其他不动产", "children": ["车位车库", "土地使用权", "海外不动产"]},
        ],
    },
    {
        "name": "车辆",
        "children": [
            {"name": "家用车辆", "children": ["燃油车", "新能源车", "摩托车"]},
            {"name": "其他车辆", "children": ["商用车", "房车", "游艇"]},
        ],
    },
    {
        "name": "其他实物",
        "children": [
            {"name": "贵金属与珠宝", "children": ["黄金实物", "白银铂金实物", "珠宝首饰"]},
            {"name": "艺术与收藏", "children": ["艺术品", "古董", "名表", "名酒"]},
            {"name": "其他高价值", "children": ["奢侈品", "乐器装备"]},
        ],
    },
    {
        "name": "经营资产",
        "children": [
            {"name": "股权类", "children": ["公司股权", "合伙份额"]},
            {"name": "经营性实物", "children": ["经营设备", "商铺装修"]},
            {"name": "经营性账户", "children": ["经营银行账户", "经营性货款"]},
        ],
    },
]

LIABILITY_CATEGORY_TREE = [
    {
        "name": "住房负债",
        "children": [
            {"name": "房屋按揭", "children": ["商业房贷", "公积金贷款", "组合贷款"]},
            {"name": "房产抵押贷", "children": ["抵押消费贷", "抵押经营贷"]},
            {"name": "装修与配套", "children": ["装修贷", "家装分期"]},
        ],
    },
    {
        "name": "经营负债",
        "children": [
            {"name": "经营性贷款", "children": ["小微经营贷", "流动资金贷款"]},
            {"name": "对公借款", "children": ["股东借款", "关联企业借款"]},
        ],
    },
    {
        "name": "消费负债",
        "children": [
            {"name": "信用卡", "children": ["已出账", "未出账", "分期"]},
            {"name": "互联网消费信贷", "children": ["花呗白条类", "京东金融", "美团消费贷"]},
            {"name": "银行消费贷", "children": ["个人信用贷", "教育医疗消费贷"]},
        ],
    },
    {
        "name": "车辆与耐用品负债",
        "children": [
            {"name": "车贷", "children": ["新车贷款", "二手车贷款", "车辆抵押贷"]},
            {"name": "耐用品分期", "children": ["手机数码", "家电家具"]},
        ],
    },
    {
        "name": "投资杠杆负债",
        "children": [
            {"name": "证券融资", "children": ["融资融券", "期权保证金"]},
            {"name": "质押借款", "children": ["股票质押", "基金质押"]},
            {"name": "其他杠杆", "children": ["配资", "加密杠杆"]},
        ],
    },
    {
        "name": "亲友借款",
        "children": [
            {"name": "短期借款", "children": ["1 年内"]},
            {"name": "长期借款", "children": ["1 年以上"]},
            {"name": "其他个人往来", "children": ["合伙人借款", "同事借款"]},
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
