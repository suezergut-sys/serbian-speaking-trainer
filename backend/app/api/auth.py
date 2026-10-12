from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.schemas import AdminUserResponse, CurrentUserResponse
from app.api.dependencies import get_current_user, require_admin
from app.services.auth_service import UserService

from app.schemas.auth import UserPreferences
from app.schemas.auth import ReviewLoginRequest, ReviewLoginResponse
from app.config import Settings, get_settings
from app.services.auth_service import AuthenticationUnavailableError
from app.services.review_login import ReviewLoginService, ReviewLoginRateLimitError

router = APIRouter(tags=["users"])


@router.post("/auth/review-login", response_model=ReviewLoginResponse)
def review_login(payload: ReviewLoginRequest, response: Response, settings: Settings = Depends(get_settings)) -> ReviewLoginResponse:
    response.headers["Cache-Control"] = "no-store"
    try:
        return ReviewLoginService(settings).sign_in(payload.username, payload.password.get_secret_value())
    except PermissionError:
        raise HTTPException(401, "Review sign-in failed", headers={"Cache-Control": "no-store"}) from None
    except ReviewLoginRateLimitError:
        raise HTTPException(429, "Try again later", headers={"Cache-Control": "no-store", "Retry-After": "60"}) from None
    except AuthenticationUnavailableError:
        raise HTTPException(503, "Review sign-in is unavailable", headers={"Cache-Control": "no-store"}) from None


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
