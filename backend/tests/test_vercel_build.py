import pytest

from scripts import vercel_build


def test_vercel_build_skips_non_production(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    def fake_seed() -> None:
        nonlocal called
        called = True

    monkeypatch.setenv("VERCEL_ENV", "preview")
    monkeypatch.setattr(vercel_build, "seed", fake_seed)

    vercel_build.main()

    assert called is False


def test_vercel_build_requires_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(SystemExit, match="DATABASE_URL"):
        vercel_build.main()


def test_vercel_build_releases_production_database(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setenv("VERCEL_ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://example.invalid/app")
    monkeypatch.setattr(vercel_build, "seed", lambda: calls.append("seed"))

    vercel_build.main()

    assert calls == ["seed"]
