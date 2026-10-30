import sys

import pytest

from scripts.backfill_source_versions import main


@pytest.mark.parametrize('contents,execute', [('DATABASE_URL=""\n', False), ('DATABASE_URL="postgresql://synthetic.invalid/example"\n', True)])
def test_redacted_operator_environment_is_rejected_before_any_database_or_ai_access(tmp_path, monkeypatch, capsys, contents, execute):
    env = tmp_path / 'operator.env'
    env.write_text(contents)
    monkeypatch.setattr(sys, 'argv', ['backfill_source_versions', '--env-file', str(env), *(['--execute'] if execute else [])])
    with pytest.raises(SystemExit) as error:
        main()
    assert error.value.code == 2
    message = capsys.readouterr().err
    assert 'incomplete or redacted' in message
    assert 'postgresql://' not in message
