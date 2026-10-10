from __future__ import annotations

import unittest

from scribe_ui import (
    APP_VERSION,
    PRIVACY_EFFECTIVE_DATE,
    heading_levels,
    is_docs_topic,
    is_settings_section,
    paragraph_style_ids,
    short_version,
    ui_manifest,
    whats_new_highlights,
)


class ManifestTests(unittest.TestCase):
    def test_manifest_coherent(self) -> None:
        m = ui_manifest()
        self.assertEqual(m["version"], APP_VERSION)
        self.assertEqual(m["shortVersion"], short_version())
        self.assertEqual(len(m["whatsNewHighlights"]), 5)
        self.assertIn("agent", m["settingsSectionIds"])
        self.assertIn("nlp", m["settingsSectionIds"])
        self.assertEqual(len(m["privacyArticleIds"]), 10)
        self.assertEqual(m["privacyEffectiveDate"], PRIVACY_EFFECTIVE_DATE)
        self.assertEqual(len(m["docsTopicIds"]), 15)
        self.assertTrue(is_docs_topic("localAi"))
        self.assertTrue(is_settings_section("appearance"))
        self.assertFalse(is_settings_section("audit"))
        self.assertIn("title", m["paragraphStyleIds"])
        self.assertEqual(m["headingLevels"], heading_levels())
        self.assertEqual(m["whatsNewHighlights"], whats_new_highlights())
        self.assertEqual(m["paragraphStyleIds"], paragraph_style_ids())
        self.assertIn("general", m["agentRoleIds"])
        self.assertIn("spellcheck", m["agentRecipeIds"])
        self.assertIn("grove", m["uiSkinIds"])
        self.assertIn("untagged", m["smartFilterIds"])
        self.assertIn("light", m["themePresetIds"])
        self.assertEqual(m["routePaths"]["home"], "/")
        self.assertEqual(len(m["themePresetIds"]), 33)


if __name__ == "__main__":
    unittest.main()
