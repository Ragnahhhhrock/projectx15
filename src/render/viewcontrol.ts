// Free-look view control: drag to rotate a full 360° around the aircraft (or look around the
// cockpit), right/middle/shift-drag to pan, wheel or pinch to zoom, double-click or V to reset.

const ROTATE_SPEED = 0.005; // rad per pixel
const PAN_SPEED = 0.0015; // fraction of view distance per pixel
const ZOOM_STEP = 0.0012; // per wheel delta unit
const ZOOM_MIN = 0.08;
const ZOOM_MAX = 40;

export class ViewControl {
  /** Azimuth offset (rad), positive swings the view to the right. Unbounded: full 360°. */
  yaw = 0;
  /** Elevation offset (rad), positive looks down from above. Unbounded: can go over the top. */
  pitch = 0;
  /** Zoom factor: >1 is further away / wider, <1 is closer / narrower. */
  zoom = 1;
  /** Pan in view space, as fractions of the view distance (right, up). */
  panX = 0;
  panY = 0;

  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) this.pinchDist = this.spread();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size >= 2) {
        // Two fingers: pinch zooms, moving together pans
        const d = this.spread();
        if (this.pinchDist > 0 && d > 0) this.zoomBy(this.pinchDist / d);
        this.pinchDist = d;
        this.pan(dx / this.pointers.size, dy / this.pointers.size);
      } else if (e.buttons & 6 || e.shiftKey) {
        this.pan(dx, dy);
      } else {
        this.yaw -= dx * ROTATE_SPEED;
        this.pitch += dy * ROTATE_SPEED;
      }
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinchDist = this.pointers.size === 2 ? this.spread() : 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomBy(Math.exp(e.deltaY * (e.deltaMode === 1 ? 40 : 1) * ZOOM_STEP));
      },
      { passive: false },
    );
    el.addEventListener('dblclick', () => this.reset());
  }

  get active(): boolean {
    return this.yaw !== 0 || this.pitch !== 0 || this.zoom !== 1 || this.panX !== 0 || this.panY !== 0;
  }

  reset(): void {
    this.yaw = this.pitch = this.panX = this.panY = 0;
    this.zoom = 1;
  }

  private zoomBy(f: number): void {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * f));
  }

  private pan(dx: number, dy: number): void {
    this.panX -= dx * PAN_SPEED;
    this.panY += dy * PAN_SPEED;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
