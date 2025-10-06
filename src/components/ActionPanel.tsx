import { memo, useCallback } from "react";

interface ActionPanelProps {
  onEndTurn: () => Promise<unknown>;
  onSettings?: () => void;
  disabled?: boolean;
}

export const ActionPanel = memo(({ onEndTurn, onSettings, disabled }: ActionPanelProps) => {
  const handleEndTurn = useCallback(() => {
    if (disabled) return;
    void onEndTurn();
  }, [disabled, onEndTurn]);

  const handleSettings = useCallback(() => {
    if (disabled) return;
    onSettings?.();
  }, [disabled, onSettings]);

  return (
    <div className="action-panel" role="toolbar" aria-label="行动面板">
      <button
        type="button"
        className="action-panel__button action-panel__button--primary"
        onClick={handleEndTurn}
        disabled={disabled}
      >
        结束回合 (Space)
      </button>
      <button
        type="button"
        className="action-panel__button action-panel__button--secondary"
        onClick={handleSettings}
        disabled={disabled}
      >
        设置 (Esc)
      </button>
    </div>
  );
});

ActionPanel.displayName = "ActionPanel";
