/**
 * Bộ dựng hình low-poly: gom nhiều khối (hộp, trụ, nón, cầu) có màu riêng
 * thành MỘT lưới duy nhất dùng vertex color → rất ít draw call, chạy mượt trên điện thoại.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Vật liệu dùng chung cho mọi thứ dựng bằng vertex color */
export const VC_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export class Builder {
  constructor() {
    this.parts = [];
  }

  /** Thêm một hình (đã tạo) với màu, vị trí, góc xoay, tỉ lệ */
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    _c.set(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _c.r;
      arr[i * 3 + 1] = _c.g;
      arr[i * 3 + 2] = _c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(geo);
    return this;
  }

  /** Hộp: tâm đáy tại (x, y, z) – tiện xếp lên mặt đất */
  box(w, h, d, x, y, z, color, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, 0, ry, 0);
  }
  /** Hộp theo tâm */
  boxC(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }
  cyl(rTop, rBot, h, seg, x, y, z, color, rx = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, x, y + h / 2, z, rx, 0, rz);
  }
  cone(r, h, seg, x, y, z, color, ry = 0) {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z, 0, ry, 0);
  }
  sphere(r, x, y, z, color, ws = 8, hs = 6, sx = 1, sy = 1, sz = 1) {
    return this.add(new THREE.SphereGeometry(r, ws, hs), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  torus(r, tube, x, y, z, color, rx = 0, ry = 0) {
    return this.add(new THREE.TorusGeometry(r, tube, 4, 10), color, x, y, z, rx, ry, 0);
  }

  geometry() {
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }

  mesh(material = VC_MATERIAL) {
    return new THREE.Mesh(this.geometry(), material);
  }
}

/** Biển chữ vẽ bằng canvas (không bị ảnh hưởng ánh sáng để luôn dễ đọc) */
export function makeSign(text, { w = 4, h = 1, bg = '#ffcf3f', fg = '#2b2150', border = '#2b2150', font = 800 } = {}) {
  const pxW = 512;
  const pxH = Math.round((512 * h) / w);
  const c = document.createElement('canvas');
  c.width = pxW;
  c.height = pxH;
  const g = c.getContext('2d');
  g.fillStyle = border;
  roundRect(g, 0, 0, pxW, pxH, 26);
  g.fill();
  g.fillStyle = bg;
  roundRect(g, 8, 8, pxW - 16, pxH - 16, 20);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = pxH * 0.55;
  g.font = `${font} ${size}px "Baloo 2", system-ui, sans-serif`;
  while (g.measureText(text).width > pxW - 40 && size > 10) {
    size -= 2;
    g.font = `${font} ${size}px "Baloo 2", system-ui, sans-serif`;
  }
  g.fillText(text, pxW / 2, pxH / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  return mesh;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
