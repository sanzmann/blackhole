// ===== 1. 배경 별 =====
const starCanvas = document.getElementById("stars");
const starCtx = starCanvas.getContext("2d");
let stars = [];

function resizeStars() {
  starCanvas.width = window.innerWidth;
  starCanvas.height = window.innerHeight;

  // 별 하나 = 객체 { x, y, 크기, 반짝임 위상 }
  stars = [];
  for (let i = 0; i < 220; i++) {
    stars.push({
      x: Math.random() * starCanvas.width,
      y: Math.random() * starCanvas.height,
      size: Math.random() * 1.4 + 0.3,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function drawStars() {
  starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
  const scroll = window.scrollY * 0.05;   // 스크롤하면 별이 천천히 따라 움직임

  for (const s of stars) {
    s.phase += 0.02;
    const alpha = 0.45 + Math.sin(s.phase) * 0.35;
    let y = (s.y - scroll) % starCanvas.height;
    if (y < 0) y += starCanvas.height;
    starCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    starCtx.fillRect(s.x, y, s.size, s.size);
  }
  requestAnimationFrame(drawStars);
}

window.addEventListener("resize", resizeStars);
resizeStars();
drawStars();


// ===== 2. 스크롤하면 카드가 나타나는 효과 =====
const revealObserver = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);   // 한 번 나타나면 끝
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll(".reveal").forEach(function (el) {
  revealObserver.observe(el);
});


// ===== 3. 사건의 지평선 계산기 =====
const G = 6.674e-11;     // 중력 상수
const C = 2.998e8;       // 빛의 속도 (m/s)
const SUN = 1.989e30;    // 태양 질량 (kg)

const bodies = [
  { name: "사람 (70kg)", emoji: "🧍", mass: 70, compare: "원자핵보다도 훨씬, 훨씬 작아요. 사실상 점이에요." },
  { name: "지구", emoji: "🌍", mass: 5.972e24, compare: "지구 전체를 구슬 하나(지름 약 1.8cm) 크기로 꾹 눌러야 해요!" },
  { name: "태양", emoji: "☀️", mass: SUN, compare: "지름 약 6km, 작은 도시 하나 정도의 크기예요." },
  { name: "궁수자리 A*", emoji: "🌀", mass: 4.3e6 * SUN, compare: "우리 은하 중심의 블랙홀. 수성의 공전 궤도 안에 쏙 들어가요." },
  { name: "M87*", emoji: "📸", mass: 6.5e9 * SUN, compare: "처음 사진이 찍힌 블랙홀. 해왕성 궤도보다 4배 넘게 커요." }
];

// 슈바르츠실트 반지름 r = 2GM / c²
function schwarzschildRadius(mass) {
  return (2 * G * mass) / (C * C);
}

// 미터 단위 길이를 읽기 쉬운 문자열로
function formatLength(m) {
  if (m < 1e-3) {
    const exp = Math.floor(Math.log10(m));
    const base = (m / Math.pow(10, exp)).toFixed(1);
    return `${base} × 10^${exp} m`;
  }
  if (m < 1) return (m * 1000).toFixed(1) + " mm";
  if (m < 1000) return m.toFixed(1) + " m";
  if (m < 1e9) return Math.round(m / 1000).toLocaleString() + " km";
  if (m < 1.496e12) return Math.round(m / 1e7).toLocaleString() + "만 km";
  return Math.round(m / 1.496e11).toLocaleString() + " AU (천문단위)";
}

const calcButtons = document.getElementById("calcButtons");
const calcName = document.getElementById("calcName");
const calcValue = document.getElementById("calcValue");
const calcCompare = document.getElementById("calcCompare");

bodies.forEach(function (body) {
  const btn = document.createElement("button");
  btn.textContent = `${body.emoji} ${body.name}`;
  btn.addEventListener("click", function () {
    calcButtons.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const r = schwarzschildRadius(body.mass);
    calcName.textContent = `${body.name}이(가) 블랙홀이 된다면 반지름은`;
    calcValue.textContent = formatLength(r);
    calcCompare.textContent = body.compare;
  });
  calcButtons.appendChild(btn);
});


// ===== 4. 시간 지연 시계 =====
const earthClock = document.getElementById("earthClock");
const holeClock = document.getElementById("holeClock");
const distRange = document.getElementById("distRange");
const distLabel = document.getElementById("distLabel");
const timeResult = document.getElementById("timeResult");

let earthSeconds = 0;
let holeSeconds = 0;
const CLOCK_SPEED = 600;   // 실제 1초에 시계는 10분씩 흐름

// 블랙홀에서 x배 떨어진 곳의 시간 흐름 비율 = √(1 - 1/x)
function timeFactor() {
  const x = distRange.value / 100;
  return Math.sqrt(1 - 1 / x);
}

function formatClock(sec) {
  const h = Math.floor(sec / 3600) % 100;
  const m = Math.floor(sec / 60) % 60;
  const s = Math.floor(sec) % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function updateTimeText() {
  const x = distRange.value / 100;
  const factor = timeFactor();
  distLabel.textContent = `블랙홀과의 거리: 사건의 지평선 반지름의 ${x.toFixed(2)}배`;

  const days = 365 * factor;
  const text = days < 1 ? `${(days * 24).toFixed(1)}시간` : `${Math.round(days)}일`;
  timeResult.textContent = `지구에서 1년이 흐르는 동안, 이곳에서는 ${text}만 흘러요.`;
}

distRange.addEventListener("input", updateTimeText);
updateTimeText();

let lastClockTime = performance.now();
setInterval(function () {
  const now = performance.now();
  const dt = (now - lastClockTime) / 1000;
  lastClockTime = now;

  earthSeconds += dt * CLOCK_SPEED;
  holeSeconds += dt * CLOCK_SPEED * timeFactor();
  earthClock.textContent = formatClock(earthSeconds);
  holeClock.textContent = formatClock(holeSeconds);
}, 50);


// ===== 5. NASA 이미지 API =====
async function loadNasaImages() {
  const gallery = document.getElementById("gallery");
  try {
    const res = await fetch("https://images-api.nasa.gov/search?q=supermassive%20black%20hole&media_type=image");
    const data = await res.json();
    const items = data.collection.items.filter(it => it.links && it.links[0]).slice(0, 6);

    gallery.innerHTML = "";
    items.forEach(function (item) {
      const info = item.data[0];
      const link = document.createElement("a");
      link.href = `https://images.nasa.gov/details/${encodeURIComponent(info.nasa_id)}`;
      link.target = "_blank";
      link.rel = "noopener";

      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = item.links[0].href;
      img.alt = info.title;
      img.loading = "lazy";
      const cap = document.createElement("figcaption");
      cap.textContent = info.title;

      fig.appendChild(img);
      fig.appendChild(cap);
      link.appendChild(fig);
      gallery.appendChild(link);
    });
  } catch (err) {
    gallery.innerHTML = '<p class="muted">NASA 이미지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>';
  }
}

loadNasaImages();


// ===== 6. 뒤집히는 사실 카드 =====
const facts = [
  { q: "태양이 블랙홀이 되면 지구는 빨려 들어갈까?", a: "아니요! 질량이 같으면 지구의 공전 궤도는 그대로예요. 블랙홀은 진공청소기가 아니거든요. 대신 햇빛이 사라져 꽁꽁 얼겠죠." },
  { q: "우리 은하 중심에도 블랙홀이 있다?", a: "네. 궁수자리 A*라는 초대질량 블랙홀이 있고, 질량은 태양의 약 400만 배예요." },
  { q: "블랙홀도 사라질 수 있다?", a: "스티븐 호킹은 블랙홀이 아주아주 천천히 에너지를 내보내며 증발한다고 예측했어요. 이걸 '호킹 복사'라고 해요." },
  { q: "블랙홀끼리 부딪히면 어떻게 될까?", a: "하나로 합쳐지며 시공간이 출렁여요. 2015년 LIGO가 이 떨림인 '중력파'를 처음으로 감지했어요." }
];

const factsBox = document.getElementById("facts");
facts.forEach(function (fact) {
  const card = document.createElement("div");
  card.className = "fact";
  card.innerHTML = `
    <div class="fact-inner">
      <div class="fact-front"><span class="q-mark">❓</span>${fact.q}</div>
      <div class="fact-back">${fact.a}</div>
    </div>`;
  card.addEventListener("click", function () {
    card.classList.toggle("flipped");
  });
  factsBox.appendChild(card);
});
