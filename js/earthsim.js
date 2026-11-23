// ============================================================
//  지구 단계 (3단계)
//
//  블랙홀이 지구 속으로 가라앉아 지구를 안쪽부터 삼키는 과정을 보여준다.
//  지구는 위도·경도로 만든 대륙을 둥근 구 위에 투영해서 그리므로, 자전하면 대륙이 실제로 돌아간다.
//  마우스 휠로 확대·축소하면 지구와 달 사이가 얼마나 먼지 실제 축척으로 볼 수 있다.
//
//  simulation.js의 전역 변수와 함수(ctx, width, state, drawHole ...)를 함께 쓴다.
// ============================================================

const earthSim = (function () {
  const D2R = Math.PI / 180;
  const EARTH_KM = 6371;          // 지구 반지름 (km)
  const MOON_DIST = 60.3;         // 달까지 거리 = 지구 반지름의 60.3배
  const MOON_R = 0.273;           // 달 반지름 = 지구 반지름의 0.273배
  const LIGHT = { x: -0.85, y: -0.35, z: 0.4 };   // 태양빛이 오는 방향 (왼쪽 위 앞)
  (function normalize(v) { const l = Math.hypot(v.x, v.y, v.z); v.x /= l; v.y /= l; v.z /= l; })(LIGHT);

  // 단계별 시간 (초)
  const T_SINK = 5, T_HEAT = 12, T_COLLAPSE = 20, T_DONE = 26;

  let globe = null;      // 대륙, 구름, 도시 불빛 (위도·경도)
  let active = false;
  let t = 0;             // 진행 시간
  let rot = 0;           // 자전 각도 (도)
  let moonAngle = 0;
  let zoom = 1;          // 화면에서 지구 반지름 1이 몇 px인지
  let manualZoom = false;
  let particles = [];    // 무너지며 떨어져 나간 조각
  let cracks = [];
  let said = {};
  const panel = document.getElementById("earthPanel");


  // ===== 지구 모양 만들기 =====
  // 중심(위도, 경도) 주변에 울퉁불퉁한 덩어리 하나
  function blob(lat0, lon0, size, n) {
    const pts = [];
    const bumps = [rand(0, 6), rand(0, 6), rand(0, 6)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = size * (1 + 0.25 * Math.sin(a * 3 + bumps[0]) + 0.15 * Math.sin(a * 5 + bumps[1]) + 0.1 * Math.sin(a * 7 + bumps[2]));
      pts.push({ lat: lat0 + Math.sin(a) * r * 0.8, lon: lon0 + Math.cos(a) * r / Math.max(0.3, Math.cos(lat0 * D2R)) });
    }
    return pts;
  }

  function prepare() {
    if (globe) return;
    globe = { land: [], ice: [], clouds: [], lights: [] };
    // 대략적인 대륙 위치 (위도, 경도, 크기)
    const LAND = [
      [50, 90, 32], [30, 100, 22], [45, 40, 18], [55, 15, 14], [8, 20, 24], [-15, 25, 20],
      [45, -100, 26], [60, -110, 18], [20, -100, 10], [-10, -60, 20], [-30, -65, 14],
      [-25, 135, 14], [65, -45, 10], [35, 128, 5], [36, 138, 5]
    ];
    LAND.forEach(([la, lo, s]) => {
      globe.land.push({ pts: blob(la, lo, s, 28), color: la > 50 || la < -40 ? "#7f9a62" : Math.abs(la) < 25 && s > 15 ? "#b49a5e" : "#5f8f45" });
      for (let i = 0; i < s * 1.5; i++) globe.lights.push({ lat: la + rand(-s, s) * 0.6, lon: lo + rand(-s, s) * 0.8, b: rand(0.4, 1) });
    });
    globe.ice.push({ pts: blob(-82, 0, 12, 36).map(p => ({ lat: Math.min(p.lat, -70), lon: p.lon * 30 })) });
    globe.ice.push({ pts: blob(84, 0, 7, 36).map(p => ({ lat: Math.max(p.lat, 76), lon: p.lon * 40 })) });
    for (let i = 0; i < 26; i++) globe.clouds.push({ lat: rand(-65, 65), lon: rand(-180, 180), w: rand(8, 22), h: rand(2, 5) });
  }

  // 위도·경도 → 구 위의 점 (지구 반지름 1). z > 0 이면 보이는 쪽
  function project(lat, lon, spin) {
    const la = lat * D2R, lo = (lon - spin) * D2R;
    return { x: Math.cos(la) * Math.sin(lo), y: -Math.sin(la), z: Math.cos(la) * Math.cos(lo) };
  }


  // ===== 지구 그리기 (전환 장면에서도 쓴다) =====
  // heat: 안쪽에서 달아오르는 정도 0~1
  function drawGlobe(cx, cy, R, spin, heat = 0) {
    prepare();
    if (R < 0.5) return;

    // 대기의 푸른 빛
    const air = ctx.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.12);
    air.addColorStop(0, "rgba(110, 170, 255, 0.55)");
    air.addColorStop(1, "rgba(110, 170, 255, 0)");
    ctx.fillStyle = air;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // 바다 (빛 받는 쪽이 밝게)
    const sea = ctx.createRadialGradient(cx + LIGHT.x * R * 0.4, cy + LIGHT.y * R * 0.4, R * 0.1, cx, cy, R);
    sea.addColorStop(0, "#3d7fc4");
    sea.addColorStop(1, "#0d2d5a");
    ctx.fillStyle = sea;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 대륙과 얼음: 구 위에 투영, 뒤쪽 점은 가장자리로 붙인다
    const drawShape = (pts, color) => {
      const proj = pts.map(p => project(p.lat, p.lon, spin));
      if (proj.every(p => p.z < 0)) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      proj.forEach((p, i) => {
        let x = p.x, y = p.y;
        if (p.z < 0) { const l = Math.hypot(x, y) || 1; x /= l; y /= l; }
        if (i === 0) ctx.moveTo(cx + x * R, cy + y * R); else ctx.lineTo(cx + x * R, cy + y * R);
      });
      ctx.closePath();
      ctx.fill();
    };
    globe.land.forEach(l => drawShape(l.pts, l.color));
    globe.ice.forEach(l => drawShape(l.pts, "#eef4f8"));

    // 구름 (지구보다 조금 빨리 돈다)
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    for (const c of globe.clouds) {
      const p = project(c.lat, c.lon, spin * 1.15);
      if (p.z < 0.05) continue;
      ctx.beginPath();
      ctx.ellipse(cx + p.x * R, cy + p.y * R, c.w * D2R * R * p.z, c.h * D2R * R, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 밤 쪽 그림자
    const lx = cx + LIGHT.x * R, ly = cy + LIGHT.y * R;
    const night = ctx.createLinearGradient(lx, ly, cx - LIGHT.x * R, cy - LIGHT.y * R);
    night.addColorStop(0, "rgba(0, 5, 25, 0)");
    night.addColorStop(0.45, "rgba(0, 5, 25, 0)");
    night.addColorStop(0.62, "rgba(0, 5, 25, 0.7)");
    night.addColorStop(1, "rgba(0, 5, 25, 0.92)");
    ctx.fillStyle = night;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // 밤 쪽 도시 불빛
    if (R > 40) {
      for (const c of globe.lights) {
        const p = project(c.lat, c.lon, spin);
        if (p.z < 0.1) continue;
        const dark = -(p.x * LIGHT.x + p.y * LIGHT.y + p.z * LIGHT.z);
        if (dark < 0.15) continue;
        ctx.fillStyle = `rgba(255, 210, 120, ${Math.min(1, dark * 1.5) * c.b * (1 - heat)})`;
        ctx.fillRect(cx + p.x * R, cy + p.y * R, 1.5, 1.5);
      }
    }

    // 안쪽에서 달아오르는 열과 갈라진 틈
    if (heat > 0) {
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      glow.addColorStop(0, `rgba(255, 220, 140, ${heat * 0.9})`);
      glow.addColorStop(0.5, `rgba(255, 110, 30, ${heat * 0.55})`);
      glow.addColorStop(1, `rgba(120, 20, 0, ${heat * 0.35})`);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      ctx.strokeStyle = `rgba(255, 200, 110, ${Math.min(1, heat * 1.4)})`;
      ctx.lineWidth = Math.max(1, R * 0.008);
      ctx.shadowColor = "rgba(255, 120, 30, 0.9)";
      ctx.shadowBlur = 8;
      for (const c of cracks) {
        if (c.start > heat) continue;
        ctx.beginPath();
        c.pts.forEach((p, i) => {
          const q = project(p.lat, p.lon, spin);
          if (q.z < 0) return;
          if (i === 0) ctx.moveTo(cx + q.x * R, cy + q.y * R); else ctx.lineTo(cx + q.x * R, cy + q.y * R);
        });
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // 가장자리의 얇은 대기층
    ctx.strokeStyle = "rgba(160, 205, 255, 0.55)";
    ctx.lineWidth = Math.max(1, R * 0.012);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawMoon(x, y, r) {
    const g = ctx.createRadialGradient(x + LIGHT.x * r * 0.5, y + LIGHT.y * r * 0.5, r * 0.1, x, y, r);
    g.addColorStop(0, "#e6e3dc");
    g.addColorStop(1, "#7d7a74");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > 6) {
      ctx.fillStyle = "rgba(90, 88, 84, 0.45)";
      [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1]].forEach(c => {
        ctx.beginPath();
        ctx.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    const shade = ctx.createLinearGradient(x + LIGHT.x * r, y + LIGHT.y * r, x - LIGHT.x * r, y - LIGHT.y * r);
    shade.addColorStop(0.5, "rgba(0, 0, 10, 0)");
    shade.addColorStop(1, "rgba(0, 0, 10, 0.85)");
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }


  // ===== 시작 / 끝 =====
  function start() {
    prepare();
    active = true;
    t = 0;
    rot = 120;
    moonAngle = rand(0, Math.PI * 2);
    zoom = closeZoom();
    manualZoom = false;
    particles = [];
    said = {};
    // 지구 중심(블랙홀)에서 사방으로 퍼지는 갈라진 틈
    cracks = [];
    for (let i = 0; i < 18; i++) {
      let lat = rand(-60, 60), lon = rand(-180, 180);
      const pts = [{ lat, lon }];
      for (let k = 0; k < 8; k++) { lat += rand(-6, 6); lon += rand(-9, 9); pts.push({ lat, lon }); }
      cracks.push({ pts, start: rand(0, 0.7) });
    }
    eatenTotals[1] = 0;
    eatenDirty = true;
    panel.classList.remove("hidden");
    document.getElementById("earthNext").disabled = true;
  }

  function stop() {
    active = false;
    panel.classList.add("hidden");
    document.getElementById("earthNext").classList.remove("pulse");
  }

  function closeZoom() { return unit * 0.33; }
  function farZoom() { return unit * 0.42 / MOON_DIST; }

  function setZoom(z) {
    zoom = clamp(z, farZoom() * 0.6, closeZoom() * 2.5);
  }


  // ===== 매 프레임 =====
  function update(dt, simDt) {
    if (!active) return;
    t += simDt;
    rot += simDt * (6 + (t > T_HEAT ? (t - T_HEAT) * 25 : 0));   // 무너질수록 빨리 돈다
    moonAngle += simDt * (Math.PI * 2 / 40);                         // 달은 40초에 한 바퀴 (실제 27일)

    // 카메라: 지구가 사라진 뒤에는 저절로 줌아웃해서 달 궤도를 보여준다
    if (!manualZoom) {
      const target = t > T_COLLAPSE + 1 ? farZoom() * 1.2 : closeZoom();
      zoom = Math.exp(lerp(Math.log(zoom), Math.log(target), Math.min(1, dt * 0.8)));
    }

    // 무너지는 동안 가장자리에서 조각이 떨어져 나와 블랙홀 주위를 돈다
    if (t > T_HEAT && t < T_COLLAPSE) {
      const s = earthScale();
      for (let i = 0; i < 6; i++) {
        const a = rand(0, Math.PI * 2);
        particles.push({ a, r: s * rand(0.9, 1.05), life: 1, hue: rand(15, 45) });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.a += simDt * (1.5 + 1.2 / Math.max(p.r, 0.05));
      p.r *= 1 - simDt * 0.35;
      p.life -= simDt * 0.25;
      if (p.life <= 0 || p.r < 0.02) particles.splice(i, 1);
    }

    // 해설
    const say = (key, at, text, hold) => { if (t >= at && !said[key]) { said[key] = true; narrate(text, hold || 3200); } };
    say("sink", 0.6, "블랙홀이 땅속으로, 지구 중심을 향해 가라앉습니다.");
    say("heat", T_SINK, "지구 중심에서 블랙홀이 물질을 빨아들이며 엄청난 열이 나기 시작합니다.");
    say("crack", T_SINK + 4, "뜨거워진 지구에 금이 가고 있습니다.");
    say("fall", T_HEAT, "지구가 안쪽으로 무너져 내립니다.");
    if (t >= T_COLLAPSE && !said.gone) {
      said.gone = true;
      hole.flash = 1;
      shake(14);
      addRing(holeScreen(), 2);
      thump(2);
      eatenTotals[1] = 1;
      eatenDirty = true;
      narrate("지구 전체를 삼킨 블랙홀의 지름은 고작 1.8 cm. 구슬만 한 크기예요.", 3600);
    }
    say("moon", T_COLLAPSE + 4.5, "지구는 사라졌지만 질량은 그대로라서, 달은 같은 궤도를 계속 돕니다.", 4000);
    if (t >= T_DONE && !said.next) {
      said.next = true;
      const btn = document.getElementById("earthNext");
      btn.disabled = false;
      btn.classList.add("pulse");
      narrate("「다음 단계 →」를 눌러 태양계로 나아가세요.", 4000);
    }
  }

  // 지구 크기 비율 (무너질 때 1 → 0)
  function earthScale() {
    if (t < T_HEAT) return 1;
    return 1 - easeInOut(clamp((t - T_HEAT) / (T_COLLAPSE - T_HEAT), 0, 1));
  }

  function heatLevel() {
    return clamp((t - T_SINK) / (T_HEAT - T_SINK), 0, 1);
  }

  // 축척 막대: 화면에서 적당한 길이가 되는 깔끔한 km 값
  function drawScaleBar() {
    const kmPerPx = EARTH_KM / zoom;
    const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000];
    let km = nice[0];
    for (const n of nice) if (n / kmPerPx < Math.min(220, width * 0.3)) km = n;
    const len = km / kmPerPx;
    const x = 24, y = 150;   // 왼쪽 위, 정보 패널 아래
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = '12px "Noto Sans KR", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(km.toLocaleString() + " km", x, y - 9);
  }

  function draw() {
    drawSpace(1);
    const R = zoom * earthScale();
    const mx = Math.cos(moonAngle) * MOON_DIST * zoom;
    const my = Math.sin(moonAngle) * MOON_DIST * zoom * 0.3;
    const mr = Math.max(2, MOON_R * zoom);
    const moonBehind = Math.sin(moonAngle) < 0;

    if (moonBehind) drawMoon(centerX + mx, centerY + my, mr);

    // 블랙홀 원반 뒤쪽 조각
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      if (Math.sin(p.a) >= 0) continue;
      ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
      ctx.fillRect(centerX + Math.cos(p.a) * p.r * zoom, centerY + Math.sin(p.a) * p.r * zoom * 0.25, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";

    if (R > 0.5) drawGlobe(centerX, centerY, R, rot, heatLevel());

    // 가라앉는 블랙홀: 서울 근처 표면에서 빛나는 점이 중심으로
    if (t < T_SINK + 1) {
      const p = project(37, 127, rot);
      const k = 1 - clamp(t / T_SINK, 0, 1);
      if (p.z > 0 || k < 0.3) {
        const x = centerX + p.x * R * k, y = centerY + p.y * R * k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, `rgba(255, 220, 170, ${0.9 * (k + 0.1)})`);
        g.addColorStop(1, "rgba(255, 120, 40, 0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 지구가 다 무너진 뒤의 블랙홀
    if (t >= T_COLLAPSE - 1) drawHole(holeScreenPos());

    // 블랙홀 원반 앞쪽 조각
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      if (Math.sin(p.a) < 0) continue;
      ctx.fillStyle = `hsla(${p.hue}, 100%, 65%, ${p.life})`;
      ctx.fillRect(centerX + Math.cos(p.a) * p.r * zoom, centerY + Math.sin(p.a) * p.r * zoom * 0.25, 2, 2);
    }
    ctx.globalCompositeOperation = "source-over";

    if (!moonBehind) drawMoon(centerX + mx, centerY + my, mr);

    // 달 이름과 달 궤도 (멀리서 볼 때)
    if (zoom < closeZoom() * 0.2) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, MOON_DIST * zoom, MOON_DIST * zoom * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = '12px "Noto Sans KR", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("달", centerX + mx, centerY + my + mr + 14);
      if (R > 0.5) ctx.fillText("지구", centerX, centerY + Math.max(R, 4) + 16);
    }

    drawScaleBar();
  }


  // ===== 조작: 확대·축소 =====
  canvas.addEventListener("wheel", function (e) {
    if (!active || state.mode !== "play") return;
    e.preventDefault();
    manualZoom = true;
    setZoom(zoom * Math.exp(-e.deltaY * 0.0015));
    if (zoom < closeZoom() * 0.1 && !said.scale) {
      said.scale = true;
      narrate("지구와 달 사이에는 지구가 30개나 들어갈 만큼의 빈 공간이 있어요.", 3600);
    }
  }, { passive: false });

  document.getElementById("earthZoomOut").addEventListener("click", function () {
    manualZoom = true;
    setZoom(zoom / 1.6);
  });
  document.getElementById("earthZoomIn").addEventListener("click", function () {
    manualZoom = true;
    setZoom(zoom * 1.6);
  });
  document.getElementById("earthNext").addEventListener("click", function () {
    if (!active || t < T_DONE) return;
    const h = holeScreenPos();
    hole.x = h.x - centerX;
    hole.y = h.y - centerY;
    hole.r = h.r;
    stop();
    startLevelUp();
  });


  // ===== 바깥(simulation.js)에서 쓰는 기능 =====
  function holeScreenPos() {
    return { x: centerX, y: centerY, r: Math.max(5 * unit / 800, 0.05 * zoom) };
  }

  return {
    prepare,
    drawGlobe,
    start,
    stop,
    update,
    draw,
    holeScreen: holeScreenPos,
    progress: () => clamp(t / T_DONE, 0, 1),
    // 사건의 지평선은 삼킨 질량에 비례해서 커지고, 지구를 다 삼키면 약 9 mm
    radiusMeters: () => 0.00887 * clamp((t - T_SINK) / (T_COLLAPSE - T_SINK), 0.02, 1)
  };
})();
