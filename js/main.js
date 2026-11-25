import {
  RANK,
  BIKES,
  ROAD_LIMITS,
  geo,
  initGeoFromCity,
  profile,
  state,
  getActiveBike,
  loadProfile,
  saveProfile,
  toast,
  $,
} from "./state.js?v=3";
import { setSoundEnabled, updateEngineSound, playSuccess, stopSpeech } from "./audio.js?v=3";
import { initWorld3D } from "./world3d.js?v=3";
import { initTablet } from "./tablet.js?v=3";
import { createDriving } from "./driving.js?v=3";
import { initPerf } from "./perf.js?v=3";
import { initRewards } from "./rewards.js?v=3";
import { initParty } from "./party.js?v=3";

function compassDir(heading) {
  // heading = 0 là +Z (Nam), PI là -Z (Bắc), +PI/2 là +X (Đông)
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const deg = (Math.atan2(fx, -fz) * 180) / Math.PI;
  const norm = (deg + 360) % 360;
  const dirs = ["Bắc", "Đông Bắc", "Đông", "Đông Nam", "Nam", "Tây Nam", "Tây", "Tây Bắc"];
  return dirs[Math.round(norm / 45) % 8];
}

async function boot() {
  const citiesRes = await fetch("./data/cities.json");
  const cities = await citiesRes.json();
  const params = new URLSearchParams(location.search);
  const reqId = params.get("city");
  const cityInfo = cities.find((c) => c.id === reqId) || cities[0];

  const sel = $("citySel");
  cities.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    if (c.id === cityInfo.id) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    location.search = "?city=" + encodeURIComponent(sel.value);
  };

  $("loader").textContent = "Đang tải bản đồ " + cityInfo.name + "…";
  const res = await fetch(cityInfo.file);
  const data = await res.json();
  const { D, SEEDS = [], meta = {} } = data;
  const R0 = D.roads;

  initGeoFromCity(D, { id: cityInfo.id, name: cityInfo.name, ...meta });
  loadProfile();

  document.title = "Không Biết Đường – " + geo.cityName;
  $("tabTitle").textContent = "Bản đồ " + geo.cityName;

  const findRoadMid = (q) => {
    const matches = R0.filter((x) => x.n && x.n.toLowerCase().includes(q.toLowerCase()) && x.p.length >= 4);
    if (!matches.length) return null;
    // Chọn đoạn dài nhất để điểm neo (nhất là các cây cầu) nằm đúng giữa thân cầu
    let bestR = matches[0];
    let bestSpan = 0;
    for (const r of matches) {
      const span = Math.hypot(r.p[r.p.length - 2] - r.p[0], r.p[r.p.length - 1] - r.p[1]);
      if (span > bestSpan) {
        bestSpan = span;
        bestR = r;
      }
    }
    if (bestR.p.length === 4) {
      return [(bestR.p[0] + bestR.p[2]) / 2, (bestR.p[1] + bestR.p[3]) / 2];
    }
    const m = Math.floor(bestR.p.length / 4) * 2;
    return [bestR.p[m], bestR.p[m + 1]];
  };

  const WATER = meta.water || [];
  const waterWorld = WATER.map((w) => {
    const pts = [];
    for (let j = 0; j + 1 < w.p.length; j += 2) {
      pts.push([w.p[j] * geo.UX, -w.p[j + 1] * geo.UZ]);
    }
    return pts;
  });

  const LANDMARKS = (meta.landmarks || []).map((d) => {
    const p = d.roadQuery ? findRoadMid(d.roadQuery) : null;
    const px = p ? p[0] : d.fx ?? geo.CX0;
    const py = p ? p[1] : d.fy ?? geo.CY0;
    return { name: d.name, type: d.type || "market", px, py, x: px * geo.UX, z: -py * geo.UZ };
  });

  let REAL_STATIONS = meta.stations || [];
  if (!REAL_STATIONS.length) {
    const major = R0.filter((r) => r.n && r.c <= 3 && r.p.length >= 4);
    const step = Math.max(1, Math.floor(major.length / 8));
    for (let i = 0; i < major.length && REAL_STATIONS.length < 8; i += step) {
      const r = major[i];
      REAL_STATIONS.push({ label: "Cây xăng · " + r.n, street: r.n, gx: r.p[0], gy: r.p[1] });
    }
  }

  const world = initWorld3D({ R0, LANDMARKS, REAL_STATIONS, WATER });
  const initBike = getActiveBike();
  world.setBikeModel(initBike.id, initBike.color);

  let drivingRef = null;
  let tabletRef = null;
  const rewards = initRewards({
    getStreets: () => (tabletRef ? tabletRef.STS : []),
    onFocusStreet: (name) => {
      if (tabletRef) tabletRef.focusStreet(name);
    },
  });
  const tablet = initTablet({
    R0,
    SEEDS,
    LANDMARKS,
    WATER,
    stations: world.stations,
    getSpeed: () => (drivingRef ? drivingRef.getSpeed() : 0),
    setSpeed: (v) => {
      if (drivingRef) drivingRef.setSpeed(v);
    },
    getMode: () => (drivingRef ? drivingRef.getMode() : "drive"),
    getHeading: () => (drivingRef ? drivingRef.getHeading() : 0),
    rewards,
  });
  tabletRef = tablet;

  // ---- Garage & Settings ----
  const garageEl = $("garage");
  const settingsEl = $("settings");
  let highQuality = true;

  function renderGarage() {
    $("garMoney").textContent = state.money.toLocaleString("vi-VN") + "đ";
    const list = $("garList");
    list.innerHTML = "";
    BIKES.forEach((b) => {
      const owned = profile.ownedBikes.includes(b.id);
      const active = profile.activeBike === b.id;
      const card = document.createElement("div");
      card.className = "bike-card" + (active ? " active" : "");
      const hex = "#" + b.color.toString(16).padStart(6, "0");
      const hwTag = b.allowHighway ? "🛣️ Cao tốc OK" : "⛔ Cấm cao tốc";
      const seatsTag = "💺 " + (1 + (b.maxPassengers || 1)) + " chỗ";
      card.innerHTML =
        '<h4><span class="bike-dot" style="background:' +
        hex +
        '"></span>' +
        b.name +
        "</h4>" +
        "<p>" +
        b.desc +
        "</p>" +
        '<div class="bike-stats">Tốc độ: ' +
        Math.round(b.boostSpd * 3.6) +
        " km/h · " +
        hwTag +
        " · " +
        seatsTag +
        "</div>";
      const btn = document.createElement("button");
      if (active) {
        btn.textContent = "✓ Đang chọn";
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = "Đổi sang xe này";
        btn.onclick = () => {
          profile.activeBike = b.id;
          world.setBikeModel(b.id, b.color);
          if (drivingRef) drivingRef.ensureLegalRoadAfterBikeChange();
          saveProfile();
          renderGarage();
          toast("Đã đổi sang " + b.name, "var(--ok)");
        };
      } else {
        btn.textContent = "Mua · " + b.price.toLocaleString("vi-VN") + "đ";
        btn.onclick = () => {
          if (state.money < b.price) {
            toast("Chưa đủ tiền mua " + b.name + "!", "var(--bad)");
            return;
          }
          state.money -= b.price;
          profile.ownedBikes.push(b.id);
          profile.activeBike = b.id;
          world.setBikeModel(b.id, b.color);
          if (drivingRef) drivingRef.ensureLegalRoadAfterBikeChange();
          saveProfile();
          playSuccess(state.soundOn);
          renderGarage();
          toast("Đã mua & lên " + b.name + "!", "var(--ok)");
        };
      }
      card.appendChild(btn);
      list.appendChild(card);
    });
  }

  function toggleGarage() {
    if (garageEl.classList.contains("open")) {
      garageEl.classList.remove("open");
      return;
    }
    if (tablet.isTabOpen()) tablet.toggleTablet();
    settingsEl.classList.remove("open");
    $("partyModal").classList.remove("open");
    renderGarage();
    garageEl.classList.add("open");
  }

  function toggleSettings() {
    if (settingsEl.classList.contains("open")) {
      settingsEl.classList.remove("open");
      return;
    }
    if (tablet.isTabOpen()) tablet.toggleTablet();
    garageEl.classList.remove("open");
    $("partyModal").classList.remove("open");
    settingsEl.classList.add("open");
  }

  const partyEl = $("partyModal");
  let partyRef = null;
  function toggleParty() {
    if (partyEl.classList.contains("open")) {
      partyEl.classList.remove("open");
      return;
    }
    if (tablet.isTabOpen()) tablet.toggleTablet();
    garageEl.classList.remove("open");
    settingsEl.classList.remove("open");
    if (partyRef) partyRef.renderPartyUI();
    partyEl.classList.add("open");
  }

  function toggleRewards() {
    if (tablet.isTabOpen()) tablet.toggleTablet();
    garageEl.classList.remove("open");
    settingsEl.classList.remove("open");
    partyEl.classList.remove("open");
    rewards.toggle();
  }

  $("garBtn").onclick = toggleGarage;
  $("gx").onclick = () => garageEl.classList.remove("open");
  $("setBtn").onclick = toggleSettings;
  $("sx").onclick = () => settingsEl.classList.remove("open");
  $("partyBtn").onclick = toggleParty;
  $("px").onclick = () => partyEl.classList.remove("open");
  $("rewBtn").onclick = toggleRewards;

  $("qualBtn").onclick = () => {
    highQuality = !highQuality;
    world.setQuality(highQuality);
    $("qualBtn").textContent = highQuality ? "✨ Cao" : "⚡ Thấp (Nhẹ)";
    toast("Đồ họa: " + (highQuality ? "Cao (Bóng đổ)" : "Thấp (Tối ưu FPS)"), "var(--ok)");
  };

  const keys = {};
  drivingRef = createDriving({
    world,
    keys,
    rewards,
    isModalOpen: () =>
      tablet.isTabOpen() ||
      garageEl.classList.contains("open") ||
      settingsEl.classList.contains("open") ||
      partyEl.classList.contains("open") ||
      rewards.isOpen(),
  });

  partyRef = initParty({
    world,
    R0,
    LANDMARKS,
    getSelfState: () => ({
      x: world.me.position.x,
      z: world.me.position.z,
      heading: drivingRef.getHeading(),
      speed: drivingRef.getSpeed(),
      mode: drivingRef.getMode(),
    }),
    onReceiveFuel: (amt) => {
      const before = state.fuel;
      state.fuel = Math.min(100, state.fuel + amt);
      saveProfile();
      return state.fuel - before;
    },
    onEnterPassenger: () => drivingRef.enterPassengerMode(),
    onUpdatePassenger: (host) => drivingRef.updatePassengerPose(host),
  });

  $("re").onclick = drivingRef.reposition;
  $("fuelBtn").onclick = drivingRef.refuel;
  $("shareFuelBtn").onclick = partyRef.shareFuel;
  $("rideMateBtn").onclick = partyRef.rideWithNearestMate;
  $("dismountBtn").onclick = drivingRef.toggleDismount;
  $("hornBtn").onclick = drivingRef.honk;
  $("hintBtn").onclick = () => {
    state.hudHint = !state.hudHint;
    $("hintBtn").textContent = (state.hudHint ? "👁️ BẬT" : "👁️ TẮT") + " (H)";
  };
  $("mmBtn").onclick = () => {
    state.minimapOn = !state.minimapOn;
    $("mmBtn").textContent = (state.minimapOn ? "🗺️ BẬT" : "🗺️ TẮT") + " (N)";
    $("minimapWrap")?.classList.toggle("hide", !state.minimapOn);
  };
  $("sndBtn").onclick = () => {
    state.soundOn = !state.soundOn;
    setSoundEnabled(state.soundOn);
    $("sndBtn").textContent = (state.soundOn ? "🔊 BẬT" : "🔇 TẮT") + " (M)";
  };
  $("ttsBtn").onclick = () => {
    state.ttsOn = !state.ttsOn;
    if (!state.ttsOn) stopSpeech();
    $("ttsBtn").textContent = state.ttsOn ? "🗣️ BẬT" : "🔇 TẮT";
    toast("Giọng đọc chat: " + (state.ttsOn ? "BẬT" : "TẮT"), "var(--ok)");
  };

  const chatBar = $("chatBar");
  const chatInp = $("chatInp");
  function toggleChat(forceOpen = null) {
    const open = forceOpen === null ? !chatBar.classList.contains("open") : !!forceOpen;
    chatBar.classList.toggle("open", open);
    if (open) {
      setTimeout(() => chatInp.focus(), 20);
    } else {
      chatInp.blur();
    }
  }
  function submitChat() {
    const txt = chatInp.value.trim();
    if (txt) partyRef.sendChat(txt);
    chatInp.value = "";
    toggleChat(false);
  }
  $("chatBtn").onclick = () => toggleChat();
  $("chatSendBtn").onclick = submitChat;
  chatInp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitChat();
    } else if (e.key === "Escape") {
      e.preventDefault();
      toggleChat(false);
    }
  });
  document.querySelectorAll(".qchat").forEach((b) => {
    b.onclick = () => {
      partyRef.sendChat(b.dataset.msg || "");
      toggleChat(false);
    };
  });

  addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      toggleChat(true);
      return;
    }
    const k = e.key.toLowerCase();
    keys[k] = 1;
    if (e.key === "Escape") toggleSettings();
    if (k === "t") {
      garageEl.classList.remove("open");
      settingsEl.classList.remove("open");
      partyEl.classList.remove("open");
      if (rewards.isOpen()) rewards.toggle();
      tablet.toggleTablet();
      if (tablet.isTabOpen()) {
        const snap = partyRef.getMapSnapshot();
        tablet.updatePartyMap(snap.members, snap.waypoint, world.me.position);
      }
    }
    if (k === "b") toggleRewards();
    if (k === "p") toggleParty();
    if (k === "v") drivingRef.toggleDismount();
    if (k === "c") partyRef.rideWithNearestMate();
    if (k === "e") partyRef.shareFuel();
    if (k === "g") toggleGarage();
    if (k === "r") drivingRef.reposition();
    if (k === "f") drivingRef.refuel();
    if (k === "h") $("hintBtn").click();
    if (k === "n") $("mmBtn").click();
    if (k === "m") $("sndBtn").click();
    if (e.code === "Space") {
      e.preventDefault();
      drivingRef.honk();
    }
  });
  addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = 0));
  document.querySelectorAll("#pad button").forEach((b) => {
    const k = b.dataset.k;
    b.onpointerdown = () => (keys[k] = 1);
    b.onpointerup = b.onpointerleave = () => (keys[k] = 0);
  });

  function onResize() {
    world.renderer.setSize(innerWidth, innerHeight, false);
    world.cam.aspect = innerWidth / innerHeight;
    world.cam.updateProjectionMatrix();
  }
  addEventListener("resize", onResize);
  onResize();

  $("loader").classList.add("hide");

  const mmCanvas = $("minimap");
  const mmCtx = mmCanvas ? mmCanvas.getContext("2d") : null;
  let mmAcc = 0;

  function drawMinimap(mx, mz, heading, locCtx, partySnap) {
    if (!mmCtx || !state.minimapOn) return;
    const W = mmCanvas.width;
    const H = mmCanvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radiusM = 210;
    const scale = W / (2 * radiusM);

    mmCtx.fillStyle = "#0b1218";
    mmCtx.fillRect(0, 0, W, H);

    // Sông Hàn & Biển trên minimap
    if (waterWorld.length) {
      mmCtx.fillStyle = "#103954";
      for (const pts of waterWorld) {
        if (pts.length < 3) continue;
        mmCtx.beginPath();
        mmCtx.moveTo(cx + (pts[0][0] - mx) * scale, cy + (pts[0][1] - mz) * scale);
        for (let i = 1; i < pts.length; i++) {
          mmCtx.lineTo(cx + (pts[i][0] - mx) * scale, cy + (pts[i][1] - mz) * scale);
        }
        mmCtx.closePath();
        mmCtx.fill();
      }
    }

    const chX = Math.floor(mx / world.CH);
    const chZ = Math.floor(mz / world.CH);
    const drawn = new Set();
    const bucket = { bg: [], main: [], trunk: [], hw: [], learned: [], cur: [] };

    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const L = world.cell.get(chX + a + "," + (chZ + b));
        if (!L) continue;
        for (const s of L) {
          if (drawn.has(s)) continue;
          drawn.add(s);
          const r = R0[s[5]];
          const x1 = cx + (s[0] - mx) * scale;
          const y1 = cy + (s[1] - mz) * scale;
          const x2 = cx + (s[2] - mx) * scale;
          const y2 = cy + (s[3] - mz) * scale;
          if (Math.max(x1, x2) < -20 || Math.min(x1, x2) > W + 20 || Math.max(y1, y2) < -20 || Math.min(y1, y2) > H + 20) {
            continue;
          }
          const seg2 = [x1, y1, x2, y2];
          if (r.n && locCtx.street === r.n && state.hudHint) bucket.cur.push(seg2);
          else if (r.n && state.learned.has(r.n)) bucket.learned.push(seg2);
          else if (s[6] === 0) bucket.hw.push(seg2);
          else if (s[6] === 1) bucket.trunk.push(seg2);
          else if (s[6] <= 3) bucket.main.push(seg2);
          else bucket.bg.push(seg2);
        }
      }
    }

    const strokeSegs = (arr, color, width, dash = []) => {
      if (!arr.length) return;
      mmCtx.strokeStyle = color;
      mmCtx.lineWidth = width;
      mmCtx.setLineDash(dash);
      mmCtx.beginPath();
      for (const [x1, y1, x2, y2] of arr) {
        mmCtx.moveTo(x1, y1);
        mmCtx.lineTo(x2, y2);
      }
      mmCtx.stroke();
    };
    mmCtx.lineCap = "round";
    strokeSegs(bucket.bg, "#223242", 1.8);
    strokeSegs(bucket.main, "#556d85", 3.4);
    strokeSegs(bucket.trunk, "#d49c2a", 4.2);
    strokeSegs(bucket.hw, "#d94f63", 4.2, [6, 5]);
    strokeSegs(bucket.learned, "#28a873", 4.2);
    strokeSegs(bucket.cur, "#4fc3f7", 5.2);
    mmCtx.setLineDash([]);

    // Gas stations
    for (const st of world.stations) {
      const sx = cx + (st.x - mx) * scale;
      const sy = cy + (st.z - mz) * scale;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
      mmCtx.fillStyle = "#3ddc97";
      mmCtx.strokeStyle = "#08120e";
      mmCtx.lineWidth = 2;
      mmCtx.beginPath();
      mmCtx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.stroke();
    }

    // Landmarks (on-map icon + label, or edge pointer for nearest)
    mmCtx.font = "700 16px 'Be Vietnam Pro',system-ui,sans-serif";
    mmCtx.textAlign = "center";
    for (const lm of LANDMARKS) {
      const lx = cx + (lm.x - mx) * scale;
      const ly = cy + (lm.z - mz) * scale;
      if (lx >= 12 && lx <= W - 12 && ly >= 14 && ly <= H - 14) {
        mmCtx.fillStyle = "#ffb020";
        mmCtx.strokeStyle = "#0b1218";
        mmCtx.lineWidth = 3;
        mmCtx.beginPath();
        mmCtx.arc(lx, ly, 5.2, 0, Math.PI * 2);
        mmCtx.fill();
        mmCtx.stroke();
        mmCtx.fillStyle = "#ffd680";
        mmCtx.strokeText("★ " + lm.name, lx, ly - 9);
        mmCtx.fillText("★ " + lm.name, lx, ly - 9);
      }
    }

    // Party waypoint & mates
    if (partySnap.waypoint) {
      const wx = cx + (partySnap.waypoint.x - mx) * scale;
      const wy = cy + (partySnap.waypoint.z - mz) * scale;
      const ang = Math.atan2(wy - cy, wx - cx);
      const distPx = Math.hypot(wx - cx, wy - cy);
      const px = distPx > cx - 14 ? cx + Math.cos(ang) * (cx - 14) : wx;
      const py = distPx > cy - 14 ? cy + Math.sin(ang) * (cy - 14) : wy;
      mmCtx.fillStyle = "#3ddc97";
      mmCtx.strokeStyle = "#ffffff";
      mmCtx.lineWidth = 2;
      mmCtx.beginPath();
      mmCtx.arc(px, py, 5.5, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.stroke();
    }
    for (const m of partySnap.members) {
      const rx = cx + (m.x - mx) * scale;
      const ry = cy + (m.z - mz) * scale;
      if (rx < 0 || rx > W || ry < 0 || ry > H) continue;
      mmCtx.fillStyle = "#4fc3f7";
      mmCtx.beginPath();
      mmCtx.arc(rx, ry, 4, 0, Math.PI * 2);
      mmCtx.fill();
    }

    // Player heading cone & arrow
    mmCtx.save();
    mmCtx.translate(cx, cy);
    mmCtx.rotate(-heading);
    mmCtx.fillStyle = "rgba(79, 195, 247, 0.2)";
    mmCtx.beginPath();
    mmCtx.moveTo(0, 0);
    mmCtx.lineTo(-18, 34);
    mmCtx.lineTo(18, 34);
    mmCtx.closePath();
    mmCtx.fill();

    mmCtx.fillStyle = "#ffffff";
    mmCtx.strokeStyle = "#1e88e5";
    mmCtx.lineWidth = 2.5;
    mmCtx.beginPath();
    mmCtx.moveTo(0, 11);
    mmCtx.lineTo(8, -8);
    mmCtx.lineTo(0, -4);
    mmCtx.lineTo(-8, -8);
    mmCtx.closePath();
    mmCtx.fill();
    mmCtx.stroke();
    mmCtx.restore();

    const mmInfo = $("mmInfo");
    if (mmInfo && locCtx.nearLandmark) {
      mmInfo.textContent = "★ " + locCtx.nearLandmark.name + " · " + locCtx.nearLandmark.dist + "m";
    }
  }

  const perf = initPerf({ world, R0, autoBench: new URLSearchParams(location.search).get("bench") === "1" });
  window.__perf = perf;
  window.__world = world;
  let last = performance.now();
  let fc = 0;
  let ft = 0;
  let near = "—";
  let lastLocCtx = { street: "—", roadClass: 2, crossStreet: null, crossDist: 0, nearLandmark: null, nearStation: null };

  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    drivingRef.update(dt);
    partyRef.update(dt);
    const spd = drivingRef.getSpeed();
    const curMode = drivingRef.getMode();
    const bike = getActiveBike();
    updateEngineSound(state.soundOn, spd, curMode !== "drive" || state.fuel <= 0.05, bike);

    const _r0 = performance.now();
    world.renderer.render(world.scene, world.cam);
    perf.frame(now, performance.now() - _r0);

    mmAcc += dt;
    if (mmAcc >= 0.04) {
      mmAcc = 0;
      drawMinimap(world.me.position.x, world.me.position.z, drivingRef.getHeading(), lastLocCtx, partyRef.getMapSnapshot());
    }

    fc++;
    ft += dt;
    if (ft > 0.3) {
      const fps = Math.round(fc / ft);
      fc = 0;
      ft = 0;
      const mx = world.me.position.x;
      const mz = world.me.position.z;
      lastLocCtx = world.getLocationContext(mx, mz);
      near = lastLocCtx.street;
      if (near !== "—") {
        tablet.checkFieldQuest(near);
        tablet.unlockStreetByDrive(near);
      }

      if (tablet.isTabOpen()) {
        const snap = partyRef.getMapSnapshot();
        tablet.updatePartyMap(snap.members, snap.waypoint, world.me.position);
      }

      $("compass").textContent = "🧭 " + compassDir(drivingRef.getHeading());

      const dBtn = $("dismountBtn");
      if (dBtn) {
        dBtn.textContent =
          curMode === "drive"
            ? "🚶 Xuống xe (V)"
            : curMode === "passenger"
            ? "🚶 Xuống xe bạn (V)"
            : bike.vehicleType === "car"
            ? "🚗 Lên ô tô (V)"
            : "🏍️ Lên xe (V)";
      }

      const nearSt = world.stations.some((st) => Math.hypot(st.x - mx, st.z - mz) < 15);
      const cost = Math.max(1000, Math.round(((100 - state.fuel) * 250) / 1000) * 1000);
      const fb = $("fuelBtn");
      fb.classList.toggle("show", nearSt && state.fuel < 99);
      if (nearSt && state.fuel < 99) fb.textContent = "⛽ Đổ đầy bình (-" + cost.toLocaleString("vi-VN") + "đ) (F)";

      const rLim = ROAD_LIMITS[drivingRef.getRoadClass()] || ROAD_LIMITS[2];
      const modeLabel = curMode === "walk" ? "Đi bộ" : curMode === "passenger" ? "Ngồi ké xe bạn" : bike.name;
      const streetTxt = state.hudHint ? (near !== "—" ? near : rLim.label) : "<i>Đọc biển báo ngã tư</i>";

      const locStreetEl = $("locStreet");
      const locSubEl = $("locSub");
      if (locStreetEl) {
        locStreetEl.textContent = state.hudHint
          ? "📍 " + (near !== "—" ? "Đường " + near : "Khu vực " + rLim.label)
          : "📍 " + rLim.label + " (Đang ẩn tên đường)";
      }
      if (locSubEl) {
        const parts = [];
        if (state.hudHint && lastLocCtx.crossStreet) {
          parts.push("🔀 Gần ngã rẽ <b>" + lastLocCtx.crossStreet + "</b>");
        }
        if (state.fuel < 35 && lastLocCtx.nearStation) {
          parts.push("⛽ Cây xăng: <b>" + lastLocCtx.nearStation.dist + "m " + lastLocCtx.nearStation.dir + "</b>");
        } else if (lastLocCtx.nearLandmark) {
          parts.push(
            "★ Gần <b>" +
              lastLocCtx.nearLandmark.name +
              "</b> (" +
              lastLocCtx.nearLandmark.dist +
              "m " +
              lastLocCtx.nearLandmark.dir +
              ")"
          );
        }
        locSubEl.innerHTML = parts.join(" · ") || rLim.label;
      }

      $("statTxt").innerHTML =
        "Hạng <b style='color:var(--acc)'>" +
        RANK[Math.min(Math.floor(state.xp / 100), 3)] +
        "</b> · <b>" +
        state.money.toLocaleString("vi-VN") +
        "đ</b> · 🔥" +
        rewards.getStreak() +
        "d · ✅" +
        rewards.getDailyDoneCount() +
        "/3<br>Thuộc đường: <b>" +
        state.learned.size +
        "/" +
        tablet.STS.length +
        "</b> · " +
        modeLabel +
        "<br>" +
        rLim.label +
        ": <b>" +
        streetTxt +
        "</b> · <b>" +
        fps +
        " FPS</b>";
      saveProfile();
    }

    const kmh = Math.round(Math.abs(spd) * 3.6);
    const rLim = ROAD_LIMITS[drivingRef.getRoadClass()] || ROAD_LIMITS[2];
    const maxKmh = (bike.allowHighway ? rLim.carMaxKmh : rLim.maxKmh) || 60;
    $("limitSign").textContent = curMode === "walk" ? "🚶" : maxKmh;
    $("limitSign").classList.toggle("over", curMode === "drive" && kmh > maxKmh + 3);

    $("xp").style.width = (state.xp % 100) + "%";
    $("xpLbl").textContent = (state.xp % 100) + "%";
    $("spdVal").textContent = kmh;
    const fp = Math.max(0, Math.min(100, Math.round(state.fuel)));
    const fuelColor = fp > 35 ? "var(--ok)" : fp > 15 ? "var(--acc)" : "var(--bad)";
    $("fuelArc").style.strokeDashoffset = (326.73 * (1 - fp / 100)).toFixed(1);
    $("fuelArc").style.stroke = fuelColor;
    $("fuelPct").textContent = "⛽ " + fp + "%";
    $("fuelPct").style.color = fuelColor;
  })(last);
}

boot();
