/// <reference types="vite/client" />
import type { VectorMindApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Preload bridge; absent when running outside Electron (e.g. tests). */
    vectormind?: VectorMindApi
  }
}

export {}
