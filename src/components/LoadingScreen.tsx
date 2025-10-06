import type { FC } from "react";

interface LoadingScreenProps {
  message?: string;
  hint?: string;
}

export const LoadingScreen: FC<LoadingScreenProps> = ({
  message = "正在加载…",
  hint,
}) => {
  return (
    <div className="game-app">
      <section className="loading-screen" role="status" aria-live="polite">
        <span className="loading-screen__spinner" aria-hidden="true" />
        <p className="loading-screen__text">{message}</p>
        {hint && <p className="loading-screen__hint">{hint}</p>}
      </section>
    </div>
  );
};
