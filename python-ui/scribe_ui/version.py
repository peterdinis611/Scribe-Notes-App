"""App version chrome — keep in sync with package.json / crates/scribe-ui."""

from __future__ import annotations

from importlib import metadata
from typing import TypedDict


def _package_version() -> str:
    try:
        return metadata.version("scribe-python-ui")
    except metadata.PackageNotFoundError:
        # Editable / PYTHONPATH checkout without install.
        return "3.4.0"


APP_VERSION: str = _package_version()


def short_version_of(version: str) -> str:
    parts = version.split(".")
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}"
    if parts:
        return parts[0]
    return version


def short_version() -> str:
    return short_version_of(APP_VERSION)


class AppVersionInfo(TypedDict):
    version: str
    shortVersion: str


def app_version_info() -> AppVersionInfo:
    return {
        "version": APP_VERSION,
        "shortVersion": short_version(),
    }
