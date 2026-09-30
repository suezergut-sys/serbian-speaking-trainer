"""Portable, loopback-only PostgreSQL test lab (Windows binaries)."""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
import shutil
import socket
import subprocess
import sys
import urllib.request
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlsplit


REPOSITORY = Path(__file__).resolve().parents[2]
LAB_ROOT = REPOSITORY / "artifacts" / "testlab" / "postgres"
DATA_DIR = LAB_ROOT / "cluster"
MARKER = LAB_ROOT / ".serbotalk-testlab-marker"
PASSWORD_FILE = LAB_ROOT / ".cluster-password"
LOG_FILE = LAB_ROOT / "postgres.log"
PORT = 55432
DB_NAME = "serbotalk_concurrency_test"
ARCHIVE_URL = "https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip"
ARCHIVE_NAME = "postgresql-17.11-3-windows-x64-binaries.zip"
ARCHIVE_LIMIT = 1_500_000_000
DOWNLOAD_TIMEOUT = 120
COMMAND_TIMEOUT = 40
MAX_START_WAIT = 35
MARKER_PREFIX = "serbian-speaking-trainer-postgres-testlab-v1|"


class LabError(RuntimeError):
    pass


def _verify_root() -> None:
    repository = REPOSITORY.resolve()
    expected_base = repository / "artifacts" / "testlab"
    actual_base = (repository / "artifacts" / "testlab").resolve()
    expected_root = expected_base / "postgres"
    actual_root = LAB_ROOT.resolve()
    if actual_base != expected_base or actual_root != expected_root:
        raise LabError("PostgreSQL testlab path traverses a symlink; refusing filesystem changes")


def _inside(path: Path, parent: Path) -> bool:
    resolved_path = path.resolve()
    resolved_parent = parent.resolve()
    return resolved_path != resolved_parent and resolved_parent in resolved_path.parents


def _require_lab_path(path: Path) -> Path:
    _verify_root()
    resolved = path.resolve()
    if not _inside(resolved, LAB_ROOT):
        raise LabError(f"Refusing path outside PostgreSQL testlab: {resolved}")
    return resolved


def _verify_marker() -> None:
    _require_lab_path(DATA_DIR)
    _require_lab_path(MARKER)
    if not MARKER.is_file():
        raise LabError("PostgreSQL testlab ownership marker is missing or invalid")
    if not DATA_DIR.is_dir():
        raise LabError("PostgreSQL testlab cluster directory is missing")
    recorded = MARKER.read_text(encoding="utf-8").strip()
    actual = _cluster_system_id()
    if not recorded.startswith(MARKER_PREFIX) or recorded[len(MARKER_PREFIX):] != actual:
        raise LabError("PostgreSQL testlab ownership marker does not match this cluster")


def _cluster_system_id() -> str:
    result = _run([str(_binary("pg_controldata")), "-D", str(DATA_DIR)], timeout=15)
    _need_success(result, "Cluster identity check")
    for line in result.stdout.splitlines():
        if line.strip().startswith("Database system identifier:"):
            return line.partition(":")[2].strip()
    raise LabError("Unable to verify PostgreSQL cluster system identifier")


def _binary(name: str) -> Path:
    candidates = list(LAB_ROOT.glob(f"pgsql/bin/{name}.exe"))
    if len(candidates) != 1 or not candidates[0].is_file():
        raise LabError(f"Portable PostgreSQL binary is missing: {name}.exe; run setup")
    return _require_lab_path(candidates[0])


def _run(args: list[str], *, timeout: int = COMMAND_TIMEOUT, env: dict[str, str] | None = None,
         starting_server: bool = False) -> subprocess.CompletedProcess[str]:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    child_env = dict(os.environ if env is None else env)
    for key in list(child_env):
        if key.upper().startswith("PG") and not (env is not None and key.upper() == "PGPASSWORD"):
            child_env.pop(key, None)
    child_env["LC_ALL"] = "C"
    child_env["LANG"] = "C"
    try:
        # A Windows server descendant can inherit PIPE handles and keep communicate()
        # waiting after pg_ctl exits. Server logs already go to the owned LOG_FILE.
        capture = ({"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
                   if starting_server else {"capture_output": True})
        return subprocess.run(args, cwd=LAB_ROOT, env=child_env, **capture,
                              text=True, timeout=timeout, check=False,
                              creationflags=flags)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise LabError(f"PostgreSQL testlab command failed safely: {type(exc).__name__}") from exc


def _need_success(result: subprocess.CompletedProcess[str], action: str) -> None:
    if result.returncode:
        detail = (result.stderr or result.stdout or "See the owned testlab postgres.log.").strip()
        raise LabError(f"{action} failed (exit {result.returncode}): {detail[-1200:]}")


def _port_available() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        try:
            sock.bind(("127.0.0.1", PORT))
        except OSError:
            return False
    return True


def _safe_extract(archive: Path, target: Path, *, permitted_root: Path | None = None,
                  server_only: bool = False) -> None:
    if permitted_root is None:
        _verify_root()
        permitted_root = LAB_ROOT
    root = permitted_root.resolve()
    target = target.resolve()
    if target != root and root not in target.parents:
        raise LabError("Archive extraction target is outside the permitted testlab directory")
    with zipfile.ZipFile(archive) as zf:
        members = zf.infolist()
        for member in members:
            name = member.filename.replace("\\", "/")
            pure = PurePosixPath(name)
            mode = member.external_attr >> 16
            if (not pure.parts or pure.is_absolute() or ".." in pure.parts
                    or (pure.parts and ":" in pure.parts[0])):
                raise LabError("Archive contains a path outside the testlab directory")
            if mode and (mode & 0o170000) == 0o120000:
                raise LabError("Archive contains a symbolic link; extraction refused")
            output = target.joinpath(*pure.parts)
            if not _inside(output, target):
                raise LabError("Archive contains a path outside the testlab directory")
        target.mkdir(parents=True, exist_ok=True)
        for member in members:
            parts = PurePosixPath(member.filename.replace("\\", "/")).parts
            if server_only and (len(parts) < 2 or parts[0] != "pgsql" or parts[1] not in {"bin", "lib", "share"}):
                continue
            output = target.joinpath(*PurePosixPath(member.filename.replace("\\", "/")).parts)
            if not _inside(output, target):
                raise LabError("Archive contains a path outside the testlab directory")
            if member.is_dir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(member, "r") as src, output.open("xb") as dst:
                    shutil.copyfileobj(src, dst)


def setup() -> None:
    _verify_root()
    LAB_ROOT.mkdir(parents=True, exist_ok=True)
    archive = _require_lab_path(LAB_ROOT / ARCHIVE_NAME)
    if archive.exists() or (LAB_ROOT / "pgsql").exists() or DATA_DIR.exists():
        raise LabError("Testlab setup target already exists; refusing to overwrite anything")
    temporary = _require_lab_path(LAB_ROOT / f".download-{uuid.uuid4().hex}.tmp")
    request = urllib.request.Request(ARCHIVE_URL, headers={"User-Agent": "SerbianSpeakingTrainer-testlab/1"})
    digest = hashlib.sha256()
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT) as response, temporary.open("xb") as output:
            if response.geturl() != ARCHIVE_URL:
                raise LabError("Archive URL redirected; refusing unexpected download source")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > ARCHIVE_LIMIT:
                    raise LabError("PostgreSQL archive exceeds the configured size limit")
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    if total == 0:
        temporary.unlink(missing_ok=True)
        raise LabError("Downloaded PostgreSQL archive is empty")
    print(f"Downloaded official PostgreSQL Windows archive ({total} bytes), SHA-256 {digest.hexdigest()} (observed; vendor checksum not verified).")
    # Server tools only; bundled pgAdmin exceeds Windows MAX_PATH in deep worktrees.
    _safe_extract(temporary, LAB_ROOT, server_only=True)
    temporary.unlink()
    initdb = _binary("initdb")
    version = _run([str(_binary("postgres")), "--version"], timeout=10)
    _need_success(version, "Version check")
    print(version.stdout.strip())
    password = secrets.token_urlsafe(36)
    password_path = _require_lab_path(PASSWORD_FILE)
    if DATA_DIR.exists() or MARKER.exists() or password_path.exists():
        raise LabError("Cluster target already exists; refusing to overwrite anything")
    password_path.write_text(password, encoding="utf-8")
    try:
        result = _run([str(initdb), "-D", str(_require_lab_path(DATA_DIR)), "-U", "postgres",
                       "--pwfile", str(password_path), "--auth=scram-sha-256",
                       "--encoding=UTF8", "--locale=C"], timeout=COMMAND_TIMEOUT)
        _need_success(result, "Cluster initialization")
        MARKER.write_text(MARKER_PREFIX + _cluster_system_id(), encoding="utf-8")
        print("Isolated cluster initialized. Its password remains in ignored testlab artifacts.")
    except Exception:
        # Preserve extracted binaries and the password file for safe inspection/recovery.
        raise


def _server_env() -> dict[str, str]:
    env = os.environ.copy()
    for key in list(env):
        if key.upper().startswith("PG"):
            env.pop(key, None)
    env["PGPASSWORD"] = PASSWORD_FILE.read_text(encoding="utf-8")
    return env


def start() -> None:
    _verify_marker()
    if not _port_available():
        result = _run([str(_binary("pg_ctl")), "-D", str(DATA_DIR), "status"], timeout=10)
        if result.returncode == 0:
            _ensure_database()
            print("Owned PostgreSQL testlab is already running on 127.0.0.1:55432.")
            return
        raise LabError("Port 55432 is occupied by an unverified process; refusing to start")
    options = "-h 127.0.0.1 -p 55432 -c max_connections=20 -c shared_buffers=64MB -c log_statement=none"
    result = _run([str(_binary("pg_ctl")), "-D", str(DATA_DIR), "-l", str(LOG_FILE),
                   "-o", options, "-w", "-t", str(MAX_START_WAIT), "start"],
                  timeout=MAX_START_WAIT + 5, starting_server=True)
    _need_success(result, "Server start")
    _ensure_database()
    print("Isolated PostgreSQL testlab is ready on 127.0.0.1:55432.")


def _make_dsn(password: str) -> str:
    return f"postgresql+psycopg://postgres:{quote(password, safe='')}@127.0.0.1:{PORT}/{DB_NAME}"


def _validate_dsn(dsn: str) -> None:
    parsed = urlsplit(dsn)
    if (parsed.scheme != "postgresql+psycopg" or parsed.hostname != "127.0.0.1"
            or parsed.port != PORT or parsed.username != "postgres"
            or parsed.path != f"/{DB_NAME}" or parsed.query or parsed.fragment):
        raise LabError("Refusing database URL outside the isolated PostgreSQL testlab")


def _dsn() -> str:
    dsn = _make_dsn(PASSWORD_FILE.read_text(encoding="utf-8"))
    _validate_dsn(dsn)
    return dsn


def _ensure_database() -> None:
    _verify_server_identity()
    result = _run([str(_binary("psql")), "-h", "127.0.0.1", "-p", str(PORT), "-U", "postgres",
                   "-d", "postgres", "-w", "-tAc", f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'"],
                  env=_server_env(), timeout=15)
    _need_success(result, "Database check")
    if result.stdout.strip() == "1":
        return
    create = _run([str(_binary("createdb")), "-h", "127.0.0.1", "-p", str(PORT), "-U", "postgres",
                   "-w", "--encoding=UTF8", DB_NAME], env=_server_env(), timeout=15)
    _need_success(create, "Test database creation")


def _verify_server_identity() -> None:
    result = _run([str(_binary("psql")), "-h", "127.0.0.1", "-p", str(PORT), "-U", "postgres",
                   "-d", "postgres", "-w", "-tAc",
                   "SELECT current_setting('data_directory') || '|' || current_setting('port') || '|' || current_setting('listen_addresses')"],
                  env=_server_env(), timeout=15)
    _need_success(result, "Loopback server identity check")
    fields = result.stdout.strip().split("|")
    if len(fields) != 3:
        raise LabError("Unexpected PostgreSQL server identity response")
    if (Path(fields[0]).resolve() != DATA_DIR.resolve() or fields[1] != str(PORT)
            or fields[2] != "127.0.0.1"):
        raise LabError("Port 55432 serves a PostgreSQL instance outside the owned testlab cluster")


def status() -> None:
    _verify_marker()
    result = _run([str(_binary("pg_ctl")), "-D", str(DATA_DIR), "status"], timeout=10)
    if result.returncode == 0:
        print("Owned PostgreSQL testlab is running.")
    else:
        print("Owned PostgreSQL testlab is stopped.")


def stop() -> None:
    _verify_marker()
    result = _run([str(_binary("pg_ctl")), "-D", str(DATA_DIR), "-m", "fast", "-w", "-t",
                   str(MAX_START_WAIT), "stop"], timeout=MAX_START_WAIT + 5)
    if result.returncode == 0:
        print("Owned PostgreSQL testlab stopped.")
    else:
        print("Owned PostgreSQL testlab was already stopped.")


def _validate_backend_inputs(python: Path, pytest_files: list[str]) -> tuple[Path, list[Path]]:
    python = python.resolve(strict=True)
    if not python.is_file() or python.name.lower() not in {"python.exe", "python"}:
        raise LabError("--python must name the backend virtualenv Python executable")
    tests_root = (REPOSITORY / "backend" / "tests").resolve()
    files: list[Path] = []
    for item in pytest_files:
        candidate = (tests_root / item).resolve()
        if tests_root not in candidate.parents or candidate.suffix != ".py":
            raise LabError("Each pytest file must be a Python file inside backend/tests")
        if not candidate.is_file():
            raise LabError("Selected pytest file does not exist")
        files.append(candidate)
    if not files:
        raise LabError("Provide at least one --pytest-file")
    return python, files


def _build_test_env(dsn: str, source: dict[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if source is None else source)
    for key in list(env):
        upper = key.upper()
        if upper.startswith("PG") or any(token in upper for token in ("OPENAI", "SUPABASE", "GOOGLE", "SECRET", "TOKEN", "PASSWORD")):
            env.pop(key, None)
    env.update({
        "OPENAI_API_KEY": "",
        "SUPABASE_URL": "",
        "SUPABASE_PUBLISHABLE_KEY": "",
        "ADMIN_EMAILS": "",
        "APP_ENV": "testlab",
        "TEST_POSTGRES_URL": dsn,
        "DATABASE_URL": dsn,
        "SERBOTALK_TESTLAB": "1",
        "PYTHONPATH": str(REPOSITORY / "backend"),
    })
    env.pop("DOTENV_PATH", None)
    return env


def run_tests(python: Path, pytest_files: list[str]) -> None:
    _verify_marker()
    if _port_available():
        raise LabError("Owned PostgreSQL testlab is stopped; run start first")
    _ensure_database()
    python, files = _validate_backend_inputs(python, pytest_files)
    test_dsn = _dsn()
    env = _build_test_env(test_dsn)
    result = _run([str(python), "-m", "pytest", "-q", *map(str, files)],
                  timeout=180, env=env)
    if result.stdout:
        print(result.stdout.replace(_dsn(), "<testlab-dsn>"), end="")
    if result.returncode:
        safe_error = result.stderr.replace(_dsn(), "<testlab-dsn>") if result.stderr else ""
        if safe_error:
            print(safe_error, file=sys.stderr, end="")
        raise LabError(f"Selected PostgreSQL integration tests failed (exit {result.returncode}).")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("setup", help="download official binaries and initialize an isolated cluster")
    sub.add_parser("start", help="start only the owned loopback cluster and create its test database")
    sub.add_parser("status", help="report the owned cluster state")
    sub.add_parser("stop", help="stop only the owned cluster")
    tests = sub.add_parser("run-tests", help="run selected backend pytest files with a test-only DSN")
    tests.add_argument("--python", type=Path, required=True)
    tests.add_argument("--pytest-file", action="append", required=True)
    args = parser.parse_args()
    try:
        if args.command == "setup":
            setup()
        elif args.command == "start":
            start()
        elif args.command == "status":
            status()
        elif args.command == "stop":
            stop()
        else:
            run_tests(args.python, args.pytest_file)
    except (LabError, OSError, urllib.error.URLError, zipfile.BadZipFile) as exc:
        print(f"PostgreSQL testlab: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
