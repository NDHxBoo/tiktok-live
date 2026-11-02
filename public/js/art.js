/**
 * Đồ hoạ SVG hoạt hình (vẽ tay bằng code, không dùng ảnh ngoài).
 * Nhân vật "Cảnh sát Bánh Bao" là nhân vật HƯ CẤU: áo tím, mũ hồng gắn huy hiệu bánh donut.
 * Không dùng quân phục, phù hiệu hay logo của bất kỳ lực lượng công an thật nào.
 */
(function () {
  const OUT = '#2b2150';

  /** Cảnh sát Bánh Bao. flip=true để quay mặt sang trái */
  function cop({ flashlight = false } = {}) {
    return `
<svg class="cop-svg" viewBox="0 0 140 180" xmlns="http://www.w3.org/2000/svg">
  ${flashlight ? `<path class="beam" d="M118 112 L300 70 L300 170 Z" fill="url(#beamGrad)"/>
  <defs><linearGradient id="beamGrad" x1="0" x2="1"><stop offset="0" stop-color="#fff7b0" stop-opacity=".85"/><stop offset="1" stop-color="#fff7b0" stop-opacity="0"/></linearGradient></defs>` : ''}
  <ellipse cx="62" cy="172" rx="40" ry="7" fill="#000" opacity=".18"/>
  <g class="leg leg-l"><rect x="40" y="128" width="17" height="32" rx="8" fill="#3b3466" stroke="${OUT}" stroke-width="3"/><ellipse cx="46" cy="162" rx="15" ry="8" fill="#1f1a38"/></g>
  <g class="leg leg-r"><rect x="68" y="128" width="17" height="32" rx="8" fill="#3b3466" stroke="${OUT}" stroke-width="3"/><ellipse cx="80" cy="162" rx="15" ry="8" fill="#1f1a38"/></g>
  <g class="arm arm-back"><rect x="14" y="88" width="15" height="38" rx="7.5" fill="#7b5cff" stroke="${OUT}" stroke-width="3.5" transform="rotate(18 21 90)"/><circle cx="14" cy="124" r="8" fill="#ffd9bd" stroke="${OUT}" stroke-width="3"/></g>
  <rect x="24" y="78" width="78" height="62" rx="27" fill="#7b5cff" stroke="${OUT}" stroke-width="4"/>
  <path d="M40 82 L63 104 L86 82" fill="none" stroke="#5a3fd6" stroke-width="5" stroke-linecap="round"/>
  <rect x="25" y="118" width="76" height="9" fill="#ffcf3f" stroke="${OUT}" stroke-width="3"/>
  <rect x="56" y="116" width="14" height="13" rx="3" fill="#ffe98a" stroke="${OUT}" stroke-width="2.5"/>
  <circle cx="63" cy="98" r="3.5" fill="#ffe27a" stroke="${OUT}" stroke-width="2"/>
  <circle cx="63" cy="109" r="3.5" fill="#ffe27a" stroke="${OUT}" stroke-width="2"/>
  <g class="arm arm-front">
    <rect x="96" y="86" width="15" height="36" rx="7.5" fill="#7b5cff" stroke="${OUT}" stroke-width="3.5" transform="rotate(-28 103 90)"/>
    ${flashlight
      ? `<rect x="108" y="104" width="22" height="12" rx="4" fill="#ffcf3f" stroke="${OUT}" stroke-width="3"/>`
      : `<rect x="110" y="108" width="12" height="8" rx="3" fill="#c8f7ff" stroke="${OUT}" stroke-width="2.5"/><circle cx="125" cy="112" r="4" fill="none" stroke="${OUT}" stroke-width="2.5"/>`}
    <circle cx="113" cy="116" r="8" fill="#ffd9bd" stroke="${OUT}" stroke-width="3"/>
  </g>
  <circle cx="63" cy="52" r="33" fill="#ffd9bd" stroke="${OUT}" stroke-width="4"/>
  <ellipse cx="52" cy="54" rx="5.5" ry="7.5" fill="${OUT}"/><circle cx="54" cy="51" r="2.2" fill="#fff"/>
  <ellipse cx="76" cy="54" rx="5.5" ry="7.5" fill="${OUT}"/><circle cx="78" cy="51" r="2.2" fill="#fff"/>
  <ellipse cx="42" cy="66" rx="6" ry="3.5" fill="#ff8fa3" opacity=".75"/>
  <ellipse cx="86" cy="66" rx="6" ry="3.5" fill="#ff8fa3" opacity=".75"/>
  <path d="M49 69 q7 -7 14 -1 q7 -6 14 1 q-7 6 -14 2 q-7 4 -14 -2z" fill="#6b4330" stroke="${OUT}" stroke-width="1.5"/>
  <path d="M57 76 q6 5 12 0" stroke="${OUT}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M30 36 C 30 6, 96 6, 96 36 Z" fill="#ff5fa2" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M24 34 H104 Q110 34 108 40 Q106 44 100 44 H28 Q20 44 20 39 Q20 34 24 34Z" fill="#e23f8a" stroke="${OUT}" stroke-width="3.5"/>
  <circle cx="63" cy="22" r="9.5" fill="#ffb84d" stroke="${OUT}" stroke-width="3"/>
  <circle cx="63" cy="22" r="3.4" fill="#ff5fa2" stroke="${OUT}" stroke-width="2"/>
  <path d="M57 16 l2 2 M68 17 l-2 2 M57 28 l2 -1 M69 27 l-2 -1" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;
  }

  /** Bức tường thủng (dùng khi vượt ngục) */
  function wallHole() {
    return `
<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <path d="M60 150 L95 70 L150 95 L190 30 L240 85 L300 55 L320 130 L360 170 L310 220 L320 270 L240 245 L190 290 L140 240 L80 260 L90 205 Z"
        fill="#1a1426" stroke="#5b3a22" stroke-width="10" stroke-linejoin="round"/>
  <path d="M110 160 L150 130 M250 120 L290 150 M200 220 L215 260" stroke="#3a2a40" stroke-width="6" stroke-linecap="round"/>
</svg>`;
  }

  window.ART = { cop, wallHole };
})();
