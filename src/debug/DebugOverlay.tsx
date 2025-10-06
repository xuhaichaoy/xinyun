import { useEffect, useMemo, useState } from "react";

import type { UseGameStateResult } from "@/hooks/useGameState";
import { useEventLog } from "@/hooks/useEventLog";
import {
  gameEventBus,
  getEventSummary,
  type GameEventEntry,
  type GameEventMap,
} from "@/events/GameEvents";

interface DebugOverlayProps {
  gameStateHook: UseGameStateResult;
}

const TABS = [
  { id: "state", label: "状态" },
  { id: "ai", label: "AI" },
  { id: "canvas", label: "Canvas" },
  { id: "events", label: "事件" },
  { id: "perf", label: "性能" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const AI_EVENTS: Array<keyof GameEventMap> = ["ai:decision", "ai:applied"];
const FLOW_EVENTS: Array<keyof GameEventMap> = [
  "wasm:request",
  "wasm:response",
  "wasm:error",
  "state:updated",
  "canvas:interaction",
  "canvas:invalidate",
  "debug:log",
];
const PERF_EVENTS: Array<keyof GameEventMap> = ["performance:frame", "performance:memory"];

export const DebugOverlay = ({ gameStateHook }: DebugOverlayProps) => {
  if (import.meta.env.PROD) {
    return null;
  }

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<TabId>("state");

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 120,
        fontFamily: "'Roboto', 'Segoe UI', sans-serif",
      }}
    >
      {open ? (
        <div
          style={{
            width: 360,
            maxHeight: 520,
            display: "grid",
            gridTemplateRows: "auto auto 1fr",
            background: "rgba(15,23,42,0.95)",
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            boxShadow: "0 20px 45px rgba(15,23,42,0.45)",
            color: "#e2e8f0",
          }}
        >
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderBottom: "1px solid rgba(71,85,105,0.45)",
            }}
          >
            <strong style={{ fontSize: 14 }}>WASM 调试工具</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                color: "#cbd5f5",
                border: "1px solid rgba(148,163,184,0.35)",
                borderRadius: 6,
                padding: "2px 8px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              关闭
            </button>
          </header>

          <nav
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 12px",
              borderBottom: "1px solid rgba(71,85,105,0.35)",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: active === tab.id ? "#60a5fa" : "rgba(148,163,184,0.3)",
                  background: active === tab.id ? "rgba(59,130,246,0.18)" : "transparent",
                  color: active === tab.id ? "#bfdbfe" : "#cbd5f5",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <section
            style={{
              overflowY: "auto",
              padding: 12,
              fontSize: 12,
              display: "grid",
              gap: 12,
            }}
          >
            {active === "state" && (
              <StatePanel state={gameStateHook.state} events={gameStateHook.events} />
            )}
            {active === "ai" && <AiPanel />}
            {active === "canvas" && <CanvasPanel />}
            {active === "events" && <EventFlowPanel />}
            {active === "perf" && <PerformancePanel />}
          </section>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: "10px 16px",
            borderRadius: 999,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.9)",
            color: "#e0f2fe",
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 12px 24px rgba(15,23,42,0.4)",
          }}
        >
          打开调试
        </button>
      )}
    </div>
  );
};

const StatePanel = ({
  state,
  events,
}: {
  state: UseGameStateResult["state"];
  events: UseGameStateResult["events"];
}) => {
  const summary = useMemo(() => {
    if (!state) {
      return "暂无状态";
    }
    return JSON.stringify(state, null, 2);
  }, [state]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 12 }}>
        <span>回合：{state?.turn ?? "-"}</span>
        <span>阶段：{state?.phase ?? "-"}</span>
        <span>事件：{events.length}</span>
      </div>
      <pre
        style={{
          background: "rgba(15,23,42,0.6)",
          padding: 12,
          borderRadius: 8,
          maxHeight: 260,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {summary}
      </pre>
    </div>
  );
};

const AiPanel = () => {
  const log = useEventLog({ limit: 12, events: AI_EVENTS });

  if (log.length === 0) {
    return <p style={{ opacity: 0.7 }}>尚未收到 AI 决策</p>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {log
        .slice()
        .reverse()
        .map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: 10,
              borderRadius: 8,
              background: "rgba(30,58,138,0.35)",
              border: "1px solid rgba(96,165,250,0.35)",
            }}
          >
            <div style={{ fontWeight: 600 }}>{entry.event as string}</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>{getEventSummary(entry)}</div>
            <pre
              style={{
                marginTop: 6,
                maxHeight: 120,
                overflow: "auto",
                background: "rgba(15,23,42,0.45)",
                padding: 8,
                borderRadius: 6,
              }}
            >
              {formatPayload(entry)}
            </pre>
          </div>
        ))}
    </div>
  );
};

const CanvasPanel = () => {
  const [config, setConfig] = useState({
    showBounds: false,
    showDirtyRects: false,
    showPerformance: false,
  });

  useEffect(() => {
    gameEventBus.emit("debug:canvasConfig", config);
  }, [config]);

  useEffect(() => {
    return () => {
      gameEventBus.emit("debug:canvasConfig", {
        showBounds: false,
        showDirtyRects: false,
        showPerformance: false,
      });
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={config.showBounds}
          onChange={(event) => setConfig((prev) => ({ ...prev, showBounds: event.target.checked }))}
        />
        显示命令边界
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={config.showDirtyRects}
          onChange={(event) => setConfig((prev) => ({ ...prev, showDirtyRects: event.target.checked }))}
        />
        显示脏矩形
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={config.showPerformance}
          onChange={(event) => setConfig((prev) => ({ ...prev, showPerformance: event.target.checked }))}
        />
        Canvas 性能叠层
      </label>
      <p style={{ opacity: 0.7 }}>
        配置通过事件总线广播，可实时切换渲染器的调试项。
      </p>
    </div>
  );
};

const EventFlowPanel = () => {
  const log = useEventLog({ limit: 20, events: FLOW_EVENTS });

  if (log.length === 0) {
    return <p style={{ opacity: 0.7 }}>暂无事件</p>;
  }

  return (
    <ol style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 6 }}>
      {log
        .slice()
        .reverse()
        .map((entry) => (
          <li key={entry.id} style={{ wordBreak: "break-word" }}>
            <div style={{ fontWeight: 600 }}>{entry.event as string}</div>
            <div style={{ opacity: 0.75 }}>{getEventSummary(entry)}</div>
          </li>
        ))}
    </ol>
  );
};

const PerformancePanel = () => {
  const log = useEventLog({ limit: 12, events: PERF_EVENTS });

  const latestFrame = useMemo(() => log.find((entry) => entry.event === "performance:frame"), [log]);
  const latestMemory = useMemo(() => log.find((entry) => entry.event === "performance:memory"), [log]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div>
        <strong>帧渲染</strong>
        <div style={{ marginTop: 4, opacity: 0.8 }}>
          {latestFrame ? getEventSummary(latestFrame) : "暂无数据"}
        </div>
      </div>
      <div>
        <strong>内存</strong>
        <div style={{ marginTop: 4, opacity: 0.8 }}>
          {latestMemory ? getEventSummary(latestMemory) : "浏览器未暴露内存 API"}
        </div>
      </div>
      <div>
        <strong>最近样本</strong>
        <ul style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 4 }}>
          {log
            .slice()
            .reverse()
            .map((entry) => (
              <li key={entry.id}>{getEventSummary(entry)}</li>
            ))}
        </ul>
      </div>
    </div>
  );
};

const formatPayload = (entry: GameEventEntry) => {
  try {
    return JSON.stringify(entry.payload, (_, value) => (value instanceof Error ? value.message : value), 2);
  } catch (error) {
    return String(entry.payload ?? "");
  }
};
