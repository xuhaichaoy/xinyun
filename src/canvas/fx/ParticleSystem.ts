import type { LayerName, SceneGraph, Rect } from "../Scene";

interface Vector2 {
  x: number;
  y: number;
}

const tmpVec = (): Vector2 => ({ x: 0, y: 0 });

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type ParticleType = "circle" | "sprite" | "text";

export interface ParticleTemplate {
  type: ParticleType;
  lifetime: number;
  color?: string;
  size?: number;
  opacity?: number;
  rotation?: number;
  angularVelocity?: number;
  text?: string;
  font?: string;
  gravity?: number;
  fadeOut?: boolean;
  fadeIn?: boolean;
}

interface ParticleInstance {
  active: boolean;
  type: ParticleType;
  lifetime: number;
  age: number;
  position: Vector2;
  velocity: Vector2;
  acceleration: Vector2;
  color: string;
  size: number;
  opacity: number;
  baseOpacity: number;
  rotation: number;
  angularVelocity: number;
  text?: string;
  font?: string;
  fadeOut: boolean;
  fadeIn: boolean;
}

export interface EmitOptions extends Partial<ParticleTemplate> {
  position: Vector2;
  velocity?: Vector2;
  acceleration?: Vector2;
  layer?: LayerName;
  count?: number;
  spread?: number;
}

interface PoolSlot {
  particle: ParticleInstance;
  layer: LayerName;
}

const DEFAULT_LAYER: LayerName = "fx";

export interface ParticleSystemOptions {
  maxParticles?: number;
  defaultLayer?: LayerName;
  viewBounds?: { width: number; height: number };
}

export class ParticleSystem {
  private readonly pool: PoolSlot[];
  private readonly freeList: number[];
  private readonly defaultLayer: LayerName;
  private activeCount = 0;
  private viewBounds = { width: 1920, height: 1080 };

  constructor(options: ParticleSystemOptions = {}) {
    const capacity = Math.max(options.maxParticles ?? 512, 32);
    this.pool = new Array(capacity);
    this.freeList = [];
    this.defaultLayer = options.defaultLayer ?? DEFAULT_LAYER;
    this.viewBounds = options.viewBounds ?? this.viewBounds;

    for (let i = 0; i < capacity; i++) {
      this.pool[i] = {
        layer: this.defaultLayer,
        particle: {
          active: false,
          type: "circle",
          lifetime: 1,
          age: 0,
          position: tmpVec(),
          velocity: tmpVec(),
          acceleration: tmpVec(),
          color: "rgba(255,255,255,1)",
          size: 12,
          opacity: 1,
          baseOpacity: 1,
          rotation: 0,
          angularVelocity: 0,
          fadeOut: true,
          fadeIn: false,
        },
      };
      this.freeList.push(i);
    }
  }

  public setViewBounds(width: number, height: number) {
    this.viewBounds.width = width;
    this.viewBounds.height = height;
  }

  public emit(base: EmitOptions) {
    const count = Math.max(base.count ?? 1, 1);
    for (let i = 0; i < count; i++) {
      const slot = this.acquire();
      if (!slot) {
        break;
      }

      const { particle } = slot;
      const layer = base.layer ?? this.defaultLayer;
      slot.layer = layer;

      const spread = base.spread ?? 0;
      const randomAngle = spread > 0 ? (Math.random() - 0.5) * spread : 0;

      particle.active = true;
      particle.type = base.type ?? "circle";
      particle.lifetime = base.lifetime ?? 0.6;
      particle.age = 0;
      particle.position.x = base.position.x;
      particle.position.y = base.position.y;

      particle.velocity.x = (base.velocity?.x ?? 0) + randomAngle;
      particle.velocity.y = base.velocity?.y ?? 0;

      particle.acceleration.x = base.acceleration?.x ?? 0;
      particle.acceleration.y = base.acceleration?.y ?? (base.gravity ?? 0);

      particle.color = base.color ?? "rgba(225,239,254,1)";
      particle.size = base.size ?? 16;
      particle.baseOpacity = base.opacity ?? 1;
      particle.opacity = particle.baseOpacity;
      particle.rotation = base.rotation ?? 0;
      particle.angularVelocity = base.angularVelocity ?? 0;
      particle.text = base.text;
      particle.font = base.font;
      particle.fadeOut = base.fadeOut ?? true;
      particle.fadeIn = base.fadeIn ?? false;
    }
  }

  public spawnDamageNumber(value: number, position: Vector2, critical = false) {
    const amount = Math.abs(value);
    const text = value > 0 ? `-${amount}` : `+${amount}`;
    const color = value > 0 ? (critical ? "#facc15" : "#f87171") : "#34d399";
    const lifetime = critical ? 1.1 : 0.85;
    const velocityY = critical ? -220 : -180;
    this.emit({
      type: "text",
      text,
      font: critical ? "700 32px 'Roboto', sans-serif" : "600 26px 'Roboto', sans-serif",
      position,
      color,
      opacity: 1,
      velocity: { x: (Math.random() - 0.5) * 40, y: velocityY },
      gravity: 220,
      lifetime,
      fadeIn: true,
      fadeOut: true,
    });
  }

  public spawnSpellImpact(position: Vector2, color = "rgba(59,130,246,0.95)") {
    const particles = 24;
    for (let i = 0; i < particles; i++) {
      const angle = (Math.PI * 2 * i) / particles;
      const magnitude = 160 + Math.random() * 80;
      this.emit({
        position,
        color,
        lifetime: 0.6 + Math.random() * 0.2,
        size: 8 + Math.random() * 6,
        velocity: { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude },
        acceleration: { x: 0, y: 220 },
        opacity: 0.9,
        rotation: Math.random() * Math.PI,
        angularVelocity: (Math.random() - 0.5) * 6,
        fadeOut: true,
        fadeIn: false,
      });
    }
  }

  public spawnDeathBurst(position: Vector2, baseColor = "rgba(248,113,113,0.95)") {
    const count = 32;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 140 + Math.random() * 120;
      const size = 10 + Math.random() * 12;
      this.emit({
        position,
        type: "circle",
        color: baseColor,
        size,
        lifetime: 0.75 + Math.random() * 0.35,
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        acceleration: { x: 0, y: 280 },
        opacity: 0.95,
        fadeOut: true,
        fadeIn: false,
      });
    }
  }

  public update(deltaTime: number) {
    const dt = Math.max(deltaTime, 0);
    if (dt === 0 || this.activeCount === 0) {
      return;
    }

    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      const particle = slot.particle;
      if (!particle.active) continue;

      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        this.release(i);
        continue;
      }

      particle.velocity.x += particle.acceleration.x * dt;
      particle.velocity.y += particle.acceleration.y * dt;
      particle.position.x += particle.velocity.x * dt;
      particle.position.y += particle.velocity.y * dt;
      particle.rotation += particle.angularVelocity * dt;

      const lifeRatio = clamp01(particle.age / particle.lifetime);
      let currentOpacity = particle.baseOpacity;
      if (particle.fadeOut) {
        currentOpacity = lerp(particle.baseOpacity, 0, lifeRatio);
      }
      if (particle.fadeIn) {
        currentOpacity *= lifeRatio;
      }
      if (currentOpacity < 0.02) {
        currentOpacity = 0;
      }
      particle.opacity = currentOpacity;

      if (!this.isWithinBounds(particle.position)) {
        this.release(i);
        continue;
      }
    }
  }

  public queueRender(scene: SceneGraph): boolean {
    if (this.activeCount === 0) {
      return false;
    }

    const layerToParticles = new Map<LayerName, { particles: ParticleInstance[]; bounds: Rect | null }>();

    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      const particle = slot.particle;
      if (!particle.active) continue;

      const existing = layerToParticles.get(slot.layer);
      if (!existing) {
        layerToParticles.set(slot.layer, {
          particles: [particle],
          bounds: computeParticleBounds(particle),
        });
      } else {
        existing.particles.push(particle);
        const bounds = computeParticleBounds(particle);
        if (bounds) {
          existing.bounds = existing.bounds ? mergeBounds(existing.bounds, bounds) : bounds;
        } else {
          existing.bounds = null;
        }
      }
    }

    let queued = false;
    for (const [layer, entry] of layerToParticles.entries()) {
      scene.queue(
        layer,
        (ctx) => {
          this.renderParticles(ctx, entry.particles);
        },
        { bounds: entry.bounds ?? undefined }
      );
      queued = true;
    }

    return queued;
  }

  public hasActiveParticles() {
    return this.activeCount > 0;
  }

  private renderParticles(ctx: CanvasRenderingContext2D, particles: ParticleInstance[]) {
    for (const particle of particles) {
      if (!particle.active) continue;
      if (particle.opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha *= particle.opacity;
      ctx.translate(particle.position.x, particle.position.y);
      ctx.rotate(particle.rotation);

      switch (particle.type) {
        case "circle": {
          ctx.fillStyle = particle.color;
          const size = particle.size * 0.5;
          ctx.beginPath();
          ctx.arc(0, 0, size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "sprite": {
          ctx.fillStyle = particle.color;
          const size2 = particle.size;
          ctx.fillRect(-size2 * 0.5, -size2 * 0.5, size2, size2);
          break;
        }
        case "text": {
          ctx.fillStyle = particle.color;
          ctx.font = particle.font ?? "600 24px 'Roboto', sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(particle.text ?? "", 0, 0);
          break;
        }
      }
      ctx.restore();
    }
  }

  private acquire(): PoolSlot | null {
    const index = this.freeList.pop();
    if (index == null) {
      return null;
    }
    this.activeCount += 1;
    return this.pool[index];
  }

  private release(index: number) {
    const slot = this.pool[index];
    if (!slot.particle.active) return;
    slot.particle.active = false;
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.freeList.push(index);
  }

  private isWithinBounds(position: Vector2) {
    return (
      position.x >= -this.viewBounds.width * 0.5 &&
      position.x <= this.viewBounds.width * 1.5 &&
      position.y >= -this.viewBounds.height * 0.5 &&
      position.y <= this.viewBounds.height * 1.5
    );
  }
}

const mergeBounds = (a: Rect, b: Rect): Rect => {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const computeParticleBounds = (particle: ParticleInstance): Rect | null => {
  const padding = 4;
  switch (particle.type) {
    case "circle": {
      const radius = particle.size * 0.5;
      return {
        x: particle.position.x - radius - padding,
        y: particle.position.y - radius - padding,
        width: radius * 2 + padding * 2,
        height: radius * 2 + padding * 2,
      };
    }
    case "sprite": {
      const half = particle.size * 0.5;
      return {
        x: particle.position.x - half - padding,
        y: particle.position.y - half - padding,
        width: particle.size + padding * 2,
        height: particle.size + padding * 2,
      };
    }
    case "text": {
      const width = Math.max(particle.size * 4, 160);
      const height = Math.max(particle.size * 1.5, 48);
      return {
        x: particle.position.x - width / 2 - padding,
        y: particle.position.y - height / 2 - padding,
        width: width + padding * 2,
        height: height + padding * 2,
      };
    }
    default:
      return null;
  }
};
