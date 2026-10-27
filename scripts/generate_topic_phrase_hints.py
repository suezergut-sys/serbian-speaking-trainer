"""Compatibility entrypoint for the bilingual short-fragment maintainer audit.

Use --export to write the reviewed checkpoint. Private phrases stay in artifacts.
"""
from audit_context_hints import main


if __name__ == "__main__":
    main()
