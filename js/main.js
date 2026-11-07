// ===== 캔버스 준비 =====
const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");

let width, height;         // 화면 크기
let centerX, centerY;      // 블랙홀 중심
let holeRadius;            // 블랙홀(검은 그림자) 반지름

// 화면 크기에 맞춰 캔버스와 블랙홀 크기를 다시 계산
function resize() {
  const dpr = window.devicePixelRatio || 1;   // 고해상도 화면 대응
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  centerX = width / 2;
  centerY = height * 0.38;
  holeRadius = Math.min(width, height) * 0.1;
}

// ===== 마우스 =====
const mouse = { x: 0, y: 0 };
let closeness = 0;         // 마우스가 블랙홀에 가까울수록 1에 가까워짐

window.addEventListener("mousemove", function (e) {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// ===== 별 (블랙홀 쪽으로 천천히 빨려 들어감) =====
const STAR_COUNT = 450;
const stars = [];

function createStar(fromEdge) {
  const maxDist = Math.hypot(width, height) / 2;
  return {
    angle: Math.random() * Math.PI * 2,
    // 처음엔 화면 전체에 흩뿌리고, 다시 생길 땐 화면 가장자리에서 등장
    dist: fromEdge ? maxDist : holeRadius * 2 + Math.random() * maxDist,
    size: Math.random() * 1.4 + 0.3,
    twinkle: Math.random() * Math.PI * 2
  };
}

function updateAndDrawStars(offsetX, offsetY) {
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];

    // 가까울수록 빨리 돌고 빨리 빨려 들어간다
    s.angle += 0.25 / s.dist;
    s.dist -= 0.04 + 25 / s.dist;
    s.twinkle += 0.05;

    // 사건의 지평선에 닿으면 사라지고 가장자리에서 새로 생성
    if (s.dist < holeRadius) {
      stars[i] = createStar(true);
      continue;
    }

    const x = centerX + Math.cos(s.angle) * s.dist + offsetX;
    const y = centerY + Math.sin(s.angle) * s.dist + offsetY;
    const alpha = 0.5 + Math.sin(s.twinkle) * 0.3;

    // 블랙홀 근처에서는 별이 회전 방향으로 길게 늘어난다
    const stretch = Math.max(0, 1 - s.dist / (holeRadius * 4)) * 14;
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.sin(s.angle) * stretch, y - Math.cos(s.angle) * stretch);
    ctx.stroke();

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fillRect(x, y, s.size, s.size);
  }
}

// ===== 강착원반 (블랙홀 주위를 도는 뜨거운 입자) =====
const DISK_COUNT = 1800;
const TILT = 0.2;          // 원반을 비스듬히 보는 정도 (작을수록 납작)
const disk = [];

function createDiskParticle() {
  return {
    angle: Math.random() * Math.PI * 2,
    // 0 = 안쪽 가장자리, 1 = 바깥쪽 가장자리 (안쪽에 더 많이 몰리게)
    t: Math.pow(Math.random(), 1.6),
    size: Math.random() * 1.6 + 0.6
  };
}

// 안쪽은 하얗고 뜨겁게, 바깥쪽은 붉게
function diskColor(t, alpha) {
  const hue = 40 - t * 25;
  const light = 88 - t * 42;
  return `hsla(${hue}, 100%, ${light}%, ${alpha})`;
}

function drawDisk(frontSide) {
  const inner = holeRadius * 1.35;
  const outer = holeRadius * 3.4;

  for (const p of disk) {
    const isFront = Math.sin(p.angle) >= 0;
    if (isFront !== frontSide) continue;

    const r = inner + p.t * (outer - inner);
    const x = centerX + Math.cos(p.angle) * r;
    const y = centerY + Math.sin(p.angle) * r * TILT;
    const alpha = 0.9 - p.t * 0.6;

    ctx.fillStyle = diskColor(p.t, alpha);
    ctx.fillRect(x, y, p.size, p.size);
  }
}

// 블랙홀 뒤쪽 원반의 빛이 중력에 휘어서 그림자 주위로 고리처럼 보이는 효과
function drawLensedRing() {
  for (const p of disk) {
    const r = holeRadius * (1.04 + p.t * 0.35);
    const x = centerX + Math.cos(p.angle) * r;
    const y = centerY + Math.sin(p.angle) * r;
    ctx.fillStyle = diskColor(p.t, 0.35 - p.t * 0.25);
    ctx.fillRect(x, y, p.size * 0.8, p.size * 0.8);
  }
}

function updateDisk(speedBoost) {
  for (const p of disk) {
    // 안쪽일수록 빠르게 회전 (케플러 운동처럼)
    p.angle += (0.012 / Math.pow(0.35 + p.t, 1.5)) * speedBoost;
  }
}

// ===== 블랙홀 본체 =====
function drawGlow() {
  const glow = ctx.createRadialGradient(centerX, centerY, holeRadius, centerX, centerY, holeRadius * 4);
  glow.addColorStop(0, `rgba(255, 140, 50, ${0.22 + closeness * 0.15})`);
  glow.addColorStop(0.4, "rgba(255, 90, 30, 0.06)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawShadow() {
  // 빛이 하나도 빠져나오지 못하는 검은 영역
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(centerX, centerY, holeRadius, 0, Math.PI * 2);
  ctx.fill();

  // 그림자 가장자리의 얇은 빛 고리 (광자 고리)
  ctx.strokeStyle = `rgba(255, 220, 170, ${0.55 + closeness * 0.3})`;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "rgba(255, 170, 90, 0.9)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(centerX, centerY, holeRadius * 1.02, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ===== 매 프레임 그리기 =====
function draw() {
  // 마우스가 블랙홀에 가까운 정도 계산 → 가까우면 더 빨리, 더 밝게
  const d = Math.hypot(mouse.x - centerX, mouse.y - centerY);
  const target = Math.max(0, 1 - d / (holeRadius * 5));
  closeness += (target - closeness) * 0.05;   // 부드럽게 따라가기
  const speedBoost = 1 + closeness * 2.5;

  // 마우스 반대 방향으로 배경이 살짝 움직이는 입체 효과
  const offsetX = (centerX - mouse.x) * 0.015;
  const offsetY = (centerY - mouse.y) * 0.015;

  // 완전히 지우지 않고 반투명으로 덮어서 잔상(꼬리)을 남긴다
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "rgba(0, 0, 4, 0.35)";
  ctx.fillRect(0, 0, width, height);

  updateAndDrawStars(offsetX, offsetY);
  drawGlow();

  updateDisk(speedBoost);

  // 빛이 겹칠수록 밝아지게
  ctx.globalCompositeOperation = "lighter";
  drawDisk(false);          // 블랙홀 뒤쪽 원반
  drawLensedRing();         // 휘어진 빛 고리

  ctx.globalCompositeOperation = "source-over";
  drawShadow();             // 검은 그림자가 뒤쪽 원반을 가림

  ctx.globalCompositeOperation = "lighter";
  drawDisk(true);           // 블랙홀 앞쪽 원반 (그림자 위로 지나감)

  ctx.globalCompositeOperation = "source-over";
  requestAnimationFrame(draw);
}

// ===== 시작 =====
window.addEventListener("resize", resize);
resize();

mouse.x = centerX;
mouse.y = height;

for (let i = 0; i < STAR_COUNT; i++) stars.push(createStar(false));
for (let i = 0; i < DISK_COUNT; i++) disk.push(createDiskParticle());

draw();
