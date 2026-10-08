from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.dependencies import require_debug_admin
from app.db import get_db
from app.models import User
from app.schemas.model_debug import DebugMode
from app.services.debug_mode import DebugModeService

router = APIRouter(prefix="/admin/model-debug", tags=["model debug"])


@router.get("", response_model=DebugMode)
def debug_mode(user: User = Depends(require_debug_admin), db: Session = Depends(get_db)):
    return DebugModeService(db, user.id).read()


@router.patch("", response_model=DebugMode)
def change_debug_mode(payload: DebugMode, user: User = Depends(require_debug_admin), db: Session = Depends(get_db)):
    return DebugModeService(db, user.id).change(payload.enabled)
