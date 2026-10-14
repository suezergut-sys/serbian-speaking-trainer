"""Request-scoped feedback language; older clients retain Russian by default."""
from contextvars import ContextVar

interface_language: ContextVar[str] = ContextVar("interface_language", default="ru")


def parse_interface_language(header: str) -> str:
    first = header.split(",", 1)[0].split(";", 1)[0].strip().lower()
    return "en" if first == "en" or first.startswith("en-") else "ru"
