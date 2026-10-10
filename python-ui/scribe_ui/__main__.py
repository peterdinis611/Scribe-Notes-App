"""CLI: print ``ui_manifest`` as JSON (handy for scripts / debugging)."""

from __future__ import annotations

import json
import sys

from .manifest import ui_manifest


def main() -> None:
    json.dump(ui_manifest(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
