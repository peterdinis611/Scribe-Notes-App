export function base64ToPdfUrl(dataBase64: string): string {
  const bytes = Uint8Array.from(atob(dataBase64), (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}
