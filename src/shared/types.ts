/** A note, with its path relative to the vault root using "/" separators. */
export type Note = { path: string; content: string }

export type Vault = { root: string; notes: Note[] }

/** What the preload exposes to the page as `window.galaxy`. */
export interface GalaxyApi {
  lastVault(): Promise<Vault | null>
  pickVault(): Promise<Vault | null>
  createNote(path: string): Promise<void>
  writeNote(path: string, content: string): Promise<void>
  /** Blocking save, only for the moment the window closes. */
  writeNoteSync(path: string, content: string): void
}
