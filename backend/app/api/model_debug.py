from fastapi import APIRouter, Depends, HTTPException, Response
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


@router.get("/logs/{log_id}/audio")
def debug_audio(log_id: str, user: User = Depends(require_debug_admin), db: Session = Depends(get_db)):
    result = DebugModeService(db, user.id).audio(log_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Debug audio not found")
    payload, content_type = result
    return Response(payload, media_type=content_type, headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})
