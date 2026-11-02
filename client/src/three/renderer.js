/**
 * Khởi tạo renderer / camera với thiết lập tối ưu cho điện thoại tầm trung:
 * giới hạn pixel ratio, tắt khử răng cưa trên máy yếu, tự hạ chất lượng khi FPS thấp.
 */
import * as THREE from 'three';

export function createRenderer(canvas, { quality = 'auto', fov = 60 } = {}) {
  const mobile = matchMedia('(pointer: coarse)').matches;
  const lowMem = (navigator.deviceMemory || 4) <= 3;
  let q = quality;
  if (q === 'auto') q = mobile ? (lowMem ? 'low' : 'medium') : 'high';
  const maxDpr = { low: 1, medium: 1.5, high: 2 }[q];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q === 'high', powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.3, 220);
  const scene = new THREE.Scene();

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // Tự hạ độ phân giải nếu FPS trung bình < 40 trong 4 giây
  let frames = 0;
  let acc = 0;
  function watchFps(dt) {
    frames++;
    acc += dt;
    if (acc >= 4) {
      const fps = frames / acc;
      if (fps < 40 && dpr > 0.75) {
        dpr = Math.max(0.75, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        console.info(`[đồ hoạ] FPS ${fps.toFixed(0)} → giảm pixel ratio còn ${dpr}`);
      }
      frames = 0;
      acc = 0;
    }
  }

  return { renderer, scene, camera, resize, watchFps, quality: q };
}
