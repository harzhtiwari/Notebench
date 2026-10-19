/**
Single source of truth for workbench autosave timing and contract (Tk 15, Decisions 1.40 & 4.4).

Ephemeral draft: flushed every 300ms of typing.
Version commit: committed to SQLite WAL on a 2,000ms quiet window,
a 30,000ms hard ceiling, or blur / navigation.
*/
export interface AutosavePolicy {
  readonly draftDebounceMs: number;
  readonly commitQuietMs: number;
  readonly commitCeilingMs: number;
}

export const autosavePolicy: AutosavePolicy = {
  draftDebounceMs: 300,
  commitQuietMs: 2000,
  commitCeilingMs: 30_000,
};

export type AutosaveStatus = "idle" | "drafting" | "saving" | "saved" | "error";
