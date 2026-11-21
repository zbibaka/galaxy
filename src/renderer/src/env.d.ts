import type { GalaxyApi } from '../../shared/types'

declare global {
  interface Window {
    galaxy: GalaxyApi
  }
}

export {}
