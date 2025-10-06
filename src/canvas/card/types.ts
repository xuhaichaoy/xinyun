import type { LayerName } from "../Scene";

export type CardVisualState = "idle" | "hovered" | "selected" | "disabled" | "attacking";

export interface CardSkin {
  frameColor: string;
  backgroundGradient: [string, string];
  borderWidth: number;
  cornerRadius: number;
  artworkClipRadius: number;
  fontFamily: string;
  localeFontMap?: Record<string, string>;
}

export interface CardArtwork {
  image?: HTMLImageElement | HTMLCanvasElement | null;
  tint?: string;
  effectLayer?: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
}

export interface CardPresentation {
  id: string | number;
  name: string;
  description: string;
  attack: number;
  health: number;
  cost: number;
  locale?: string;
  artwork?: CardArtwork;
  skin?: Partial<CardSkin>;
  layer?: LayerName;
  glowColor?: string;
  state?: CardVisualState;
}

export interface CardTransform {
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  opacity: number;
  lodLevel: number;
  highlight?: boolean;
}

export interface CardRenderOptions {
  width: number;
  height: number;
  dpiScale: number;
  showDebugBounds?: boolean;
}
