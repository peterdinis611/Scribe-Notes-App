/** Keep in sync with package.json / src-tauri version fields. */
export const APP_VERSION = '2.0.0'

/** Major.minor for “Scribe 2.0” chrome. */
export const APP_SHORT_VERSION = APP_VERSION.split('.').slice(0, 2).join('.')
