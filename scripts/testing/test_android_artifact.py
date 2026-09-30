import json
from zipfile import ZipFile

import pytest
from check_android_artifact import check_assets


def fixture_apk(path, *, lab=False, legacy_mixed=False):
    config = {"server": {"androidScheme": "https"}}
    if lab:
        config["android"] = {"allowMixedContent": True}
    if legacy_mixed:
        config["allowMixedContent"] = True
    with ZipFile(path, "w") as archive:
        archive.writestr("assets/capacitor.config.json", json.dumps(config))
        archive.writestr("assets/public/main.js", "sb_publishable_testlab_local_only" if lab else "ordinary app")
        if lab:
            archive.writestr("assets/public/testlab.html", "isolated login")


def test_production_rejects_local_assets_and_legacy_transport(tmp_path):
    apk = tmp_path / "fixture.apk"
    fixture_apk(apk)
    assert not check_assets(apk, "prod")["test_login"]
    fixture_apk(apk, lab=True)
    with pytest.raises(ValueError, match="Production APK"):
        check_assets(apk, "prod")
    assert check_assets(apk, "lab")["test_login"]
    fixture_apk(apk, legacy_mixed=True)
    with pytest.raises(ValueError, match="Production APK"):
        check_assets(apk, "prod")
