import { memo, useCallback } from "react";

interface ActionPanelProps {
  onEndTurn: () => Promise<unknown>;
  onSettings?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export const ActionPanel = memo(({ onEndTurn, onSettings, disabled, loading }: ActionPanelProps) => {
  const handleEndTurn = useCallback(() => {
    if (disabled || loading) return;
    void onEndTurn();
  }, [disabled, loading, onEndTurn]);

  const handleSettings = useCallback(() => {
    if (disabled || loading) return;
    onSettings?.();
  }, [disabled, loading, onSettings]);

  return (
    <div
      className="action-panel"
      role="toolbar"
      aria-label="行动面板"
      aria-busy={loading}
    >
      <button
        type="button"
        className="action-panel__button action-panel__button--primary"
        onClick={handleEndTurn}
        disabled={disabled || loading}
      >
        {loading ? "执行中…" : "结束回合 (Space)"}
      </button>
      <button
        type="button"
        className="action-panel__button action-panel__button--secondary"
        onClick={handleSettings}
        disabled={disabled || loading}
      >
        {loading ? "稍候…" : "设置 (Esc)"}
      </button>
    </div>
  );
});

ActionPanel.displayName = "ActionPanel";
