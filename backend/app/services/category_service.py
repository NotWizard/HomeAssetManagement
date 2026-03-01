from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.category import Category


class CategoryService:
    @staticmethod
    def get_tree(session: Session, category_type: str) -> list[dict]:
        rows = list(
            session.scalars(
                select(Category)
                .where(Category.type == category_type)
                .order_by(Category.level.asc(), Category.sort_order.asc(), Category.id.asc())
            )
        )

        by_id: dict[int, dict] = {}
        roots: list[dict] = []
        for row in rows:
            by_id[row.id] = {
                "id": row.id,
                "type": row.type,
                "level": row.level,
                "name": row.name,
                "parent_id": row.parent_id,
                "children": [],
            }

        for row in rows:
            node = by_id[row.id]
            if row.parent_id and row.parent_id in by_id:
                by_id[row.parent_id]["children"].append(node)
            else:
                roots.append(node)

        return roots

    @staticmethod
    def resolve_path(session: Session, l1_id: int, l2_id: int, l3_id: int, ctype: str) -> tuple[Category, Category, Category]:
        l1 = session.get(Category, l1_id)
        l2 = session.get(Category, l2_id)
        l3 = session.get(Category, l3_id)

        if not l1 or not l2 or not l3:
            raise ValueError("分类不存在")
        if l1.type != ctype or l2.type != ctype or l3.type != ctype:
            raise ValueError("分类类型不一致")
        if l1.level != 1 or l2.level != 2 or l3.level != 3:
            raise ValueError("分类层级不正确")
        if l2.parent_id != l1.id or l3.parent_id != l2.id:
            raise ValueError("分类路径不匹配")

        return l1, l2, l3

    @staticmethod
    def resolve_path_by_name(
        session: Session, ctype: str, l1_name: str, l2_name: str, l3_name: str
    ) -> tuple[Category, Category, Category]:
        l1 = session.scalar(
            select(Category).where(
                Category.type == ctype, Category.level == 1, Category.name == l1_name
            )
        )
        if l1 is None:
            raise ValueError(f"找不到一级分类: {l1_name}")

        l2 = session.scalar(
            select(Category).where(
                Category.type == ctype,
                Category.level == 2,
                Category.name == l2_name,
                Category.parent_id == l1.id,
            )
        )
        if l2 is None:
            raise ValueError(f"找不到二级分类: {l2_name}")

        l3 = session.scalar(
            select(Category).where(
                Category.type == ctype,
                Category.level == 3,
                Category.name == l3_name,
                Category.parent_id == l2.id,
            )
        )
        if l3 is None:
            raise ValueError(f"找不到三级分类: {l3_name}")

        return l1, l2, l3
