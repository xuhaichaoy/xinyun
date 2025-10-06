import { v4 as uuid } from "uuid";

import type {
  BackupEntry,
  GameSettings,
  PlayerProgress,
  SaveSlot,
  SaveState,
  AiDifficulty,
} from "@/types/domain";

export const STORAGE_VERSION = 1;
export const DEFAULT_SLOT_COUNT = 3;
export const STORAGE_KEY = "nebula-cards:save";

export interface CreateSaveOptions {
  name?: string;
  aiDifficulty?: AiDifficulty;
}

const DEFAULT_SETTINGS: GameSettings = {
  soundEnabled: true,
  volume: 0.8,
  graphicsQuality: "high",
  aiDifficulty: "normal",
  controlScheme: "auto",
};

const DEFAULT_PROGRESS: PlayerProgress = {
  unlockedLevels: [1],
  achievements: [],
  lastCompletedLevel: undefined,
  playTimeSeconds: 0,
};

export const createSlot = (name: string, options?: Partial<SaveSlot>): SaveSlot => {
  const now = new Date().toISOString();
  return {
    id: options?.id ?? uuid(),
    name,
    createdAt: options?.createdAt ?? now,
    updatedAt: options?.updatedAt ?? now,
    progress: options?.progress ?? { ...DEFAULT_PROGRESS },
    settings: options?.settings ?? { ...DEFAULT_SETTINGS },
  };
};

export const createInitialState = (): SaveState => {
  const slots = Array.from({ length: DEFAULT_SLOT_COUNT }).map((_, index) =>
    createSlot(`存档 ${index + 1}`)
  );
  return {
    version: STORAGE_VERSION,
    activeSlotId: slots[0]?.id ?? null,
    slots,
    backups: [],
  };
};

type AnySaveState = SaveState & Record<string, unknown>;

export const migrateSaveState = (state: AnySaveState | undefined): SaveState => {
  if (!state) {
    return createInitialState();
  }

  let migrated: SaveState = {
    version: typeof state.version === "number" ? state.version : 0,
    activeSlotId: typeof state.activeSlotId === "string" || state.activeSlotId === null
      ? state.activeSlotId
      : null,
    slots: Array.isArray(state.slots) ? state.slots.map(sanitizeSlot) : [],
    backups: Array.isArray(state.backups) ? state.backups.map(sanitizeBackup) : [],
  };

  if (migrated.slots.length === 0) {
    migrated.slots = createInitialState().slots;
  }

  if (!migrated.activeSlotId || !migrated.slots.some((slot) => slot.id === migrated.activeSlotId)) {
    migrated.activeSlotId = migrated.slots[0]?.id ?? null;
  }

  // Future migrations can be handled here based on version differences
  migrated.version = STORAGE_VERSION;

  return migrated;
};

const sanitizeSlot = (slot: any): SaveSlot => {
  const base = createSlot(slot?.name ?? "存档", slot);
  base.progress = sanitizeProgress(slot?.progress);
  base.settings = sanitizeSettings(slot?.settings);
  base.createdAt = slot?.createdAt ?? base.createdAt;
  base.updatedAt = slot?.updatedAt ?? base.updatedAt;
  base.name = slot?.name ?? base.name;
  base.id = slot?.id ?? base.id;
  return base;
};

const sanitizeProgress = (progress: any): PlayerProgress => ({
  unlockedLevels: Array.isArray(progress?.unlockedLevels)
    ? Array.from(new Set(progress.unlockedLevels.map(Number))).filter((id) => Number.isFinite(id) && id > 0)
    : [...DEFAULT_PROGRESS.unlockedLevels],
  achievements: Array.isArray(progress?.achievements)
    ? Array.from(new Set(progress.achievements.map(String)))
    : [...DEFAULT_PROGRESS.achievements],
  lastCompletedLevel: Number.isFinite(progress?.lastCompletedLevel)
    ? progress.lastCompletedLevel
    : undefined,
  playTimeSeconds: Number.isFinite(progress?.playTimeSeconds) ? progress.playTimeSeconds : 0,
});

const sanitizeSettings = (settings: any): GameSettings => ({
  soundEnabled: typeof settings?.soundEnabled === "boolean" ? settings.soundEnabled : true,
  volume: clamp(typeof settings?.volume === "number" ? settings.volume : DEFAULT_SETTINGS.volume, 0, 1),
  graphicsQuality: (settings?.graphicsQuality === "low" || settings?.graphicsQuality === "medium" || settings?.graphicsQuality === "high")
    ? settings.graphicsQuality
    : DEFAULT_SETTINGS.graphicsQuality,
  aiDifficulty: (settings?.aiDifficulty as AiDifficulty) ?? DEFAULT_SETTINGS.aiDifficulty,
  controlScheme:
    settings?.controlScheme === "touch" || settings?.controlScheme === "keyboard" || settings?.controlScheme === "auto"
      ? settings.controlScheme
      : DEFAULT_SETTINGS.controlScheme,
});

const sanitizeBackup = (backup: any): BackupEntry => ({
  id: backup?.id ?? uuid(),
  slotId: backup?.slotId ?? uuid(),
  createdAt: backup?.createdAt ?? new Date().toISOString(),
  note: backup?.note ?? undefined,
  data: sanitizeSlot(backup?.data ?? {}),
});

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const createBackup = (slot: SaveSlot, note?: string): BackupEntry => ({
  id: uuid(),
  slotId: slot.id,
  createdAt: new Date().toISOString(),
  note,
  data: { ...slot, progress: { ...slot.progress }, settings: { ...slot.settings } },
});

export const updateSlotTimestamp = (slot: SaveSlot): SaveSlot => ({
  ...slot,
  updatedAt: new Date().toISOString(),
});
