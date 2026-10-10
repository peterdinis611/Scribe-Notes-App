"""CLI: ``python -m scribe_ui`` → manifest JSON; ``python -m scribe_ui html <surface>``."""

from __future__ import annotations

import argparse
import json
import sys

from .manifest import ui_manifest


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="scribe-ui", description="Scribe Python UI")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("manifest", help="Print ui_manifest JSON (default)")

    html_parser = sub.add_parser("html", help="Render a chrome surface to HTML")
    html_parser.add_argument(
        "surface",
        nargs="?",
        default="whats-new",
        choices=["whats-new", "welcome", "about", "privacy", "docs"],
    )
    html_parser.add_argument(
        "--fragment",
        action="store_true",
        help="Body fragment only (no document shell)",
    )
    html_parser.add_argument("--version", default="3.4.0")
    html_parser.add_argument("--short-version", default=None)

    args = parser.parse_args(argv)

    if args.cmd == "html":
        from .html import render_surface

        sys.stdout.write(
            render_surface(
                args.surface,
                version=args.version,
                short_version=args.short_version,
                full_document=not args.fragment,
            )
        )
        if not args.fragment:
            sys.stdout.write("\n" if not sys.stdout.isatty() else "")
        return

    # Default / manifest
    json.dump(ui_manifest(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
