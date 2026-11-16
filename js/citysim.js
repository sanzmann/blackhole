// ============================================================
//  도시 단계 (LEVEL 1)
//  - 사람·자동차·건물·비행기·산이 놓인 하나의 세계에서 블랙홀을 마우스로 움직인다
//  - 블랙홀보다 작은 것부터 끌려와 삼켜지고, 삼킬수록 블랙홀이 커진다
//  - 커진 만큼 카메라가 뒤로 물러나서 사람 눈높이 → 거리 → 도시 → 산맥까지 한 화면으로 이어진다
//  - 마우스 휠(또는 +, - 키)로 직접 확대·축소할 수도 있다
//  물체 그림은 img/sprites 폴더에 있고, simulation.js의 전역 변수·함수를 같이 쓴다
// ============================================================

const citySim = (function () {
  const TILT = 0.55;        // 바닥이 납작해 보이는 정도 (위에서 비스듬히 내려다본다)
  const HGT = 0.9;          // 높이가 화면에서 위로 올라가는 비율
  const R_START = 0.9;      // 처음 반지름 (m) - 사람만 한 크기
  const R_END = 3000;       // 이만큼 커지면 지구 단계로 (m)
  const ZOOM_K = 34;        // 화면 가로에 '반지름의 몇 배'가 보이게 할지
  const EAT_RATIO = 2.2;    // 반지름의 몇 배 크기까지 삼킬 수 있는지
  const PULL_K = 4;         // 반지름의 몇 배 거리까지 끌어당기는지
  const GROW = 0.04;         // 삼켰을 때 커지는 정도
  const G = 150;            // 끌어당기는 세기
  const ROAD = 60;          // 도로 간격 (m)
  const CITY_R = 4200;      // 도시 반지름 (m)
  const WORLD_R = 70000;    // 세계 반지름 (m)
  const T_LAND = 2.4;       // 하늘에서 떨어져 땅에 닿는 시각 (초)

  // ===== 물체 그림 =====
  const SPRITE_NAMES = ["man", "woman", "child", "stroller", "cyclist", "bench", "lamp", "tree", "blossom", "parasol",
    "car_red", "car_white", "taxi", "bus", "truck", "house", "cafe", "brick", "stone", "office", "spire", "highrise",
    "plane", "hill", "mountain", "range", "cloud"];
  const sprites = {};
  SPRITE_NAMES.forEach(function (name) {
    const im = new Image();
    im.src = "img/sprites/" + name + ".webp";
    sprites[name] = im;
  });

  // 멀리 보이는 다른 도시: 건물 그림 몇 개를 모아서 하나로 그린다 [그림, 가로 위치, 세로 위치, 크기]
  const TOWN_PARTS = [["office", -0.3, -0.1, 0.26], ["spire", 0.02, -0.04, 0.2], ["highrise", 0.28, -0.06, 0.36],
    ["brick", -0.12, 0.1, 0.2], ["stone", 0.18, 0.12, 0.2], ["house", -0.36, 0.14, 0.16]];

  // ===== 물체 종류 =====
  // w: 화면에 그릴 가로 길이(m), size: 삼킬 수 있는지 판단하는 크기(m), n: 개수, r0~r1: 놓이는 거리(m)
  const KINDS = [
    { img: ["man", "woman"], w: [0.85, 0.95], size: 1.7, n: 150, r0: 4, r1: 55, walk: 1.2, person: true },
    { img: ["child"], w: [0.7, 0.8], size: 1.2, n: 36, r0: 3, r1: 45, walk: 2, person: true },
    { img: ["stroller"], w: [1.2, 1.3], size: 1.8, n: 16, r0: 5, r1: 50, walk: 0.9, person: true },
    { img: ["cyclist"], w: [1.4, 1.5], size: 1.9, n: 24, r0: 8, r1: 110, drive: 4, lane: 5.5 },
    { img: ["bench"], w: [1.8, 2], size: 1.6, n: 30, r0: 5, r1: 60 },
    { img: ["lamp"], w: [1, 1.1], size: 2.6, n: 40, r0: 6, r1: 80 },
    { img: ["parasol"], w: [3, 3.4], size: 3, n: 22, r0: 8, r1: 60 },
    { img: ["tree", "blossom"], w: [5, 7.5], size: 5.5, n: 220, r0: 9, r1: 380 },
    { img: ["car_red", "car_white", "taxi"], w: [4.4, 4.8], size: 4.5, n: 220, r0: 15, r1: 600, drive: 12, foot: 0.66 },
    { img: ["truck"], w: [6.2, 6.8], size: 6.5, n: 26, r0: 30, r1: 900, drive: 10, foot: 0.68 },
    { img: ["bus"], w: [10, 11], size: 10, n: 26, r0: 30, r1: 900, drive: 9, foot: 0.66 },
    { img: ["house"], w: [10, 13], size: 11, n: 90, r0: 40, r1: 330, lot: true },
    { img: ["cafe"], w: [14, 18], size: 15, n: 34, r0: 35, r1: 300, lot: true },
    { img: ["brick", "stone"], w: [15, 30], size: 1, n: 210, r0: 80, r1: 800, lot: true, sizeByW: 1 },
    { img: ["office"], w: [26, 42], size: 1, n: 120, r0: 200, r1: 1500, lot: true, sizeByW: 1.5, big: true },
    { img: ["highrise"], w: [50, 85], size: 1, n: 75, r0: 400, r1: 2600, lot: true, sizeByW: 1.1, big: true },
    { img: ["spire"], w: [80, 135], size: 1, n: 42, r0: 600, r1: 3600, lot: true, sizeByW: 2.2, big: true },
    { img: ["plane"], w: [55, 70], size: 60, n: 12, r0: 200, r1: 7000, fly: 140, alt: [250, 700], big: true },
    { img: ["hill"], w: [400, 1100], size: 1, n: 46, r0: 4600, r1: 26000, sizeByW: 0.8, big: true, apart: true },
    { town: true, w: [900, 1700], size: 1, n: 30, r0: 7000, r1: 45000, sizeByW: 0.6, big: true, apart: true },
    { img: ["cloud"], w: [700, 2600], size: 1, n: 26, r0: 2500, r1: 60000, sizeByW: 0.6, fly: 25, alt: [1500, 3000], big: true },
    { img: ["mountain"], w: [1500, 3600], size: 1, n: 30, r0: 9000, r1: 50000, sizeByW: 0.9, big: true, apart: true },
    { img: ["range"], w: [5000, 9500], size: 1, n: 18, r0: 20000, r1: WORLD_R, sizeByW: 0.8, big: true, apart: true }
  ];

  const MILESTONES = [
    { d: 4.5, text: "자동차만큼 커졌습니다. 이제 자동차도 끌려옵니다." },
    { d: 12, text: "집 한 채만 한 크기! 건물이 통째로 뜯겨 올라옵니다." },
    { d: 70, text: "빌딩만큼 커졌습니다. 하늘의 비행기도 조심해야겠네요." },
    { d: 500, text: "도시가 한눈에 들어옵니다. 이제 언덕과 다른 도시까지 삼킵니다." },
    { d: 2500, text: "산맥도 삼킬 수 있는 크기입니다. 지구 표면이 점점 멀어집니다." }
  ];

  let active = false, leaving = false;
  let t = 0;
  let items = [];
  let patches = [];               // 멀리서 보이는 땅 무늬 (숲, 밭, 호수)
  let hx = 0, hy = 0;             // 블랙홀 바로 아래 땅의 위치 (m)
  let r = R_START, rTarget = R_START;
  let landed = false;
  let userZoom = 1;
  let idle = 0;                   // 아무것도 못 삼킨 시간
  let popTimer = 0;
  let milestone = 0;
  let leaveScale = 1;
  const view = { x: 0, y: 0, s: 1, ox: 0, oy: 0 };   // 카메라: 화면 가운데의 세계 좌표, 1m당 픽셀, 화면 밀기
  const pointer = { x: 0, y: 0, active: false };

  // ===== 좌표 변환: 세계 (x, y는 바닥, z는 높이) ↔ 화면 =====
  function proj(x, y, z) {
    return {
      x: centerX + view.ox + (x - view.x) * view.s,
      y: centerY + view.oy + (y - view.y) * view.s * TILT - z * view.s * HGT
    };
  }
  function unproj(sx, sy, z) {
    return {
      x: view.x + (sx - centerX) / view.s,
      y: view.y + (sy - centerY + z * view.s * HGT) / (view.s * TILT)
    };
  }
  function holeFloat() {
    const drop = clamp(1 - (t - (T_LAND - 0.6)) / 0.6, 0, 1) * 40;
    return r * (1.3 + drop) + 0.3;   // 블랙홀은 바닥에서 살짝 떠 있다
  }
  function holeScreenPos() {
    if (leaving) return { x: centerX + hole.x, y: centerY + hole.y, r: hole.r };
    const p = proj(hx, hy, holeFloat());
    return { x: p.x, y: p.y, r: r * view.s };
  }

  // ===== 세계 만들기 =====
  function build() {
    items = [];
    const lots = {};   // 건물이 이미 들어선 칸
    for (const kind of KINDS) {
      for (let i = 0; i < kind.n; i++) {
        const w = rand(kind.w[0], kind.w[1]);
        const it = {
          kind, w,
          img: kind.town ? null : sprites[pick(kind.img)],
          size: kind.sizeByW ? w * kind.sizeByW : kind.size,
          x: 0, y: 0, z: 0, vx: 0, vy: 0,
          pulled: false, vel: 0, wobble: 0, rot: 0, spin: rand(-2, 2), flip: false, seed: rand(0, 100)
        };
        if (!place(it, lots)) continue;
        if (kind.walk) {
          const a = rand(0, 6.28);
          it.vx = Math.cos(a) * kind.walk * rand(0.6, 1.2);
          it.vy = Math.sin(a) * kind.walk * rand(0.3, 0.6);
        }
        if (kind.drive) {
          // 자동차는 가로 도로 위에서 제 차선을 따라 달린다
          // (그림이 옆을 보고 있어서 세로로 달리면 미끄러지듯 떠 보이므로 가로 도로만 쓴다)
          const dir = pick([-1, 1]);
          it.y = Math.round(it.y / ROAD) * ROAD + dir * (kind.lane || 2.4);
          it.vx = dir * kind.drive * rand(0.85, 1.15);
          it.vy = 0;
        }
        if (kind.fly) {
          const a = rand(0, 6.28);
          it.z = rand(kind.alt[0], kind.alt[1]);
          it.vx = Math.cos(a) * kind.fly;
          it.vy = Math.sin(a) * kind.fly;
        }
        it.flip = it.vx > 0;
        items.push(it);
      }
    }

    patches = [];
    const colors = ["#3f6b46", "#4f7a4a", "#2f5a3e", "#6b7a45", "#37607a", "#566f3c"];
    for (let i = 0; i < 150; i++) {
      const a = rand(0, 6.28), d = rand(CITY_R * 0.9, WORLD_R * 1.4);
      patches.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, w: rand(900, 9000), k: rand(0.5, 1), rot: rand(0, 3.14), c: pick(colors) });
    }
  }

  // 물체 하나의 자리를 정한다. 건물은 도로 사이 칸 한가운데, 산은 서로 겹치지 않게
  function place(it, lots) {
    const kind = it.kind;
    for (let tries = 0; tries < 30; tries++) {
      const a = rand(0, 6.28);
      const d = Math.sqrt(rand(kind.r0 * kind.r0, kind.r1 * kind.r1));   // 넓이에 고르게
      let x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (kind.lot) {
        const step = it.w > 45 ? ROAD * 2 : ROAD;
        const cx = Math.floor(x / step), cy = Math.floor(y / step);
        const key = step + ":" + cx + ":" + cy;
        if (lots[key]) continue;
        x = (cx + 0.5) * step;
        y = (cy + 0.5) * step;
        if (Math.hypot(x, y) < 38) continue;   // 처음 떨어지는 광장은 비워 둔다
        lots[key] = true;
        if (step === ROAD) {
          const room = (ROAD - 12 - it.w) / 2;
          if (room > 0) { x += rand(-room, room); y += rand(-room, room); }
        } else {
          lots[ROAD + ":" + cx * 2 + ":" + cy * 2] = true;
        }
      } else if (kind.apart) {
        if (items.some(o => o.kind.apart && Math.hypot(o.x - x, (o.y - y) * 2) < (o.w + it.w) * 0.45)) continue;
      }
      it.x = x;
      it.y = y;
      return true;
    }
    return false;
  }

  // ===== 시작 / 끝 =====
  function start() {
    active = true;
    leaving = false;
    t = 0;
    landed = false;
    userZoom = 1;
    idle = 0;
    milestone = 0;
    hx = hy = 0;
    r = rTarget = R_START;
    view.x = view.y = view.ox = view.oy = 0;
    view.s = width / (R_START * ZOOM_K) * 0.25;
    pointer.active = false;
    build();
    eatenTotals[0] = 0;
    eatenDirty = true;
  }

  function stop() {
    active = false;
    leaving = false;
    items = [];
  }

  // ===== 카메라: 블랙홀을 따라가고, 블랙홀이 커지면 뒤로 물러난다 =====
  function updateCamera(dt) {
    let target = width / (r * ZOOM_K) * userZoom;
    // 처음에는 높은 곳에서 내려다보다가 블랙홀 쪽으로 내려간다
    if (t < T_LAND) target *= lerp(0.25, 1, easeInOut(clamp(t / (T_LAND - 0.4), 0, 1)));
    target = Math.max(target, 1e-6);
    if (!(view.s > 0)) view.s = target;   // 창 크기가 잠깐 0이었던 경우에도 멈추지 않게
    view.s = Math.exp(lerp(Math.log(view.s), Math.log(target), Math.min(1, dt * 2.5)));
    const k = Math.min(1, dt * 3);   // 블랙홀이 빨라진 만큼 카메라도 빨리 따라간다
    view.x += (hx - view.x) * k;
    view.y += (hy - r * 1.2 - view.y) * k;
  }

  // 블랙홀이 마우스를 따라간다
  function moveHole(dt) {
    if (!pointer.active) return;
    const w = unproj(pointer.x, pointer.y, holeFloat());
    const k = Math.min(1, dt * 8);
    let mx = (w.x - hx) * k, my = (w.y - hy) * k;
    const limit = 16 * r * dt;   // 1초에 반지름의 16배 (화면 절반쯤)
    const len = Math.hypot(mx, my);
    if (len > limit) { mx *= limit / len; my *= limit / len; }
    hx += mx;
    hy += my;
    const d = Math.hypot(hx, hy);
    if (d > WORLD_R) { hx *= WORLD_R / d; hy *= WORLD_R / d; }
  }

  // ===== 물체 움직이기: 평소 움직임, 끌려가기, 삼켜지기 =====
  function updateItems(dt) {
    const pullR = r * PULL_K + 2;
    const float = holeFloat();
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const kind = it.kind;
      let dx = hx - it.x, dy = hy - it.y;
      let d = Math.hypot(dx, dy) || 0.001;

      if (!it.pulled) {
        if (it.vx || it.vy) {
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          // 너무 멀리 가면 반대쪽에서 다시 나타난다
          const far = Math.hypot(it.x, it.y);
          if (far > kind.r1 * 1.15) {
            if (kind.drive) it.x = -it.x * 0.98;   // 같은 차선의 반대쪽 끝으로
            else { it.x *= -0.95; it.y *= -0.95; }
          }
        }
        if (!landed) continue;

        // 사람은 블랙홀이 다가오면 반대쪽으로 달아난다
        if (kind.person && d < pullR * 2) {
          it.x -= dx / d * 3.2 * dt;
          it.y -= dy / d * 3.2 * dt;
          it.flip = dx < 0;
        }
        if (d < pullR) {
          if (it.size <= r * EAT_RATIO) it.pulled = true;
          else it.wobble = 1;   // 아직 너무 커서 흔들리기만 한다
        }
      }

      if (it.pulled) {
        // 가까울수록 더 세게 끌려간다
        const acc = G * r * r * r / Math.max(d * d, r * r * 0.25);
        it.vel += acc * dt;
        const step = Math.min(d, it.vel * dt);
        it.x += dx / d * step;
        it.y += dy / d * step;
        it.rot += it.spin * Math.min(it.vel / (r * 10), 3) * dt;
        // 바닥에서 떠오르며 블랙홀 쪽으로
        const near = clamp(1 - (d - step) / pullR, 0, 1);
        it.z = lerp(it.z, float * near, Math.min(1, dt * 4));
        if (d - step < r + it.size * 0.15) {
          eat(it);
          items.splice(i, 1);
          continue;
        }
      }
      it.wobble = Math.max(0, it.wobble - dt * 2);
    }
  }

  function eat(it) {
    // 블랙홀에 비해 큰 것을 삼킬수록 많이 자란다
    rTarget = Math.sqrt(rTarget * rTarget + it.size * it.size * GROW);
    idle = 0;
    eatenTotals[0] += 1;
    eatenDirty = true;
    const large = it.size > r * 1.1;
    hole.flash = Math.max(hole.flash, large ? 1 : 0.3);
    const h = holeScreenPos();
    if (large) {
      addDebris(h, 16);
      thump();
      shake(5);
      addRing(h, 0.6);
    } else if (popTimer <= 0) {
      popTimer = 0.07;
      addDebris(h, 4);
      pop();
    }
  }

  // ===== 매 프레임 =====
  function update(dt, simDt) {
    if (!active || leaving) return;
    t += simDt;
    popTimer -= dt;

    if (!landed && t >= T_LAND) {
      landed = true;
      shake(10);
      addRing(holeScreenPos(), 1);
      thump(1.2);
    }
    if (landed) {
      moveHole(simDt);
      // 한동안 삼킬 것이 없으면 주변 공기와 먼지를 빨아들이며 조금씩 자란다 (막히지 않게)
      idle += simDt;
      if (idle > 6) rTarget *= 1 + 0.06 * simDt;
    }
    updateItems(simDt);
    r += (rTarget - r) * Math.min(1, dt * 3);
    updateCamera(dt);

    // 크기가 한 단계 커질 때마다 알려 준다
    if (milestone < MILESTONES.length && r * 2 >= MILESTONES[milestone].d) {
      narrate(MILESTONES[milestone].text, 3200);
      milestone++;
      hole.flash = 1;
      thump();
      shake(6);
      addRing(holeScreenPos(), 0.8);
    }

    // 충분히 커지면 지구 단계로
    if (r >= R_END) {
      const h = holeScreenPos();
      leaveScale = view.s;
      leaving = true;
      hole.x = h.x - centerX;
      hole.y = h.y - centerY;
      hole.r = h.r;
      startLevelUp();
    }
  }

  // ===== 땅 그리기 =====
  function smooth(a, b, v) { const k = clamp((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); }

  function groundEllipse(x, y, rad, color) {
    const p = proj(x, y, 0);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rad * view.s, rad * view.s * TILT, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 일정한 간격의 도로 (간격이 화면에서 너무 촘촘해지면 서서히 사라진다)
  function drawRoads(step, roadW, color, limit) {
    const alpha = smooth(7, 22, step * view.s);
    if (alpha <= 0) return;
    const a = unproj(0, 0, 0), b = unproj(width, height, 0);
    const x0 = Math.max(a.x - view.ox / view.s, -limit), x1 = Math.min(b.x - view.ox / view.s, limit);
    const y0 = Math.max(a.y - view.oy / (view.s * TILT), -limit), y1 = Math.min(b.y - view.oy / (view.s * TILT), limit);
    if (x0 >= x1 || y0 >= y1) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (let k = Math.ceil(y0 / step); k * step <= y1; k++) {
      const p = proj(x0, k * step - roadW / 2, 0), q = proj(x1, k * step + roadW / 2, 0);
      ctx.fillRect(p.x, p.y, q.x - p.x, q.y - p.y);
    }
    for (let k = Math.ceil(x0 / step); k * step <= x1; k++) {
      const p = proj(k * step - roadW / 2, y0, 0), q = proj(k * step + roadW / 2, y1, 0);
      ctx.fillRect(p.x, p.y, q.x - p.x, q.y - p.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    // 해 질 녘의 들판
    ctx.fillStyle = "#3b5f45";
    ctx.fillRect(0, 0, width, height);
    for (const p of patches) {
      const wpx = p.w * view.s;
      if (wpx < 4) continue;
      const s = proj(p.x, p.y, 0);
      if (s.x < -wpx || s.x > width + wpx || s.y < -wpx || s.y > height + wpx) continue;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, wpx, wpx * p.k * TILT, p.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    // 도시: 교외 → 시가지 → 처음 떨어진 광장
    groundEllipse(0, 0, CITY_R * 1.12, "#5d6a58");
    groundEllipse(0, 0, CITY_R, "#8a7f86");
    drawRoads(ROAD * 10, 26, "#4b4654", CITY_R);
    drawRoads(ROAD, 9, "#4b4654", CITY_R);
    drawRoads(ROAD, 0.25, "#e9dfc8", CITY_R);   // 중앙선
    groundEllipse(0, 0, 34, "#c9ad94");
    groundEllipse(0, 0, 30, "#d9bfa3");
    // 광장 바닥의 돌 타일 (광장 모양대로 잘라서 그린다)
    ctx.save();
    const c = proj(0, 0, 0);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 30 * view.s, 30 * view.s * TILT, 0, 0, Math.PI * 2);
    ctx.clip();
    drawRoads(2.5, 0.12, "rgba(140, 105, 80, 0.55)", 30);
    ctx.restore();
    // 저녁 햇빛이 한쪽에서 비치는 느낌
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, "rgba(255, 170, 90, 0.16)");
    g.addColorStop(1, "rgba(40, 20, 90, 0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  // ===== 물체 그리기 =====
  // foot: 그림 위에서부터 몇 % 지점이 땅에 닿는 자리인지 (사람·나무는 맨 아래, 자동차는 차체 바닥 한가운데)
  function drawSprite(im, wpx, foot) {
    if (!im.complete || !im.naturalWidth) return;
    const hpx = wpx * im.naturalHeight / im.naturalWidth;
    ctx.drawImage(im, -wpx / 2, -hpx * (foot || 0.95), wpx, hpx);
  }

  function drawItem(it, h) {
    const wpx = it.w * view.s;
    const p = proj(it.x, it.y, it.z);
    const kind = it.kind;

    // 바닥 그림자 (움직이는 것과 하늘에 떠 있는 것)
    if (!kind.lot && !kind.apart && !kind.town) {
      const sp = it.z > 0 ? proj(it.x, it.y, 0) : p;
      ctx.fillStyle = "rgba(10, 0, 30, 0.22)";
      ctx.beginPath();
      const sw = wpx * (kind.foot ? 0.5 : 0.42), sh = sw * TILT * (kind.foot ? 0.55 : 0.7);
      ctx.ellipse(sp.x, sp.y + (kind.foot ? sh * 0.25 : 0), sw, sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 블랙홀에 가까워질수록 그쪽으로 길게 늘어난다 (스파게티화)
    const dx = h.x - p.x, dy = h.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const near = it.pulled ? clamp(1 - (dist - h.r) / (h.r * 3 + 25), 0, 1) : 0;
    const ang = Math.atan2(dy, dx);
    const hpx = it.img ? wpx * it.img.naturalHeight / (it.img.naturalWidth || 1) : wpx * 0.6;

    ctx.save();
    ctx.translate(p.x, p.y);
    if (it.pulled) {
      // 가운데를 축으로 돌면서 빨려 들어간다
      ctx.translate(0, -hpx * 0.45);
      ctx.rotate(ang);
      ctx.scale((1 + near * 2) * (1 - near * 0.5), (1 - near * 0.5) * (1 - near * 0.5));
      ctx.rotate(-ang + it.rot);
      ctx.translate(0, hpx * 0.45);
      ctx.globalAlpha = 1 - near * 0.3;
    } else {
      if (it.wobble > 0) ctx.rotate(Math.sin(state.timer * 40 + it.seed) * 0.05 * it.wobble);
      // 걷는 사람은 살짝 통통 튄다
      if (kind.person) ctx.translate(0, -Math.abs(Math.sin(state.timer * 8 + it.seed)) * wpx * 0.07);
    }
    if (it.flip) ctx.scale(-1, 1);

    if (kind.town) {
      for (const part of TOWN_PARTS) {
        ctx.save();
        ctx.translate(part[1] * wpx, part[2] * wpx * TILT);
        drawSprite(sprites[part[0]], part[3] * wpx);
        ctx.restore();
      }
    } else {
      drawSprite(it.img, wpx, kind.foot);
    }
    ctx.restore();
  }

  // 화면에 보이는 것만, 멀리 있는 것부터 그리고 블랙홀도 그 사이에 끼워 넣는다
  function drawScene(showHole) {
    drawGround();
    const h = holeScreenPos();
    const visible = [];
    for (const it of items) {
      const wpx = it.w * view.s;
      if (wpx < 2.5) continue;
      const p = proj(it.x, it.y, it.z);
      const m = wpx * 1.6 + 30;
      if (p.x < -m || p.x > width + m || p.y < -30 || p.y > height + m * 2) continue;
      visible.push(it);
    }
    visible.sort((a, b) => a.y - b.y);

    if (showHole) {
      // 땅에 드리운 블랙홀 그림자와 끌어당기는 범위
      const g0 = proj(hx, hy, 0);
      const shR = r * view.s * 2.2;
      const sg = ctx.createRadialGradient(g0.x, g0.y, 0, g0.x, g0.y, shR);
      sg.addColorStop(0, "rgba(15, 0, 30, 0.55)");
      sg.addColorStop(1, "rgba(15, 0, 30, 0)");
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(g0.x, g0.y, shR, shR * TILT, 0, 0, Math.PI * 2);
      ctx.fill();
      if (landed) {
        const pullR = (r * PULL_K + 2) * view.s;
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -state.timer * 20;
        ctx.strokeStyle = "rgba(255, 215, 170, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(g0.x, g0.y, pullR, pullR * TILT, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    let holeDrawn = !showHole;
    for (const it of visible) {
      if (!holeDrawn && it.y > hy && !it.pulled) {
        drawHole(h);
        holeDrawn = true;
      }
      drawItem(it, h);
    }
    if (!holeDrawn) drawHole(h);
  }

  function draw() {
    view.ox = view.oy = 0;
    drawScene(true);
  }

  // 지구 단계로 넘어가는 동안: 땅이 빠르게 멀어진다 (k: 0 → 1). 블랙홀은 simulation.js가 그린다
  function drawLeaving(k) {
    view.s = leaveScale * Math.exp(-7 * k);
    view.x = hx;
    view.y = hy;
    view.ox = hole.x;
    view.oy = hole.y + r * 1.6 * view.s * HGT;
    drawScene(false);
  }

  // ===== 조작 =====
  function onPointer(e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }
  canvas.addEventListener("pointermove", onPointer);
  canvas.addEventListener("pointerdown", onPointer);

  function canZoom() { return active && !leaving && state.mode === "play"; }
  function zoomBy(f) { userZoom = clamp(userZoom * f, 0.3, 3); }
  canvas.addEventListener("wheel", function (e) {
    if (!canZoom()) return;
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  window.addEventListener("keydown", function (e) {
    if (!canZoom()) return;
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    if (e.key === "-" || e.key === "_") zoomBy(0.8);
  });

  return {
    start,
    stop,
    update,
    draw,
    drawLeaving,
    holeScreen: holeScreenPos,
    // 크기가 수천 배로 커지므로 진행도는 로그로 잰다
    progress: () => clamp(Math.log(r / R_START) / Math.log(R_END / R_START), 0, 1),
    radiusMeters: () => r
  };
})();
