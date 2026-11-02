/**
 * Bản đồ nhà tù – DÙNG CHUNG cho server (kiểm tra va chạm, dẫn giải) và client (dựng cảnh 3D).
 * Hệ toạ độ: x = đông(+)/tây(-), z = nam(+)/bắc(-), y = lên. Đơn vị ~ mét.
 *
 *            (bắc, z = -30)
 *   ┌──────────── DÃY PHÒNG GIAM (12 ô) ────────────┐
 *   │                                               │
 *   │ NHÀ ĂN          SÂN TẬP THỂ DỤC    tạ ▪▪▪     │ ← tường có lỗ vượt ngục (đông)
 *   │                                               │
 *   │          bàn tiếp nhận ▭   tháp canh          │
 *   └─────────────────── CỔNG ──────────────────────┘
 *            (nam, z = +30)
 */

export const WORLD = {
  half: 30, // tường bao từ -30..30
  wallHeight: 4,
  moveBounds: { minX: -29.2, maxX: 29.2, minZ: -19.2, maxZ: 29.2 },
};

// ───────── Cổng & bàn tiếp nhận ─────────
export const GATE = { x: 0, z: 30, width: 6 };
export const SPAWN = { x: 0, z: 27.5 };
export const DESK = { x: -4.2, z: 23, w: 4, d: 1.2 }; // bàn "Tiếp nhận phạm nhân"
export const DESK_STOP = { x: -1.6, z: 23 }; // chỗ phạm nhân đứng làm thủ tục

// ───────── Dãy phòng giam ─────────
export const CELLS = {
  count: 12,
  width: 4,
  startX: -24, // mép tây của ô 0
  backZ: -29.6,
  frontZ: -20, // vị trí song sắt
  capacity: 6,
};

export function cellBounds(i) {
  const x0 = CELLS.startX + i * CELLS.width;
  return { minX: x0 + 0.45, maxX: x0 + CELLS.width - 0.45, minZ: CELLS.backZ + 0.5, maxZ: CELLS.frontZ - 0.45 };
}
export function cellCenter(i) {
  const b = cellBounds(i);
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
}
/** Cửa ô tù (ngay ngoài song sắt) */
export function cellDoor(i) {
  return { x: CELLS.startX + i * CELLS.width + CELLS.width / 2, z: CELLS.frontZ + 0.9 };
}
/** Vị trí đứng thứ k trong ô (lưới 2 cột x 3 hàng) */
export function cellSlot(i, k) {
  const b = cellBounds(i);
  const col = k % 2;
  const row = Math.floor(k / 2) % 3;
  return { x: b.minX + 0.7 + col * (b.maxX - b.minX - 1.4), z: b.maxZ - 0.8 - row * 2.4 };
}

// ───────── Sân tập ─────────
export const BENCHES = [
  { x: 14, z: -6 },
  { x: 14, z: -1 },
  { x: 14, z: 4 },
];
export const HOOP = { x: 22, z: 12 };

// ───────── Nhà ăn (phía tây, mở cửa về phía đông) ─────────
export const CANTEEN = { minX: -29.4, maxX: -18, minZ: -9, maxZ: 9, counterX: -27.2 };
export const TABLES = [
  { x: -21.5, z: -5.5 },
  { x: -21.5, z: 5.5 },
];
export function queueSlot(i) {
  return { x: -25.6 + i * 1.25, z: 0 };
}
export const QUEUE_MAX = 10;

// ───────── Lỗ vượt ngục ở tường đông ─────────
export const TUNNEL_EXIT = { x: 27.6, z: 14 };
export const WALL_HOLE = { x: 30, z: 14 };

// ───────── Tháp canh & bục Cai ngục ─────────
export const TOWER = { x: 22, z: 23 };
export const PODIUM = { x: 7, z: 15 };

/** Vật cản cho người đi tự do (hộp AABB trên mặt xz) */
export const OBSTACLES = [
  { minX: DESK.x - DESK.w / 2, maxX: DESK.x + DESK.w / 2, minZ: DESK.z - DESK.d / 2, maxZ: DESK.z + DESK.d / 2 },
  ...BENCHES.map((b) => ({ minX: b.x - 0.9, maxX: b.x + 0.9, minZ: b.z - 0.5, maxZ: b.z + 0.5 })),
  ...TABLES.map((t) => ({ minX: t.x - 1.6, maxX: t.x + 1.6, minZ: t.z - 0.8, maxZ: t.z + 0.8 })),
  { minX: CANTEEN.minX, maxX: CANTEEN.counterX + 0.4, minZ: -4, maxZ: 4 }, // quầy cơm
  { minX: CANTEEN.minX, maxX: CANTEEN.maxX, minZ: CANTEEN.minZ - 0.3, maxZ: CANTEEN.minZ + 0.3 }, // tường bắc nhà ăn
  { minX: CANTEEN.minX, maxX: CANTEEN.maxX, minZ: CANTEEN.maxZ - 0.3, maxZ: CANTEEN.maxZ + 0.3 }, // tường nam nhà ăn
  { minX: TOWER.x - 1.6, maxX: TOWER.x + 1.6, minZ: TOWER.z - 1.6, maxZ: TOWER.z + 1.6 },
  { minX: HOOP.x - 0.3, maxX: HOOP.x + 0.3, minZ: HOOP.z - 0.3, maxZ: HOOP.z + 0.3 },
  { minX: PODIUM.x - 1.3, maxX: PODIUM.x + 1.3, minZ: PODIUM.z - 1.3, maxZ: PODIUM.z + 1.3 },
];

const R = 0.38; // bán kính nhân vật

/** Đẩy điểm (x,z) ra khỏi vật cản và giữ trong khu vực đi lại tự do */
export function resolveFree(x, z) {
  const b = WORLD.moveBounds;
  x = Math.max(b.minX, Math.min(b.maxX, x));
  z = Math.max(b.minZ, Math.min(b.maxZ, z));
  for (const o of OBSTACLES) {
    if (x > o.minX - R && x < o.maxX + R && z > o.minZ - R && z < o.maxZ + R) {
      const dl = x - (o.minX - R);
      const dr = o.maxX + R - x;
      const dt = z - (o.minZ - R);
      const db = o.maxZ + R - z;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) x = o.minX - R;
      else if (m === dr) x = o.maxX + R;
      else if (m === dt) z = o.minZ - R;
      else z = o.maxZ + R;
    }
  }
  return { x, z };
}

/** Giữ người trong ô tù i */
export function resolveCell(i, x, z) {
  const b = cellBounds(i);
  return { x: Math.max(b.minX, Math.min(b.maxX, x)), z: Math.max(b.minZ, Math.min(b.maxZ, z)) };
}

/** Một điểm ngẫu nhiên trên sân (không đụng vật cản) */
export function randomYardPoint(rand = Math.random) {
  for (let i = 0; i < 20; i++) {
    const x = -14 + rand() * 32;
    const z = -16 + rand() * 36;
    const p = resolveFree(x, z);
    if (Math.abs(p.x - x) < 0.01 && Math.abs(p.z - z) < 0.01) return p;
  }
  return { x: 0, z: 0 };
}

/** Lộ trình dẫn giải: cổng → bàn tiếp nhận → sân → cửa ô → chỗ đứng trong ô */
export function escortPath(cell, slot) {
  const door = cellDoor(cell);
  const s = cellSlot(cell, slot);
  return [
    { x: DESK_STOP.x, z: DESK_STOP.z, wait: 1.4 },
    { x: 0, z: 17 },
    { x: door.x * 0.6, z: -6 },
    { x: door.x, z: door.z + 1.5 },
    { x: door.x, z: door.z - 1.4 },
    { x: s.x, z: s.z },
  ];
}

/** Lộ trình ra khỏi ô sau khi được thả */
export function releasePath(cell, from, rand = Math.random) {
  const door = cellDoor(cell);
  const yard = randomYardPoint(rand);
  return [{ x: door.x, z: door.z - 1.6 }, { x: door.x, z: door.z + 1.8 }, yard];
}
