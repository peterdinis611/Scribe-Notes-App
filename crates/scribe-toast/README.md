# scribe-toast

User-configurable toast preferences and pure stacking / duration logic for Scribe.

Canonical for Tauri + MCP + FE (keep `src/lib/toast/settings.ts` in sync).

## Settings

| Field | Default | Notes |
|-------|---------|-------|
| `enabled` | `true` | Master mute |
| `position` | `bottom-right` | Corner of the viewport |
| `durationMs` | `3500` | Auto-dismiss without action |
| `durationWithActionMs` | `8000` | Auto-dismiss with action button |
| `exitMs` | `200` | Exit animation |
| `maxVisible` | `5` | Stack cap |
| `stackBehavior` | `drop-oldest` | `drop-oldest` \| `drop-newest` \| `replace-same` |
| `pauseOnHover` | `true` | FE host may pause timers |
| `showSuccess` / `showError` / `showInfo` / `showDefault` | `true` | Per-variant mute |
| `respectReducedMotion` | `true` | Skip enter/exit motion when OS asks |
| `dense` | `false` | Compact padding |

## API

- `default_toast_settings()` / `normalize_toast_settings`
- `resolve_duration` / `should_show_variant`
- `apply_stack` — insert + enforce max / behavior
- `position_class` — host CSS class helper
