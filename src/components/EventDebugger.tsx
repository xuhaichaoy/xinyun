import { useMemo } from "react";

import { getEventSummary, type GameEventEntry, type GameEventMap } from "@/events/GameEvents";
import { useEventLog } from "@/hooks/useEventLog";

export interface EventDebuggerProps {
  limit?: number;
  events?: Array<keyof GameEventMap>;
}

export const EventDebugger = ({ limit = 30, events }: EventDebuggerProps) => {
  const log = useEventLog({ limit, events });
  const items = useMemo(() => log.slice(-limit).reverse(), [log, limit]);

  return (
    <section
      aria-label="事件调试面板"
      style={{
        display: "grid",
        gap: 8,
        maxHeight: 240,
        overflowY: "auto",
        padding: 12,
        background: "rgba(15, 23, 42, 0.85)",
        borderRadius: 12,
        border: "1px solid rgba(148,163,184,0.35)",
        fontSize: 12,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 13 }}>事件调试</strong>
        <span style={{ opacity: 0.6 }}>最近 {items.length} 条</span>
      </header>
      <ol style={{ margin: 0, paddingInlineStart: 16, display: "grid", gap: 6 }}>
        {items.map((entry) => (
          <li key={entry.id} style={{ listStyle: "decimal", wordBreak: "break-all" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontWeight: 600 }}>{entry.event as string}</span>
              <span style={{ opacity: 0.75 }}>{getEventSummary(entry)}</span>
              <code style={{ fontSize: 11, whiteSpace: "pre-wrap" }}>
                {formatPayload(entry)}
              </code>
              <span style={{ opacity: 0.45 }}>
                {new Date(entry.timestamp).toLocaleTimeString()} · #{entry.id}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};

const formatPayload = (entry: GameEventEntry) => {
  try {
    return JSON.stringify(entry.payload, (_, value) => (value instanceof Error ? value.message : value), 2);
  } catch (error) {
    return String(entry.payload ?? "");
  }
};
