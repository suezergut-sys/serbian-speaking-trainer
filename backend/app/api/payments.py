from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, require_admin
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas.payments import AdminPaymentResponse, PaymentChoice, PaymentDecision, PaymentReport, PaymentResponse
from app.services.payments import PaymentError, PaymentService

router = APIRouter(tags=["payments"])


def service(response: Response, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> PaymentService:
    response.headers["Cache-Control"] = "no-store"
    return PaymentService(db, settings.manual_payments)


def run(action):
    try:
        return action()
    except PaymentError as exc:
        raise HTTPException(exc.status, exc.code, headers={"Cache-Control": "no-store"}) from None


@router.get("/payments/options")
def options(_user: User = Depends(get_current_user), svc: PaymentService = Depends(service)):
    return svc.options()


@router.get("/payments", response_model=list[PaymentResponse])
def mine(user: User = Depends(get_current_user), svc: PaymentService = Depends(service)):
    return svc.repo.mine(user.id)


@router.post("/payments", response_model=PaymentResponse)
def create(payload: PaymentChoice, user: User = Depends(get_current_user), svc: PaymentService = Depends(service)):
    return run(lambda: svc.create(user, payload))


@router.post("/payments/{payment_id}/report", response_model=PaymentResponse)
def report(payment_id: str, payload: PaymentReport, user: User = Depends(get_current_user), svc: PaymentService = Depends(service)):
    return run(lambda: svc.report(user, payment_id, payload))


@router.post("/payments/{payment_id}/cancel", response_model=PaymentResponse)
def cancel(payment_id: str, user: User = Depends(get_current_user), svc: PaymentService = Depends(service)):
    return run(lambda: svc.cancel(user, payment_id))


@router.get("/admin/payments", response_model=list[AdminPaymentResponse])
def admin_list(offset: int = Query(default=0, ge=0, le=1000000), _admin: User = Depends(require_admin), svc: PaymentService = Depends(service)):
    return [AdminPaymentResponse(**PaymentResponse.model_validate(payment).model_dump(), email=user.email, display_name=user.display_name)
            for payment, user in svc.repo.admin_list(offset)]


@router.patch("/admin/payments/{payment_id}", response_model=PaymentResponse)
def decide(payment_id: str, payload: PaymentDecision, admin: User = Depends(require_admin), svc: PaymentService = Depends(service)):
    return run(lambda: svc.decide(admin, payment_id, payload))
