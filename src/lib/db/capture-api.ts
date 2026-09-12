import { invoke } from '@/lib/tauri'

export type CaptureStatus = {
  running: boolean
  port: number | null
  url: string | null
  token: string | null
  lanIp: string | null
  inboxFolderId: string | null
}

export type CaptureCreatedEvent = {
  documentId: string
  title: string
  folderId: string
}

export const captureStatus = () => invoke<CaptureStatus>('capture_status')
export const captureStart = () => invoke<CaptureStatus>('capture_start')
export const captureStop = () => invoke<CaptureStatus>('capture_stop')
