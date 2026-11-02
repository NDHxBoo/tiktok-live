/**
 * Hằng số giao thức dùng chung server ↔ client.
 */

/** Mã hoạt ảnh gửi trong snapshot (số nhỏ cho gọn băng thông) */
export const ANIM = {
  idle: 0,
  walk: 1,
  run: 2,
  wave: 3,
  cry: 4,
  dance: 5,
  bang: 6,
  lift: 7,
  dig: 8,
  eat: 9,
};
export const ANIM_NAMES = Object.fromEntries(Object.entries(ANIM).map(([k, v]) => [v, k]));

/** Biểu cảm người chơi được phép dùng */
export const EMOTES = ['wave', 'cry', 'dance', 'bang'];

/**
 * Trạng thái nhân vật:
 *  new     – mới vào, đang chọn tội
 *  escort  – đang bị dẫn giải vào ô
 *  jailed  – đang thụ án trong ô
 *  run     – đang chạy (được thả / vượt ngục), server điều khiển
 *  free    – tự do đi lại trên sân
 *  queue   – đang xếp hàng nhà ăn
 *  leaving – nhân vật TikTok đi về cổng để rời phòng
 */
export const STATUS = ['new', 'escort', 'jailed', 'run', 'free', 'queue', 'leaving'];

/** Trạng thái do server điều khiển vị trí (client không tự di chuyển) */
export const SERVER_DRIVEN = new Set(['escort', 'run', 'queue', 'leaving']);

export const TICK_MS = 100; // server cập nhật 10 lần/giây
