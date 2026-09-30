"""Unit tests for PostgreSQL testlab safety; never download or start PostgreSQL."""

from __future__ import annotations

import importlib.util
import contextlib
import io
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("postgres_testlab.py")
SPEC = importlib.util.spec_from_file_location("postgres_testlab", MODULE_PATH)
assert SPEC and SPEC.loader
lab = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(lab)


class PostgresTestlabSafetyTests(unittest.TestCase):
    def test_paths_must_be_strict_descendants_of_lab(self) -> None:
        self.assertTrue(lab._inside(lab.LAB_ROOT / "cluster", lab.LAB_ROOT))
        self.assertFalse(lab._inside(lab.LAB_ROOT, lab.LAB_ROOT))
        self.assertFalse(lab._inside(lab.REPOSITORY / "backend", lab.LAB_ROOT))
        with self.assertRaises(lab.LabError):
            lab._require_lab_path(lab.REPOSITORY / "backend" / "data")

    def test_archive_traversal_is_rejected_before_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "traversal.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("../outside.txt", "must not be written")
            with self.assertRaisesRegex(lab.LabError, "outside the testlab"):
                lab._safe_extract(archive, lab.LAB_ROOT / "safe-extraction-test")
            self.assertFalse((Path(temp).parent / "outside.txt").exists())

    def test_archive_extracts_valid_files_inside_isolated_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fixture_root = Path(temp) / "postgres-lab"
            fixture_root.mkdir()
            archive = Path(temp) / "valid.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("pgsql/bin/postgres.exe", b"fixture binary")
                zf.writestr("pgsql/share/test.conf", "fixture config")
            lab._safe_extract(archive, fixture_root, permitted_root=fixture_root)
            self.assertEqual((fixture_root / "pgsql/bin/postgres.exe").read_bytes(), b"fixture binary")
            self.assertEqual((fixture_root / "pgsql/share/test.conf").read_text(encoding="utf-8"), "fixture config")

    def test_archive_rejects_absolute_and_drive_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            for name in ("/absolute.txt", "C:/outside.txt"):
                archive = Path(temp) / "bad.zip"
                with zipfile.ZipFile(archive, "w") as zf:
                    zf.writestr(name, "no")
                with self.assertRaises(lab.LabError):
                    lab._safe_extract(archive, lab.LAB_ROOT / "safe-extraction-test")

    def test_server_only_extraction_omits_bundled_gui(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "lab"
            archive = Path(temp) / "server.zip"
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("pgsql/bin/postgres.exe", b"synthetic binary")
                zf.writestr("pgsql/lib/test.dll", b"synthetic library")
                zf.writestr("pgsql/share/postgresql.conf.sample", "synthetic config")
                zf.writestr("pgsql/pgAdmin 4/long/path/file", "unused GUI")
            lab._safe_extract(archive, root, permitted_root=root, server_only=True)
            self.assertTrue((root / "pgsql/bin/postgres.exe").is_file())
            self.assertTrue((root / "pgsql/share/postgresql.conf.sample").is_file())
            self.assertFalse((root / "pgsql/pgAdmin 4").exists())

    def test_server_start_does_not_leave_inherited_capture_pipes(self) -> None:
        with patch.object(lab.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)) as mocked:
            lab._run(["pg_ctl", "start"], starting_server=True)
        self.assertNotIn("capture_output", mocked.call_args.kwargs)
        self.assertEqual(mocked.call_args.kwargs["stdout"], subprocess.DEVNULL)
        self.assertEqual(mocked.call_args.kwargs["stderr"], subprocess.DEVNULL)

    def test_pytest_targets_are_confined_to_backend_tests(self) -> None:
        python = Path(__import__("sys").executable)
        selected = lab.REPOSITORY / "backend" / "tests" / "test_database_configuration.py"
        resolved_python, files = lab._validate_backend_inputs(python, [selected.name])
        self.assertEqual(resolved_python, python.resolve())
        self.assertEqual(files, [selected.resolve()])
        with self.assertRaises(lab.LabError):
            lab._validate_backend_inputs(python, ["../../.env"])

    def test_password_is_escaped_in_test_only_dsn(self) -> None:
        dsn = lab._make_dsn("test:password/@value")
        self.assertIn("127.0.0.1:55432/serbotalk_concurrency_test", dsn)
        self.assertIn("test%3Apassword%2F%40value", dsn)
        lab._validate_dsn(dsn)

    def test_production_or_remote_database_urls_are_rejected(self) -> None:
        for dsn in (
            "postgresql://localhost/app",
            "postgresql+psycopg://postgres:secret@db.example.com:55432/serbotalk_concurrency_test",
            "postgresql+psycopg://postgres:secret@127.0.0.1:5432/serbotalk_concurrency_test",
            "postgresql+psycopg://postgres:secret@127.0.0.1:55432/production",
        ):
            with self.subTest(dsn=dsn), self.assertRaises(lab.LabError):
                lab._validate_dsn(dsn)

    def test_test_environment_pins_local_backend_settings(self) -> None:
        inherited = {
            "OPENAI_API_KEY": "real-key-must-not-survive",
            "SUPABASE_URL": "https://production.example",
            "SUPABASE_PUBLISHABLE_KEY": "real-supabase-key",
            "SUPABASE_JWT_SECRET": "real-jwt-secret",
            "ADMIN_EMAILS": "owner@example.com",
            "APP_ENV": "production",
            "DATABASE_URL": "postgresql://production.example/app",
            "DOTENV_PATH": "production.env",
            "PGHOSTADDR": "203.0.113.77",
            "PGSERVICE": "production",
            "PGSERVICEFILE": "production-service.conf",
            "PGPASSWORD": "inherited-libpq-password",
        }
        dsn = lab._make_dsn("test-password")
        child = lab._build_test_env(dsn, inherited)
        self.assertEqual(child["OPENAI_API_KEY"], "")
        self.assertEqual(child["SUPABASE_URL"], "")
        self.assertEqual(child["SUPABASE_PUBLISHABLE_KEY"], "")
        self.assertNotIn("SUPABASE_JWT_SECRET", child)
        self.assertEqual(child["ADMIN_EMAILS"], "")
        self.assertEqual(child["APP_ENV"], "testlab")
        self.assertEqual(child["DATABASE_URL"], dsn)
        self.assertEqual(child["TEST_POSTGRES_URL"], dsn)
        self.assertEqual(child["SERBOTALK_TESTLAB"], "1")
        self.assertNotIn("DOTENV_PATH", child)
        for key in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE", "PGPASSWORD"):
            self.assertNotIn(key, child)
        self.assertEqual(inherited["DATABASE_URL"], "postgresql://production.example/app")

    def test_runner_redacts_child_output_and_does_not_print_dsn(self) -> None:
        secret_dsn = lab._make_dsn("private-test-password")
        python = Path(sys.executable)
        output = io.StringIO()
        completed = subprocess.CompletedProcess([], 0, f"reported {secret_dsn}\n", "")
        with patch.object(lab, "_verify_marker"), patch.object(lab, "_port_available", return_value=False), \
                patch.object(lab, "_ensure_database"), patch.object(
                    lab, "_validate_backend_inputs", return_value=(python, [MODULE_PATH.resolve()])), \
                patch.object(lab, "_dsn", return_value=secret_dsn), patch.object(
                    lab, "_run", return_value=completed) as mock_run, contextlib.redirect_stdout(output):
            lab.run_tests(python, ["test_postgres_testlab.py"])
        self.assertNotIn("private-test-password", output.getvalue())
        self.assertNotIn(secret_dsn, output.getvalue())
        self.assertIn("<testlab-dsn>", output.getvalue())
        child_env = mock_run.call_args.kwargs["env"]
        self.assertEqual(child_env["OPENAI_API_KEY"], "")
        self.assertEqual(child_env["SUPABASE_URL"], "")
        self.assertEqual(child_env["APP_ENV"], "testlab")

    def test_command_environment_uses_c_locale_without_mutating_caller(self) -> None:
        supplied = {"PATH": "test-path", "LANG": "ru_RU.UTF-8", "LC_ALL": "ru_RU.UTF-8",
                    "PGHOSTADDR": "203.0.113.77", "PGSERVICE": "production",
                    "PGSERVICEFILE": "production-service.conf", "PGPASSWORD": "owned-test-password"}
        fake_result = subprocess.CompletedProcess([], 0, "", "")
        with patch.object(lab.subprocess, "run", return_value=fake_result) as mocked:
            lab._run(["fake"], env=supplied)
        child_env = mocked.call_args.kwargs["env"]
        self.assertEqual(child_env["LANG"], "C")
        self.assertEqual(child_env["LC_ALL"], "C")
        for key in ("PGHOSTADDR", "PGSERVICE", "PGSERVICEFILE"):
            self.assertNotIn(key, child_env)
        self.assertEqual(child_env["PGPASSWORD"], "owned-test-password")
        self.assertEqual(supplied["LANG"], "ru_RU.UTF-8")
        self.assertEqual(supplied["PGHOSTADDR"], "203.0.113.77")


if __name__ == "__main__":
    unittest.main()
