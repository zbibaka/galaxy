/** A note, with its path relative to the vault root using "/" separators, and last-modified time in ms. */
export type Note = { path: string; content: string; mtime: number }

export type Vault = { root: string; notes: Note[] }

/** One line in the agent panel: what Claude said, a vault tool it used, an error, or a change waiting for approval. */
export type AgentEvent = { kind: 'text' | 'tool' | 'error'; text: string } | { kind: 'approve'; text: string; id: number }

/** Jev's suggestion to move a loose note into a constellation (top-level folder). */
export type Filing = { path: string; folder: string; confidence: number }

/** After an agent run or undo: the notes it changed, the reloaded vault, and the error if it failed. */
export type AgentResult = { changed: string[]; vault: Vault; error?: string }

/** What the preload exposes to the page as `window.galaxy`. */
export interface GalaxyApi {
  lastVault(): Promise<Vault | null>
  pickVault(): Promise<Vault | null>
  createNote(path: string): Promise<void>
  writeNote(path: string, content: string): Promise<void>
  /** Blocking save, only for the moment the window closes. */
  writeNoteSync(path: string, content: string): void
  /** Claude Code's version, or null if it is not installed. */
  agentStatus(): Promise<string | null>
  runAgent(prompt: string): Promise<AgentResult>
  stopAgent(): void
  /** Restores the notes the last run changed. */
  undoAgent(): Promise<AgentResult>
  /** Calls back for each step of the running agent; returns the unsubscribe function. */
  onAgentEvent(callback: (event: AgentEvent) => void): () => void
  /** Answers an 'approve' event: let the paused change run, or refuse it. */
  decideAgent(id: number, allow: boolean): void
  /** Whether a Jev API key is saved. */
  jevStatus(): Promise<boolean>
  /** Saves a Jev API key (encrypted), or removes it with null. */
  setJevKey(key: string | null): Promise<void>
  suggestFiling(): Promise<Filing[]>
  /** Moves notes into their folders; undo with undoAgent. */
  fileNotes(moves: Filing[]): Promise<AgentResult>
}
