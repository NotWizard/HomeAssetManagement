from app.core.database import SessionLocal
from app.models.member import Member
from app.services.bootstrap import init_database
from app.services.import_service import ImportService


def test_import_preview_detects_insert_or_update_actions():
    init_database()
    with SessionLocal() as session:
        member = session.query(Member).filter(Member.name == "Alice").first()
        if member is None:
            member = Member(family_id=1, name="Alice")
            session.add(member)
            session.commit()

        content = "\n".join(
            [
                "name,type,member,category_l1,category_l2,category_l3,currency,amount_original,target_ratio",
                "US ETF,asset,Alice,权益投资,基金,指数基金/ETF,USD,1000,30",
            ]
        ).encode("utf-8")

        preview = ImportService.preview_csv(session, content)
        assert preview["total_rows"] == 1
        assert preview["failed_rows"] == 0
        assert preview["inserted_rows"] == 1
