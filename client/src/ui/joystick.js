/**
 * Điều khiển:
 *  - Điện thoại: joystick ảo (nửa trái màn hình), kéo nửa phải để xoay camera
 *  - Máy tính: WASD / phím mũi tên, Shift để chạy, kéo chuột để xoay camera, cuộn chuột để zoom
 */
export class Controls {
  constructor(el, { onLook, onZoom } = {}) {
    this.el = el;
    this.move = { x: 0, y: 0 }; // y > 0 = tiến lên
    this.keys = new Set();
    this.onLook = onLook;
    this.onZoom = onZoom;
    this.enabled = true;
    this.stick = null;
    this.look = null;

    this.base = document.createElement('div');
    this.base.className = 'joy-base hidden';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    el.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._moveEv(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('wheel', (e) => this.onZoom && this.onZoom(Math.sign(e.deltaY)), { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _down(e) {
    if (!this.enabled) return;
    const touchLike = e.pointerType !== 'mouse';
    if (touchLike && e.clientX < window.innerWidth * 0.45 && !this.stick) {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.remove('hidden');
      this.knob.style.transform = 'translate(-50%, -50%)';
    } else if (!this.look) {
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  }

  _moveEv(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      const R = 55;
      let dx = e.clientX - this.stick.x;
      let dy = e.clientY - this.stick.y;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.move.x = dx / R;
      this.move.y = -dy / R;
    } else if (this.look && e.pointerId === this.look.id) {
      const dx = e.clientX - this.look.x;
      const dy = e.clientY - this.look.y;
      this.look.x = e.clientX;
      this.look.y = e.clientY;
      this.onLook && this.onLook(dx, dy);
    }
  }

  _up(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.move.x = 0;
      this.move.y = 0;
      this.base.classList.add('hidden');
    }
    if (this.look && e.pointerId === this.look.id) this.look = null;
  }

  /** Vector di chuyển hiện tại (kết hợp joystick + bàn phím), độ lớn 0..1, run = chạy nhanh */
  vector() {
    let x = this.move.x;
    let y = this.move.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    const keyboard = x !== this.move.x || y !== this.move.y;
    const run = keyboard ? k.has('ShiftLeft') || k.has('ShiftRight') : Math.hypot(x, y) > 0.8;
    return { x: this.enabled ? x : 0, y: this.enabled ? y : 0, run };
  }
}
