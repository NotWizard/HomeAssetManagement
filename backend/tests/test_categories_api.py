from fastapi.testclient import TestClient

from app.main import app


EXPECTED_ASSET_TREE = [
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

EXPECTED_LIABILITY_TREE = [
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


LEGACY_PLACEHOLDERS = {"默认一级", "默认二级", "默认三级", "外币现钞"}


def _project_tree(nodes: list[dict]) -> list[dict]:
    return [
        {
            "name": node["name"],
            "children": [
                {"name": child["name"], "children": [leaf["name"] for leaf in child["children"]]}
                for child in node["children"]
            ],
        }
        for node in nodes
    ]


def _collect_names(nodes: list[dict]) -> set[str]:
    names: set[str] = set()
    for node in nodes:
        names.add(node["name"])
        for child in node["children"]:
            names.add(child["name"])
            for leaf in child["children"]:
                names.add(leaf["name"])
    return names


def test_categories_api_returns_curated_asset_and_liability_trees():
    with TestClient(app) as client:
        asset_resp = client.get("/api/v1/categories", params={"type": "asset"})
        liability_resp = client.get("/api/v1/categories", params={"type": "liability"})

    assert asset_resp.status_code == 200
    assert liability_resp.status_code == 200

    asset_tree = asset_resp.json()["data"]
    liability_tree = liability_resp.json()["data"]

    assert _project_tree(asset_tree) == EXPECTED_ASSET_TREE
    assert _project_tree(liability_tree) == EXPECTED_LIABILITY_TREE

    all_names = _collect_names(asset_tree) | _collect_names(liability_tree)
    assert "美元现金" in all_names
    assert not (LEGACY_PLACEHOLDERS & all_names)
