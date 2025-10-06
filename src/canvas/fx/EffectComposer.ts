import type { LayerName, SceneGraph } from "../Scene";
import { AnimationSystem } from "../animation/AnimationSystem";
import type { TransformLike, Vector2 } from "../animation/types";
import { ParticleSystem, type ParticleSystemOptions } from "./ParticleSystem";
import { ScreenEffects, type ScreenFlashOptions, type ShakeOptions } from "./ScreenEffects";
import { CardEffects, type CardPlayOptions, type CardAttackOptions, type CardDeathOptions, type CardHoverOptions } from "./CardAnimations";

export interface EffectComposerOptions extends ParticleSystemOptions {
  animationSystem: AnimationSystem;
  particleLayer?: LayerName;
}

export interface HitEffectOptions {
  shake?: ShakeOptions;
  flash?: ScreenFlashOptions;
  color?: string;
}

export class EffectComposer {
  readonly particles: ParticleSystem;
  readonly screen: ScreenEffects;
  readonly cards: CardEffects;

  private readonly animationSystem: AnimationSystem;

  constructor(options: EffectComposerOptions) {
    const { animationSystem, particleLayer, ...rest } = options;
    this.animationSystem = animationSystem;
    this.particles = new ParticleSystem({
      ...rest,
      defaultLayer: particleLayer ?? rest.defaultLayer,
    });
    this.screen = new ScreenEffects();
    this.cards = new CardEffects(this.animationSystem);
  }

  public update(deltaTime: number, scene: SceneGraph): boolean {
    this.particles.update(deltaTime);
    this.screen.update(deltaTime);

    let queued = false;
    let needsRender = this.screen.isActive();

    if (this.particles.hasActiveParticles()) {
      const particlesQueued = this.particles.queueRender(scene);
      queued = particlesQueued || queued;
      needsRender = true;
    }

    if (this.screen.queueFlash(scene)) {
      queued = true;
      needsRender = true;
    }

    return queued || needsRender;
  }

  public applyScreenTransform(ctx: CanvasRenderingContext2D) {
    this.screen.applyScreenTransform(ctx);
  }

  public setViewport(width: number, height: number) {
    this.particles.setViewBounds(width, height);
  }

  public spawnDamageNumber(value: number, position: Vector2, critical = false) {
    this.particles.spawnDamageNumber(value, position, critical);
  }

  public spawnSpellImpact(position: Vector2, color?: string) {
    this.particles.spawnSpellImpact(position, color);
  }

  public spawnDeathBurst(position: Vector2, color?: string) {
    this.particles.spawnDeathBurst(position, color);
  }

  public shake(options: ShakeOptions) {
    this.screen.triggerShake(options);
  }

  public flash(options: ScreenFlashOptions = {}) {
    this.screen.triggerFlash(options);
  }

  public playCard(transform: TransformLike, options: CardPlayOptions) {
    return this.cards.playCard(transform, options);
  }

  public attackCard(transform: TransformLike, options: CardAttackOptions) {
    return this.cards.attackCard(transform, options);
  }

  public destroyCard(transform: TransformLike, options: CardDeathOptions = {}) {
    return this.cards.cardDestroyed(transform, options);
  }

  public hoverCard(transform: TransformLike, options: CardHoverOptions = {}) {
    return this.cards.hoverCard(transform, options);
  }

  public resetHover(transform: TransformLike, duration?: number) {
    return this.cards.resetHover(transform, duration);
  }

  public triggerHit(position: Vector2, options: HitEffectOptions = {}) {
    if (options.color) {
      this.spawnSpellImpact(position, options.color);
    } else {
      this.spawnSpellImpact(position);
    }
    if (options.shake) {
      this.shake(options.shake);
    }
    if (options.flash) {
      this.flash(options.flash);
    }
  }

  public getAnimationSystem() {
    return this.animationSystem;
  }

  public hasActiveEffects() {
    return this.particles.hasActiveParticles() || this.screen.isActive();
  }
}
