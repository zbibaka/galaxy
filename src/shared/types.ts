/** A note, with its path relative to the vault root using "/" separators, and last-modified time in ms. */
export type Note = { path: string; content: string; mtime: number }

export type Vault = { root: string; notes: Note[] }

/** One line in the agent panel: what Claude said, a vault tool it used, an error, or a change waiting for approval. */
export type AgentEvent = { kind: 'text' | 'tool' | 'error'; text: string } | { kind: 'approve'; text: string; id: number }

/** n8n connection: its MCP URL when connected, and whether n8n may use the vault (with the URL and token to give it). */
export type N8nStatus = { url: string | null; shareOn: boolean; shareUrl: string; shareToken: string | null }

/** Guide mode as the overlay shows it: looking at the screen, thinking, pointing at a step, finished, or failed. */
export type GuideState =
  | { mode: 'looking' }
  | { mode: 'thinking' }
  | { mode: 'step'; say: string; x: number; y: number }
  | { mode: 'done'; say: string }
  | { mode: 'error'; say: string }

/** What the floating companion shows: the microphone indicator and guide mode. */
export type CompanionState = { listening: boolean; guide: GuideState | null }

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
  n8nStatus(): Promise<N8nStatus>
  /** Saves n8n's MCP URL and token (encrypted), or disconnects with null. */
  connectN8n(url: string | null, token?: string): Promise<N8nStatus>
  /** Starts or stops letting n8n read and write the vault. */
  shareVault(on: boolean): Promise<N8nStatus>
  /** Notes changed outside the app (by n8n); returns the unsubscribe function. */
  onVaultChanged(callback: (vault: Vault) => void): () => void
  /** Speech to text on this computer; `audio` is mono 16 kHz samples. */
  transcribe(audio: Float32Array): Promise<string>
  /** Saves a transcribed voice note as a new note; undo with undoAgent. */
  saveVoiceNote(text: string): Promise<AgentResult>
  /** Shows or hides the always-on-top microphone indicator. */
  setListening(on: boolean): void
  /** The push-to-talk shortcut was pressed; returns the unsubscribe function. */
  onTalkToggle(callback: () => void): () => void
  /** Guide mode: minimises Galaxy, looks at the screen and points at the first step. */
  startGuide(goal: string): Promise<void>
  nextGuide(): Promise<void>
  stopGuide(): void
  /** For the overlay: let its buttons take clicks while the mouse is over them. */
  setOverlayInteractive(on: boolean): void
  onCompanion(callback: (state: CompanionState) => void): () => void
}
