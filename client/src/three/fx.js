/**
 * Hiệu ứng: nổ tường vượt ngục, bụi đào hầm, pháo giấy khi được thả, chữ bay (-30s).
 * Dùng InstancedMesh (1 draw call cho hàng trăm mảnh) để nhẹ máy.
 */
import * as THREE from 'three';
import { CELLS, TUNNEL_EXIT } from '../../../shared/map.js';

const MAX = 400;
const COLORS = ['#ff5fa2', '#7b5cff', '#3fb8ff', '#3fc9b0', '#ffcf3f', '#ff7a4d'];

export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.parts = [];
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3a0', transparent: true, opacity: 0 }));
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashT = 0;
    this.texts = [];
    this.shake = 0;
    this.barsHiddenUntil = 0;
  }

  _spawn(x, y, z, vx, vy, vz, size, color, life) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push({ x, y, z, vx, vy, vz, size, color, life, max: life, rx: Math.random() * 6, ry: Math.random() * 6 });
  }

  /** Nổ tường phòng giam (vượt ngục tập thể) */
  explode() {
    const cx = CELLS.startX + (CELLS.count * CELLS.width) / 2;
    const z = CELLS.frontZ;
    for (let i = 0; i < 160; i++) {
      const x = CELLS.startX + Math.random() * CELLS.count * CELLS.width;
      this._spawn(x, 0.5 + Math.random() * 2.5, z, (Math.random() - 0.5) * 6, 4 + Math.random() * 7, 3 + Math.random() * 9, 0.15 + Math.random() * 0.35, i % 3 ? '#d9a77a' : '#5d6385', 2 + Math.random());
    }
    this.flash.position.set(cx, 2, z);
    this.flash.visible = true;
    this.flashT = 0;
    this.shake = 1;
    // song sắt "bay mất" rồi được lắp lại sau 6 giây
    this.world.barsMesh.visible = false;
    this.barsHiddenUntil = performance.now() + 6000;
  }

  /** Bụi đất ở miệng hầm */
  tunnel() {
    for (let i = 0; i < 70; i++) {
      this._spawn(TUNNEL_EXIT.x + 1, 0.3, TUNNEL_EXIT.z + (Math.random() - 0.5) * 2, -2 - Math.random() * 4, 2 + Math.random() * 4, (Math.random() - 0.5) * 4, 0.12 + Math.random() * 0.25, '#9b6640', 1.6);
    }
    this.shake = 0.5;
  }

  /** Pháo giấy tại vị trí */
  confetti(x, y, z, n = 40) {
    for (let i = 0; i < n; i++) {
      this._spawn(x, y, z, (Math.random() - 0.5) * 5, 3 + Math.random() * 5, (Math.random() - 0.5) * 5, 0.08 + Math.random() * 0.08, COLORS[i % COLORS.length], 1.8);
    }
  }

  /** Chữ bay lên (vd "-30s", "+2:00") */
  floatText(text, x, y, z, color = '#3fc9b0') {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d');
    g.font = '800 64px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#2b2150';
    g.strokeText(text, 128, 50);
    g.fillStyle = color;
    g.fillText(text, 128, 50);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(2, 0.75, 1);
    s.position.set(x, y, z);
    s.renderOrder = 12;
    this.scene.add(s);
    this.texts.push({ s, life: 1.6 });
  }

  update(dt, camera) {
    // mảnh vụn
    const d = this.dummy;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.size / 2) {
        p.y = p.size / 2;
        p.vy *= -0.3;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      p.rx += dt * 5;
      p.ry += dt * 4;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, 0);
      d.scale.setScalar(p.size * Math.min(1, p.life / 0.4));
      d.updateMatrix();
      this.mesh.setMatrixAt(n, d.matrix);
      this.mesh.setColorAt(n, this.color.set(p.color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // chớp sáng
    if (this.flash.visible) {
      this.flashT += dt;
      this.flash.scale.setScalar(2 + this.flashT * 30);
      this.flash.material.opacity = Math.max(0, 0.9 - this.flashT * 1.8);
      if (this.flashT > 0.5) this.flash.visible = false;
    }
    if (!this.world.barsMesh.visible && performance.now() > this.barsHiddenUntil) {
      this.world.barsMesh.visible = true;
      this.world.barsMesh.scale.y = 0.01;
    }
    if (this.world.barsMesh.visible && this.world.barsMesh.scale.y < 1) {
      this.world.barsMesh.scale.y = Math.min(1, this.world.barsMesh.scale.y + dt * 1.5);
    }
    // chữ bay
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.s.position.y += dt * 1.2;
      t.s.material.opacity = Math.min(1, t.life);
      if (t.life <= 0) {
        this.scene.remove(t.s);
        t.s.material.map.dispose();
        t.s.material.dispose();
        this.texts.splice(i, 1);
      }
    }
    // rung màn hình
    if (this.shake > 0 && camera) {
      camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
  }
}
