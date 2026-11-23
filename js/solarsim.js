// ============================================================
//  태양계 시뮬레이터 (4단계)
//
//  블랙홀의 질량을 고르고 화면을 끌어서 던지면,
//  뉴턴의 중력 법칙으로 태양·행성·소행성이 어떻게 움직이는지 계산한다.
//
//  단위: 거리 AU(지구~태양 거리), 시간 년, 질량 태양 질량
//        → 이 단위에서 중력 상수 G × 태양 질량 = 4π²
//
//  simulation.js의 전역 변수와 함수(ctx, width, state, drawHole ...)를 함께 쓴다.
//  이름이 겹치지 않도록 전체를 함수 하나로 감싸고, 필요한 기능만 solarSim으로 내보낸다.
// ============================================================

const solarSim = (function () {
  const GM = 4 * Math.PI * Math.PI;   // G × 태양 질량 (AU³/년²)
  const SOFT = 0.003;                 // 너무 가까울 때 힘이 무한대가 되지 않게 하는 거리 (AU)
  const TIDE_BOOST = 6;               // 화면에서 보이도록 조석 파괴 거리를 키우는 배율
  const SUN_R = 0.00465;              // 태양 반지름 (AU)

  // 던질 블랙홀의 질량 (태양 = 1)
  const MASSES = [
    { label: "🌍 지구만큼", m: 3.0e-6, text: "지구" },
    { label: "🪐 목성만큼", m: 9.5e-4, text: "목성" },
    { label: "☀️ 태양만큼", m: 1, text: "태양" },
    { label: "⭐ 태양×10", m: 10, text: "태양의 10배" }
  ];
  const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5];   // 1초에 흐르는 시간 (년)

  // 행성의 실제 값: a 궤도 반지름(AU), m 질량(태양 = 1), R 반지름(AU)
  // hit: 블랙홀과 '부딪혔다'고 볼 거리 (AU). 실제 크기로는 너무 작아 맞히기 어려워서 크게 잡았다
  // px: 「실제 크기」를 끈 상태에서 보기 좋게 키운 화면 크기, color/dark: 밝은 쪽·어두운 쪽 색
  // tex: 표면 무늬 { pal 색 팔레트, bands 줄무늬 수(0이면 얼룩무늬), turb 소용돌이 정도 }
  const PLANET_DATA = [
    { name: "수성",   a: 0.39, m: 1.66e-7, R: 1.63e-5, hit: 0.02,  px: 3.5, color: "#c9c2b8", dark: "#5e5850",
      tex: { pal: ["#5b554e", "#8a837a", "#b9b2a8", "#6e6860", "#a39c92"], bands: 0, turb: 1 } },
    { name: "금성",   a: 0.72, m: 2.45e-6, R: 4.05e-5, hit: 0.025, px: 5.5, color: "#f1d9a0", dark: "#8a6a35",
      tex: { pal: ["#c9a25e", "#e6cf9a", "#f3e3b8", "#d4b477", "#ecd9a6"], bands: 3, turb: 6 } },
    { name: "화성",   a: 1.52, m: 3.23e-7, R: 2.27e-5, hit: 0.02,  px: 4.5, color: "#e08350", dark: "#6e2e14",
      tex: { pal: ["#7a3418", "#b5562b", "#d98a55", "#9c4521", "#c9713d"], bands: 0, turb: 1, cap: true } },
    { name: "목성",   a: 5.2,  m: 9.55e-4, R: 4.67e-4, hit: 0.06,  px: 13,  color: "#e9cfa8", dark: "#7a5a3a", bands: true,
      tex: { pal: ["#8b5a3c", "#c9a070", "#f1e3c8", "#a4673f", "#e8d2ae", "#7a4a30", "#d9b58a"], bands: 5, turb: 2.4, spot: true } },
    { name: "토성",   a: 9.58, m: 2.86e-4, R: 3.89e-4, hit: 0.05,  px: 11,  color: "#f0dca8", dark: "#86704a", bands: true, ring: true,
      tex: { pal: ["#c9b07a", "#e9d8a8", "#f3e7c3", "#d8c08a", "#e6d39c"], bands: 6, turb: 0.8 } },
    { name: "천왕성", a: 19.2, m: 4.37e-5, R: 1.70e-4, hit: 0.035, px: 8,   color: "#b8eef2", dark: "#3c7f8a",
      tex: { pal: ["#a9e2ea", "#bfeef2", "#c9f3f5", "#b3e8ee"], bands: 2, turb: 0.5 } },
    { name: "해왕성", a: 30.1, m: 5.15e-5, R: 1.65e-4, hit: 0.035, px: 8,   color: "#6f8ff5", dark: "#1d2f7a",
      tex: { pal: ["#2b47a8", "#3f60d0", "#5f82ee", "#3554c0", "#4a6ce0"], bands: 3, turb: 1.5 } }
  ];

  // ===== 행성 표면 무늬 만들기 =====
  // 가로는 경도(한 바퀴), 세로는 화면에서 보이는 높이. 점마다 색을 계산해서 그림으로 저장해 둔다
  const TEX_W = 512, TEX_H = 256;
  const textures = {};

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function makeTexture(spec) {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    const g = c.getContext("2d");
    const img = g.createImageData(TEX_W, TEX_H);
    const d = img.data;
    const pal = spec.pal.map(hexToRgb);
    const ph = [];
    for (let i = 0; i < 8; i++) ph.push(Math.random() * Math.PI * 2);   // 행성마다 다른 무늬가 나오게

    for (let y = 0; y < TEX_H; y++) {
      // 구를 정면에서 보면 위아래 끝으로 갈수록 무늬가 눌려 보인다 → 화면 높이를 위도로 바꿔서 계산
      const v = Math.asin(y / (TEX_H - 1) * 2 - 1) / Math.PI + 0.5;
      for (let x = 0; x < TEX_W; x++) {
        const u = x / TEX_W * Math.PI * 2;   // 정수 배 주파수만 써서 좌우가 이어지게
        let t;
        if (spec.bands) {
          // 줄무늬: 위도에 따라 색이 바뀌고, 경도에 따라 물결치며 소용돌이친다
          const wave = (Math.sin(u * 3 + v * 40 + ph[0]) * 0.008 + Math.sin(u * 7 + v * 90 + ph[1]) * 0.004 + Math.sin(u * 13 + v * 25 + ph[2]) * 0.003) * spec.turb;
          const w = (v + wave) * spec.bands * Math.PI * 2;
          t = 0.5 + 0.28 * Math.sin(w + ph[3]) + 0.14 * Math.sin(w * 2.7 + ph[4]) + 0.08 * Math.sin(w * 6.1 + ph[5]);
        } else {
          // 얼룩무늬: 암석 행성의 고지대와 저지대
          t = 0.5 + 0.22 * Math.sin(u * 2 + ph[0]) * Math.sin(v * 9 + ph[1])
                  + 0.16 * Math.sin(u * 5 + v * 7 + ph[2]) * Math.sin(v * 17 + ph[3])
                  + 0.1 * Math.sin(u * 11 + ph[4]) * Math.sin(v * 31 + u * 3 + ph[5])
                  + 0.06 * Math.sin(u * 23 + v * 53 + ph[6]);
        }
        t = clamp(t + (Math.random() - 0.5) * 0.05, 0, 0.9999) * (pal.length - 1);
        const i0 = Math.floor(t), f = t - i0;
        const a = pal[i0], b = pal[i0 + 1];
        const k = (y * TEX_W + x) * 4;
        d[k] = a[0] + (b[0] - a[0]) * f;
        d[k + 1] = a[1] + (b[1] - a[1]) * f;
        d[k + 2] = a[2] + (b[2] - a[2]) * f;
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    if (spec.spot) {
      // 목성의 대적점
      const sx = TEX_W * 0.3, sy = TEX_H * 0.64;
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, 30);
      gr.addColorStop(0, "rgba(176, 72, 40, 0.95)");
      gr.addColorStop(0.6, "rgba(190, 100, 60, 0.6)");
      gr.addColorStop(1, "rgba(190, 100, 60, 0)");
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(sx, sy, 30, 13, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (spec.cap) {
      // 화성의 하얀 극관
      const top = g.createLinearGradient(0, 0, 0, 16);
      top.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      top.addColorStop(1, "rgba(255, 255, 255, 0)");
      g.fillStyle = top;
      g.fillRect(0, 0, TEX_W, 16);
    }
    return c;
  }

  // 태양 표면의 알갱이 무늬
  function makeSunTexture() {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d");
    g.fillStyle = "#ffcf5a";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const bright = Math.random() < 0.6;
      g.fillStyle = bright ? `rgba(255, 250, 220, ${rand(0.08, 0.3)})` : `rgba(230, 110, 20, ${rand(0.06, 0.22)})`;
      g.beginPath();
      g.arc(rand(0, S), rand(0, S), rand(1.5, 5), 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  function prepareTextures() {
    if (textures.sun) return;
    textures.sun = makeSunTexture();
    PLANET_DATA.forEach(p => { textures[p.name] = makeTexture(p.tex); });
  }

  // ----- 상태 -----
  let bodies = [];      // 서로 끌어당기는 무거운 천체: 태양, 행성, 블랙홀
  let dust = [];        // 끌려가기만 하는 가벼운 것: 소행성, 찢어진 파편
  let bh = null;        // 던진 블랙홀
  let massIndex = 2;
  let speedIndex = 2;
  let years = 0;
  let aim = null;       // 끌어서 조준하는 중 { x0, y0, x1, y1, p0 } (화면 좌표와 출발 지점)
  let drag = null;      // 끌어서 시점을 돌리는 중
  let active = false;
  let sunGone = false;
  let sunNoticeShown = false;
  let goneTimer = 0;
  let realSize = false; // 「실제 크기」: 켜면 태양과 행성을 실제 비율 그대로 그린다
  let uiReady = false;
  let noticed = {};     // 한 번만 알려줄 사건들
  let rocks = [];       // 행성 가까이에서 보이는 암석 조각
  let rocksFor = null;  // 암석 조각을 만들어 둔 행성
  let astro = null;     // 우주인 모드: 블랙홀을 기준으로 한 위치와 속도
  const keys = {};      // 지금 눌려 있는 키

  const LY = 63241;                 // 1광년 = 63,241 AU
  const HORIZON = 46.5e9 * LY;      // 관측 가능한 우주의 반지름 (465억 광년)

  // 자유 카메라: 한 점(focus)을 바라보며 둘레를 돌고(yaw, pitch), 거리(dist)를 바꾼다
  // 거리 하나로 행성 바로 옆부터 우주 끝까지 이어진다
  const camera = {
    yaw: -Math.PI / 2, pitch: 0.42, dist: 14, distTarget: 14,
    focus: null, fx: 0, fy: 0, fz: 0, ox: 0, oy: 0,
    C: { x: 0, y: 0, z: 1 }, f: { x: 0, y: 1, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 }, F: 800
  };

  const panel = document.getElementById("simPanel");
  const logBox = document.getElementById("simLog");


  // 받침에 맞는 조사 붙이기: josa("목성", "이", "가") → "목성이", josa("토성", "을", "를") → "토성을"
  function josa(word, withBatchim, withoutBatchim) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (hasBatchim ? withBatchim : withoutBatchim);
  }

  // a에서 b 사이를 0→1로 부드럽게 바꿔 주는 함수 (화면 요소를 서서히 나타내고 숨길 때 쓴다)
  function smooth(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function bhPos() {
    return bh ? { x: bh.x, y: bh.y } : { x: 0, y: 0 };
  }


  // ===== 카메라 =====
  // 카메라 위치(C)와 앞(f)·오른쪽(right)·위(up) 방향을 계산한다
  function updateCameraBasis() {
    const c = camera;
    c.F = Math.max(width, height) * 0.8;   // 원근 정도 (클수록 망원)
    let look;
    if (astro) {
      // 우주인 모드: 우주인 등 뒤에서 블랙홀 쪽을 바라본다
      const b = bhPos();
      const r = Math.hypot(astro.x, astro.y, astro.z) || 1;
      const ux = astro.x / r, uy = astro.y / r, uz = astro.z / r;   // 블랙홀 → 우주인 방향
      const ax = b.x + astro.x, ay = b.y + astro.y, az = astro.z;
      c.C = { x: ax + ux * 0.26, y: ay + uy * 0.26, z: az + uz * 0.26 + 0.05 };
      // 우주인이 아래쪽 패널에 가리지 않게, 우주인보다 살짝 아래를 바라봐서 화면 위쪽에 오게 한다
      look = { x: lerp(ax, b.x, 0.5), y: lerp(ay, b.y, 0.5), z: lerp(az, 0, 0.5) - 0.07 };
    } else {
      const cp = Math.cos(c.pitch);
      c.C = {
        x: c.fx + c.dist * cp * Math.cos(c.yaw),
        y: c.fy + c.dist * cp * Math.sin(c.yaw),
        z: c.fz + c.dist * Math.sin(c.pitch)
      };
      look = { x: c.fx, y: c.fy, z: c.fz };
    }
    let fx = look.x - c.C.x, fy = look.y - c.C.y, fz = look.z - c.C.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    const rl = Math.hypot(fx, fy) || 1e-9;
    const right = { x: fy / rl, y: -fx / rl, z: 0 };
    c.f = { x: fx, y: fy, z: fz };
    c.right = right;
    c.up = {                     // 오른쪽 × 앞
      x: right.y * fz - right.z * fy,
      y: right.z * fx - right.x * fz,
      z: right.x * fy - right.y * fx
    };
  }

  // 우주 좌표 → 화면 좌표. z는 카메라에서의 거리 (0 이하면 카메라 뒤)
  function project(x, y, z) {
    const c = camera;
    const px = x - c.C.x, py = y - c.C.y, pz = z - c.C.z;
    const depth = px * c.f.x + py * c.f.y + pz * c.f.z;
    return {
      x: centerX + c.F * (px * c.right.x + py * c.right.y) / depth,
      y: centerY - c.F * (px * c.up.x + py * c.up.y + pz * c.up.z) / depth,
      z: depth
    };
  }

  // 화면의 한 점 → 행성들이 도는 평면(z = 0) 위의 좌표. 평면을 못 만나면 null
  function screenToPlane(sx, sy) {
    const c = camera;
    const a = (sx - centerX) / c.F, b = -(sy - centerY) / c.F;
    const dx = c.f.x + c.right.x * a + c.up.x * b;
    const dy = c.f.y + c.right.y * a + c.up.y * b;
    const dz = c.f.z + c.up.z * b;
    if (dz > -1e-6) return null;
    const t = -c.C.z / dz;
    return { x: c.C.x + dx * t, y: c.C.y + dy * t };
  }

  // 천체를 눈에 띄게 키우는 배율 (「실제 크기」를 켜면 1배)
  function visR(b) {
    return b.R * (realSize ? 1 : b.kind === "sun" ? 12 : 60);
  }

  function bodyScreenR(b, depth) {
    return Math.max(camera.F * visR(b) / depth, realSize ? 1.2 : b.px * unit / 800 * 0.8);
  }

  function bhScreenRadius(m) {
    return (5 + 2.2 * Math.log10(m / 3e-6)) * unit / 800;
  }

  function holeScreenR(m, depth) {
    const world = astro ? 0.035 + 0.03 * Math.cbrt(m) : realSize ? 1.97e-8 * m : 0.012 + 0.02 * Math.cbrt(m);
    return Math.max(camera.F * world / depth, bhScreenRadius(m) * 0.6);
  }

  // 지금 따라갈 수 있는 천체들
  function focusList() {
    const list = bodies.filter(b => !b.gone && b.kind !== "bh");
    if (bh && !bh.gone) list.push(bh);
    return list;
  }

  function minDist() {
    const f = camera.focus;
    if (!f) return 0.05;
    return f.kind === "bh" ? 0.06 : Math.max(visR(f) * 1.8, 1e-5);
  }

  function setFocus(b) {
    // 지금 보던 곳과 새 천체 사이의 차이를 기억해 두고, 이 차이를 서서히 줄여서 부드럽게 넘어간다
    camera.ox = camera.fx - b.x;
    camera.oy = camera.fy - b.y;
    camera.focus = b;
    camera.distTarget = Math.max(camera.distTarget, minDist());
    renderPanel();
  }

  function zoomBy(factor) {
    camera.distTarget = clamp(camera.distTarget * factor, minDist(), HORIZON * 3);
  }


  // ===== 태양계 바깥: 오르트 구름, 가까운 별, 우리 은하, 은하들 =====
  let outer = null;
  function buildOuter() {
    if (outer) return;
    const dirRandom = () => {
      const z = rand(-1, 1), a = rand(0, Math.PI * 2), s = Math.sqrt(1 - z * z);
      return [Math.cos(a) * s, Math.sin(a) * s, z];
    };
    outer = { kuiper: [], oort: [], stars: [], namedStars: [], galaxy: [], cosmic: [], namedGalaxies: [] };

    // 카이퍼 벨트: 해왕성 바깥의 얼음 조각 띠
    for (let i = 0; i < 420; i++) {
      const r = rand(32, 52), a = rand(0, Math.PI * 2);
      outer.kuiper.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: rand(-3, 3) });
    }
    // 오르트 구름: 태양계를 둥글게 감싼 얼음 조각 구름
    for (let i = 0; i < 1100; i++) {
      const d = dirRandom(), r = Math.pow(10, rand(3.3, 4.9));
      outer.oort.push({ x: d[0] * r, y: d[1] * r, z: d[2] * r });
    }
    // 가까운 별들 (이름 있는 별은 실제 거리, 방향은 임의)
    for (let i = 0; i < 320; i++) {
      const d = dirRandom(), r = Math.cbrt(Math.random()) * 90 * LY;
      outer.stars.push({ x: d[0] * r, y: d[1] * r, z: d[2] * r, c: pick(["255, 255, 255", "190, 210, 255", "255, 220, 180", "255, 190, 150"]) });
    }
    [["알파 센타우리", 4.37], ["바너드별", 5.96], ["시리우스", 8.6], ["프로키온", 11.5], ["베가", 25], ["아크투루스", 36.7]].forEach(([name, ly]) => {
      const d = dirRandom(), r = ly * LY;
      outer.namedStars.push({ name, ly, x: d[0] * r, y: d[1] * r, z: d[2] * r * 0.4 });
    });

    // 우리 은하: 나선팔 4개와 가운데 팽대부. 태양은 중심에서 2만 6천 광년 떨어져 있다
    const e1 = [Math.cos(0.6), Math.sin(0.6), 0];
    const e2 = [-Math.sin(0.6) * 0.5, Math.cos(0.6) * 0.5, 0.866];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const gc = [e1[0] * 26000 * LY, e1[1] * 26000 * LY, 0];
    outer.gc = { x: gc[0], y: gc[1], z: gc[2] };
    const put = (r, a, h, c, s) => {
      outer.galaxy.push({
        x: gc[0] + (Math.cos(a) * e1[0] + Math.sin(a) * e2[0]) * r * LY + n[0] * h * LY,
        y: gc[1] + (Math.cos(a) * e1[1] + Math.sin(a) * e2[1]) * r * LY + n[1] * h * LY,
        z: gc[2] + (Math.cos(a) * e1[2] + Math.sin(a) * e2[2]) * r * LY + n[2] * h * LY,
        c, s
      });
    };
    for (let i = 0; i < 5200; i++) {
      const r = 2500 + Math.pow(Math.random(), 0.7) * 50000;
      const a = (i % 4) * Math.PI / 2 + Math.log(r / 2500) * 2.6 + rand(-0.28, 0.28);
      const blue = Math.random() < 0.45;
      put(r, a, rand(-1, 1) * rand(0, 700), blue ? "170, 200, 255" : "255, 235, 210", Math.random() < 0.08 ? 2 : 1);
    }
    for (let i = 0; i < 1300; i++) {
      const r = Math.abs(rand(-1, 1) + rand(-1, 1)) * 3500;
      put(r, rand(0, Math.PI * 2), rand(-1, 1) * rand(0, 2200) * (1 - r / 9000), "255, 215, 150", 1);
    }

    // 은하들: 뭉쳐서 은하단을 이루며 우주 끝까지 퍼져 있다
    const clusters = [];
    for (let i = 0; i < 150; i++) {
      const d = dirRandom(), r = Math.cbrt(Math.random()) * HORIZON * 0.98;
      clusters.push([d[0] * r, d[1] * r, d[2] * r]);
    }
    for (let i = 0; i < 2600; i++) {
      const c = pick(clusters), d = dirRandom(), r = Math.random() * HORIZON * 0.035;
      const x = c[0] + d[0] * r, y = c[1] + d[1] * r, z = c[2] + d[2] * r;
      if (Math.hypot(x, y, z) < HORIZON) outer.cosmic.push({ x, y, z, c: pick(["255, 240, 220", "200, 215, 255", "255, 210, 170"]) });
    }
    [["마젤란 은하", 1.6e5, 0], ["안드로메다 은하", 2.5e6, 1], ["삼각형자리 은하", 2.7e6, 2], ["처녀자리 은하단", 5.4e7, 3]].forEach(([name, ly, sprite]) => {
      const d = dirRandom(), r = ly * LY;
      outer.namedGalaxies.push({ name, ly, sprite, x: d[0] * r, y: d[1] * r, z: d[2] * r * 0.5 });
    });
  }


  // ===== 시작 =====
  function start() {
    prepareTextures();
    buildOuter();
    bodies = [];
    dust = [];
    bh = null;
    years = 0;
    aim = null;
    drag = null;
    astro = null;
    sunGone = false;
    sunNoticeShown = false;
    goneTimer = 0;
    noticed = {};
    rocks = [];
    rocksFor = null;

    bodies.push({ name: "태양", kind: "sun", m: 1, R: SUN_R, hit: 0.15, x: 0, y: 0, vx: 0, vy: 0, px: 22, trail: [] });

    // 행성은 원 궤도 속도 v = √(GM / a)로 출발 (위치는 무작위)
    PLANET_DATA.forEach(p => {
      const ang = rand(0, Math.PI * 2);
      const v = Math.sqrt(GM / p.a);
      bodies.push({
        ...p, kind: "planet", trail: [],
        x: Math.cos(ang) * p.a, y: Math.sin(ang) * p.a,
        vx: -Math.sin(ang) * v, vy: Math.cos(ang) * v
      });
    });

    // 화성과 목성 사이 소행성대
    for (let i = 0; i < 150; i++) {
      const a = rand(2.2, 3.3), ang = rand(0, Math.PI * 2), v = Math.sqrt(GM / a);
      dust.push({ x: Math.cos(ang) * a, y: Math.sin(ang) * a, vx: -Math.sin(ang) * v, vy: Math.cos(ang) * v, size: rand(1, 2), color: "#9b948a" });
    }

    // 카메라: 태양을 중심으로, 목성 궤도까지 보이는 거리에서 비스듬히 내려다본다
    Object.assign(camera, { yaw: -Math.PI / 2, pitch: 0.42, dist: 14, distTarget: 14, focus: bodies[0], fx: 0, fy: 0, fz: 0, ox: 0, oy: 0 });
    updateCameraBasis();

    eatenTotals[2] = 0;
    eatenDirty = true;
    logBox.innerHTML = "";
    setupUI();
    renderPanel();
    panel.classList.remove("hidden");
    logBox.classList.remove("hidden");
    active = true;
    addLog("블랙홀의 질량을 고르고, 화면을 끌어서 던져 보세요.");
    addLog("휠로 확대·축소, 방향키로 시점 회전. 천체를 누르면 그 천체를 따라가요.");
    addLog("지구는 이미 블랙홀에 삼켜져 궤도가 비어 있어요.", true);
  }

  function stop() {
    active = false;
    aim = null;
    drag = null;
    astro = null;
    for (const k in keys) delete keys[k];
    panel.classList.add("hidden");
    logBox.classList.add("hidden");
  }


  // ===== 중력 계산 =====
  // (x, y) 위치에서 무거운 천체들이 당기는 가속도의 합
  function accel(x, y, self) {
    let ax = 0, ay = 0;
    for (const b of bodies) {
      if (b === self || b.gone) continue;
      const dx = b.x - x, dy = b.y - y;
      const d2 = dx * dx + dy * dy + SOFT * SOFT;
      const f = GM * b.m / (d2 * Math.sqrt(d2));   // a = GM / r² 를 방향 성분으로 나눈 것
      ax += dx * f;
      ay += dy * f;
    }
    return [ax, ay];
  }

  // 짧은 시간 dt(년)만큼 진행 (속도를 먼저 바꾸고 위치를 옮기는 방식)
  function step(dt) {
    for (const b of bodies) {
      if (b.gone || b.carrier) continue;
      const a = accel(b.x, b.y, b);
      b.vx += a[0] * dt;
      b.vy += a[1] * dt;
    }
    for (const b of bodies) {
      if (b.gone) continue;
      if (b.carrier) { b.x = b.carrier.x; b.y = b.carrier.y; continue; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i];
      const a = accel(p.x, p.y, null);
      p.vx += a[0] * dt;
      p.vy += a[1] * dt;
      if (bh && !bh.gone && !bh.carrier) {
        const dx = p.x - bh.x, dy = p.y - bh.y;
        const d = Math.hypot(dx, dy);
        // 블랙홀 가까이에 모인 파편은 서로 부딪히며 속도를 잃고 소용돌이치며 떨어진다 (강착 원반)
        if (d < 0.6) {
          const k = 1 - 0.8 * dt;
          p.vx = bh.vx + (p.vx - bh.vx) * k;
          p.vy = bh.vy + (p.vy - bh.vy) * k;
        }
        if (d < eatRadius()) { dust.splice(i, 1); continue; }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.hypot(p.x - bodies[0].x, p.y - bodies[0].y) > 400) dust.splice(i, 1);
    }

    // 블랙홀과 태양이 아주 가까우면 조석 마찰로 서서히 가까워진다 (서로 영원히 돌기만 하지 않게)
    const sun = bodies[0];
    if (bh && !bh.gone && !bh.carrier && !sun.gone) {
      const d = Math.hypot(sun.x - bh.x, sun.y - bh.y);
      if (d < 0.5) {
        const k = 1 - 0.5 * dt;
        const cx = (sun.vx * sun.m + bh.vx * bh.m) / (sun.m + bh.m);
        const cy = (sun.vy * sun.m + bh.vy * bh.m) / (sun.m + bh.m);
        sun.vx = cx + (sun.vx - cx) * k; sun.vy = cy + (sun.vy - cy) * k;
        bh.vx = cx + (bh.vx - cx) * k;   bh.vy = cy + (bh.vy - cy) * k;
      }
    }

    checkEvents();
  }

  function eatRadius() {
    return 0.01 * Math.cbrt(bh.m) + 0.003;
  }


  // ===== 사건 판정: 삼킴, 조석 파괴, 튕겨 나감 =====
  function checkEvents() {
    if (!bh || bh.gone || bh.carrier) return;
    const eatR = eatRadius();

    for (const b of bodies) {
      if (b === bh || b.gone) continue;
      const d = Math.hypot(b.x - bh.x, b.y - bh.y);
      // 부딪힘 거리: 천체마다 정한 값 + 블랙홀이 무거울수록 조금 더
      const touch = d < b.hit + 0.02 * Math.cbrt(bh.m);

      if (bh.m < b.m * 0.05) {
        // 블랙홀이 천체보다 훨씬 가벼우면 찢지 못하고 천체 속으로 들어가 버린다
        if (touch || d < b.R * TIDE_BOOST + eatR) {
          bh.carrier = b;
          addLog(`🕳️ 블랙홀이 ${b.name} 속으로 가라앉았습니다. 너무 가벼워서 ${josa(b.name, "을", "를")} 한 번에 찢지 못하고, 아주 오랜 시간에 걸쳐 안쪽부터 먹어 들어갑니다.`, true);
          if (b.kind === "sun") sunGone = true;
          thump(1.2);
          shake(6);
        }
        continue;
      }

      // 조석 파괴 거리: 천체 반지름 × (블랙홀 질량 / 천체 질량)^(1/3)
      const tidal = b.R * Math.cbrt(bh.m / b.m) * TIDE_BOOST;
      if ((d < tidal && tidal > eatR) || touch) disrupt(b);
      else if (d < eatR) swallow(b);
    }

    // 태양의 중력에서 벗어날 만큼 빨라진 행성은 태양계 밖으로 튕겨 나간다
    const sun = bodies[0];
    for (const b of bodies) {
      if (b.kind !== "planet" || b.gone || b.ejected || sun.gone) continue;
      const rx = b.x - sun.x, ry = b.y - sun.y;
      const r = Math.hypot(rx, ry);
      const v2 = Math.pow(b.vx - sun.vx, 2) + Math.pow(b.vy - sun.vy, 2);
      if (r > 40 && v2 / 2 - GM / r > 0) {
        b.ejected = true;
        addLog(`🚀 ${josa(b.name, "이", "가")} 태양계 밖으로 튕겨 나가고 있습니다.`);
      }
    }
  }

  function swallow(b) {
    b.gone = true;
    bh.m += b.m;
    eatenTotals[2] += 1;
    eatenDirty = true;
    hole.flash = 1;
    const h = holeScreen();
    addRing(h, 0.8);
    addDebris(h, 14);
    thump();
    shake(5);
    addLog(`🕳️ ${josa(b.name, "이", "가")} 블랙홀에 삼켜졌습니다.`);
    if (b.kind === "sun") sunGone = true;
  }

  // 조석 파괴: 블랙홀 쪽과 반대쪽에 걸리는 중력 차이로 천체가 길게 찢어진다
  function disrupt(b) {
    b.gone = true;
    bh.m += b.m;   // 파편 대부분은 결국 블랙홀 주변에 모이므로 질량을 블랙홀에 더한다
    eatenTotals[2] += 1;
    eatenDirty = true;

    const n = b.kind === "sun" ? 450 : 70;
    const dx = b.x - bh.x, dy = b.y - bh.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;   // 블랙홀 → 천체 방향
    const vrel = Math.hypot(b.vx - bh.vx, b.vy - bh.vy) || 1;
    for (let i = 0; i < n; i++) {
      const s = rand(-1, 1);          // 블랙홀 쪽(-) ~ 반대쪽(+)
      const spread = s * vrel * 0.35;
      dust.push({
        x: b.x + ux * s * d * 0.3 + rand(-0.002, 0.002),
        y: b.y + uy * s * d * 0.3 + rand(-0.002, 0.002),
        vx: b.vx + ux * spread + rand(-0.2, 0.2),
        vy: b.vy + uy * spread + rand(-0.2, 0.2),
        size: rand(1, 2.2),
        color: b.kind === "sun" ? `hsl(${rand(25, 50)}, 100%, ${rand(60, 85)}%)` : b.color,
        glow: true
      });
    }

    hole.flash = 1;
    const h = holeScreen();
    addRing(h, b.kind === "sun" ? 2.2 : 1);
    thump(b.kind === "sun" ? 2 : 1.2);
    shake(b.kind === "sun" ? 16 : 7);
    if (b.kind === "sun") {
      sunGone = true;
      addLog("☀️ 태양이 블랙홀의 조석력에 길게 찢어졌습니다! 실제 우주에서도 관측되는 '조석 파괴 현상'이에요.", true);
    } else {
      addLog(`💥 ${josa(b.name, "이", "가")} 조석력에 부서졌습니다.`);
    }
  }


  // ===== 블랙홀 던지기 =====
  // 끌어당긴 방향과 길이 → 출발 속도 (AU/년). 지구의 공전 속도가 약 6.3 AU/년
  function aimVelocity(a) {
    const p1 = screenToPlane(a.x1, a.y1);
    if (!p1) return { vx: 0, vy: 0 };
    const dx = p1.x - a.p0.x, dy = p1.y - a.p0.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return { vx: 0, vy: 0 };
    const ref = camera.dist * 0.45;   // 화면에서 이만큼 끌면 최고 속도
    const speed = Math.min(len, ref) / ref * 20;
    return { vx: dx / len * speed, vy: dy / len * speed };
  }

  function launch(a) {
    const v = aimVelocity(a);
    const M = MASSES[massIndex];
    bh = { name: "블랙홀", kind: "bh", m: M.m, R: 0, x: a.p0.x, y: a.p0.y, vx: v.vx, vy: v.vy, px: 8, trail: [] };
    bodies.push(bh);
    renderPanel();
    addLog(`🕳️ ${M.text} 질량의 블랙홀을 던졌습니다.`);
    addLog("방향키나 끌기로 시점을 돌리고, 행성을 눌러 가까이 다가가 보세요.");
    hintEl.textContent = "⌨️ 방향키·끌기: 시점 회전 · 휠: 확대/축소 · 천체 클릭: 따라가기";
  }

  // 지금 조준대로 던졌을 때 예상 경로 (현재 천체 위치가 그대로라고 가정)
  function predictPath(a) {
    const v = aimVelocity(a);
    let x = a.p0.x, y = a.p0.y, vx = v.vx, vy = v.vy;
    const pts = [];
    for (let i = 0; i < 400; i++) {
      for (let k = 0; k < 4; k++) {
        const acc = accel(x, y, null);
        vx += acc[0] * 0.002;
        vy += acc[1] * 0.002;
        x += vx * 0.002;
        y += vy * 0.002;
      }
      if (i % 4 === 0) {
        const s = project(x, y, 0);
        if (s.z > 0) pts.push(s);
      }
      if (Math.hypot(x - bodies[0].x, y - bodies[0].y) > 60) break;
    }
    return pts;
  }

  // 누른 자리 근처의 천체를 골라 그 천체를 따라간다
  function pickFocus(sx, sy) {
    let best = null, bestD = 1e9;
    for (const b of focusList()) {
      const s = project(b.x, b.y, 0);
      if (s.z <= 0) continue;
      const r = b.kind === "bh" ? holeScreenR(b.m, s.z) : bodyScreenR(b, s.z);
      const d = Math.hypot(s.x - sx, s.y - sy) - r;
      if (d < 22 && d < bestD) { best = b; bestD = d; }
    }
    if (!best) return;
    setFocus(best);
    if (!noticed.focus) {
      noticed.focus = true;
      addLog(`${josa(best.name, "을", "를")} 따라갑니다. 휠로 확대하면 가까이 다가가요.`);
    }
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (!active || state.mode !== "play" || astro) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 지원하지 않는 환경은 무시 */ }
    // 블랙홀을 던지기 전: 끌면 조준. 던진 뒤: 끌면 시점 회전
    if (!bh && !state.paused) {
      const p0 = screenToPlane(e.clientX, e.clientY);
      if (p0) {
        aim = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, p0 };
        return;
      }
    }
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  canvas.addEventListener("pointermove", function (e) {
    if (aim) {
      aim.x1 = e.clientX;
      aim.y1 = e.clientY;
    } else if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      camera.yaw -= dx * 0.005;
      camera.pitch = clamp(camera.pitch + dy * 0.005, 0.05, 1.5);
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  canvas.addEventListener("pointerup", function (e) {
    if (aim) {
      // 조금만 움직였으면 던지기가 아니라 '누르기'로 본다
      if (Math.hypot(aim.x1 - aim.x0, aim.y1 - aim.y0) >= 8) launch(aim);
      else pickFocus(aim.x0, aim.y0);
      aim = null;
    } else if (drag) {
      if (drag.moved < 6) pickFocus(e.clientX, e.clientY);
      drag = null;
    }
  });

  // 방향키 등 눌려 있는 키 기억하기
  const CONTROL_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"];
  window.addEventListener("keydown", function (e) {
    if (!active || state.mode !== "play" || !CONTROL_KEYS.includes(e.code)) return;
    if (document.activeElement && document.activeElement.tagName === "INPUT") return;
    keys[e.code] = true;
    e.preventDefault();   // 방향키로 페이지가 스크롤되지 않게
  });
  window.addEventListener("keyup", function (e) {
    delete keys[e.code];
  });


  // ===== 우주인 모드 =====
  // 우주인이 되어 블랙홀 근처를 떠다닌다. 블랙홀이 살짝 끌어당기지만 안전 거리 안으로는 들어가지 않는다
  const ASTRO_MIN = 0.32, ASTRO_MAX = 5;   // 블랙홀과의 최소·최대 거리 (AU)

  function enterAstro() {
    if (!bh) return;
    // 지금 카메라가 있는 쪽으로 블랙홀에서 1.4 AU 떨어진 곳에서 시작
    const b = bhPos();
    let dx = camera.C.x - b.x, dy = camera.C.y - b.y;
    const l = Math.hypot(dx, dy) || 1;
    astro = { x: dx / l * 1.4, y: dy / l * 1.4, z: 0.03, vx: 0, vy: 0, vz: 0, pull: 0 };
    aim = null;
    drag = null;
    renderPanel();
    addLog("🧑‍🚀 우주인이 되었습니다. 방향키로 움직여 보세요. 블랙홀이 조금씩 끌어당겨요.", true);
    hintEl.textContent = "⌨️ ↑ 블랙홀 쪽으로 · ↓ 멀어지기 · ← → 옆으로";
  }

  function exitAstro() {
    astro = null;
    setFocus(bh || bodies[0]);
    camera.distTarget = 3;
    renderPanel();
    hintEl.textContent = "⌨️ 방향키·끌기: 시점 회전 · 휠: 확대/축소 · 천체 클릭: 따라가기";
  }

  function updateAstro(dt) {
    const r = Math.hypot(astro.x, astro.y, astro.z) || 1;
    const ux = astro.x / r, uy = astro.y / r, uz = astro.z / r;   // 블랙홀 → 우주인 방향

    // 블랙홀의 끌어당김: 가까울수록 강해지지만 제트팩(0.3)보다는 약하게 제한한다
    const pull = Math.min(0.2, 0.07 * Math.cbrt(bh.m) / (r * r + 0.03));
    astro.pull = pull;
    let ax = -ux * pull, ay = -uy * pull, az = -uz * pull;

    // 제트팩: ↑ 블랙홀 쪽, ↓ 반대쪽, ← → 옆으로
    const T = 0.3;
    const sx = -uy, sy = ux;   // 옆 방향
    if (keys.ArrowUp || keys.KeyW) { ax -= ux * T; ay -= uy * T; }
    if (keys.ArrowDown || keys.KeyS) { ax += ux * T; ay += uy * T; }
    if (keys.ArrowLeft || keys.KeyA) { ax += sx * T; ay += sy * T; }
    if (keys.ArrowRight || keys.KeyD) { ax -= sx * T; ay -= sy * T; }
    astro.thrust = !!(keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight || keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD);

    astro.vx += ax * dt;
    astro.vy += ay * dt;
    astro.vz += az * dt;
    const damp = 1 - Math.min(1, dt * 0.9);   // 우주복의 자세 제어 장치가 속도를 조금씩 줄여 준다
    astro.vx *= damp; astro.vy *= damp; astro.vz *= damp;
    astro.x += astro.vx * dt;
    astro.y += astro.vy * dt;
    astro.z += astro.vz * dt;

    // 안전 거리: 더 가까이는 못 간다 (안쪽으로 향하는 속도를 없앤다)
    const r2 = Math.hypot(astro.x, astro.y, astro.z) || 1;
    const limit = r2 < ASTRO_MIN ? ASTRO_MIN : r2 > ASTRO_MAX ? ASTRO_MAX : 0;
    if (limit) {
      const k = limit / r2;
      astro.x *= k; astro.y *= k; astro.z *= k;
      const nx = astro.x / limit, ny = astro.y / limit, nz = astro.z / limit;
      const vr = astro.vx * nx + astro.vy * ny + astro.vz * nz;
      if ((limit === ASTRO_MIN && vr < 0) || (limit === ASTRO_MAX && vr > 0)) {
        astro.vx -= nx * vr; astro.vy -= ny * vr; astro.vz -= nz * vr;
      }
      if (limit === ASTRO_MIN && !noticed.safe) {
        noticed.safe = true;
        addLog("여기가 안전 거리의 끝이에요. 더 가까이 가면 돌아올 수 없어요.", true);
      }
    }
  }


  // ===== 매 프레임 =====
  function update(dt, simDt) {
    if (!active) return;
    // 1초에 흐르는 년 × 지난 시간 → 잘게 나눠서 계산 (가까이 지나갈 때 정확하게)
    const simYears = SPEEDS[speedIndex] * simDt;
    const n = Math.min(150, Math.ceil(simYears / 0.0015));
    for (let i = 0; i < n; i++) step(simYears / n);
    years += simYears;

    const sun = bodies[0];

    // 눈에 띄는 변화 알려주기
    if (bh && !bh.gone) {
      if (!sun.gone && !noticed.drag && Math.hypot(sun.x, sun.y) > 1.5) {
        noticed.drag = true;
        addLog("☀️ 블랙홀의 중력에 태양이 끌려가기 시작했습니다. 행성들도 태양을 따라 함께 움직여요.", true);
      }
      if (!noticed.leave && !bh.carrier && Math.hypot(bh.x - sun.x, bh.y - sun.y) > 45 && years > 1) {
        noticed.leave = true;
        addLog("🕳️ 블랙홀이 태양계를 지나쳐 멀어지고 있습니다. 「↺ 처음부터」로 다시 던져 볼 수 있어요.");
      }
    }

    // 궤적 기록
    for (const b of bodies) {
      if (b.gone) continue;
      const last = b.trail[b.trail.length - 1];
      if (!last || Math.hypot(last.x - b.x, last.y - b.y) > 0.02 * Math.max(1, Math.hypot(b.x, b.y) * 0.2)) {
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 90) b.trail.shift();
      }
    }

    if (sunGone) {
      goneTimer += dt;
      if (goneTimer > 4 && !sunNoticeShown) {
        sunNoticeShown = true;
        addLog("태양계의 중심이 사라졌습니다. 「다음 단계 →」를 눌러 계속하세요.", true);
        document.getElementById("simNext").classList.add("pulse");
      }
    }
    document.getElementById("simYear").textContent = years.toFixed(1) + "년";

    // ----- 카메라 -----
    if (astro) {
      updateAstro(dt);
    } else {
      const rot = 1.3 * dt;
      if (keys.ArrowLeft || keys.KeyA) camera.yaw += rot;
      if (keys.ArrowRight || keys.KeyD) camera.yaw -= rot;
      if (keys.ArrowUp || keys.KeyW) camera.pitch = Math.min(1.5, camera.pitch + rot * 0.7);
      if (keys.ArrowDown || keys.KeyS) camera.pitch = Math.max(0.05, camera.pitch - rot * 0.7);
      if (keys.Equal || keys.NumpadAdd) zoomBy(Math.exp(-dt * 1.8));
      if (keys.Minus || keys.NumpadSubtract) zoomBy(Math.exp(dt * 1.8));

      // 따라가던 천체가 사라졌으면 태양(없으면 블랙홀)으로
      if (!camera.focus || camera.focus.gone) setFocus(!sun.gone ? sun : (bh || sun));
      // 카메라는 천체에 정확히 붙어서 움직인다 (빠르게 도는 행성도 놓치지 않게)
      const k = Math.min(1, dt * 4);
      camera.ox *= 1 - k;
      camera.oy *= 1 - k;
      camera.fx = camera.focus.x + camera.ox;
      camera.fy = camera.focus.y + camera.oy;
      camera.dist = Math.exp(lerp(Math.log(camera.dist), Math.log(camera.distTarget), Math.min(1, dt * 5)));
      zoomNotices();
    }
  }

  // 멀어질수록 크기를 실감할 수 있는 한마디
  function zoomNotices() {
    const L = Math.log10(camera.dist);
    const say = (key, text) => { if (!noticed[key]) { noticed[key] = true; addLog(text, true); } };
    if (L > 2.7) say("z1", "태양계 바깥이에요. 얼음 조각들이 모인 오르트 구름이 태양계를 둥글게 감싸고 있어요.");
    if (L > 5.2) say("z2", "가장 가까운 별 알파 센타우리까지 4.4광년. 빛의 속도로도 4년 넘게 걸려요.");
    if (L > 8.6) say("z3", "우리 은하예요. 별이 약 2천억 개, 지름은 약 10만 광년. 태양계는 중심에서 2만 6천 광년 떨어진 변두리에 있어요.");
    if (L > 11.8) say("z4", "이제 은하 하나하나가 점으로 보여요. 은하들은 뭉쳐서 은하단을 이루고 있어요.");
    if (L > 15.3) say("z5", "관측 가능한 우주의 끝, 우주의 지평선이에요. 반지름 약 465억 광년. 이 너머의 빛은 아직 우리에게 닿지 못했어요.");
    if (L < -0.6 && camera.focus && camera.focus.kind === "planet") say("zp", `${camera.focus.name}에 가까이 다가왔어요. 방향키로 둘레를 돌아 보세요.`);
  }


  // 행성: 태양 쪽은 밝고 반대쪽은 어둡게, 표면 무늬, 토성은 고리
  // back: 0이면 정면에서 빛을 받고, 1에 가까울수록 역광 (태양이 행성 너머에 있어 가장자리만 빛남)
  function paintPlanet(b, x, y, r, light, back = 0) {
    const lx = light.x, ly = light.y;   // 태양 쪽 방향 (단위 벡터)

    // 토성의 고리: 얇고 반투명한 고리 여러 겹 (밝기가 조금씩 달라 틈이 있는 것처럼 보인다)
    const RING_ALPHA = [0.25, 0.5, 0.7, 0.55, 0.75, 0.15, 0.6, 0.45, 0.3];
    const ring = (front) => {
      if (!b.ring || r < 2) return;
      const from = front ? 0 : Math.PI, to = front ? Math.PI : Math.PI * 2;
      if (r < 14) {
        ctx.strokeStyle = "rgba(225, 205, 160, 0.7)";
        ctx.lineWidth = Math.max(1, r * 0.3);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 2, r * 2 * 0.32, -0.2, from, to);
        ctx.stroke();
        return;
      }
      ctx.lineWidth = r * 0.1;
      RING_ALPHA.forEach((a, i) => {
        const rr = r * (1.4 + i * 0.105);
        ctx.strokeStyle = `rgba(${225 - i * 4}, ${205 - i * 5}, ${165 - i * 6}, ${a})`;
        ctx.beginPath();
        ctx.ellipse(x, y, rr, rr * 0.32, -0.2, from, to);
        ctx.stroke();
      });
    };
    ring(false);

    const g = ctx.createRadialGradient(x + lx * r * 0.45, y + ly * r * 0.45, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, b.color);
    g.addColorStop(1, b.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // 충분히 크게 보이면 미리 만든 표면 무늬를 구에 입힌다
    const tex = textures[b.name];
    if (tex && r >= 5) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      // 세로 띠로 잘라 붙인다. 가장자리로 갈수록 경도가 빨리 바뀌어 둥글게 보인다
      const w = r > 120 ? 3 : r > 40 ? 2 : 1;
      const spin = years * 0.15 + b.a;   // 자전
      for (let sx = -r; sx < r; sx += w) {
        const ang = Math.asin(clamp((sx + w / 2) / r, -1, 1));
        let u = (ang / (Math.PI * 2) + spin) % 1;
        if (u < 0) u += 1;
        ctx.drawImage(tex, Math.floor(u * TEX_W), 0, 1, TEX_H, x + sx, y - r, w + 0.5, r * 2);
      }
      // 가장자리가 어두워지는 효과
      const limb = ctx.createRadialGradient(x, y, r * 0.55, x, y, r);
      limb.addColorStop(0, "rgba(0, 0, 10, 0)");
      limb.addColorStop(1, "rgba(0, 0, 10, 0.5)");
      ctx.fillStyle = limb;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }

    // 밤 쪽 그림자: 빛 받는 쪽에 중심을 둔 둥근 그림자. 역광일수록 밝은 부분이 가장자리로 밀려 초승달 모양이 된다
    if (r > 1.5) {
      const m = lerp(0.35, 1.02, back);
      const sx = x + lx * r * m, sy = y + ly * r * m;
      const shade = ctx.createRadialGradient(sx, sy, r * lerp(0.75, 0.2, back), sx, sy, r * lerp(1.9, 1.2, back));
      shade.addColorStop(0, "rgba(0, 0, 8, 0)");
      shade.addColorStop(1, "rgba(0, 0, 8, 0.94)");
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 빛 받는 쪽 가장자리의 밝은 테두리 (대기가 빛을 산란하는 느낌)
    if (r > 8) {
      const a = Math.atan2(ly, lx);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = Math.max(1, r * 0.022);
      ctx.strokeStyle = `rgba(255, 228, 195, ${0.35 + back * 0.4})`;
      ctx.shadowColor = "rgba(255, 200, 140, 0.9)";
      ctx.shadowBlur = Math.min(24, r * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, r - ctx.lineWidth / 2, a - 1.15, a + 1.15);
      ctx.stroke();
      ctx.restore();
    }
    ring(true);
  }

  // 태양: 여러 겹의 빛 번짐 + 알갱이 무늬가 있는 표면. 아주 작게 보여도 빛은 보이게
  function paintSun(x, y, r) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // 넓고 은은한 빛부터 좁고 강한 빛까지 겹쳐서 눈부신 느낌을 낸다
    [[9, 0.12, "255, 150, 60"], [4, 0.28, "255, 190, 100"], [2, 0.6, "255, 235, 190"], [1.35, 0.8, "255, 250, 230"]].forEach(([k, a, rgb]) => {
      const R = Math.max(r * k, 6 * k);
      const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, R);
      g.addColorStop(0, `rgba(${rgb}, ${a})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.fill();
    });
    // 가로로 길게 번지는 빛줄기
    if (r > 5) {
      const len = r * 6;
      const streak = ctx.createLinearGradient(x - len, y, x + len, y);
      streak.addColorStop(0, "rgba(255, 220, 170, 0)");
      streak.addColorStop(0.5, "rgba(255, 235, 200, 0.35)");
      streak.addColorStop(1, "rgba(255, 220, 170, 0)");
      ctx.fillStyle = streak;
      ctx.fillRect(x - len, y - Math.max(1, r * 0.04), len * 2, Math.max(2, r * 0.08));
    }
    ctx.restore();

    const rr = Math.max(r, 1.5);
    const body = ctx.createRadialGradient(x, y, 0, x, y, rr);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(0.55, "#fff6cf");
    body.addColorStop(1, "#ffc45e");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();

    // 표면의 알갱이 무늬 (크게 보일 때만)
    if (r > 8 && textures.sun) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = 0.28;
      ctx.translate(x, y);
      ctx.rotate(years * 0.2);
      ctx.drawImage(textures.sun, -rr, -rr, rr * 2, rr * 2);
      ctx.restore();
      // 가운데는 하얗게 타오르고 가장자리는 주황빛
      const core = ctx.createRadialGradient(x, y, 0, x, y, rr);
      core.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      core.addColorStop(0.55, "rgba(255, 250, 225, 0.35)");
      core.addColorStop(1, "rgba(255, 160, 50, 0.25)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }


  // ===== 그리기 =====
  function label(text, x, y, alpha, align) {
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = align || "center";
    ctx.fillText(text, x, y);
  }

  // 우주 배경 그림: 시점을 돌리면 배경도 함께 돌아가는 것처럼 옆으로 민다
  function drawBackdrop(L) {
    if (!spaceBg) return;
    const heading = Math.atan2(camera.f.y, camera.f.x);
    // 배경 그림은 왼쪽 끝과 오른쪽 끝이 이어지게 만들어져 있어서 옆으로 나란히 붙이면 된다
    const ox = ((heading / (Math.PI * 2) * width * 2) % width + width) % width;
    const oy = clamp(-camera.f.z * height * 0.15, -0.12 * height, 0.12 * height) - 0.12 * height;
    ctx.globalAlpha = lerp(1, 0.3, smooth(6.5, 9.5, L));   // 은하가 보일 만큼 멀어지면 배경은 흐리게
    ctx.drawImage(spaceBg, -ox, oy, width, height * 1.24);
    ctx.drawImage(spaceBg, width - ox, oy, width, height * 1.24);
    ctx.globalAlpha = 1;
  }

  // 점 여러 개를 한꺼번에 그린다 (화면 밖과 카메라 뒤는 건너뜀)
  function drawPoints(list, alpha, size, rgb) {
    if (alpha < 0.02) return;
    for (const p of list) {
      const s = project(p.x, p.y, p.z);
      if (s.z <= 0 || s.x < 0 || s.x > width || s.y < 0 || s.y > height) continue;
      ctx.fillStyle = `rgba(${p.c || rgb}, ${alpha})`;
      const w = size * (p.s || 1);
      ctx.fillRect(s.x, s.y, w, w);
    }
  }

  // 태양계 바깥의 풍경. 카메라 거리(로그)에 따라 서서히 나타났다 사라진다
  function drawOuter(L) {
    const o = outer;
    const band = (inA, inB, outA, outB) => smooth(inA, inB, L) * (1 - smooth(outA, outB, L));

    drawPoints(o.kuiper, band(1.2, 1.8, 3.4, 4.2) * 0.6, 1.2, "190, 215, 235");
    const oortA = band(2.6, 3.4, 5.6, 6.3);
    drawPoints(o.oort, oortA * 0.55, 1.2, "170, 200, 235");
    if (oortA > 0.3) {
      const s = project(bodies[0].x, bodies[0].y, 0);
      if (s.z > 0) label("오르트 구름", s.x, s.y - camera.F * 3e4 / s.z - 8, oortA * 0.7);
    }

    const starA = band(4.4, 5.3, 8.4, 9.2);
    drawPoints(o.stars, starA * 0.9, 1.6, "255, 255, 255");
    if (starA > 0.05) {
      for (const st of o.namedStars) {
        const s = project(st.x, st.y, st.z);
        if (s.z <= 0) continue;
        ctx.fillStyle = `rgba(255, 245, 225, ${starA})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        label(`${st.name} · ${st.ly}광년`, s.x, s.y - 8, starA * 0.8);
      }
    }

    // 우리 은하
    const galA = band(6.9, 7.9, 12, 12.8);
    if (galA > 0.02) {
      ctx.globalCompositeOperation = "lighter";
      const c = project(o.gc.x, o.gc.y, o.gc.z);
      if (c.z > 0) {
        const r = Math.max(4, camera.F * 6000 * LY / c.z);
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, `rgba(255, 235, 190, ${0.75 * galA})`);
        g.addColorStop(1, "rgba(255, 190, 110, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      drawPoints(o.galaxy, galA * 0.75, 1.3, "255, 255, 255");
      ctx.globalCompositeOperation = "source-over";
      if (c.z > 0 && galA > 0.4) label("은하 중심 (궁수자리 A*)", c.x, c.y - 22, galA * 0.8);
    }

    // 은하들
    const cosA = smooth(10.6, 11.6, L);
    if (cosA > 0.02) {
      drawPoints(o.cosmic, cosA * 0.85, 1.5, "255, 255, 255");
      for (const gx of o.namedGalaxies) {
        const s = project(gx.x, gx.y, gx.z);
        if (s.z <= 0) continue;
        const a = cosA * (1 - smooth(13.2, 14, L));
        if (a < 0.05) continue;
        const sz = clamp(camera.F * gx.ly * 0.05 * LY / s.z, 7, 26);
        ctx.globalAlpha = a;
        ctx.drawImage(galaxySprites[gx.sprite], s.x - sz, s.y - sz, sz * 2, sz * 2);
        ctx.globalAlpha = 1;
        label(gx.name, s.x, s.y + sz + 12, a * 0.8);
      }
    }

    // 관측 가능한 우주의 끝
    const horA = smooth(14.4, 15, L);
    if (horA > 0.02) {
      const s = project(0, 0, 0);
      if (s.z > HORIZON) {
        const r = camera.F * HORIZON / Math.sqrt(s.z * s.z - HORIZON * HORIZON);
        const edge = ctx.createRadialGradient(s.x, s.y, r * 0.86, s.x, s.y, r * 1.04);
        edge.addColorStop(0, "rgba(120, 170, 255, 0)");
        edge.addColorStop(0.85, `rgba(140, 185, 255, ${0.22 * horA})`);
        edge.addColorStop(1, "rgba(120, 170, 255, 0)");
        ctx.fillStyle = edge;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 1.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = `rgba(190, 215, 255, ${0.7 * horA})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        label("우주의 지평선 · 관측 가능한 우주의 끝 (반지름 465억 광년)", s.x, Math.max(72, s.y - r + 24), horA);
      }
    }

    // 멀리서 본 우리의 위치
    const hereA = smooth(2.9, 3.6, L);
    if (hereA > 0.05) {
      const s = project(bodies[0].x, bodies[0].y, 0);
      if (s.z > 0) {
        ctx.fillStyle = `rgba(255, 220, 150, ${hereA})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        label(L > 12.5 ? "우리 은하" : L > 7.5 ? "태양계 (우리의 위치)" : "태양계", s.x, s.y + 16, hereA * 0.85);
      }
    }
  }

  // 행성 가까이에 떠다니는 암석 조각 (행성 크기를 기준으로 한 위치)
  function makeRocks(planet) {
    rocksFor = planet;
    rocks = [];
    for (let i = 0; i < 170; i++) {
      const a = rand(0, Math.PI * 2), d = rand(1.8, 11);
      rocks.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, z: rand(-1.6, 1.6), size: rand(0.005, 0.045), squash: rand(0.6, 1), tilt: rand(0, Math.PI) });
    }
  }

  // 태양계: 궤도, 지나온 길, 태양, 행성, 블랙홀, 소행성
  function drawSolar(alpha) {
    if (alpha < 0.02) return;
    const c = camera;
    const sun = bodies[0];
    const near = astro ? 0.03 : c.dist * 0.02;
    ctx.globalAlpha = alpha;

    // 원래 궤도 (참고선). 지구가 있던 궤도는 점선
    if (!sun.gone) {
      const orbit = (a) => {
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= 96; i++) {
          const ang = i / 96 * Math.PI * 2;
          const s = project(sun.x + Math.cos(ang) * a, sun.y + Math.sin(ang) * a, 0);
          if (s.z < near) { pen = false; continue; }
          if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
          pen = true;
        }
        ctx.stroke();
      };
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
      PLANET_DATA.forEach(p => orbit(p.a));
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = "rgba(120, 180, 255, 0.3)";
      orbit(1);
      ctx.setLineDash([]);
    }

    // 지나온 길
    const trail = (b, color) => {
      if (b.trail.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let pen = false;
      for (const t of b.trail.concat([b])) {
        const s = project(t.x, t.y, 0);
        if (s.z < near) { pen = false; continue; }
        if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y);
        pen = true;
      }
      ctx.stroke();
    };
    for (const b of bodies) if (!b.gone && b !== bh) trail(b, "rgba(255, 255, 255, 0.12)");
    if (bh) trail(bh, "rgba(200, 140, 255, 0.5)");

    // 빛이 오는 곳: 태양, 태양이 없으면 블랙홀의 원반
    const lightBody = !sun.gone ? sun : (bh && !bh.gone ? bh : null);
    const lightS = lightBody ? project(lightBody.x, lightBody.y, 0) : { x: centerX, y: centerY, z: 1 };

    // 그릴 것들을 모아서 먼 것부터 그린다
    const list = [];
    const add = (x, y, z, draw) => {
      const s = project(x, y, z);
      if (s.z > near) list.push({ s, draw });
    };

    if (!sun.gone) add(sun.x, sun.y, 0, s => paintSun(s.x, s.y, bodyScreenR(sun, s.z)));

    for (const b of bodies) {
      if (b.kind !== "planet" || b.gone) continue;
      add(b.x, b.y, 0, s => {
        const r = bodyScreenR(b, s.z);
        if (s.x < -r * 3 || s.x > width + r * 3 || s.y < -r * 3 || s.y > height + r * 3) return;
        // 빛 방향: 화면에서 태양이 있는 쪽 / 역광 정도: 태양이 행성 너머에 있을수록 큼
        let lx = lightS.x - s.x, ly = lightS.y - s.y;
        if (lightS.z <= 0) { lx = -lx; ly = -ly; }
        const ll = Math.hypot(lx, ly) || 1;
        let back = 0;
        if (lightBody) {
          const tx = lightBody.x - b.x, ty = lightBody.y - b.y;
          const tl = Math.hypot(tx, ty) || 1;
          back = clamp((tx * c.f.x + ty * c.f.y) / tl * 0.45 + 0.3, 0, 1);
        }
        paintPlanet(b, s.x, s.y, r, { x: lx / ll, y: ly / ll }, back);
        if (r < 70) label(b.name, s.x, s.y + r + 13, b.ejected ? 0.9 : 0.7);
      });
    }

    if (bh && !bh.gone && !bh.carrier) add(bh.x, bh.y, 0, s => drawHole({ x: s.x, y: s.y, r: holeScreenR(bh.m, s.z) }));

    // 소행성(어두운 암석)과 찢어진 파편(빛나는 조각)
    for (const p of dust) {
      add(p.x, p.y, 0, s => {
        if (s.x < 0 || s.x > width || s.y < 0 || s.y > height) return;
        const size = clamp(c.F * 0.012 / s.z, 0.7, 3.5);
        if (p.glow) {
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = p.color;
          ctx.fillRect(s.x, s.y, size * 1.6, size * 1.6);
          ctx.globalCompositeOperation = "source-over";
        } else {
          ctx.fillStyle = "rgba(150, 135, 120, 0.8)";
          ctx.beginPath();
          ctx.arc(s.x, s.y, size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 행성에 가까이 다가갔을 때만 보이는 암석 조각: 어두운 덩어리에 태양 쪽 가장자리만 빛난다
    const fb = c.focus;
    if (!astro && fb && fb.kind === "planet" && !fb.gone && c.dist < visR(fb) * 45) {
      if (rocksFor !== fb) makeRocks(fb);
      const R = visR(fb);
      for (const k of rocks) {
        add(fb.x + k.x * R, fb.y + k.y * R, k.z * R, s => {
          const r = Math.min(26, c.F * k.size * R / s.z);
          if (r < 0.7) return;
          ctx.fillStyle = "#15100c";
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, r, r * k.squash, k.tilt, 0, Math.PI * 2);
          ctx.fill();
          if (r > 2) {
            const a = Math.atan2(lightS.y - s.y, lightS.x - s.x);
            ctx.strokeStyle = "rgba(255, 190, 130, 0.65)";
            ctx.lineWidth = Math.max(0.8, r * 0.12);
            ctx.beginPath();
            ctx.arc(s.x, s.y, r * 0.85, a - 0.9, a + 0.9);
            ctx.stroke();
          }
        });
      }
    }

    list.sort((p, q) => q.s.z - p.s.z);
    for (const it of list) it.draw(it.s);
    ctx.globalAlpha = 1;
  }

  // 우주인: 블랙홀 쪽으로 살짝 늘어나고, 끌려갈수록 화면 가장자리가 어두워진다
  function drawAstro() {
    const b = bhPos();
    const s = project(b.x + astro.x, b.y + astro.y, astro.z);
    const h = project(b.x, b.y, 0);
    const pull = astro.pull / 0.2;   // 0~1
    const ang = Math.atan2(h.y - s.y, h.x - s.x);

    // 블랙홀 쪽으로 빨려 드는 빛줄기
    ctx.strokeStyle = `rgba(255, 210, 170, ${0.1 + pull * 0.35})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      const a = i * 2.399 + state.timer * 0.05;
      const t = (state.timer * (0.25 + pull * 0.9) + i * 0.137) % 1;
      const d0 = Math.max(width, height) * 0.75 * (1 - t), d1 = d0 * (0.93 - pull * 0.08);
      ctx.beginPath();
      ctx.moveTo(h.x + Math.cos(a) * d0, h.y + Math.sin(a) * d0);
      ctx.lineTo(h.x + Math.cos(a) * d1, h.y + Math.sin(a) * d1);
      ctx.stroke();
    }

    // 제트팩 불꽃
    if (astro.thrust) {
      const g = ctx.createRadialGradient(s.x, s.y + 16, 0, s.x, s.y + 16, 22);
      g.addColorStop(0, "rgba(160, 220, 255, 0.8)");
      g.addColorStop(1, "rgba(120, 180, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y + 16, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    // 우주인 (끌려가는 방향으로 살짝 늘어나고 흔들린다)
    ctx.save();
    ctx.translate(s.x + Math.sin(state.timer * 30) * pull * 2, s.y + Math.cos(state.timer * 27) * pull * 2);
    ctx.rotate(ang);
    ctx.scale(1 + pull * 0.35, 1 - pull * 0.15);
    ctx.rotate(-ang + Math.sin(state.timer * 1.3) * 0.12);
    ctx.font = '46px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";   // 컬러 이모지도 fillStyle의 투명도를 따라가므로 불투명하게
    ctx.shadowColor = "rgba(255, 190, 120, 0.8)";
    ctx.shadowBlur = 14;
    ctx.fillText("🧑‍🚀", 0, 0);
    ctx.restore();
    ctx.textBaseline = "alphabetic";

    // 끌려갈수록 화면 가장자리가 붉게 어두워진다
    if (pull > 0.05) {
      const v = ctx.createRadialGradient(centerX, centerY, unit * 0.3, centerX, centerY, Math.hypot(width, height) / 2);
      v.addColorStop(0, "rgba(60, 0, 0, 0)");
      v.addColorStop(1, `rgba(60, 0, 0, ${pull * 0.55})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, width, height);
    }

    // 계기판: 거리와 끌어당기는 힘
    const r = Math.hypot(astro.x, astro.y, astro.z);
    label("🧑‍🚀 우주인 시점", 24, 148, 0.85, "left");
    label(`블랙홀까지 ${r.toFixed(2)} AU (약 ${bigKorean(r * 1.496e8)} km)`, 24, 168, 0.8, "left");
    label("끌어당기는 힘", 24, 188, 0.8, "left");
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(110, 179, 120, 9);
    ctx.fillStyle = pull > 0.7 ? "#ff6a3a" : "#ffb36b";
    ctx.fillRect(110, 179, 120 * pull, 9);
  }

  // 조준 중: 출발점, 방향 화살표, 예상 경로
  function drawAim() {
    if (!aim) return;
    const r = bhScreenRadius(MASSES[massIndex].m);
    ctx.globalAlpha = 0.6;
    drawHole({ x: aim.x0, y: aim.y0, r });
    ctx.globalAlpha = 1;

    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = "rgba(200, 160, 255, 0.8)";
    ctx.beginPath();
    predictPath(aim).forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#ffcf9a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(aim.x0, aim.y0);
    ctx.lineTo(aim.x1, aim.y1);
    ctx.stroke();
    const ang = Math.atan2(aim.y1 - aim.y0, aim.x1 - aim.x0);
    ctx.beginPath();
    ctx.moveTo(aim.x1, aim.y1);
    ctx.lineTo(aim.x1 - Math.cos(ang - 0.4) * 10, aim.y1 - Math.sin(ang - 0.4) * 10);
    ctx.moveTo(aim.x1, aim.y1);
    ctx.lineTo(aim.x1 - Math.cos(ang + 0.4) * 10, aim.y1 - Math.sin(ang + 0.4) * 10);
    ctx.stroke();
    const v = aimVelocity(aim);
    ctx.fillStyle = "#ffcf9a";
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(`속도 ${Math.hypot(v.vx, v.vy).toFixed(1)} AU/년`, aim.x1, aim.y1 - 12);
  }

  // 축척 막대: 지금 화면이 얼마나 넓은지. km → AU → 광년으로 단위가 바뀐다
  function drawScaleBar() {
    const worldLen = 200 * camera.dist / camera.F;   // 화면 200px에 해당하는 실제 길이 (AU)
    const nice = (v) => {
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      const m = v / p;
      return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
    };
    let au, text;
    if (worldLen < 0.02) {
      const km = nice(worldLen * 1.496e8);
      au = km / 1.496e8;
      text = km >= 1e4 ? bigKorean(km) + " km" : Math.round(km).toLocaleString() + " km";
    } else if (worldLen < 2e4) {
      au = nice(worldLen);
      const km = au * 1.496e8;
      text = `${au.toLocaleString()} AU · ${km >= 1e8 ? bigKorean(km) : Math.round(km / 1e4).toLocaleString() + "만"} km`;
    } else {
      const ly = nice(worldLen / LY);
      au = ly * LY;
      text = (ly >= 1e4 ? bigKorean(ly) : ly.toLocaleString()) + " 광년";
    }
    const len = au * camera.F / camera.dist;
    const x = 24, y = 150;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5);
    ctx.stroke();
    label(text, x, y - 9, 0.8, "left");
  }

  function draw() {
    updateCameraBasis();
    const L = astro ? 0 : Math.log10(camera.dist);
    drawBackdrop(L);
    if (!astro) drawOuter(L);
    drawSolar(astro ? 1 : 1 - smooth(2.3, 3.5, L));
    if (astro) drawAstro();
    else {
      drawHoleMarker();
      drawAim();
      drawScaleBar();
    }
  }

  // 블랙홀 이름표: 멀리 축소해서 블랙홀이 점처럼 작아지거나 안 보여도 어디 있는지 알 수 있게 한다
  function drawHoleMarker() {
    if (!bh || bh.gone) return;
    const s = project(bh.x, bh.y, 0);
    if (s.z <= 0) return;
    const r = bh.carrier ? 0 : holeScreenR(bh.m, s.z);
    const ring = Math.max(r * 3.2, 16);   // 원반까지 감싸는 크기, 아무리 멀어도 16px 이상
    // 블랙홀이 화면에서 충분히 크게 보일 때는 이름만, 작을 때는 깜빡이는 고리도 함께
    const small = clamp((40 - r) / 25, 0, 1);
    if (small > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(state.timer * 3);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 170, 90, ${(0.45 + 0.35 * pulse) * small})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -state.timer * 12;
      ctx.beginPath();
      ctx.arc(s.x, s.y, ring + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = '500 13px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 200, 140, 0.95)";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 6;
    ctx.fillText("🕳️ " + settings.name, s.x, s.y - ring - 10);
    ctx.shadowBlur = 0;
  }


  // ===== 조작 패널 =====
  function setupUI() {
    if (uiReady) return;
    uiReady = true;
    const on = (id, fn) => document.getElementById(id).addEventListener("click", fn);

    const massBox = document.getElementById("simMass");
    MASSES.forEach((M, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = M.label;
      btn.addEventListener("click", function () {
        if (bh) return;
        massIndex = i;
        renderPanel();
      });
      massBox.appendChild(btn);
    });

    on("simSlower", () => { speedIndex = Math.max(0, speedIndex - 1); renderPanel(); });
    on("simFaster", () => { speedIndex = Math.min(SPEEDS.length - 1, speedIndex + 1); renderPanel(); });

    // 확대·축소: 버튼, 마우스 휠, +/- 키
    on("simZoomOut", () => zoomBy(2.5));
    on("simZoomIn", () => zoomBy(1 / 2.5));
    canvas.addEventListener("wheel", function (e) {
      if (!active || state.mode !== "play" || astro) return;
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.003));
    }, { passive: false });

    on("simRealSize", function () {
      realSize = !realSize;
      camera.distTarget = Math.max(camera.distTarget, minDist());
      renderPanel();
      if (realSize && !noticed.real) {
        noticed.real = true;
        addLog("실제 크기로 보면 행성은 점보다 작아요. 우주는 대부분 텅 빈 공간이에요.", true);
      }
    });

    // 따라갈 천체 바꾸기
    const cycle = (step) => {
      const list = focusList();
      if (!list.length) return;
      setFocus(list[(list.indexOf(camera.focus) + step + list.length) % list.length]);
    };
    on("simFocusPrev", () => cycle(-1));
    on("simFocusNext", () => cycle(1));

    // 한 번에 이동
    on("simJumpSolar", () => { setFocus(!bodies[0].gone ? bodies[0] : (bh || bodies[0])); camera.distTarget = 14; });
    on("simJumpGalaxy", () => { camera.distTarget = 1.5e5 * LY; });
    on("simJumpUniverse", () => { camera.distTarget = HORIZON * 2.4; });

    on("simAstro", () => { if (astro) exitAstro(); else enterAstro(); });

    on("simReset", function () {
      if (!active) return;
      document.getElementById("simNext").classList.remove("pulse");
      start();
    });
    on("simNext", function () {
      if (!active || !bh) return;
      document.getElementById("simNext").classList.remove("pulse");
      // 지금 블랙홀이 보이는 자리에서 영상 단계로 이어지도록 위치를 넘겨준다
      const h = holeScreenPos();
      hole.x = h.x - centerX;
      hole.y = h.y - centerY;
      hole.r = h.r;
      stop();
      startLevelUp();
    });
  }

  function renderPanel() {
    document.querySelectorAll("#simMass button").forEach((btn, i) => {
      btn.classList.toggle("active", i === massIndex);
      btn.disabled = !!bh && i !== massIndex;
    });
    document.getElementById("simSpeed").textContent = SPEEDS[speedIndex] + "년/초";
    document.getElementById("simRealSize").classList.toggle("active", realSize);
    document.getElementById("simFocusName").textContent = camera.focus ? camera.focus.name : "-";
    const astroBtn = document.getElementById("simAstro");
    astroBtn.disabled = !bh;
    astroBtn.textContent = astro ? "🚪 관찰 시점으로" : "🧑‍🚀 우주인 되기";
    astroBtn.classList.toggle("active", !!astro);
    document.getElementById("simNext").disabled = !bh;
  }

  function addLog(text, important) {
    const p = document.createElement("p");
    p.textContent = text;
    if (important) p.className = "important";
    logBox.prepend(p);
    while (logBox.children.length > 6) logBox.lastChild.remove();
  }


  // ===== 바깥(simulation.js)에서 쓰는 기능 =====
  function holeScreenPos() {
    if (!bh || bh.gone) return { x: centerX, y: centerY, r: bhScreenRadius(MASSES[massIndex].m) };
    const s = project(bh.x, bh.y, 0);
    if (s.z <= 0) return { x: centerX, y: centerY, r: bhScreenRadius(bh.m) };
    return { x: s.x, y: s.y, r: holeScreenR(bh.m, s.z) };
  }

  return {
    start,
    stop,
    update,
    draw,
    holeScreen: holeScreenPos,
    progress: () => (sunGone ? 1 : bh ? 0.5 : 0),
    // 블랙홀의 사건의 지평선 반지름 (m) = 2.95 km × (태양 질량 대비)
    radiusMeters: () => 2953 * (bh ? bh.m : MASSES[massIndex].m)
  };
})();
