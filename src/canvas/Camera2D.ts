export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class Camera2D {
  private _x: number;
  private _y: number;
  private _zoom: number;
  private viewportWidth: number;
  private viewportHeight: number;

  constructor({ x = 0, y = 0, zoom = 1 }: Partial<CameraState> = {}) {
    this._x = x;
    this._y = y;
    this._zoom = zoom;
    this.viewportWidth = 1;
    this.viewportHeight = 1;
  }

  get x() {
    return this._x;
  }

  set x(value: number) {
    this._x = value;
  }

  get y() {
    return this._y;
  }

  set y(value: number) {
    this._y = value;
  }

  get zoom() {
    return this._zoom;
  }

  set zoom(value: number) {
    this._zoom = Math.max(0.1, value);
  }

  public lookAt(x: number, y: number) {
    this._x = x;
    this._y = y;
  }

  public updateViewport(width: number, height: number) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public worldToScreen(position: { x: number; y: number }) {
    const screenX = (position.x - this._x) * this._zoom + this.viewportWidth / 2;
    const screenY = (position.y - this._y) * this._zoom + this.viewportHeight / 2;
    return { x: screenX, y: screenY };
  }

  public screenToWorld(position: { x: number; y: number }) {
    const worldX = (position.x - this.viewportWidth / 2) / this._zoom + this._x;
    const worldY = (position.y - this.viewportHeight / 2) / this._zoom + this._y;
    return { x: worldX, y: worldY };
  }

  public applyTransform(context: CanvasRenderingContext2D) {
    context.scale(this._zoom, this._zoom);
    context.translate(-this._x + this.viewportWidth / (2 * this._zoom), -this._y + this.viewportHeight / (2 * this._zoom));
  }
}
