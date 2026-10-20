from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.api.dependencies import require_debug_admin
from app.db import get_db
from app.models import User
from app.schemas.model_debug import DebugMode
from app.services.debug_mode import DebugModeService
from app.config import Settings, get_settings
from app.schemas.transcription_settings import TranscriptionModelSelection, TranscriptionModelSettings
from app.services.transcription_settings import TranscriptionSettingsService

router = APIRouter(prefix="/admin/model-debug", tags=["model debug"])


@router.get("/transcription", response_model=TranscriptionModelSettings)
def transcription_settings(user: User = Depends(require_debug_admin), db: Session = Depends(get_db),
                           settings: Settings = Depends(get_settings)):
    return TranscriptionSettingsService(db, settings, user.id).read()


@router.patch("/transcription", response_model=TranscriptionModelSettings)
def change_transcription_settings(payload: TranscriptionModelSelection, user: User = Depends(require_debug_admin),
                                  db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    try:
        return TranscriptionSettingsService(db, settings, user.id).change(payload.model)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unknown transcription model") from exc


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
