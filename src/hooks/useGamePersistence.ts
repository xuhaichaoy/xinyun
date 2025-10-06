import { useCallback, useMemo } from "react";

import type {
  BackupEntry,
  GameSettings,
  PlayerProgress,
  SaveSlot,
  SaveState,
  AiDifficulty,
} from "@/types/domain";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  STORAGE_KEY,
  createBackup,
  createInitialState,
  createSlot,
  migrateSaveState,
  updateSlotTimestamp,
} from "@/utils/persistence";

export interface UseGamePersistenceOptions {
  storageKey?: string;
}

export interface UseGamePersistenceResult {
  state: SaveState;
  activeSlot: SaveSlot;
  setActiveSlot: (slotId: string) => void;
  updateProgress: (progress: Partial<PlayerProgress>) => void;
  updateSettings: (settings: Partial<GameSettings>) => void;
  unlockLevel: (levelId: number) => void;
  addAchievement: (achievementId: string) => void;
  createSlot: (name?: string) => SaveSlot;
  deleteSlot: (slotId: string) => void;
  backupSlot: (slotId: string, note?: string) => BackupEntry | null;
  restoreBackup: (backupId: string) => void;
  deleteBackup: (backupId: string) => void;
  resetSlot: (slotId: string) => void;
}

export const useGamePersistence = (
  options: UseGamePersistenceOptions = {}
): UseGamePersistenceResult => {
  const storageKey = options.storageKey ?? STORAGE_KEY;
  const [state, setState] = useLocalStorage<SaveState>(storageKey, createInitialState(), {
    deserializer: (value) => migrateSaveState(JSON.parse(value)),
    serializer: (value) => JSON.stringify(value),
  });

  const activeSlot = useMemo(() => {
    const slot = state.slots.find((item) => item.id === state.activeSlotId);
    return slot ?? state.slots[0];
  }, [state.activeSlotId, state.slots]);

  const setActiveSlot = useCallback(
    (slotId: string) => {
      setState((prev) => ({ ...prev, activeSlotId: slotId }));
    },
    [setState]
  );

  const updateSlot = useCallback(
    (slotId: string, updater: (slot: SaveSlot) => SaveSlot) => {
      setState((prev) => {
        const slots = prev.slots.map((slot) => (slot.id === slotId ? updateSlotTimestamp(updater(slot)) : slot));
        return { ...prev, slots };
      });
    },
    [setState]
  );

  const updateProgress = useCallback(
    (progress: Partial<PlayerProgress>) => {
      if (!activeSlot) return;
      updateSlot(activeSlot.id, (slot) => ({
        ...slot,
        progress: {
          ...slot.progress,
          ...progress,
          unlockedLevels: progress.unlockedLevels
            ? Array.from(new Set(progress.unlockedLevels)).sort((a, b) => a - b)
            : slot.progress.unlockedLevels,
          achievements: progress.achievements
            ? Array.from(new Set(progress.achievements))
            : slot.progress.achievements,
        },
      }));
    },
    [activeSlot, updateSlot]
  );

  const updateSettings = useCallback(
    (settings: Partial<GameSettings>) => {
      if (!activeSlot) return;
      updateSlot(activeSlot.id, (slot) => ({
        ...slot,
        settings: {
          ...slot.settings,
          ...settings,
        },
      }));
    },
    [activeSlot, updateSlot]
  );

  const unlockLevel = useCallback(
    (levelId: number) => {
      if (!activeSlot || !Number.isFinite(levelId)) return;
      updateSlot(activeSlot.id, (slot) => ({
        ...slot,
        progress: {
          ...slot.progress,
          unlockedLevels: Array.from(new Set([...slot.progress.unlockedLevels, levelId])).sort((a, b) => a - b),
        },
      }));
    },
    [activeSlot, updateSlot]
  );

  const addAchievement = useCallback(
    (achievementId: string) => {
      if (!activeSlot) return;
      updateSlot(activeSlot.id, (slot) => ({
        ...slot,
        progress: {
          ...slot.progress,
          achievements: Array.from(new Set([...slot.progress.achievements, achievementId])),
        },
      }));
    },
    [activeSlot, updateSlot]
  );

  const createSlotHandler = useCallback(
    (name?: string) => {
      const slot = createSlot(name ?? `存档 ${state.slots.length + 1}`);
      setState((prev) => ({
        ...prev,
        slots: [...prev.slots, slot],
        activeSlotId: slot.id,
      }));
      return slot;
    },
    [setState, state.slots.length]
  );

  const deleteSlot = useCallback(
    (slotId: string) => {
      setState((prev) => {
        const slots = prev.slots.filter((slot) => slot.id !== slotId);
        const activeSlotId = prev.activeSlotId === slotId ? slots[0]?.id ?? null : prev.activeSlotId;
        const backups = prev.backups.filter((backup) => backup.slotId !== slotId);
        return {
          ...prev,
          slots: slots.length > 0 ? slots : createInitialState().slots,
          activeSlotId,
          backups,
        };
      });
    },
    [setState]
  );

  const backupSlot = useCallback(
    (slotId: string, note?: string): BackupEntry | null => {
      const slot = state.slots.find((item) => item.id === slotId);
      if (!slot) return null;
      const backup = createBackup(slot, note);
      setState((prev) => ({ ...prev, backups: [...prev.backups, backup] }));
      return backup;
    },
    [setState, state.slots]
  );

  const restoreBackup = useCallback(
    (backupId: string) => {
      const backup = state.backups.find((entry) => entry.id === backupId);
      if (!backup) return;
      updateSlot(backup.slotId, () => ({ ...backup.data }));
    },
    [state.backups, updateSlot]
  );

  const deleteBackup = useCallback(
    (backupId: string) => {
      setState((prev) => ({
        ...prev,
        backups: prev.backups.filter((entry) => entry.id !== backupId),
      }));
    },
    [setState]
  );

  const resetSlot = useCallback(
    (slotId: string) => {
      updateSlot(slotId, () => createSlot("存档", { id: slotId }));
    },
    [updateSlot]
  );

  return useMemo(
    () => ({
      state,
      activeSlot,
      setActiveSlot,
      updateProgress,
      updateSettings,
      unlockLevel,
      addAchievement,
      createSlot: createSlotHandler,
      deleteSlot,
      backupSlot,
      restoreBackup,
      deleteBackup,
      resetSlot,
    }),
    [
      state,
      activeSlot,
      setActiveSlot,
      updateProgress,
      updateSettings,
      unlockLevel,
      addAchievement,
      createSlotHandler,
      deleteSlot,
      backupSlot,
      restoreBackup,
      deleteBackup,
      resetSlot,
    ]
  );
};
