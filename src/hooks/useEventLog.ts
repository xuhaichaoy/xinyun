import { useEffect, useMemo, useState } from "react";

import {
  gameEventBus,
  type GameEventBus,
  type GameEventEntry,
  type GameEventMap,
} from "@/events/GameEvents";
import type { EventBusEntry } from "@/events/EventBus";

export interface UseEventLogOptions {
  bus?: GameEventBus;
  limit?: number;
  events?: Array<keyof GameEventMap>;
}

export function useEventLog(
  options: UseEventLogOptions = {}
): GameEventEntry[] {
  const { bus = gameEventBus, limit = 50, events } = options;
  const [entries, setEntries] = useState<Array<EventBusEntry<GameEventMap>>>(
    () => {
      const history = bus.getHistory(limit) as Array<
        EventBusEntry<GameEventMap>
      >;
      return filterHistory(history, events);
    }
  );

  useEffect(() => {
    let disposed = false;
    const unsubscribe = bus.onAny((event, payload, entry) => {
      if (disposed) return;
      if (events && events.length > 0 && !events.includes(event)) {
        return;
      }
      // 使用 setTimeout 确保在下一个事件循环中更新状态，避免在渲染过程中调用 setState
      setTimeout(() => {
        if (!disposed) {
          setEntries((prev) => {
            const next = [...prev, entry as EventBusEntry<GameEventMap>];
            if (next.length > limit) {
              next.splice(0, next.length - limit);
            }
            return next;
          });
        }
      }, 0);
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bus, events, limit]);

  return useMemo(
    () => entries.slice(-limit) as GameEventEntry[],
    [entries, limit]
  );
}

function filterHistory(
  history: Array<EventBusEntry<GameEventMap>>,
  events?: Array<keyof GameEventMap>
) {
  if (!events || events.length === 0) {
    return history;
  }
  const set = new Set(events);
  return history.filter((entry) => set.has(entry.event));
}
