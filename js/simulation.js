// ============================================================
//  블랙홀 시뮬레이션
//
//  [조작 단계] 도시 → 지구 → 태양계
//    도시: 사람·자동차·건물·산을 삼키며 지구 표면이 내려다보일 때까지 커진다 (js/citysim.js)
//    지구·태양계: 실제 물리로 계산하는 우주 시뮬레이터 (js/earthsim.js, js/solarsim.js)
//    '우주 관측하기'를 고르면 도시·지구를 건너뛰고 태양계부터 바로 시작한다.
//
//  은하·우주 단계와 엔딩은 다음 업데이트에서 이어진다.
// ============================================================


// ===== 0. 캔버스 =====
const canvas = document.getElementById("sim");
const ctx = canvas.getContext("2d");

let width, height;        // 화면 크기
let centerX, centerY;     // 화면 중심
let unit;                 // 화면의 짧은 쪽 길이 (크기 기준)
let vignette = null;      // 화면 가장자리를 어둡게 하는 그라디언트

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  centerX = width / 2;
  centerY = height / 2;
  unit = Math.max(1, Math.min(width, height));   // 창 크기가 잠깐 0이어도 0으로 나누지 않게

  buildSpaceBg();
  vignette = ctx.createRadialGradient(centerX, centerY, unit * 0.35, centerX, centerY, Math.hypot(width, height) / 2);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");

}


// ===== 1. 도우미 함수 =====
function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function maxDist() { return Math.hypot(width, height) / 2 + 40; }

function bigKorean(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "조";
  if (n >= 1e8) return (n / 1e8).toFixed(1) + "억";
  if (n >= 1e4) return (n / 1e4).toFixed(1) + "만";
  return Math.round(n).toLocaleString();
}

function formatLength(m) {
  if (m < 1) return (m * 100).toFixed(0) + " cm";
  if (m < 1000) return m.toFixed(m < 10 ? 1 : 0) + " m";
  if (m < 1.496e10) return Math.round(m / 1000).toLocaleString() + " km";
  if (m < 9.461e14) {
    const au = m / 1.496e11;
    return (au < 100 ? au.toFixed(1) : Math.round(au).toLocaleString()) + " AU";
  }
  const ly = m / 9.461e15;
  if (ly < 10) return ly.toFixed(1) + " 광년";
  return bigKorean(ly) + " 광년";
}

function formatTime(sec) {
  return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
}


// ===== 2. 상태 =====
const state = {
  mode: "setup",      // setup, play, levelup, ending
  level: 0,           // 조작 단계 번호 (0 도시, 1 지구, 2 태양계)
  speed: 1,
  paused: false,
  sound: true,
  elapsed: 0,
  timer: 0,
  trans: null         // 레벨업 전환 정보
};

// mode: "play" 블랙홀 조종하기(도시부터), "observe" 우주 관측하기(태양계부터)
const settings = { name: "", mode: "play" };

// 블랙홀: 단계 사이를 넘어갈 때는 화면 가운데 기준 위치(x, y)와 반지름 r, 시작 화면에서는 화면 반지름 sr
const hole = { x: 0, y: 0, r: 0, sr: 0, flash: 0, startR: 0 };

let eatenTotals = [];     // 단계별 삼킨 양 (0 도시, 1 지구, 2 태양계)

const fx = { shake: 0, rings: [], debris: [], jet: 0 };

// 지금 블랙홀이 화면 어디에 얼마나 크게 보이는지
function holeScreen() {
  if (state.mode === "play") return LEVELS[state.level].sim().holeScreen();
  return { x: centerX + hole.x, y: centerY + hole.y, r: hole.r };
}


// ===== 3. 단계 정의 =====
// 조작 단계는 저마다 다른 파일의 시뮬레이터가 맡는다 (js/citysim.js, js/earthsim.js, js/solarsim.js)
const LEVELS = [
  {
    key: "city", type: "sim", title: "도시", sim: () => citySim,
    label: "사람·자동차·건물·산",
    intro: "도시 한복판에 블랙홀이 떨어졌습니다. 작은 것부터 삼키며 키워 보세요.",
    done: "도시도, 산맥도 사라졌습니다. 이제 지구 차례입니다.",
    hint: "🖱️ 마우스(손가락)로 블랙홀 움직이기 · 휠: 확대/축소",
    realSize: () => citySim.radiusMeters()
  },
  // sim은 다른 파일에 있어서 함수로 나중에 꺼낸다
  {
    key: "earth", type: "sim", title: "지구", sim: () => earthSim,
    label: "지구",
    intro: "도시를 삼킨 블랙홀이 이제 지구 속으로 들어갑니다.",
    done: "지구를 삼킨 블랙홀이 태양계로 나아갑니다...",
    hint: "🖱️ 마우스 휠로 확대·축소해 보세요",
    realSize: () => earthSim.radiusMeters()
  },
  {
    key: "solar", type: "sim", title: "태양계", sim: () => solarSim,
    label: "태양계 천체",
    intro: "블랙홀의 질량을 고르고, 화면을 끌어서 던져 보세요. 실제 중력 법칙으로 계산됩니다.",
    done: "블랙홀은 계속 자라며, 이제 은하 전체를 향합니다...",
    hint: "🖱️ 끌어서 블랙홀 던지기 · 휠: 확대/축소 · ⌨️ 방향키: 시점 회전",
    // 사건의 지평선 반지름 = 2.95 km × (태양 질량 대비)
    realSize: () => solarSim.radiusMeters()
  }
];

// 은하 그림 (태양계 단계에서 멀리 축소하면 보이는 은하들, js/solarsim.js)
const galaxySprites = [];
function makeGalaxySprite(hue) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, `hsla(${hue}, 80%, 85%, 0.9)`);
  glow.addColorStop(0.25, `hsla(${hue}, 70%, 60%, 0.25)`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 64, 64);
  g.translate(32, 32);
  for (let i = 0; i < 260; i++) {
    const t = Math.random();
    const a = (i % 2) * Math.PI + t * 5 + rand(-0.4, 0.4);
    g.fillStyle = `hsla(${hue + rand(-20, 20)}, 80%, ${rand(70, 95)}%, ${0.9 - t * 0.6})`;
    g.fillRect(Math.cos(a) * t * 29, Math.sin(a) * t * 29 * 0.55, 1.3, 1.3);
  }
  return c;
}
[30, 200, 280, 330, 50].forEach(h => galaxySprites.push(makeGalaxySprite(h)));

function stageTitle(i) { return LEVELS[i].title; }
function stageLabel(i) { return LEVELS[i].label; }
function stageFormat(i, n) { return LEVELS[i].format ? LEVELS[i].format(n) : n + "개"; }


// ===== 4. 배경 =====
let bgStars = [];
function createBgStar(fromEdge) {
  const md = maxDist();
  return { angle: rand(0, 6.28), dist: fromEdge ? rand(md * 0.75, md) : rand(unit * 0.05, md), vel: 0, size: rand(0.3, 1.6), tw: rand(0, 6.28) };
}
function resetBgStars() {
  bgStars = [];
  for (let i = 0; i < 320; i++) bgStars.push(createBgStar(false));
}

// 은하수와 성운이 있는 우주 배경 그림. 한 번만 그려 두고 매 프레임 그대로 붙인다
let spaceBg = null;
function buildSpaceBg() {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  const g = c.getContext("2d");
  g.fillStyle = "#02030a";
  g.fillRect(0, 0, c.width, c.height);

  // 은하수 띠: 물결치며 가로지른다. 시점을 돌릴 때 그림을 옆으로 이어 붙이므로
  // 왼쪽 끝과 오른쪽 끝의 높이가 같아야 한다 (사인 곡선 한 주기)
  const spread = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // 가운데에 몰리는 난수
  const onBand = (w) => {
    const t = Math.random(), off = spread() * w;
    return { x: t * width, y: height * (0.5 + 0.22 * Math.sin(t * Math.PI * 2 + 1)) + off, off };
  };
  // 가장자리에 걸친 빛은 반대쪽 끝에도 그려서 이음매가 보이지 않게 한다
  const blob = (x, y, r, rgb, a) => {
    for (const shift of [-width, 0, width]) {
      const bx = x + shift;
      if (bx + r < 0 || bx - r > width) continue;
      const gr = g.createRadialGradient(bx, y, 0, bx, y, r);
      gr.addColorStop(0, `rgba(${rgb}, ${a})`);
      gr.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = gr;
      g.fillRect(bx - r, y - r, r * 2, r * 2);
    }
  };

  // 빛나는 성운 (빛을 더하는 방식으로 겹쳐서 부드럽게)
  g.globalCompositeOperation = "lighter";
  const cols = ["60, 90, 170", "110, 70, 150", "40, 60, 120", "150, 90, 60"];
  for (let i = 0; i < 260; i++) {
    const p = onBand(unit * 0.16);
    const warm = Math.abs(p.off) < unit * 0.05 && Math.random() < 0.5;
    blob(p.x, p.y, rand(unit * 0.05, unit * 0.22), warm ? "190, 120, 70" : pick(cols), rand(0.02, 0.06));
  }
  // 은하수 가운데의 어두운 먼지 띠
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 60; i++) {
    const p = onBand(unit * 0.04);
    blob(p.x, p.y, rand(unit * 0.03, unit * 0.1), "2, 3, 10", 0.35);
  }
  // 작은 별 (은하수 쪽에 많이), 색도 조금씩 다르게
  g.globalCompositeOperation = "lighter";
  const starCols = ["255, 255, 255", "255, 255, 255", "190, 210, 255", "255, 220, 180", "255, 190, 150"];
  for (let i = 0; i < 2600; i++) {
    const p = Math.random() < 0.6 ? onBand(unit * 0.2) : { x: rand(0, width), y: rand(0, height) };
    const s = Math.random() < 0.93 ? rand(0.4, 1.1) : rand(1.1, 1.9);
    g.fillStyle = `rgba(${pick(starCols)}, ${rand(0.25, 0.9)})`;
    g.fillRect(p.x, p.y, s, s);
  }
  // 밝은 별: 빛 번짐과 십자 모양 빛줄기
  for (let i = 0; i < 22; i++) {
    const x = rand(0, width), y = rand(0, height), r = rand(5, 14), rgb = pick(starCols);
    blob(x, y, r, rgb, 0.55);
    blob(x, y, r * 0.25, "255, 255, 255", 1);
    g.strokeStyle = `rgba(${rgb}, 0.3)`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x - r * 2, y); g.lineTo(x + r * 2, y);
    g.moveTo(x, y - r * 2); g.lineTo(x, y + r * 2);
    g.stroke();
  }
  spaceBg = c;
}

function drawSpace(alpha) {
  if (alpha < 0.01) return;

  // 성운 배경 (마지막 화면에서는 별만)
  let bgAlpha = alpha;
  if (state.mode === "ending") bgAlpha = 0;
  if (spaceBg && bgAlpha > 0.01) {
    ctx.globalAlpha = bgAlpha;
    ctx.drawImage(spaceBg, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  for (const s of bgStars) {
    const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
    const x = centerX + cos * s.dist, y = centerY + sin * s.dist;
    const a = (0.5 + Math.sin(s.tw) * 0.3) * alpha;
    const len = Math.min(40, s.vel * 0.05);
    if (len > 0.8) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cos * len, y + sin * len);
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.fillRect(x, y, s.size, s.size);
    }
  }
}

// ===== 5. 블랙홀 그리기 =====
const disk = [];
for (let i = 0; i < 900; i++) disk.push({ angle: rand(0, 6.28), t: Math.pow(Math.random(), 1.6), size: rand(0.6, 2) });

function diskColor(t, alpha) { return `hsla(${40 - t * 25}, 100%, ${88 - t * 42}%, ${alpha})`; }
function updateDisk(dt) {
  for (const p of disk) p.angle += (0.7 / Math.pow(0.35 + p.t, 1.5)) * dt;
  diskSpin += dt * 0.9;
}

// 소용돌이치는 원반 그림: 휘감기는 빛줄기 수천 개를 미리 그려 두고, 돌리고 눕혀서 쓴다
let diskSpin = 0;
const diskTex = (function () {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.translate(S / 2, S / 2);
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  // 은은한 빛 바탕
  const base = g.createRadialGradient(0, 0, S * 0.13, 0, 0, S * 0.5);
  base.addColorStop(0, "rgba(255, 230, 180, 0.4)");
  base.addColorStop(0.3, "rgba(255, 140, 50, 0.16)");
  base.addColorStop(1, "rgba(120, 30, 0, 0)");
  g.fillStyle = base;
  g.beginPath();
  g.arc(0, 0, S * 0.5, 0, Math.PI * 2);
  g.fill();
  // 빛줄기: 안쪽은 하얗고 짧게 휘감기고, 바깥쪽은 붉고 길게
  for (let i = 0; i < 1500; i++) {
    const t = Math.pow(Math.random(), 1.5);
    const r = S * 0.5 * (0.3 + t * 0.68);
    const a0 = rand(0, Math.PI * 2);
    g.strokeStyle = `hsla(${42 - t * 30}, 100%, ${86 - t * 48}%, ${rand(0.05, 0.3) * (1 - t * 0.5)})`;
    g.lineWidth = rand(0.5, 2.2);
    g.beginPath();
    g.arc(0, 0, r, a0, a0 + rand(0.25, 1.3) * (1 - t * 0.4));
    g.stroke();
  }
  return c;
})();

// 원반의 뒤쪽 절반 또는 앞쪽 절반을 비스듬히 눕혀서 그린다
function drawDiskTex(h, frontSide) {
  if (h.r < 5) return;
  const half = h.r * 4.2;   // 그림 안쪽 가장자리가 블랙홀 바로 바깥에 오도록
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(1, 0.2);
  ctx.beginPath();
  ctx.rect(-half, frontSide ? 0 : -half, half * 2, half);
  ctx.clip();
  ctx.rotate(diskSpin);
  ctx.drawImage(diskTex, -half, -half, half * 2, half * 2);
  ctx.restore();
}

function drawDisk(h, frontSide) {
  const inner = h.r * 1.35, outer = h.r * 3.3;
  for (const p of disk) {
    if ((Math.sin(p.angle) >= 0) !== frontSide) continue;
    const r = inner + p.t * (outer - inner);
    ctx.fillStyle = diskColor(p.t, 0.9 - p.t * 0.6);
    const sz = Math.max(0.6, Math.min(p.size, h.r * 0.3));
    ctx.fillRect(h.x + Math.cos(p.angle) * r, h.y + Math.sin(p.angle) * r * 0.2, sz, sz);
  }
}

function drawHole(h) {
  if (h.r < 0.3) return;
  // 주변의 빛 (삼키면 번쩍)
  const glow = ctx.createRadialGradient(h.x, h.y, h.r, h.x, h.y, h.r * 4.5);
  glow.addColorStop(0, `rgba(255, 140, 50, ${0.25 + hole.flash * 0.35})`);
  glow.addColorStop(0.4, `rgba(255, 90, 30, ${0.07 + hole.flash * 0.1})`);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * 4.5, 0, Math.PI * 2);
  ctx.fill();

  // 제트
  if (fx.jet > 0.01) {
    const flicker = 0.75 + Math.sin(state.timer * 13) * 0.1 + Math.random() * 0.15;
    const len = h.r * 7 * fx.jet, w = h.r * 0.35;
    ctx.globalCompositeOperation = "lighter";
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(h.x, h.y, h.x, h.y + side * len);
      g.addColorStop(0, `rgba(190, 215, 255, ${0.55 * fx.jet * flicker})`);
      g.addColorStop(1, "rgba(120, 160, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(h.x - w, h.y);
      ctx.lineTo(h.x - w * 0.15, h.y + side * len);
      ctx.lineTo(h.x + w * 0.15, h.y + side * len);
      ctx.lineTo(h.x + w, h.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "lighter";
  drawDiskTex(h, false);
  drawDisk(h, false);
  for (const p of disk) {   // 휘어진 빛 고리
    const r = h.r * (1.04 + p.t * 0.35);
    ctx.fillStyle = diskColor(p.t, 0.35 - p.t * 0.25);
    ctx.fillRect(h.x + Math.cos(p.angle) * r, h.y + Math.sin(p.angle) * r, 1, 1);
  }
  ctx.globalCompositeOperation = "source-over";

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255, 220, 170, ${0.6 + hole.flash * 0.4})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(255, 170, 90, 0.9)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.globalCompositeOperation = "lighter";
  drawDiskTex(h, true);
  drawDisk(h, true);
  ctx.globalCompositeOperation = "source-over";
}

// 블랙홀이 끌어당기는 범위를 점선 원으로 표시

function levelProgress() { return LEVELS[state.level].sim().progress(); }


// ===== 6. 연출 효과 =====
function shake(power) { fx.shake = Math.max(fx.shake, power); }

function addRing(h, power) {
  fx.rings.push({ x: h.x, y: h.y, r: h.r * 1.05, speed: 180 + power * 220, life: 1, width: 1.5 + power * 2 });
}

function addDebris(h, count) {
  for (let i = 0; i < count; i++) {
    fx.debris.push({ angle: rand(0, 6.28), dist: h.r * rand(1.05, 1.5), r: h.r, life: 1, size: rand(1, 2.5), hue: rand(20, 45) });
  }
}

function updateFx(dt) {
  fx.shake = Math.max(0, fx.shake - dt * 25);
  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const g = fx.rings[i];
    g.r += g.speed * dt;
    g.life -= dt * 0.8;
    if (g.life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.debris.length - 1; i >= 0; i--) {
    const d = fx.debris[i];
    d.angle += (4 + 60 / Math.max(d.dist, 5)) * dt;
    d.dist = Math.max(d.r * 0.9, d.dist - d.r * 0.6 * dt);
    d.life -= dt * 1.3;
    if (d.life <= 0) fx.debris.splice(i, 1);
  }
  // 제트는 태양계부터
  const jetTarget = state.mode === "play" && LEVELS[state.level].key === "solar" ? 0.35 : 0;
  fx.jet += (jetTarget - fx.jet) * Math.min(1, dt * 0.8);
}

function drawFx() {
  const h = holeScreen();
  ctx.globalCompositeOperation = "lighter";
  for (const d of fx.debris) {
    ctx.fillStyle = `hsla(${d.hue}, 100%, 75%, ${d.life})`;
    ctx.fillRect(h.x + Math.cos(d.angle) * d.dist, h.y + Math.sin(d.angle) * d.dist * 0.3, d.size, d.size);
  }
  for (const g of fx.rings) {
    ctx.strokeStyle = `rgba(255, 210, 160, ${g.life * 0.55})`;
    ctx.lineWidth = g.width * g.life + 0.5;
    ctx.beginPath();
    ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}


// ===== 7. 소리 (Web Audio API) =====
let audio = null;

function initAudio() {
  if (audio) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    const osc1 = ac.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 55;
    osc1.connect(master);
    const osc2 = ac.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = 55.6;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const g2 = ac.createGain();
    g2.gain.value = 0.18;
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(master);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    osc1.start();
    osc2.start();
    lfo.start();
    audio = { ac, master, osc1, osc2 };
  } catch (err) {
    audio = null;
  }
}

function setVolume(level) {
  if (!audio) return;
  const t = audio.ac.currentTime;
  audio.master.gain.cancelScheduledValues(t);
  audio.master.gain.setTargetAtTime(state.sound ? level : 0, t, 0.6);
}

function setPitch(level) {
  if (!audio) return;
  const t = audio.ac.currentTime;
  const f = 58 - level * 4;
  audio.osc1.frequency.setTargetAtTime(f, t, 1.5);
  audio.osc2.frequency.setTargetAtTime(f * 1.01, t, 1.5);
}

function thump(power = 1) {
  if (!audio || !state.sound) return;
  const ac = audio.ac, t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(28, t + 0.7 * power);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * Math.min(power, 1.5), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 * power);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t);
  o.stop(t + 1 * power);
}

// 작은 것을 삼킬 때 '뽁' 소리
function pop() {
  if (!audio || !state.sound) return;
  const ac = audio.ac, t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(rand(500, 700), t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g);
  g.connect(ac.destination);
  o.start(t);
  o.stop(t + 0.2);
}

// ===== 8. 화면 글자 (해설, 단계 제목, 계기판) =====
const narrationEl = document.getElementById("narration");
let narrTyping = null, narrHide = null;

function narrate(text, holdMs = 2600) {
  clearInterval(narrTyping);
  clearTimeout(narrHide);
  narrationEl.textContent = "";
  narrationEl.classList.add("show");
  let i = 0;
  narrTyping = setInterval(function () {
    i++;
    narrationEl.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(narrTyping);
      narrHide = setTimeout(() => narrationEl.classList.remove("show"), holdMs);
    }
  }, 40);
}

const stageTitleEl = document.getElementById("stageTitle");
let titleHide = null;
function showTitle(small, big) {
  document.getElementById("stageTitleSmall").textContent = small;
  document.getElementById("stageTitleBig").textContent = big;
  stageTitleEl.classList.add("show");
  clearTimeout(titleHide);
  titleHide = setTimeout(() => stageTitleEl.classList.remove("show"), 2400);
}

const hudEl = document.getElementById("hud");
const hudName = document.getElementById("hudName");
const hudPlace = document.getElementById("hudPlace");
const hudStage = document.getElementById("hudStage");
const hudSize = document.getElementById("hudSize");
const hudTime = document.getElementById("hudTime");
const hintEl = document.getElementById("hint");
const progressBar = document.getElementById("progressBar");
const eatenList = document.getElementById("eatenList");
let eatenDirty = true;
let hudTimer = 0;

function currentSizeText() {
  return formatLength(LEVELS[state.level].realSize(hole.r));
}

function updateHud(dt) {
  hudTimer += dt;
  if (hudTimer < 0.1) return;
  hudTimer = 0;

  const i = state.level;
  const p = state.mode === "play" ? levelProgress() : state.mode === "levelup" ? 1 : 0;
  hudStage.textContent = `LEVEL ${i + 1}/${LEVELS.length} · ${stageTitle(i)}`;
  progressBar.style.width = ((i + p) / LEVELS.length * 100) + "%";
  hudSize.textContent = currentSizeText();
  hudTime.textContent = formatTime(state.elapsed);

  if (eatenDirty) {
    eatenDirty = false;
    eatenList.innerHTML = "";
    for (let k = 0; k < eatenTotals.length; k++) {
      if (eatenTotals[k] === undefined) continue;
      const li = document.createElement("li");
      li.innerHTML = `<span>${stageLabel(k)}</span><b>${stageFormat(k, eatenTotals[k])}</b>`;
      eatenList.appendChild(li);
    }
  }
}


// ===== 9. 진행 흐름 =====
// 처음 화면에서 고른 방식으로 시작한다
function begin(mode) {
  settings.name = document.getElementById("nameInput").value.trim() || "이름 없는 블랙홀";
  settings.mode = mode;

  initAudio();
  if (audio) audio.ac.resume();
  setPitch(0);
  setVolume(0.2);

  const setupEl = document.getElementById("setup");
  setupEl.classList.add("fade-out");
  setTimeout(() => setupEl.classList.add("hidden"), 800);

  hudName.textContent = "🕳️ " + settings.name;
  hudPlace.textContent = MODE_LABELS[mode];
  hudEl.classList.remove("hidden");

  state.timer = 0;
  state.elapsed = 0;
  eatenTotals = [];
  eatenDirty = true;
  fx.rings = [];
  fx.debris = [];

  // 조종하기는 도시부터, 관측하기는 도시와 지구를 건너뛰고 태양계부터
  state.level = mode === "observe" ? LEVELS.length - 1 : 0;
  LEVELS[state.level].sim().start();
  startPlay();
}

function startPlay() {
  const level = LEVELS[state.level];
  state.mode = "play";
  state.timer = 0;
  if (eatenTotals[state.level] === undefined) eatenTotals[state.level] = 0;
  eatenDirty = true;
  showTitle(`LEVEL ${state.level + 1}`, level.title);
  // 그 사이에 단계가 바뀌었으면(다시 하기 등) 예전 해설은 띄우지 않는다
  setTimeout(() => { if (state.mode === "play" && LEVELS[state.level] === level) narrate(level.intro, 3500); }, 800);
  setPitch(state.level);
  hintEl.textContent = level.hint || "🖱️ 마우스(손가락)로 블랙홀을 움직여 보세요";
}

function startLevelUp() {
  const from = LEVELS[state.level];
  state.mode = "levelup";
  state.timer = 0;
  state.trans = {
    from: state.level,
    to: state.level + 1,
    holeFrom: holeScreen(),
    rFrom: hole.r
  };
  shake(12);
  addRing(holeScreen(), 1.5);
  thump(1.5);
  narrate(from.done);
  if (state.level === LEVELS.length - 1) {
    showTitle("CLEAR!", "태양계");
    return;   // 태양계 다음은 마지막 화면
  }
  showTitle("LEVEL UP!", LEVELS[state.level + 1].title);

  // 다음 단계를 미리 준비해 둔다 (서서히 나타남)
  if (state.level === 0) earthSim.prepare();
}

function updateLevelUp(dt) {
  const tr = state.trans;
  const t = state.timer;
  const k = easeInOut(clamp(t / 3, 0, 1));

  if (tr.from === 0) {
    // 도시 → 지구: 도시가 멀어지며 둥근 지구가 나타나고, 블랙홀은 화면 가운데로
    hole.x = lerp(tr.holeFrom.x - centerX, 0, k);
    hole.y = lerp(tr.holeFrom.y - centerY, 0, k);
    hole.r = lerp(tr.holeFrom.r, 5 * unit / 800, k);
    if (t > 3.6) {
      citySim.stop();
      state.level = 1;
      earthSim.start();
      startPlay();
    }

  } else if (tr.from === 1) {
    // 지구 → 태양계: 지구를 삼킨 블랙홀이 우주로 (지구 단계에서 이미 무너지는 장면을 보여줬다)
    hole.x = lerp(hole.x, 0, Math.min(1, dt * 2));
    hole.y = lerp(hole.y, 0, Math.min(1, dt * 2));
    if (t > 2.2) {
      state.level = 2;
      solarSim.start();
      startPlay();
    }

  } else if (tr.from === 2) {
    // 태양계를 마치면: 블랙홀이 화면 가운데로 온 뒤 마지막 화면
    const h0 = tr.holeFrom;
    hole.r = lerp(h0.r, 0.03 * unit, k);
    hole.x = lerp(h0.x - centerX, 0, k);
    hole.y = lerp(h0.y - centerY, 0, k);
    if (t > 4) {
      hudEl.classList.add("hidden");
      setVolume(0);
      saveRecord();
      showEnding();
    }
  }
}

// ===== 10. 기록 (localStorage) =====
const RECORD_KEY = "blackholeRecords";
const MODE_LABELS = { play: "🎮 블랙홀 조종", observe: "🔭 우주 관측" };

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(RECORD_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function saveRecord() {
  const records = loadRecords();
  records.unshift({
    name: settings.name, mode: MODE_LABELS[settings.mode],
    seconds: Math.round(state.elapsed), date: new Date().toLocaleDateString("ko-KR")
  });
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(records.slice(0, 10)));
  } catch (err) {
    // 저장이 막힌 환경(시크릿 모드 등)에서는 기록 없이 진행
  }
}

function showEnding() {
  state.mode = "ending";
  document.getElementById("endingResult").innerHTML =
    `블랙홀 <b>'${settings.name}'</b>이(가)<br>` +
    `태양계를 휩쓰는 데 <b>${formatTime(state.elapsed)}</b>이 걸렸습니다.`;
  const list = document.getElementById("recordList");
  list.innerHTML = "";
  const records = loadRecords().slice(0, 5);
  if (records.length === 0) list.innerHTML = "<li><span>저장된 기록이 없어요</span></li>";
  records.forEach(function (rec, i) {
    const li = document.createElement("li");
    if (i === 0) li.className = "latest";
    li.innerHTML = `<span>🕳️ ${rec.name} · ${rec.mode || rec.place || ""}</span><span>${formatTime(rec.seconds)} · ${rec.date}</span>`;
    list.appendChild(li);
  });
  document.getElementById("ending").classList.remove("hidden");
}

function restart() {
  citySim.stop();
  earthSim.stop();
  solarSim.stop();
  document.getElementById("ending").classList.add("hidden");
  const setupEl = document.getElementById("setup");
  setupEl.classList.remove("hidden", "fade-out");
  state.mode = "setup";
  state.level = 0;
  state.paused = false;
  eatenTotals = [];
  fx.rings = [];
  fx.debris = [];
  fx.jet = 0;
  resetBgStars();
  pauseBtn.textContent = "⏸";
  setVolume(0.2);
}


// ===== 11. 매 프레임 업데이트 =====
function update(dt) {
  const simDt = dt * state.speed;
  state.timer += dt;
  hole.flash = Math.max(0, hole.flash - dt * 1.5);
  updateDisk(simDt);
  updateFx(dt);

  // 배경 별 반짝임
  for (const s of bgStars) s.tw += dt * 3;

  if (state.mode === "setup") {
    hole.sr += (unit * 0.06 - hole.sr) * Math.min(1, dt * 2);

  } else if (state.mode === "play") {
    // 도시·지구·태양계: 각 단계의 시뮬레이터가 맡는다
    state.elapsed += dt;
    LEVELS[state.level].sim().update(dt, simDt);

  } else if (state.mode === "levelup") {
    state.elapsed += dt;
    updateLevelUp(dt);

  }

  if (state.mode !== "setup") updateHud(dt);
}


// ===== 12. 매 프레임 그리기 =====
function draw() {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake));

  const mode = state.mode;
  if (mode === "setup") {
    drawSpace(1);
    drawHole({ x: centerX, y: centerY, r: hole.sr });

  } else if (mode === "play" || mode === "levelup") {
    drawLevelScene();

  } else {
    drawSpace(1);
  }
  drawFx();
  ctx.restore();

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawLevelScene() {
  if (state.mode === "play") {
    LEVELS[state.level].sim().draw();
    return;
  }

  // 단계 사이 전환: 블랙홀이 화면 가운데로
  const tr = state.trans;
  const t = state.timer;
  drawSpace(1);
  if (tr.from === 0) {
    // 도시가 멀어지는 동안 둥근 지구가 커다랗게 나타나 제자리 크기로 줄어든다
    const earthA = clamp((t - 1.2) / 2, 0, 1);
    if (earthA < 1) citySim.drawLeaving(easeInOut(clamp(t / 3, 0, 1)));
    if (earthA > 0) {
      // 멀어진 땅 위로 우주와 지구가 서서히 겹쳐진다
      ctx.fillStyle = `rgba(0, 0, 0, ${earthA})`;
      ctx.fillRect(0, 0, width, height);
      drawSpace(earthA);
      const R = unit * 0.33 * Math.exp(lerp(Math.log(30), 0, clamp((t - 1.2) / 2.4, 0, 1)));
      ctx.globalAlpha = earthA;
      earthSim.drawGlobe(centerX, centerY, R, 120);
      ctx.globalAlpha = 1;
    }
  }
  drawHole(holeScreen());
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (!state.paused) update(dt);
  draw();
  requestAnimationFrame(loop);
}


// ===== 13. 이벤트 =====
document.getElementById("playBtn").addEventListener("click", () => begin("play"));
document.getElementById("observeBtn").addEventListener("click", () => begin("observe"));
document.getElementById("restartBtn").addEventListener("click", restart);

const pauseBtn = document.getElementById("pauseBtn");
function togglePause() {
  if (state.mode === "setup" || state.mode === "ending") return;
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? "▶" : "⏸";
  if (audio) state.paused ? audio.ac.suspend() : audio.ac.resume();
}
pauseBtn.addEventListener("click", togglePause);

const speedBtn = document.getElementById("speedBtn");
speedBtn.addEventListener("click", function () {
  state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
  speedBtn.textContent = "×" + state.speed;
});

const soundBtn = document.getElementById("soundBtn");
soundBtn.addEventListener("click", function () {
  state.sound = !state.sound;
  soundBtn.textContent = state.sound ? "🔊" : "🔇";
  const playing = state.mode !== "ending";
  setVolume(playing ? 0.2 : 0);
});

window.addEventListener("keydown", function (e) {
  if (e.code === "Space" && document.activeElement.tagName !== "INPUT") {
    e.preventDefault();
    togglePause();
  }
});

window.addEventListener("resize", resize);


// ===== 시작 =====
resize();
resetBgStars();
requestAnimationFrame(loop);
