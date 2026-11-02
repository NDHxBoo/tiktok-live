/**
 * Quản lý mọi nhân vật trong phòng: tạo/xoá theo meta từ server, nội suy vị trí từ snapshot,
 * ẩn bớt nhân vật & bảng tên ở xa để tiết kiệm GPU trên điện thoại.
 * Kèm theo các "Cảnh sát Bánh Bao" (NPC chỉ để trang trí, chạy phía client).
 */
import * as THREE from 'three';
import { Character } from './character.js';
import { ANIM } from '../../../shared/protocol.js';
import { DESK, PODIUM } from '../../../shared/map.js';

export class ActorManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} opts { maxVisible, maxDist, labelDist, labelScale }
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.opts = Object.assign({ maxVisible: 36, maxDist: 48, labelDist: 24, labelScale: 1 }, opts);
    this.chars = new Map();
    this.myId = null;
    this.frame = 0;
    this.guards = new Guards(scene, this.opts.labelScale);
  }

  get(id) {
    return this.chars.get(id);
  }

  applyMetas(list) {
    for (const m of list) {
      let c = this.chars.get(m.id);
      if (!c) {
        c = new Character(m, { me: m.id === this.myId, labelScale: this.opts.labelScale });
        c.root.visible = false; // chờ snapshot đầu tiên mới hiện
        c.fresh = true;
        this.scene.add(c.root);
        this.chars.set(m.id, c);
      } else c.setMeta(m);
    }
  }

  remove(id) {
    const c = this.chars.get(id);
    if (!c) return;
    this.scene.remove(c.root);
    c.dispose();
    this.chars.delete(id);
  }

  clear() {
    for (const id of [...this.chars.keys()]) this.remove(id);
  }

  /** Snapshot từ server: [[id, x*100, z*100, ry*100, anim], …] */
  applySnapshot(arr) {
    for (const [id, x, z, ry, anim] of arr) {
      const c = this.chars.get(id);
      if (!c) continue;
      c.target = { x: x / 100, z: z / 100, ry: ry / 100 };
      if (!c.local) c.anim = anim;
      if (c.fresh) {
        c.fresh = false;
        c.root.position.set(c.target.x, 0, c.target.z);
        c.root.rotation.y = c.target.ry;
        c.root.visible = true;
      }
    }
  }

  chat(id, text) {
    const c = this.chars.get(id);
    if (c) c.say(text);
  }

  update(dt, t, camera) {
    const k = Math.min(1, dt * 10);
    for (const c of this.chars.values()) {
      if (c.target && !c.local) {
        const p = c.root.position;
        // dịch chuyển xa (vd vượt ngục qua hầm) thì nhảy luôn
        if (Math.hypot(p.x - c.target.x, p.z - c.target.z) > 6) p.set(c.target.x, 0, c.target.z);
        p.x += (c.target.x - p.x) * k;
        p.z += (c.target.z - p.z) * k;
        c.root.rotation.y = lerpAngle(c.root.rotation.y, c.target.ry, k);
      }
      if (c.root.visible) c.update(dt, t);
    }
    // Ẩn bớt nhân vật ở xa (mỗi 10 khung hình)
    if (++this.frame % 10 === 0) this._cull(camera);
    this.guards.update(dt, t, this.chars);
  }

  _cull(camera) {
    const cp = camera.position;
    const { maxVisible, maxDist, labelDist } = this.opts;
    const list = [];
    for (const c of this.chars.values()) {
      if (c.fresh) continue;
      const d = c.root.position.distanceTo(cp);
      list.push([d, c]);
    }
    list.sort((a, b) => a[0] - b[0]);
    list.forEach(([d, c], i) => {
      const show = c.local || (i < maxVisible && d < maxDist);
      c.root.visible = show;
      c.label.visible = show && (c.local || d < labelDist);
    });
  }
}

function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/**
 * Cảnh sát Bánh Bao (NPC trang trí):
 *  - 1 người ngồi bàn tiếp nhận
 *  - 1 người đi tuần quanh sân
 *  - người áp giải đi cạnh phạm nhân đang bị dẫn vào ô
 */
class Guards {
  constructor(scene, labelScale) {
    this.scene = scene;
    this.labelScale = labelScale;
    const mk = (name) => {
      const g = new Character({ id: -1, name, color: 2, status: 'free' }, { outfit: 'guard', labelScale: labelScale * 0.75 });
      g.label.position.y = 2.3;
      scene.add(g.root);
      return g;
    };
    this.desk = mk('Bánh Bao 1');
    this.desk.root.position.set(DESK.x - 0.6, 0, DESK.z - 1.0);
    this.patrol = mk('Bánh Bao 2');
    this.route = [[-10, 14], [18, 14], [18, -12], [-10, -12]];
    this.routeLen = this.route.reduce((s, p, i) => s + dist(p, this.route[(i + 1) % this.route.length]), 0);
    this.escorts = new Map(); // id phạm nhân -> Character cảnh sát
    this.pool = [];
    this.makeGuard = mk;
  }

  /** Vị trí người đi tuần theo thời gian thực (mọi người xem thấy gần giống nhau) */
  patrolPos(t) {
    let d = ((Date.now() / 1000) * 2.2) % this.routeLen;
    for (let i = 0; i < this.route.length; i++) {
      const a = this.route[i];
      const b = this.route[(i + 1) % this.route.length];
      const l = dist(a, b);
      if (d <= l) {
        const f = d / l;
        return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, ry: Math.atan2(b[0] - a[0], b[1] - a[1]) };
      }
      d -= l;
    }
    return { x: 0, z: 0, ry: 0 };
  }

  update(dt, t, chars) {
    const p = this.patrolPos(t);
    this.patrol.root.position.set(p.x, 0, p.z);
    this.patrol.root.rotation.y = p.ry;
    this.patrol.anim = ANIM.walk;
    this.patrol.update(dt, t);
    this.desk.anim = Math.sin(t * 0.3) > 0.85 ? ANIM.wave : ANIM.idle;
    this.desk.root.rotation.y = 0;
    this.desk.update(dt, t);

    // Cảnh sát áp giải đi cạnh người đang bị dẫn vào ô
    const need = new Set();
    for (const c of chars.values()) if (c.meta.status === 'escort' && c.root.visible) need.add(c.meta.id);
    for (const [id, g] of this.escorts) {
      if (!need.has(id)) {
        g.root.visible = false;
        this.pool.push(g);
        this.escorts.delete(id);
      }
    }
    for (const id of need) {
      let g = this.escorts.get(id);
      if (!g) {
        if (this.escorts.size >= 8) continue;
        g = this.pool.pop() || this.makeGuard('Bánh Bao');
        g.root.visible = true;
        g.label.visible = false; // không che tên phạm nhân
        const c = chars.get(id);
        g.root.position.copy(c.root.position);
        this.escorts.set(id, g);
      }
      const c = chars.get(id);
      const ry = c.root.rotation.y;
      // đứng bên phải, hơi lùi sau phạm nhân
      const tx = c.root.position.x + Math.cos(ry) * 0.85 - Math.sin(ry) * 0.3;
      const tz = c.root.position.z - Math.sin(ry) * 0.85 - Math.cos(ry) * 0.3;
      const k = Math.min(1, dt * 8);
      const moved = Math.hypot(tx - g.root.position.x, tz - g.root.position.z);
      g.root.position.x += (tx - g.root.position.x) * k;
      g.root.position.z += (tz - g.root.position.z) * k;
      g.root.rotation.y = ry;
      g.anim = moved > 0.05 ? ANIM.walk : ANIM.idle;
      g.update(dt, t);
    }
  }

  /** Cho camera trang /live bám theo người đi tuần */
  get patrolGuard() {
    return this.patrol;
  }
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export { PODIUM };
