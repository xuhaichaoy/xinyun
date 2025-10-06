import type { Camera2D } from "./Camera2D";

export type RenderCommand = (
  context: CanvasRenderingContext2D,
  camera: Camera2D,
  deltaTime: number
) => void;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderCommandOptions {
  bounds?: Rect | null;
}

export interface QueuedRenderCommand {
  run: RenderCommand;
  bounds: Rect | null;
}

export type LayerName = "background" | "game" | "ui" | "fx" | string;

export interface RenderLayer {
  name: LayerName;
  visible: boolean;
  commands: QueuedRenderCommand[];
  autoClear: boolean;
}

export class SceneGraph {
  private layers: Map<LayerName, RenderLayer> = new Map();
  private queueListener: ((layer: LayerName, command: QueuedRenderCommand, options?: RenderCommandOptions) => void) | null = null;

  constructor(initialLayers: LayerName[] = ["background", "game", "fx", "ui"]) {
    initialLayers.forEach((layer) => this.ensureLayer(layer));
  }

  public ensureLayer(name: LayerName, options: Partial<Omit<RenderLayer, "name" | "commands">> = {}) {
    if (!this.layers.has(name)) {
      this.layers.set(name, {
        name,
        visible: options.visible ?? true,
        autoClear: options.autoClear ?? true,
        commands: [],
      });
    }
    return this.layers.get(name)!;
  }

  public queue(layerName: LayerName, command: RenderCommand, options: RenderCommandOptions = {}) {
    const layer = this.ensureLayer(layerName);
    const entry: QueuedRenderCommand = {
      run: command,
      bounds: options.bounds ?? null,
    };
    layer.commands.push(entry);
    this.queueListener?.(layerName, entry, options);
  }

  public getLayers() {
    return Array.from(this.layers.values());
  }

  public hasCommands() {
    for (const layer of this.layers.values()) {
      if (layer.commands.length > 0) {
        return true;
      }
    }
    return false;
  }

  public clear() {
    this.layers.forEach((layer) => {
      layer.commands.length = 0;
    });
  }

  public setQueueListener(
    listener: (layer: LayerName, command: QueuedRenderCommand, options?: RenderCommandOptions) => void
  ) {
    this.queueListener = listener;
  }
}
