"""Fail closed when production and local testlab Android assets are mixed."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile


def check_assets(apk: Path, variant: str) -> dict[str, object]:
    with ZipFile(apk) as archive:
        names = archive.namelist()
        config = json.loads(archive.read("assets/capacitor.config.json"))
        has_login = "assets/public/testlab.html" in names
        has_local_key = any(
            b"sb_publishable_testlab_local_only" in archive.read(name)
            for name in names if name.startswith("assets/public/") and name.endswith(".js")
        )
        android = config.get("android", {})
        mixed = android.get("allowMixedContent") is True or config.get("allowMixedContent") is True
        if variant == "prod" and (has_login or has_local_key or mixed):
            raise ValueError("Production APK contains testlab assets or transport configuration")
        if variant == "lab" and not (has_login and has_local_key and mixed):
            raise ValueError("Lab APK is missing its isolated test configuration")
        if config.get("server", {}).get("androidScheme") != "https":
            raise ValueError("Unexpected WebView scheme")
        return {"variant": variant, "test_login": has_login, "local_configuration": has_local_key,
                "mixed_content": mixed, "bytes": apk.stat().st_size}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--variant", choices=("prod", "lab"), required=True)
    args = parser.parse_args()
    print(json.dumps(check_assets(args.apk, args.variant)))
