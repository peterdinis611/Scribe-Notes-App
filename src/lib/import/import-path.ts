/** Keep in sync with `crates/scribe-ui` counterpart. */
export function importTitleFromPath(path: string, fallback: string) {
  const fileName = path.split(/[/\\]/).pop() ?? fallback
  const stem = fileName.replace(/\.[^.]+$/, '').trim()
  return stem || fallback
}

export function isPagesPath(path: string) {
  return /\.pages$/i.test(path) || /\.pages\/?$/i.test(path)
}

export function isNumbersPath(path: string) {
  return /\.numbers$/i.test(path) || /\.numbers\/?$/i.test(path)
}

export function isKeynotePath(path: string) {
  return /\.key$/i.test(path) || /\.key\/?$/i.test(path)
}
