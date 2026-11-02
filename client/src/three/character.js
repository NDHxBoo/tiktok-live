/**
 * Nhân vật low-poly: phạm nhân áo sọc, Cai ngục (áo vàng + vương miện),
 * "Cảnh sát Bánh Bao" HƯ CẤU (áo tím, mũ hồng gắn bánh donut – không giống lực lượng thật nào).
 *
 * Mỗi nhân vật = 1 lưới thân (gộp đầu, mắt, áo…) + 4 tay chân + bảng tên. Hình học & vật liệu dùng chung.
 */
import * as THREE from 'three';
import { Builder, VC_MATERIAL, roundRect } from './build.js';
import { ANIM } from '../../../shared/protocol.js';

const SKINS = ['#ffd9bd', '#f5c49c', '#e0a878', '#c68a5e', '#ffe2cc', '#d9a07a', '#f0b98f', '#ffcfaa'];
const HAIRS = ['#3b2a20', '#1f1a2e', '#7a4a2a', '#e0b050', '#ff7aa8', '#5a3fd6', '#2e2e2e', '#b5562e'];
const PANTS = ['#2d3561', '#3a6ea5', '#5a3fd6', '#2f7d6d', '#7a4a2a', '#444466', '#a33b5b', '#36507a'];

const geoCache = new Map();

function outfitColors(outfit) {
  if (outfit === 'warden') return { stripeA: '#ffc93c', stripeB: '#ffb020', sleeve: '#ffc93c' };
  if (outfit === 'guard') return { stripeA: '#7b5cff', stripeB: '#6a4be8', sleeve: '#7b5cff' };
  return { stripeA: '#ffffff', stripeB: '#2d3561', sleeve: '#2d3561' };
}

function coreGeometry(outfit, color) {
  const key = `core-${outfit}-${color}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const b = new Builder();
  const oc = outfitColors(outfit);
  // áo: 5 sọc ngang
  for (let i = 0; i < 5; i++) b.box(0.64, 0.115, 0.38, 0, 0.74 + i * 0.115, 0, i % 2 ? oc.stripeB : oc.stripeA);
  if (outfit === 'guard') {
    b.box(0.66, 0.08, 0.4, 0, 0.86, 0, '#ffcf3f'); // thắt lưng
    b.box(0.12, 0.12, 0.05, 0.14, 1.1, 0.2, '#ffe27a'); // cúc áo
  }
  if (outfit === 'warden') b.boxC(0.12, 0.62, 0.4, 0, 1.03, 0.01, '#ff5e6c', 0, 0, 0.6); // dải chéo đỏ
  const skin = SKINS[color % SKINS.length];
  b.box(0.2, 0.08, 0.2, 0, 1.31, 0, skin); // cổ
  b.sphere(0.32, 0, 1.62, 0, skin, 10, 7);
  // mắt, má, miệng
  b.boxC(0.07, 0.11, 0.04, -0.11, 1.66, 0.3, '#2b2150');
  b.boxC(0.07, 0.11, 0.04, 0.11, 1.66, 0.3, '#2b2150');
  b.boxC(0.09, 0.04, 0.03, -0.19, 1.56, 0.27, '#ff9aa8');
  b.boxC(0.09, 0.04, 0.03, 0.19, 1.56, 0.27, '#ff9aa8');
  b.boxC(0.12, 0.035, 0.03, 0, 1.52, 0.31, '#b0405a');
  if (outfit === 'guard') {
    // mũ hồng + vành + huy hiệu bánh donut (hư cấu)
    b.cyl(0.3, 0.34, 0.24, 10, 0, 1.82, 0, '#ff5fa2');
    b.boxC(0.5, 0.04, 0.24, 0, 1.84, 0.26, '#e23f8a');
    b.torus(0.06, 0.03, 0, 1.96, 0.33, '#ffb84d');
    b.boxC(0.3, 0.06, 0.06, 0, 1.49, 0.31, '#6b4330'); // ria mép
  } else {
    b.sphere(0.335, 0, 1.72, -0.03, HAIRS[color % HAIRS.length], 10, 5, 1, 0.62, 1);
    if (outfit === 'warden') {
      b.cyl(0.24, 0.24, 0.16, 8, 0, 1.9, 0, '#ffd700');
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        b.cone(0.07, 0.18, 4, Math.cos(a) * 0.2, 2.06, Math.sin(a) * 0.2, '#ffd700');
      }
    }
  }
  const g = b.geometry();
  geoCache.set(key, g);
  return g;
}

function armGeometry(outfit, color) {
  const key = `arm-${outfit}-${color}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const b = new Builder();
  b.boxC(0.16, 0.38, 0.16, 0, -0.19, 0, outfitColors(outfit).sleeve);
  b.boxC(0.15, 0.14, 0.15, 0, -0.45, 0, SKINS[color % SKINS.length]);
  const g = b.geometry();
  geoCache.set(key, g);
  return g;
}

function legGeometry(outfit, color) {
  const key = `leg-${outfit}-${color}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const b = new Builder();
  const pants = outfit === 'guard' ? '#3b3466' : outfit === 'warden' ? '#7a4a2a' : PANTS[color % PANTS.length];
  b.boxC(0.21, 0.6, 0.22, 0, -0.3, 0, pants);
  b.boxC(0.23, 0.12, 0.3, 0, -0.66, 0.04, '#2b2150');
  const g = b.geometry();
  geoCache.set(key, g);
  return g;
}

// Đạo cụ cho hoạt động mini
let PROPS = null;
function props() {
  if (PROPS) return PROPS;
  const bar = new Builder();
  bar.cyl(0.03, 0.03, 1.5, 6, 0, -0.75, 0, '#2b2150', 0, Math.PI / 2);
  bar.cyl(0.18, 0.18, 0.1, 8, -0.7, 0, 0, '#ff5e6c', 0, Math.PI / 2);
  bar.cyl(0.18, 0.18, 0.1, 8, 0.7, 0, 0, '#ff5e6c', 0, Math.PI / 2);
  const shovel = new Builder();
  shovel.boxC(0.05, 0.9, 0.05, 0, -0.35, 0.1, '#9b6640');
  shovel.boxC(0.22, 0.28, 0.04, 0, -0.85, 0.1, '#8a91b4');
  const bowl = new Builder();
  bowl.cyl(0.16, 0.1, 0.12, 8, 0, -0.06, 0, '#ffffff');
  bowl.sphere(0.12, 0, 0.06, 0, '#ffe08a', 6, 4, 1, 0.4, 1);
  PROPS = { barbell: bar.geometry(), shovel: shovel.geometry(), bowl: bowl.geometry() };
  return PROPS;
}

const SHADOW_GEO = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false });

// ───────── Ảnh đại diện (dùng chung, tải 1 lần) ─────────
const avatarCache = new Map();
function loadAvatar(url, cb) {
  let e = avatarCache.get(url);
  if (!e) {
    e = { img: new Image(), ok: false, cbs: [] };
    e.img.crossOrigin = 'anonymous';
    e.img.onload = () => {
      e.ok = true;
      e.cbs.splice(0).forEach((f) => f());
    };
    e.img.onerror = () => (e.cbs.length = 0);
    e.img.src = url;
    avatarCache.set(url, e);
  }
  if (e.ok) return e.img;
  e.cbs.push(cb);
  return null;
}

const COLORS = ['#ff5fa2', '#7b5cff', '#3fb8ff', '#3fc9b0', '#ffb84d', '#ff7a4d', '#a35cff', '#4dc96b'];
const EMOJI = { [ANIM.wave]: '👋', [ANIM.cry]: '😭', [ANIM.dance]: '🎵', [ANIM.bang]: '💢', [ANIM.lift]: '💪', [ANIM.dig]: '⛏️', [ANIM.eat]: '🍲' };

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export class Character {
  /**
   * @param {object} meta  { id, name, avatar, color, status, warden… }
   * @param {object} opts  { outfit?: 'prisoner'|'guard'|'warden', labelScale?: number, me?: boolean }
   */
  constructor(meta, opts = {}) {
    this.opts = opts;
    this.root = new THREE.Group();
    this.pose = new THREE.Group();
    this.root.add(this.pose);
    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.armL.position.set(-0.41, 1.25, 0);
    this.armR.position.set(0.41, 1.25, 0);
    this.legL.position.set(-0.15, 0.74, 0);
    this.legR.position.set(0.15, 0.74, 0);
    this.pose.add(this.armL, this.armR, this.legL, this.legR);

    this.anim = ANIM.idle;
    this.phase = Math.random() * 10;
    this.meta = {};
    this.outfit = null;
    this.target = null; // vị trí server
    this.labelText = '';
    this.bubbleUntil = 0;
    this.emoteShown = -1;
    this.prop = null;

    // Bảng tên
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 320;
    this.labelCanvas.height = 96;
    this.labelTex = new THREE.CanvasTexture(this.labelCanvas);
    this.labelTex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.labelTex, depthTest: false, transparent: true }));
    const ls = opts.labelScale || 1;
    this.label.scale.set(2.2 * ls, 0.66 * ls, 1);
    this.label.position.y = 2.45;
    this.label.renderOrder = 10;
    this.root.add(this.label);

    // Bong bóng chat
    this.bubbleCanvas = document.createElement('canvas');
    this.bubbleCanvas.width = 512;
    this.bubbleCanvas.height = 160;
    this.bubbleTex = new THREE.CanvasTexture(this.bubbleCanvas);
    this.bubbleTex.colorSpace = THREE.SRGBColorSpace;
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.bubbleTex, depthTest: false, transparent: true }));
    this.bubble.scale.set(3.2 * ls, 1.0 * ls, 1);
    this.bubble.position.y = 3.25 * (ls > 1 ? 1.1 : 1);
    this.bubble.visible = false;
    this.bubble.renderOrder = 11;
    this.root.add(this.bubble);

    this.setMeta(meta);
  }

  setMeta(meta) {
    const prev = this.meta;
    this.meta = { ...prev, ...meta };
    const outfit = this.opts.outfit || (this.meta.warden ? 'warden' : 'prisoner');
    if (outfit !== this.outfit || prev.color !== this.meta.color) this._buildBody(outfit);
    if (prev.status !== this.meta.status || prev.remaining !== this.meta.remaining) this.remainingAt = performance.now();
    this._drawLabel(true);
  }

  _buildBody(outfit) {
    this.outfit = outfit;
    const c = this.meta.color || 0;
    if (this.core) this.pose.remove(this.core);
    this.core = new THREE.Mesh(coreGeometry(outfit, c), VC_MATERIAL);
    this.pose.add(this.core);
    for (const [grp, geo] of [[this.armL, armGeometry(outfit, c)], [this.armR, armGeometry(outfit, c)], [this.legL, legGeometry(outfit, c)], [this.legR, legGeometry(outfit, c)]]) {
      grp.clear();
      grp.add(new THREE.Mesh(geo, VC_MATERIAL));
    }
  }

  /** Số giây án còn lại (đếm ngược phía client giữa các lần server cập nhật) */
  remaining() {
    const m = this.meta;
    if (m.status !== 'jailed') return m.remaining || 0;
    return Math.max(0, (m.remaining || 0) - (performance.now() - (this.remainingAt || 0)) / 1000);
  }

  _statusLine() {
    const m = this.meta;
    if (this.opts.outfit === 'guard') return '🍩 Cảnh sát';
    if (m.warden) return '👑 CAI NGỤC';
    if (m.status === 'jailed') return `⏳ ${fmtTime(this.remaining())}`;
    if (m.status === 'escort') return '🚔 đang vào tù';
    if (m.status === 'new') return '📝 làm thủ tục';
    if (m.status === 'queue') return '🍲 xếp hàng';
    return m.kind === 'tiktok' ? '🎵 TikTok' : '🕊️ tự do';
  }

  _drawLabel(force = false) {
    const text = `${this.meta.name}|${this._statusLine()}|${this.avatarReady ? 1 : 0}`;
    if (!force && text === this.labelText) return;
    this.labelText = text;
    const g = this.labelCanvas.getContext('2d');
    const W = 320;
    const Hh = 96;
    g.clearRect(0, 0, W, Hh);
    const me = this.opts.me;
    g.fillStyle = me ? 'rgba(255,207,63,0.95)' : this.meta.warden ? 'rgba(255,215,0,0.95)' : 'rgba(255,255,255,0.88)';
    roundRect(g, 4, 6, W - 8, Hh - 12, 22);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#2b2150';
    g.stroke();
    // avatar
    const cx = 46;
    const cy = Hh / 2;
    g.save();
    g.beginPath();
    g.arc(cx, cy, 30, 0, Math.PI * 2);
    g.closePath();
    g.fillStyle = COLORS[(this.meta.color || 0) % COLORS.length];
    g.fill();
    g.clip();
    let img = null;
    if (this.meta.avatar) img = loadAvatar(this.meta.avatar, () => {
      this.avatarReady = true;
      this._drawLabel(true);
    });
    if (img) {
      g.drawImage(img, cx - 30, cy - 30, 60, 60);
      this.avatarReady = true;
    } else {
      g.fillStyle = '#fff';
      g.font = '800 30px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ch = /^Ẩn danh/.test(this.meta.name || '') ? '🙈' : [...(this.meta.name || '?')][0].toUpperCase();
      g.fillText(ch, cx, cy + 2);
    }
    g.restore();
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#2b2150';
    g.font = '800 30px "Baloo 2", system-ui, sans-serif';
    let name = this.meta.name || '';
    while (g.measureText(name).width > W - 100 && name.length > 2) name = name.slice(0, -2) + '…';
    g.fillText(name, 86, 44);
    g.font = '700 24px "Baloo 2", system-ui, sans-serif';
    g.fillStyle = this.meta.status === 'jailed' ? '#d6336c' : '#5a4a8a';
    g.fillText(this._statusLine(), 86, 76);
    this.labelTex.needsUpdate = true;
  }

  /** Hiện bong bóng chat (hoặc emoji biểu cảm) vài giây */
  say(text, ms = 5000, big = false) {
    const g = this.bubbleCanvas.getContext('2d');
    const W = 512;
    const Hh = 160;
    g.clearRect(0, 0, W, Hh);
    g.font = big ? '72px system-ui, sans-serif' : '700 34px "Baloo 2", system-ui, sans-serif';
    const lines = big ? [text] : wrap(g, text, W - 60).slice(0, 2);
    const tw = Math.min(W - 16, Math.max(...lines.map((l) => g.measureText(l).width)) + 50);
    const th = big ? 110 : lines.length * 42 + 30;
    const x = (W - tw) / 2;
    g.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(g, x, 4, tw, th, 26);
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#2b2150';
    g.stroke();
    g.beginPath();
    g.moveTo(W / 2 - 14, th + 2);
    g.lineTo(W / 2, th + 26);
    g.lineTo(W / 2 + 14, th + 2);
    g.fill();
    g.fillStyle = '#2b2150';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, 4 + (big ? th / 2 + 4 : 34 + i * 42)));
    this.bubbleTex.needsUpdate = true;
    this.bubble.visible = true;
    this.bubbleUntil = performance.now() + ms;
  }

  _setProp(name) {
    if (this.propName === name) return;
    if (this.prop) {
      this.prop.parent.remove(this.prop);
      this.prop = null;
    }
    this.propName = name;
    if (!name) return;
    const P = props();
    this.prop = new THREE.Mesh(P[name], VC_MATERIAL);
    if (name === 'barbell') {
      this.prop.position.set(-0.41, -0.5, 0.1);
      this.armR.add(this.prop);
    } else if (name === 'shovel') this.armR.add(this.prop);
    else {
      this.prop.position.set(0, -0.55, 0.1);
      this.armL.add(this.prop);
    }
  }

  /** Cập nhật hoạt ảnh mỗi khung hình */
  update(dt, t) {
    const a = this.anim;
    const moving = a === ANIM.walk || a === ANIM.run;
    this.phase += dt * (a === ANIM.run ? 12 : a === ANIM.walk ? 8 : 2);
    const s = Math.sin(this.phase);
    const pose = this.pose;
    pose.position.y = 0;
    pose.rotation.set(0, 0, 0);
    let aL = 0, aR = 0, lL = 0, lR = 0, zL = 0, zR = 0;
    let prop = null;

    if (moving) {
      const amp = a === ANIM.run ? 0.9 : 0.6;
      lL = s * amp;
      lR = -s * amp;
      aL = -s * amp * 0.8;
      aR = s * amp * 0.8;
      pose.position.y = Math.abs(s) * (a === ANIM.run ? 0.09 : 0.05);
    } else if (a === ANIM.wave) {
      zR = 2.6 + Math.sin(t * 12) * 0.35;
    } else if (a === ANIM.cry) {
      pose.rotation.x = 0.25;
      pose.position.x = Math.sin(t * 30) * 0.02;
      aL = -1.2;
      aR = -1.2;
      zL = -0.5;
      zR = 0.5;
    } else if (a === ANIM.dance) {
      pose.rotation.y = t * 6;
      pose.position.y = Math.abs(Math.sin(t * 8)) * 0.25;
      zL = -2.4 + Math.sin(t * 8) * 0.4;
      zR = 2.4 - Math.sin(t * 8) * 0.4;
      lL = Math.sin(t * 8) * 0.4;
      lR = -lL;
    } else if (a === ANIM.bang) {
      aL = -1.7 + Math.sin(t * 20) * 0.45;
      aR = -1.7 - Math.sin(t * 20) * 0.45;
    } else if (a === ANIM.lift) {
      const up = Math.sin(t * 4) * 0.5 + 0.5;
      aL = aR = -2.0 - up * 1.0;
      prop = 'barbell';
    } else if (a === ANIM.dig) {
      aR = -0.6 + Math.sin(t * 16) * 0.8;
      aL = aR;
      pose.rotation.x = 0.2;
      prop = 'shovel';
    } else if (a === ANIM.eat) {
      aR = -2.2 + Math.sin(t * 7) * 0.3;
      aL = -1.2;
      prop = 'bowl';
    } else {
      aL = Math.sin(t * 1.5 + this.phase) * 0.05;
      aR = -aL;
      pose.position.y = Math.sin(t * 2 + this.phase) * 0.012;
    }
    this.armL.rotation.set(aL, 0, zL);
    this.armR.rotation.set(aR, 0, zR);
    this.legL.rotation.x = lL;
    this.legR.rotation.x = lR;
    this._setProp(prop);

    // Biểu cảm: hiện emoji to trên đầu
    if (EMOJI[a] && this.emoteShown !== a && a !== ANIM.dig && a !== ANIM.lift) {
      this.emoteShown = a;
      this.say(EMOJI[a], 2200, true);
    } else if (!EMOJI[a]) this.emoteShown = -1;

    if (this.bubble.visible && performance.now() > this.bubbleUntil) this.bubble.visible = false;
    if (this.label.visible) this._drawLabel();
  }

  dispose() {
    this.labelTex.dispose();
    this.bubbleTex.dispose();
    this.label.material.dispose();
    this.bubble.material.dispose();
  }
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (g.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) lines[1] = lines[1].slice(0, -1) + '…';
  return lines;
}
