"""Best-effort Telegram delivery only after the owning transaction commits."""
import json
import logging
from urllib.request import Request, urlopen

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import Settings


def notify_after_commit(db: Session, settings: Settings, email: str, action: str) -> None:
    if settings.telegram_bot_token and settings.telegram_chat_id:
        db.info.setdefault("telegram_notifications", []).append((settings, f"{email} {action}"))


def send_notification(settings: Settings, text: str) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    request = Request(
        f"https://api.telegram.org/bot{settings.telegram_bot_token.get_secret_value()}/sendMessage",
        data=json.dumps({"chat_id": settings.telegram_chat_id, "text": text}).encode(),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        # No retries: a timeout may occur after delivery; retrying can duplicate alerts.
        # urllib does not log the URL containing the bot token.
        with urlopen(request, timeout=settings.telegram_timeout_seconds) as response:
            return bool(json.loads(response.read()).get("ok"))
    except Exception:
        logging.getLogger(__name__).warning("Telegram notification delivery failed")
        return False


@event.listens_for(Session, "after_commit")
def deliver_notifications(db: Session) -> None:
    for settings, text in db.info.pop("telegram_notifications", []):
        send_notification(settings, text)


@event.listens_for(Session, "after_rollback")
def discard_notifications(db: Session) -> None:
    db.info.pop("telegram_notifications", None)
