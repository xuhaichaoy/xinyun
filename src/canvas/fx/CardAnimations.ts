import { AnimationSystem } from "../animation/AnimationSystem";
import type { AnimationQueueHandle } from "../animation/AnimationSystem";
import type { TransformLike, TweenConfig, Vector2 } from "../animation/types";
import { EASING_PRESETS } from "../animation/easing";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface CardPlayOptions {
  start: Vector2;
  end: Vector2;
  arcHeight?: number;
  duration?: number;
  overshootScale?: number;
}

export interface CardAttackOptions {
  target: Vector2;
  dashDistance?: number;
  strikeDuration?: number;
  recoverDuration?: number;
  tilt?: number;
}

export interface CardDeathOptions {
  shrinkDuration?: number;
  fadeDuration?: number;
}

export interface CardHoverOptions {
  lift?: number;
  scale?: number;
  duration?: number;
}

export class CardEffects {
  constructor(private readonly animations: AnimationSystem) {}

  public playCard(transform: TransformLike, options: CardPlayOptions): AnimationQueueHandle<TransformLike> {
    const arcHeight = options.arcHeight ?? 140;
    const duration = options.duration ?? 0.48;
    const overshootScale = options.overshootScale ?? 1.08;

    const start = options.start;
    const end = options.end;
    const control: Vector2 = {
      x: (start.x + end.x) / 2,
      y: Math.min(start.y, end.y) - arcHeight,
    };

    return this.animations.play(transform, (timeline) => {
      timeline
        .tween({
          from: {
            position: { ...start },
            scale: 0.78,
            opacity: 0,
            rotation: 0,
          },
          to: {
            position: { ...end },
            scale: overshootScale,
            opacity: 1,
            rotation: 0,
          },
          duration,
          easing: EASING_PRESETS.easeOutCubic,
          onUpdate: (target, t) => {
            const bezier = quadraticBezier(start, control, end, t);
            target.position.x = bezier.x;
            target.position.y = bezier.y;
          },
        })
        .tween({
          to: {
            scale: 1,
            rotation: 0,
          },
          duration: 0.2,
          easing: EASING_PRESETS.easeOutBack,
        });
    });
  }

  public attackCard(
    transform: TransformLike,
    options: CardAttackOptions
  ): AnimationQueueHandle<TransformLike> {
    const dashDistance = options.dashDistance ?? 160;
    const strikeDuration = options.strikeDuration ?? 0.22;
    const recoverDuration = options.recoverDuration ?? 0.18;
    const tilt = options.tilt ?? (Math.PI / 16);

    const basePosition = { ...transform.position };

    const attackTarget = {
      x: options.target.x,
      y: options.target.y,
    };

    const direction = normalize({
      x: attackTarget.x - basePosition.x,
      y: attackTarget.y - basePosition.y,
    });

    const strikePoint = {
      x: basePosition.x + direction.x * dashDistance,
      y: basePosition.y + direction.y * dashDistance,
    };

    const forwardTween: TweenConfig<TransformLike> = {
      to: {
        position: strikePoint,
        rotation: tilt,
        scale: 1.08,
      },
      duration: strikeDuration,
      easing: EASING_PRESETS.easeInQuad,
    };

    const recoverTween: TweenConfig<TransformLike> = {
      to: {
        position: basePosition,
        rotation: 0,
        scale: 1,
      },
      duration: recoverDuration,
      easing: EASING_PRESETS.easeOutCubic,
    };

    return this.animations.play(transform, (timeline) => {
      timeline
        .tween(forwardTween)
        .tween(recoverTween);
    });
  }

  public cardDestroyed(transform: TransformLike, options: CardDeathOptions = {}) {
    const shrinkDuration = options.shrinkDuration ?? 0.25;
    const fadeDuration = options.fadeDuration ?? 0.25;

    return this.animations.play(transform, (timeline) => {
      timeline
        .tween({
          to: {
            scale: 0.6,
            rotation: 0,
          },
          duration: shrinkDuration,
          easing: EASING_PRESETS.easeInQuad,
        })
        .tween({
          to: {
            opacity: 0,
            scale: 0.2,
          },
          duration: fadeDuration,
          easing: EASING_PRESETS.easeInQuad,
        });
    });
  }

  public hoverCard(transform: TransformLike, options: CardHoverOptions = {}) {
    const lift = options.lift ?? 42;
    const scale = options.scale ?? 1.08;
    const duration = options.duration ?? 0.18;
    const basePosition = { ...transform.position };

    return this.animations.play(transform, (timeline) => {
      timeline
        .tween({
          to: {
            position: {
              x: basePosition.x,
              y: basePosition.y - lift,
            },
            scale,
          },
          duration,
          easing: EASING_PRESETS.easeOutQuad,
        });
    });
  }

  public resetHover(transform: TransformLike, duration = 0.15) {
    return this.animations.play(transform, (timeline) => {
      timeline
        .tween({
          to: {
            position: { ...transform.position },
            scale: 1,
          },
          duration,
          easing: EASING_PRESETS.easeInQuad,
        });
    });
  }
}

const quadraticBezier = (a: Vector2, b: Vector2, c: Vector2, t: number): Vector2 => {
  const clamped = clamp(t, 0, 1);
  const inv = 1 - clamped;
  return {
    x: inv * inv * a.x + 2 * inv * clamped * b.x + clamped * clamped * c.x,
    y: inv * inv * a.y + 2 * inv * clamped * b.y + clamped * clamped * c.y,
  };
};

const normalize = (vector: Vector2): Vector2 => {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
};
