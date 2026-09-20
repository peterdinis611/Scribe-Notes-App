"""Optional Argos Translate for offline SK↔EN rewrite modes."""

from __future__ import annotations

from functools import lru_cache

from .extras import has_argos


@lru_cache(maxsize=1)
def argos_ready() -> bool:
    if not has_argos():
        return False
    try:
        from argostranslate import translate

        installed = translate.get_installed_languages()
        codes = {str(lang.code).lower() for lang in installed}
        return "en" in codes and "sk" in codes
    except Exception:
        return False


def ensure_argos_packages() -> bool:
    """Best-effort install of en↔sk packages (needs network once)."""
    if not has_argos():
        return False
    if argos_ready():
        return True
    try:
        from argostranslate import package, translate

        package.update_package_index()
        available = package.get_available_packages()
        wanted = {
            ("en", "sk"),
            ("sk", "en"),
        }
        for pkg in available:
            pair = (str(pkg.from_code).lower(), str(pkg.to_code).lower())
            if pair in wanted:
                package.install_from_path(pkg.download())
        argos_ready.cache_clear()
        return argos_ready()
    except Exception:
        return False


def translate_argos(text: str, *, source: str, target: str) -> str | None:
    """Translate with Argos when language packs are installed; else None."""
    if not text.strip():
        return ""
    if not argos_ready() and not ensure_argos_packages():
        return None
    try:
        from argostranslate import translate

        languages = translate.get_installed_languages()
        from_lang = next((lang for lang in languages if lang.code == source), None)
        to_lang = next((lang for lang in languages if lang.code == target), None)
        if from_lang is None or to_lang is None:
            return None
        translation = from_lang.get_translation(to_lang)
        if translation is None:
            return None
        return translation.translate(text)
    except Exception:
        return None
