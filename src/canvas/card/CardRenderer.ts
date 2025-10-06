import { Camera2D } from "../Camera2D";
import type { CardPresentation, CardRenderOptions, CardTransform, CardSkin } from "./types";

const DEFAULT_SKIN: CardSkin = {
  frameColor: "#1d4ed8",
  backgroundGradient: ["rgba(30,64,175,0.95)", "rgba(59,130,246,0.85)"],
  borderWidth: 6,
  cornerRadius: 18,
  artworkClipRadius: 14,
  fontFamily: "'Noto Sans SC', 'Segoe UI', sans-serif",
};

interface CachedTextMetrics {
  text: string;
  locale?: string;
  width: number;
}

export class CardRenderer {
  private readonly options: CardRenderOptions;
  private readonly camera: Camera2D;
  private readonly textCache: Map<string, CachedTextMetrics> = new Map();

  constructor(options: CardRenderOptions) {
    this.options = options;
    this.camera = new Camera2D();
  }

  public getCamera() {
    return this.camera;
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    transform: CardTransform,
    deltaTime: number
  ) {
    ctx.save();
    this.applyTransform(ctx, transform);

    const skin = { ...DEFAULT_SKIN, ...(card.skin ?? {}) };

    const width = this.options.width;
    const height = this.options.height;

    // Determine LOD & whether to draw details
    const lod = transform.lodLevel;
    const detailThreshold = lod < 2;

    this.drawCardBase(ctx, skin, width, height, card, transform);

    if (card.artwork?.image) {
      this.drawArtwork(ctx, card, skin, width, height);
    }

    if (detailThreshold) {
      this.drawText(ctx, card, skin, width, height);
      this.drawStats(ctx, card, skin, width, height);
    } else {
      this.drawMinimalStats(ctx, card, skin, width, height);
    }

    this.drawStateOverlays(ctx, card, skin, width, height, transform, deltaTime);

    ctx.restore();
  }

  private applyTransform(ctx: CanvasRenderingContext2D, transform: CardTransform) {
    ctx.globalAlpha *= transform.opacity;
    ctx.translate(transform.position.x, transform.position.y);
    ctx.rotate(transform.rotation);
    ctx.scale(transform.scale, transform.scale);
  }

  private drawCardBase(
    ctx: CanvasRenderingContext2D,
    skin: CardSkin,
    width: number,
    height: number,
    card: CardPresentation,
    transform: CardTransform
  ) {
    const radius = skin.cornerRadius;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, skin.backgroundGradient[0]);
    gradient.addColorStop(1, skin.backgroundGradient[1]);

    this.roundRect(ctx, 0, 0, width, height, radius);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = skin.borderWidth;
    ctx.strokeStyle = this.resolveFrameColor(card, transform, skin);
    ctx.stroke();
  }

  private drawArtwork(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    skin: CardSkin,
    width: number,
    height: number,
  ) {
    if (!card.artwork?.image) return;
    const padding = 22;
    const artworkHeight = height * 0.55;
    const clipRadius = skin.artworkClipRadius;

    ctx.save();
    this.roundRect(ctx, padding, padding, width - padding * 2, artworkHeight, clipRadius);
    ctx.clip();
    if (card.artwork.tint) {
      ctx.fillStyle = card.artwork.tint;
      ctx.fillRect(padding, padding, width - padding * 2, artworkHeight);
    }
    ctx.drawImage(card.artwork.image, padding, padding, width - padding * 2, artworkHeight);
    ctx.restore();

    if (card.artwork.effectLayer) {
      card.artwork.effectLayer(ctx, width, artworkHeight);
    }
  }

  private drawText(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    skin: CardSkin,
    width: number,
    height: number
  ) {
    const localeFont = card.locale && skin.localeFontMap?.[card.locale];
    const fontFamily = localeFont ?? skin.fontFamily;

    ctx.fillStyle = "#f8fafc";
    ctx.font = `600 20px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillText(card.name, 24, height * 0.58, width - 48);

    ctx.font = `400 14px ${fontFamily}`;
    const description = this.wrapText(ctx, card.description, width - 48);
    description.forEach((line, index) => {
      ctx.fillText(line, 24, height * 0.65 + index * 16);
    });
  }

  private drawStats(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    skin: CardSkin,
    width: number,
    height: number
  ) {
    ctx.font = "700 18px 'Roboto', 'Segoe UI', sans-serif";

    // Cost
    this.drawBadge(ctx, {
      x: 24,
      y: 24,
      radius: 20,
      color: "rgba(8, 145, 178, 0.9)",
      text: String(card.cost),
    });

    // Attack
    this.drawBadge(ctx, {
      x: 24,
      y: height - 36,
      radius: 18,
      color: "rgba(249, 115, 22, 0.9)",
      text: String(card.attack),
    });

    // Health
    this.drawBadge(ctx, {
      x: width - 24,
      y: height - 36,
      radius: 18,
      color: "rgba(34, 197, 94, 0.9)",
      text: String(card.health),
    });
  }

  private drawMinimalStats(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    skin: CardSkin,
    width: number,
    height: number
  ) {
    ctx.font = "600 16px 'Roboto', 'Segoe UI', sans-serif";
    ctx.fillStyle = "rgba(248,250,252,0.85)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(card.name, width / 2, height - 24, width - 48);
    ctx.textAlign = "left";

    this.drawBadge(ctx, {
      x: 24,
      y: height - 36,
      radius: 16,
      color: "rgba(249,115,22,0.8)",
      text: String(card.attack),
    });
    this.drawBadge(ctx, {
      x: width - 24,
      y: height - 36,
      radius: 16,
      color: "rgba(34,197,94,0.8)",
      text: String(card.health),
    });
  }

  private drawStateOverlays(
    ctx: CanvasRenderingContext2D,
    card: CardPresentation,
    skin: CardSkin,
    width: number,
    height: number,
    transform: CardTransform,
    deltaTime: number
  ) {
    switch (card.state) {
      case "hovered":
        this.drawOutline(ctx, width, height, "rgba(96,165,250,0.65)", 3);
        break;
      case "selected":
        this.drawOutline(ctx, width, height, "rgba(244,114,182,0.7)", 4);
        break;
      case "disabled":
        this.drawOverlay(ctx, width, height, "rgba(15,23,42,0.55)");
        break;
      case "attacking":
        this.drawAttackEffect(ctx, width, height, deltaTime);
        break;
      default:
        break;
    }

    if (transform.highlight) {
      this.drawOutline(ctx, width, height, card.glowColor ?? "rgba(34,211,238,0.75)", 5);
    }
  }

  private drawOutline(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: string,
    thickness: number
  ) {
    ctx.save();
    this.roundRect(ctx, 0, 0, width, height, DEFAULT_SKIN.cornerRadius + 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.setLineDash([12, 6]);
    ctx.stroke();
    ctx.restore();
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, color: string) {
    ctx.save();
    this.roundRect(ctx, 0, 0, width, height, DEFAULT_SKIN.cornerRadius);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  private drawAttackEffect(ctx: CanvasRenderingContext2D, width: number, height: number, deltaTime: number) {
    const time = performance.now() / 300;
    const intensity = (Math.sin(time) + 1) / 2;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.roundRect(ctx, 6, 6, width - 12, height - 12, DEFAULT_SKIN.cornerRadius);
    ctx.strokeStyle = `rgba(239,68,68,${0.5 + intensity * 0.4})`;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }

  private drawBadge(
    ctx: CanvasRenderingContext2D,
    {
      x,
      y,
      radius,
      color,
      text,
    }: {
      x: number;
      y: number;
      radius: number;
      color: string;
      text: string;
    }
  ) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = "700 16px 'Roboto', 'Segoe UI', sans-serif";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  private resolveFrameColor(card: CardPresentation, transform: CardTransform, skin: CardSkin) {
    switch (card.state) {
      case "hovered":
        return "rgba(96,165,250,0.8)";
      case "selected":
        return "rgba(244,114,182,0.85)";
      case "disabled":
        return "rgba(51,65,85,0.7)";
      case "attacking":
        return "rgba(239,68,68,0.85)";
      default:
        return skin.frameColor;
    }
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";

    words.forEach((word) => {
      const testLine = current ? `${current} ${word}` : word;
      const { width } = ctx.measureText(testLine);
      if (width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = testLine;
      }
    });

    if (current) {
      lines.push(current);
    }
    return lines.slice(0, 3);
  }
}
