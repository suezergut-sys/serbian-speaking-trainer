from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import AdminUserResponse, CurrentUserResponse
from app.api.dependencies import get_current_user, require_admin
from app.services.auth_service import UserService

from app.schemas.auth import AndroidPremiumClaim, UserPreferences

router = APIRouter(tags=["users"])


@router.post("/auth/review-login", include_in_schema=False)
def review_login() -> None:
    raise HTTPException(410, "Review sign-in has been retired", headers={"Cache-Control": "no-store"})


@router.get("/auth/me", response_model=CurrentUserResponse)
def current_user(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserResponse:
    return UserService(db).current_response(user)


@router.get("/admin/users", response_model=list[AdminUserResponse])
def list_users(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AdminUserResponse]:
    return UserService(db).list_users()


@router.post("/auth/me/android-premium", response_model=CurrentUserResponse)
def claim_android_premium(
    payload: AndroidPremiumClaim,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserResponse:
    response.headers["Cache-Control"] = "no-store"
    service = UserService(db)
    return service.current_response(service.grant_android_premium(user))


@router.get("/auth/me/preferences", response_model=UserPreferences)
def preferences(user: User = Depends(get_current_user)) -> UserPreferences:
    return UserPreferences(assistance_enabled=user.assistance_enabled)


@router.patch("/auth/me/preferences", response_model=UserPreferences)
def update_preferences(
    payload: UserPreferences,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPreferences:
    UserService(db).update_preferences(user, payload.assistance_enabled)
    return payload
