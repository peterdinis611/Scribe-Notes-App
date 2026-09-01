export function importTitleFromPath(path: string, fallback: string) {
  const fileName = path.split(/[/\\]/).pop() ?? fallback
  const stem = fileName.replace(/\.[^.]+$/, '').trim()
  return stem || fallback
}

export function isPagesPath(path: string) {
  return /\.pages$/i.test(path) || /\.pages\/?$/i.test(path)
}
