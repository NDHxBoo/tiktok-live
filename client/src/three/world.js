/**
 * Dựng cảnh nhà tù 3D low-poly + ánh sáng ngày/đêm theo giờ thực.
 * Toàn bộ đồ tĩnh được gộp thành vài lưới (draw call) để chạy nhẹ trên điện thoại.
 */
import * as THREE from 'three';
import { Builder, VC_MATERIAL, makeSign } from './build.js';
import {
  WORLD, GATE, DESK, CELLS, BENCHES, HOOP, CANTEEN, TABLES, TOWER, PODIUM, WALL_HOLE, cellBounds, queueSlot,
} from '../../../shared/map.js';

const C = {
  grass: '#8fd16f',
  grassDark: '#6fbf5a',
  yard: '#f2d9a6',
  path: '#e8c48c',
  wall: '#fff1d6',
  wallTrim: '#ff8fb1',
  wallBase: '#e7c9a0',
  block: '#ffd9a8',
  blockRoof: '#ff7aa8',
  cellFloor: '#c9b8e8',
  cellWall: '#f3e6ff',
  bar: '#5d6385',
  wood: '#c98b5e',
  woodDark: '#9b6640',
  metal: '#8a91b4',
  teal: '#3fc9b0',
  purple: '#7b5cff',
  yellow: '#ffcf3f',
  red: '#ff5e6c',
  white: '#ffffff',
  dark: '#2b2150',
  leaf: '#4cbf6b',
  leaf2: '#7ad36a',
  trunk: '#9b6640',
  canteenFloor: '#ffe9c7',
  canteenWall: '#bfe8ff',
  canteenRoof: '#3fa7d6',
};

export function createWorld(scene) {
  const B = new Builder(); // khối tĩnh chính
  const BARS = new Builder(); // song sắt (tách riêng để "nổ" khi vượt ngục)
  const LAMPS = new Builder(); // bóng đèn (sáng về đêm)
  const H = WORLD.half;

  // ───────── Mặt đất ─────────
  B.box(160, 0.2, 160, 0, -0.2, 0, C.grassDark);
  B.box(2 * H, 0.05, 2 * H, 0, -0.05, 0, C.grass);
  B.box(46, 0.06, 36, 4, -0.04, 1, C.yard); // sân đất
  B.box(3, 0.07, 12, 0, -0.04, 24, C.path); // lối vào từ cổng
  // vạch sân
  for (let i = -1; i <= 1; i++) B.box(0.15, 0.08, 30, 4 + i * 10, -0.04, 1, '#fff6e0');

  // ───────── Tường bao ─────────
  const t = 0.8;
  const wh = WORLD.wallHeight;
  const wall = (x, z, w, d) => {
    B.box(w, wh, d, x, 0, z, C.wall);
    B.box(w + 0.1, 0.35, d + 0.1, x, wh, z, C.wallTrim);
    B.box(w + 0.05, 0.5, d + 0.05, x, 0, z, C.wallBase);
  };
  wall(0, -H - t / 2, 2 * H + 2 * t, t); // bắc
  wall(-H - t / 2, 0, t, 2 * H); // tây
  // đông: chừa lỗ vượt ngục
  const holeW = 2.4;
  wall(H + t / 2, (-H + WALL_HOLE.z - holeW / 2) / 2, t, WALL_HOLE.z - holeW / 2 + H);
  wall(H + t / 2, (WALL_HOLE.z + holeW / 2 + H) / 2, t, H - WALL_HOLE.z - holeW / 2);
  B.box(t, wh - 2.2, holeW, H + t / 2, 2.2, WALL_HOLE.z, C.wall);
  B.box(t * 0.6, 2.2, holeW, H + t, 0, WALL_HOLE.z, '#2a2238'); // lỗ tối
  // ván gỗ chắn lỗ (cho vui)
  B.boxC(0.12, 0.3, 2.6, H - 0.05, 1.5, WALL_HOLE.z, C.wood, 0.35, 0, 0);
  B.boxC(0.12, 0.3, 2.6, H - 0.05, 0.8, WALL_HOLE.z, C.woodDark, -0.25, 0, 0);
  // gạch vụn quanh lỗ
  for (let i = 0; i < 6; i++) B.boxC(0.4, 0.25, 0.35, H - 0.8 - (i % 3) * 0.5, 0.12, WALL_HOLE.z - 1.2 + i * 0.45, '#d9a77a', 0, i, 0);
  // nam: chừa cổng
  const gw = GATE.width;
  wall((-H - gw / 2) / 2, H + t / 2, H - gw / 2, t);
  wall((H + gw / 2) / 2, H + t / 2, H - gw / 2, t);

  // ───────── Cổng vào ─────────
  for (const s of [-1, 1]) {
    B.box(1.4, 5.4, 1.4, s * (gw / 2 + 0.7), 0, H, C.purple);
    B.cone(1.0, 1.0, 4, s * (gw / 2 + 0.7), 5.4, H, C.yellow, Math.PI / 4);
  }
  B.box(gw + 2.8, 0.9, 1.0, 0, 4.6, H, C.purple);
  // cánh cổng mở (song sắt màu vàng)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) BARS.box(0.1, 3.4, 0.1, s * (gw / 2 + 0.2), 0, H - 0.6 - i * 0.55, C.yellow);
    BARS.box(0.12, 0.15, 2.6, s * (gw / 2 + 0.2), 3.2, H - 1.7, C.yellow);
  }
  const gateSign = makeSign('TRẠI GIAM BÁNH BAO', { w: 7.5, h: 1.1, bg: '#ffcf3f' });
  gateSign.position.set(0, 5.15, H + 0.55);
  gateSign.rotation.y = Math.PI;
  const gateSign2 = gateSign.clone();
  gateSign2.position.set(0, 5.15, H - 0.55);
  gateSign2.rotation.y = 0;

  // ───────── Bàn tiếp nhận phạm nhân ─────────
  B.box(DESK.w, 1.05, DESK.d, DESK.x, 0, DESK.z, C.wood);
  B.box(DESK.w + 0.2, 0.12, DESK.d + 0.2, DESK.x, 1.05, DESK.z, C.woodDark);
  B.box(0.5, 0.35, 0.4, DESK.x + 1.2, 1.17, DESK.z, '#ffffff'); // giấy tờ
  B.box(0.35, 0.25, 0.3, DESK.x - 1.1, 1.17, DESK.z, C.red); // con dấu
  B.box(0.1, 2.6, 0.1, DESK.x - DESK.w / 2 + 0.1, 0, DESK.z + 0.4, C.metal);
  B.box(0.1, 2.6, 0.1, DESK.x + DESK.w / 2 - 0.1, 0, DESK.z + 0.4, C.metal);
  B.box(0.9, 0.9, 0.9, DESK.x - 0.6, 0, DESK.z - 1.3, C.teal); // ghế cảnh sát ngồi
  const deskSign = makeSign('TIẾP NHẬN PHẠM NHÂN', { w: 4.2, h: 0.75, bg: '#ffffff', fg: '#7b5cff' });
  deskSign.position.set(DESK.x, 2.75, DESK.z + 0.42);

  // ───────── Dãy phòng giam ─────────
  const x0 = CELLS.startX;
  const x1 = CELLS.startX + CELLS.count * CELLS.width;
  const bz = CELLS.backZ;
  const fz = CELLS.frontZ;
  const ch = 3.2;
  B.box(x1 - x0 + 1, 0.15, fz - bz + 1.6, (x0 + x1) / 2, 0, (bz + fz) / 2 + 0.3, '#d8cdee'); // nền
  B.box(x1 - x0 + 1, ch, 0.4, (x0 + x1) / 2, 0, bz - 0.2, C.block); // tường sau
  B.box(x1 - x0 + 2.4, 0.5, fz - bz + 2.6, (x0 + x1) / 2, ch, (bz + fz) / 2 + 0.5, C.blockRoof); // mái
  B.box(x1 - x0 + 2.6, 0.25, 0.4, (x0 + x1) / 2, ch + 0.5, fz + 1.6, C.yellow);
  const cellColors = ['#ffd6e7', '#d6f1ff', '#e7ffd6', '#fff3c4', '#e8dcff', '#ffe0cc'];
  for (let i = 0; i <= CELLS.count; i++) {
    const x = x0 + i * CELLS.width;
    B.box(0.3, ch, fz - bz, x, 0, (bz + fz) / 2, C.block); // vách ngăn
    B.box(0.45, ch, 0.45, x, 0, fz, C.purple); // cột trước
  }
  for (let i = 0; i < CELLS.count; i++) {
    const b = cellBounds(i);
    const cx = (b.minX + b.maxX) / 2;
    B.box(CELLS.width - 0.3, 0.05, fz - bz, cx, 0.15, (bz + fz) / 2, cellColors[i % cellColors.length]);
    B.box(1.4, 0.45, 2.4, b.minX + 0.75, 0.15, bz + 1.5, C.wood); // giường
    B.box(1.2, 0.15, 0.5, b.minX + 0.75, 0.6, bz + 0.6, '#ffffff'); // gối
    B.box(1.0, 0.7, 0.1, cx, 1.9, bz + 0.05, '#9fe0ff'); // cửa sổ nhỏ
    // song sắt
    for (let k = 0; k < 8; k++) BARS.box(0.09, ch - 0.2, 0.09, b.minX - 0.1 + k * 0.48, 0.15, fz, C.bar);
    BARS.box(CELLS.width - 0.4, 0.12, 0.14, cx, ch - 0.3, fz, C.bar);
    BARS.box(CELLS.width - 0.4, 0.12, 0.14, cx, 1.4, fz, C.bar);
  }
  // biển số phòng (gộp vào 1 texture)
  const cellSigns = makeCellNumbers(x0);

  // ───────── Sân tập thể dục ─────────
  for (const b of BENCHES) {
    B.box(1.8, 0.45, 0.6, b.x, 0, b.z, C.teal);
    B.box(0.1, 1.3, 0.1, b.x - 0.8, 0, b.z - 0.35, C.metal);
    B.box(0.1, 1.3, 0.1, b.x + 0.8, 0, b.z - 0.35, C.metal);
    B.cyl(0.04, 0.04, 2.2, 6, b.x, 1.25, b.z - 0.35, C.dark, 0, Math.PI / 2);
    B.cyl(0.25, 0.25, 0.12, 8, b.x - 1.0, 1.25, b.z - 0.35, C.red, 0, Math.PI / 2);
    B.cyl(0.25, 0.25, 0.12, 8, b.x + 1.0, 1.25, b.z - 0.35, C.red, 0, Math.PI / 2);
  }
  const yardSign = makeSign('SÂN TẬP 💪', { w: 3, h: 0.8, bg: '#3fc9b0', fg: '#ffffff' });
  yardSign.position.set(BENCHES[0].x + 3.5, 2.4, BENCHES[1].z);
  yardSign.rotation.y = -Math.PI / 2;
  B.box(0.1, 2.0, 0.1, BENCHES[0].x + 3.5, 0, BENCHES[1].z, C.metal);
  // bóng rổ
  B.cyl(0.12, 0.12, 3.4, 6, HOOP.x, 0, HOOP.z, C.metal);
  B.box(1.6, 1.1, 0.12, HOOP.x, 3.2, HOOP.z - 0.25, '#ffffff');
  B.torus(0.32, 0.04, HOOP.x, 3.3, HOOP.z + 0.15, C.red, Math.PI / 2);
  B.sphere(0.22, HOOP.x - 1.5, 0.22, HOOP.z + 1, '#ff8a3d', 7, 5);

  // ───────── Nhà ăn ─────────
  const cw = CANTEEN.maxX - CANTEEN.minX;
  const cd = CANTEEN.maxZ - CANTEEN.minZ;
  const ccx = (CANTEEN.minX + CANTEEN.maxX) / 2;
  B.box(cw, 0.12, cd, ccx, 0, 0, C.canteenFloor);
  B.box(cw, 3, 0.3, ccx, 0, CANTEEN.minZ, C.canteenWall);
  B.box(cw, 3, 0.3, ccx, 0, CANTEEN.maxZ, C.canteenWall);
  B.box(cw + 1.2, 0.35, cd + 1.2, ccx + 0.3, 3, 0, C.canteenRoof);
  for (const z of [CANTEEN.minZ, -3, 3, CANTEEN.maxZ]) B.box(0.35, 3, 0.35, CANTEEN.maxX, 0, z, '#ffffff');
  B.box(CANTEEN.counterX - CANTEEN.minX + 0.4, 1.1, 8, (CANTEEN.minX + CANTEEN.counterX + 0.4) / 2, 0, 0, '#ffffff');
  B.box(CANTEEN.counterX - CANTEEN.minX + 0.6, 0.12, 8.2, (CANTEEN.minX + CANTEEN.counterX + 0.4) / 2, 1.1, 0, C.red);
  for (let i = -1; i <= 1; i++) B.cyl(0.35, 0.3, 0.45, 8, CANTEEN.counterX - 0.6, 1.22, i * 2.2, C.metal); // nồi
  for (const tb of TABLES) {
    B.box(3.2, 0.12, 1.4, tb.x, 0.75, tb.z, C.wood);
    B.box(0.15, 0.75, 0.15, tb.x - 1.4, 0, tb.z, C.woodDark);
    B.box(0.15, 0.75, 0.15, tb.x + 1.4, 0, tb.z, C.woodDark);
    for (const s of [-1, 1]) B.box(3.0, 0.4, 0.35, tb.x, 0, tb.z + s * 1.05, C.teal);
  }
  for (let i = 0; i < 6; i++) {
    const q = queueSlot(i);
    B.box(0.5, 0.03, 0.5, q.x, 0.01, q.z, i === 0 ? C.red : '#ffffff'); // vạch xếp hàng
  }
  const canteenSign = makeSign('NHÀ ĂN 🍲', { w: 3.6, h: 0.9, bg: '#3fa7d6', fg: '#ffffff' });
  canteenSign.position.set(CANTEEN.maxX + 0.3, 3.75, 0);
  canteenSign.rotation.y = Math.PI / 2;

  // ───────── Tháp canh & bục Cai ngục ─────────
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.3, 5, 0.3, TOWER.x + dx * 1.2, 0, TOWER.z + dz * 1.2, C.woodDark);
  B.box(3.4, 1.4, 3.4, TOWER.x, 5, TOWER.z, C.wood);
  B.cone(2.8, 1.6, 4, TOWER.x, 6.4, TOWER.z, C.red, Math.PI / 4);
  B.cyl(1.4, 1.5, 0.3, 10, PODIUM.x, 0, PODIUM.z, '#ffd36b');
  B.cyl(1.0, 1.1, 0.3, 10, PODIUM.x, 0.3, PODIUM.z, '#ffb84d');

  // ───────── Đèn đường ─────────
  const lampPos = [[-8, 10], [8, -12], [-8, -12], [18, 18], [-14, 20], [10, 24]];
  for (const [x, z] of lampPos) {
    B.cyl(0.08, 0.1, 3.4, 6, x, 0, z, C.dark);
    LAMPS.sphere(0.3, x, 3.6, z, '#ffffff', 8, 6);
  }

  // ───────── Cây ngoài tường ─────────
  const rnd = mulberry(7);
  for (let i = 0; i < 46; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = H + 4 + rnd() * 18;
    const x = Math.cos(ang) * r;
    const z = Math.sin(ang) * r;
    const s = 0.8 + rnd() * 0.9;
    B.cyl(0.2 * s, 0.3 * s, 1.2 * s, 5, x, 0, z, C.trunk);
    B.cone(1.3 * s, 2.4 * s, 6, x, 1.0 * s, z, rnd() < 0.5 ? C.leaf : C.leaf2);
    B.cone(1.0 * s, 1.8 * s, 6, x, 2.2 * s, z, C.leaf2);
  }
  // bụi hoa trong sân
  for (const [x, z] of [[-6, 26], [6, 26], [-12, -16], [24, -16], [-14, 12]]) {
    B.sphere(0.7, x, 0.4, z, C.leaf, 6, 4);
    B.sphere(0.18, x + 0.3, 0.9, z, '#ff7aa8', 5, 4);
    B.sphere(0.18, x - 0.3, 0.8, z + 0.3, '#ffe066', 5, 4);
  }

  const staticMesh = B.mesh();
  staticMesh.matrixAutoUpdate = false;
  const barsMesh = BARS.mesh();
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const lampsMesh = LAMPS.mesh(lampMat);
  scene.add(staticMesh, barsMesh, lampsMesh, gateSign, gateSign2, deskSign, yardSign, canteenSign, cellSigns);

  // ───────── Mây ─────────
  const CL = new Builder();
  for (let i = 0; i < 9; i++) {
    const x = (rnd() - 0.5) * 140;
    const z = (rnd() - 0.5) * 140;
    const y = 26 + rnd() * 10;
    for (let k = 0; k < 4; k++) CL.sphere(2 + rnd() * 1.6, x + k * 2.2, y + rnd(), z + rnd() * 1.5, '#ffffff', 7, 5, 1, 0.7, 1);
  }
  const cloudMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.92 });
  const clouds = CL.mesh(cloudMat);
  scene.add(clouds);

  // ───────── Sao (chỉ hiện ban đêm) ─────────
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 400; i++) {
    const th = rnd() * Math.PI * 2;
    const ph = rnd() * Math.PI * 0.45;
    sp.push(Math.cos(th) * Math.sin(ph) * 150, Math.cos(ph) * 150, Math.sin(th) * Math.sin(ph) * 150);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.2, sizeAttenuation: false, transparent: true }));
  scene.add(stars);

  // ───────── Ánh sáng ─────────
  const hemi = new THREE.HemisphereLight('#ffffff', '#6b8f5a', 1.2);
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.position.set(30, 50, 20);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog('#8fd6ff', 60, 150);
  scene.background = new THREE.Color('#8fd6ff');

  const sky = { night: new THREE.Color('#0e1438'), dusk: new THREE.Color('#ff9f80'), day: new THREE.Color('#8fd6ff') };
  const tmp = new THREE.Color();
  const forcedHour = Number(new URLSearchParams(location.search).get('gio'));

  /** Cập nhật ngày/đêm theo giờ máy (hoặc ?gio=21 để thử) */
  function updateDayNight() {
    const d = new Date();
    const h = Number.isFinite(forcedHour) && new URLSearchParams(location.search).has('gio') ? forcedHour : d.getHours() + d.getMinutes() / 60;
    const s = Math.sin(((h - 6) / 12) * Math.PI); // >0 ban ngày
    const day = THREE.MathUtils.smoothstep(s, -0.15, 0.3);
    const dusk = Math.max(0, 1 - Math.abs(s) / 0.3) * 0.8;
    tmp.copy(sky.night).lerp(sky.day, day).lerp(sky.dusk, dusk * (1 - Math.abs(day - 0.5)));
    scene.background.copy(tmp);
    scene.fog.color.copy(tmp);
    sun.intensity = 0.15 + 1.5 * day;
    sun.color.set(day < 0.6 ? '#ffd2a8' : '#ffffff');
    const ang = ((h - 6) / 12) * Math.PI;
    sun.position.set(Math.cos(ang) * 50, Math.max(10, Math.sin(ang) * 50), 20);
    hemi.intensity = 0.55 + 0.75 * day;
    hemi.color.set(day > 0.5 ? '#ffffff' : '#9fb0ff');
    stars.material.opacity = 1 - day;
    stars.visible = day < 0.95;
    lampMat.color.set(day < 0.5 ? '#fff3a0' : '#f4f4f4');
    cloudMat.opacity = 0.5 + 0.42 * day;
    return day;
  }
  let dayFactor = updateDayNight();
  let dnTimer = 0;

  return {
    barsMesh,
    get isNight() {
      return dayFactor < 0.5;
    },
    update(dt) {
      clouds.rotation.y += dt * 0.004;
      dnTimer += dt;
      if (dnTimer > 30) {
        dnTimer = 0;
        dayFactor = updateDayNight();
      }
    },
  };
}

/** 12 biển số phòng trên một texture */
function makeCellNumbers(x0) {
  const n = CELLS.count;
  const c = document.createElement('canvas');
  c.width = 64 * n;
  c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = '#2b2150';
    g.fillRect(i * 64 + 2, 2, 60, 60);
    g.fillStyle = '#ffcf3f';
    g.fillRect(i * 64 + 6, 6, 52, 52);
    g.fillStyle = '#2b2150';
    g.font = '800 36px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(i + 1), i * 64 + 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geos = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.PlaneGeometry(0.8, 0.8);
    const uv = p.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / n);
    p.translate(x0 + i * CELLS.width + CELLS.width / 2, 3.65, CELLS.frontZ + 1.82);
    geos.push(p);
  }
  // gộp thủ công (cùng thuộc tính)
  const merged = new THREE.BufferGeometry();
  const pos = [];
  const uvs = [];
  const idx = [];
  geos.forEach((g2, gi) => {
    const base = gi * 4;
    for (let k = 0; k < 4; k++) {
      pos.push(g2.attributes.position.getX(k), g2.attributes.position.getY(k), g2.attributes.position.getZ(k));
      uvs.push(g2.attributes.uv.getX(k), g2.attributes.uv.getY(k));
    }
    for (let k = 0; k < g2.index.count; k++) idx.push(base + g2.index.getX(k));
  });
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(idx);
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ map: tex }));
}

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { VC_MATERIAL };
