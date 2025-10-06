export interface ButtonFeedbackOptions {
  scale?: number;
  duration?: number;
  easing?: string;
  glowColor?: string;
}

export interface StatePulseOptions {
  highlightColor?: string;
  duration?: number;
  iterations?: number;
}

export interface FlashOptions {
  color?: string;
  duration?: number;
}

const supportsWebAnimations = typeof document !== "undefined" && typeof document.createElement("div").animate === "function";

export class UIEffects {
  private readonly buttonAnimations = new WeakMap<HTMLElement, Animation>();

  public attachButton(element: HTMLElement, options: ButtonFeedbackOptions = {}) {
    element.style.touchAction = "manipulation";
    const handlePointerDown = () => this.buttonPress(element, options);
    const handlePointerUp = () => this.buttonRelease(element, options);
    const handlePointerLeave = () => this.buttonRelease(element, options);

    element.addEventListener("pointerdown", handlePointerDown);
    element.addEventListener("pointerup", handlePointerUp);
    element.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      element.removeEventListener("pointerup", handlePointerUp);
      element.removeEventListener("pointerleave", handlePointerLeave);
    };
  }

  public buttonPress(element: HTMLElement, options: ButtonFeedbackOptions = {}) {
    const scale = options.scale ?? 0.94;
    const duration = options.duration ?? 120;
    const easing = options.easing ?? "ease-out";
    const glowColor = options.glowColor ?? "rgba(96,165,250,0.35)";

    if (supportsWebAnimations) {
      this.cancelAnimation(element);
      const animation = element.animate(
        [
          { transform: "scale(1)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
          { transform: `scale(${scale})`, boxShadow: `0 8px 22px ${glowColor}` },
        ],
        { duration, easing, fill: "forwards" }
      );
      this.buttonAnimations.set(element, animation);
    } else {
      element.style.transition = `transform ${duration}ms ${easing}`;
      element.style.transform = `scale(${scale})`;
      element.style.boxShadow = `0 8px 22px ${glowColor}`;
    }
  }

  public buttonRelease(element: HTMLElement, options: ButtonFeedbackOptions = {}) {
    const duration = options.duration ?? 180;
    const easing = options.easing ?? "ease-out";

    if (supportsWebAnimations) {
      this.cancelAnimation(element);
      const animation = element.animate(
        [
          { transform: getComputedStyle(element).transform, boxShadow: getComputedStyle(element).boxShadow },
          { transform: "scale(1)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
        ],
        { duration, easing, fill: "forwards" }
      );
      this.buttonAnimations.set(element, animation);
    } else {
      element.style.transition = `transform ${duration}ms ${easing}`;
      element.style.transform = "scale(1)";
      element.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
    }
  }

  public pulseState(element: HTMLElement, options: StatePulseOptions = {}) {
    if (!supportsWebAnimations) {
      return;
    }

    element.animate(
      [
        { boxShadow: `0 0 0 ${options.highlightColor ?? "rgba(34,197,94,0.25)"}` },
        { boxShadow: `0 0 18px ${options.highlightColor ?? "rgba(34,197,94,0.55)"}` },
        { boxShadow: `0 0 0 ${options.highlightColor ?? "rgba(34,197,94,0.0)"}` },
      ],
      {
        duration: options.duration ?? 600,
        iterations: options.iterations ?? 1,
        easing: "ease-in-out",
      }
    );
  }

  public flash(element: HTMLElement, options: FlashOptions = {}) {
    const duration = options.duration ?? 260;
    const color = options.color ?? "rgba(248,250,252,0.65)";
    if (supportsWebAnimations) {
      element.animate(
        [
          { background: "inherit" },
          { background: color },
          { background: "inherit" },
        ],
        {
          duration,
          easing: "ease-out",
        }
      );
    } else {
      const original = element.style.backgroundColor;
      element.style.backgroundColor = color;
      setTimeout(() => {
        element.style.backgroundColor = original;
      }, duration);
    }
  }

  private cancelAnimation(element: HTMLElement) {
    const current = this.buttonAnimations.get(element);
    current?.cancel();
  }
}
