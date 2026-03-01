from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.response import ok
from app.schemas.member import MemberCreate
from app.schemas.member import MemberUpdate
from app.services.member_service import MemberService

router = APIRouter()


@router.get("")
def list_members(db: Session = Depends(get_db)):
    members = MemberService.list_members(db)
    return ok(
        [
            {
                "id": m.id,
                "family_id": m.family_id,
                "name": m.name,
                "created_at": m.created_at.isoformat(),
                "updated_at": m.updated_at.isoformat(),
            }
            for m in members
        ]
    )


@router.post("")
def create_member(payload: MemberCreate, db: Session = Depends(get_db)):
    member = MemberService.create_member(db, payload.name)
    db.commit()
    db.refresh(member)
    return ok(
        {
            "id": member.id,
            "family_id": member.family_id,
            "name": member.name,
            "created_at": member.created_at.isoformat(),
            "updated_at": member.updated_at.isoformat(),
        }
    )


@router.put("/{member_id}")
def update_member(member_id: int, payload: MemberUpdate, db: Session = Depends(get_db)):
    member = MemberService.update_member(db, member_id, payload.name)
    db.commit()
    db.refresh(member)
    return ok(
        {
            "id": member.id,
            "family_id": member.family_id,
            "name": member.name,
            "created_at": member.created_at.isoformat(),
            "updated_at": member.updated_at.isoformat(),
        }
    )


@router.delete("/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db)):
    MemberService.delete_member(db, member_id)
    db.commit()
    return ok(True)
