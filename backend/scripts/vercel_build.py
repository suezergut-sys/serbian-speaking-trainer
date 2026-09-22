"""Apply production migrations and the idempotent catalog seed during deploy."""

import os

from app.db.cli import seed


def main() -> None:
    if os.getenv("VERCEL_ENV") != "production":
        print("Skipping database release outside Vercel production.")
        return
    if not os.getenv("DATABASE_URL"):
        raise SystemExit("DATABASE_URL is required for a production deployment.")
    seed()


if __name__ == "__main__":
    main()
