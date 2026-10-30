"""Operator tool: defaults to inspection; execution requires verified email.

SUPABASE_SERVICE_ROLE_KEY is read from backend/operator environment only.
Never pass the key on the command line or print provider payloads.
"""
import argparse
import os
import sys
from pathlib import Path

import httpx
from pydantic import ValidationError
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings
from app.db.session import engine
from app.models import User
from app.schemas.auth import SupabaseUserPayload
from app.services.account_deletion import AccountDeletionService


def provider_remover(base_url: str, secret: str):
    def remove(user_id: str, confirmed_email: str) -> None:
        with httpx.Client(timeout=10, transport=httpx.HTTPTransport(retries=1)) as client:
            url = f'{base_url.rstrip("/")}/auth/v1/admin/users/{user_id}'
            headers = {'apikey': secret, 'Authorization': f'Bearer {secret}'}
            response = client.get(url, headers=headers)
            if response.status_code == 404:
                return
            if response.status_code != 200:
                raise RuntimeError('Auth identity verification failed; account remains blocked')
            try:
                payload = SupabaseUserPayload.model_validate(response.json())
            except (ValueError, ValidationError):
                raise RuntimeError('Invalid Auth identity response') from None
            if payload.id != user_id or payload.email.casefold() != confirmed_email.strip().casefold():
                raise PermissionError('Auth identity does not match the confirmed request')
            response = client.delete(url, headers=headers)
            if response.status_code not in (200, 204, 404):
                raise RuntimeError('Auth deletion failed; retry the verified request')
            if client.get(url, headers=headers).status_code != 404:
                raise RuntimeError('Auth deletion is not yet verified; account remains blocked')
    return remove


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user-id', required=True)
    parser.add_argument('--confirmed-email', required=True)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    with Session(engine) as db:
        user = db.get(User, args.user_id)
        if user is None:
            print('Account is already absent from the application database')
            return
        if user.role == 'admin' or user.email.casefold() != args.confirmed_email.strip().casefold():
            raise SystemExit('Refusing an unconfirmed or administrator account deletion')
        if not args.execute:
            print('Verified application identity; dry run only. No data was changed')
            return
        settings = get_settings()
        secret = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
        if not settings.supabase_url or not secret:
            raise SystemExit('Set backend SUPABASE_URL and operator SUPABASE_SERVICE_ROLE_KEY')
        try:
            AccountDeletionService(db).erase(args.user_id, args.confirmed_email,
                provider_remover(settings.supabase_url, secret))
        except (httpx.HTTPError, RuntimeError, PermissionError):
            raise SystemExit('Deletion not complete. Inspect the verified request and retry; no secrets were logged') from None
        print('Auth identity removal verified; application account and dependent rows deleted')


if __name__ == '__main__':
    main()
