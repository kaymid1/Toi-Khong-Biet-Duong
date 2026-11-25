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
} from "./state.js";
import { setSoundEnabled, updateEngineSound, playSuccess, stopSpeech } from "./audio.js";
import { initWorld3D, dseg } from "./world3d.js";
import { initTablet } from "./tablet.js";
import { createDriving } from "./driving.js";
import { initParty } from "./party.js";

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
    const r = R0.find((x) => x.n && x.n.toLowerCase().includes(q.toLowerCase()));
    if (!r) return null;
    const m = Math.floor(r.p.length / 4) * 2;
    return [r.p[m], r.p[m + 1]];
  };

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

  const world = initWorld3D({ R0, LANDMARKS, REAL_STATIONS });
  const initBike = getActiveBike();
  world.setBikeModel(initBike.id, initBike.color);

  let drivingRef = null;
  const tablet = initTablet({
    R0,
    SEEDS,
    LANDMARKS,
    stations: world.stations,
    getSpeed: () => (drivingRef ? drivingRef.getSpeed() : 0),
    setSpeed: (v) => {
      if (drivingRef) drivingRef.setSpeed(v);
    },
    getMode: () => (drivingRef ? drivingRef.getMode() : "drive"),
  });

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

  $("garBtn").onclick = toggleGarage;
  $("gx").onclick = () => garageEl.classList.remove("open");
  $("setBtn").onclick = toggleSettings;
  $("sx").onclick = () => settingsEl.classList.remove("open");
  $("partyBtn").onclick = toggleParty;
  $("px").onclick = () => partyEl.classList.remove("open");

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
    isModalOpen: () =>
      tablet.isTabOpen() ||
      garageEl.classList.contains("open") ||
      settingsEl.classList.contains("open") ||
      partyEl.classList.contains("open"),
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
      tablet.toggleTablet();
      if (tablet.isTabOpen()) {
        const snap = partyRef.getMapSnapshot();
        tablet.updatePartyMap(snap.members, snap.waypoint, world.me.position);
      }
    }
    if (k === "p") toggleParty();
    if (k === "v") drivingRef.toggleDismount();
    if (k === "c") partyRef.rideWithNearestMate();
    if (k === "e") partyRef.shareFuel();
    if (k === "g") toggleGarage();
    if (k === "r") drivingRef.reposition();
    if (k === "f") drivingRef.refuel();
    if (k === "h") $("hintBtn").click();
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

  let last = performance.now();
  let fc = 0;
  let ft = 0;
  let near = "—";

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

    world.renderer.render(world.scene, world.cam);

    fc++;
    ft += dt;
    if (ft > 0.3) {
      const fps = Math.round(fc / ft);
      fc = 0;
      ft = 0;
      const mx = world.me.position.x;
      const mz = world.me.position.z;
      const L = world.cell.get(Math.floor(mx / world.CH) + "," + Math.floor(mz / world.CH)) || [];
      let bd = 30;
      near = "—";
      for (const s of L) {
        const r = R0[s[5]];
        if (!r.n) continue;
        const d = dseg(mx, mz, s);
        if (d < bd) {
          bd = d;
          near = r.n;
        }
      }
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

      const nearSt = world.stations.some((st) => Math.hypot(st.x - mx, st.z - mz) < 11);
      const cost = Math.max(1000, Math.round(((100 - state.fuel) * 250) / 1000) * 1000);
      const fb = $("fuelBtn");
      fb.classList.toggle("show", nearSt && state.fuel < 99);
      if (nearSt && state.fuel < 99) fb.textContent = "⛽ Đổ đầy bình (-" + cost.toLocaleString("vi-VN") + "đ) (F)";

      const rLim = ROAD_LIMITS[drivingRef.getRoadClass()] || ROAD_LIMITS[2];
      const modeLabel = curMode === "walk" ? "Đi bộ" : curMode === "passenger" ? "Ngồi ké xe bạn" : bike.name;
      const streetTxt = state.hudHint ? near : "<i>Đọc biển báo ngã tư</i>";
      $("statTxt").innerHTML =
        "Hạng <b style='color:var(--acc)'>" +
        RANK[Math.min(Math.floor(state.xp / 100), 3)] +
        "</b> · <b>" +
        state.money.toLocaleString("vi-VN") +
        "đ</b><br>Thuộc đường: <b>" +
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
