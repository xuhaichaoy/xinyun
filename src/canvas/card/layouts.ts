import type { CardTransform } from "./types";

export interface FanLayoutOptions {
  origin: { x: number; y: number };
  radius: number;
  startAngle?: number;
  endAngle?: number;
  spread?: number; // degrees override start/end
  baseScale?: number;
  scaleFalloff?: number;
  maxVisible?: number;
}

export function computeFanLayout(
  count: number,
  options: FanLayoutOptions
): CardTransform[] {
  const {
    origin,
    radius,
    startAngle = -25,
    endAngle = 25,
    spread,
    baseScale = 1,
    scaleFalloff = 0.02,
    maxVisible = count,
  } = options;

  if (count === 0) return [];

  const effectiveCount = Math.min(count, maxVisible);
  const angleSpread = spread != null ? spread : endAngle - startAngle;
  const step = effectiveCount > 1 ? angleSpread / (effectiveCount - 1) : 0;

  const transforms: CardTransform[] = [];
  for (let i = 0; i < count; i++) {
    const index = i;
    const cardPosition = Math.min(index, effectiveCount - 1);
    const angleDeg = startAngle + step * cardPosition;
    const angleRad = (angleDeg * Math.PI) / 180;

    const x = origin.x + radius * Math.sin(angleRad);
    const y = origin.y + radius * (1 - Math.cos(angleRad));

    const scale = baseScale - Math.abs(cardPosition - (effectiveCount - 1) / 2) * scaleFalloff;

    transforms.push({
      position: { x, y },
      rotation: angleRad * 0.25,
      scale: Math.max(scale, baseScale * 0.7),
      opacity: 1,
      lodLevel: angleSpread > 40 ? 1 : 0,
    });
  }

  return transforms;
}

export interface GridLayoutOptions {
  origin: { x: number; y: number };
  columns: number;
  rowSpacing: number;
  columnSpacing: number;
  baseScale?: number;
}

export function computeGridLayout(count: number, options: GridLayoutOptions): CardTransform[] {
  const { origin, columns, rowSpacing, columnSpacing, baseScale = 1 } = options;
  const transforms: CardTransform[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    transforms.push({
      position: {
        x: origin.x + col * columnSpacing,
        y: origin.y + row * rowSpacing,
      },
      rotation: 0,
      scale: baseScale,
      opacity: 1,
      lodLevel: 0,
    });
  }

  return transforms;
}

export function computeLOD(distance: number, thresholds: number[] = [250, 500, 800]) {
  for (let i = 0; i < thresholds.length; i++) {
    if (distance < thresholds[i]) {
      return i;
    }
  }
  return thresholds.length;
}
