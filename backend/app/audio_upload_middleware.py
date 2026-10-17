from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings

MULTIPART_OVERHEAD_BYTES = 64_000


class AudioUploadBodyLimitMiddleware:
    """Buffer the one audio route in memory and reject it before multipart can spool to disk."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("path") not in {"/api/transcriptions", "/api/feedback/transcribe"}:
            await self.app(scope, receive, send)
            return

        max_body_bytes = get_settings().max_audio_bytes + MULTIPART_OVERHEAD_BYTES
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > max_body_bytes:
                response = JSONResponse({"detail": "Audio is too large"}, status_code=413)
                await response(scope, receive, send)
                return
            if not message.get("more_body", False):
                break

        sent = False

        async def replay_body() -> Message:
            nonlocal sent
            if sent:
                return {"type": "http.request", "body": b"", "more_body": False}
            sent = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay_body, send)
