import {
  RANK,
  BIKES,
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
import { setSoundEnabled, updateEngineSound, playSuccess } from "./audio.js";
import { initWorld3D, dseg } from "./world3d.js";
import { initTablet } from "./tablet.js";
import { createDriving } from "./driving.js";

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
  world.setBikeColor(getActiveBike().color);

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
  });

  // ---- Garage ----
  const garageEl = $("garage");
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
        " km/h · Hao xăng: x" +
        b.fuelMult +
        "</div>";
      const btn = document.createElement("button");
      if (active) {
        btn.textContent = "✓ Đang chạy";
        btn.disabled = true;
      } else if (owned) {
        btn.textContent = "Chọn xe này";
        btn.onclick = () => {
          profile.activeBike = b.id;
          world.setBikeColor(b.color);
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
          world.setBikeColor(b.color);
          saveProfile();
          playSuccess(state.soundOn);
          renderGarage();
          toast("Đã mua & lên xe " + b.name + "!", "var(--ok)");
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
    renderGarage();
    garageEl.classList.add("open");
  }
  $("garBtn").onclick = toggleGarage;
  $("gx").onclick = () => garageEl.classList.remove("open");

  const keys = {};
  drivingRef = createDriving({
    world,
    keys,
    isModalOpen: () => tablet.isTabOpen() || garageEl.classList.contains("open"),
  });

  $("re").onclick = drivingRef.reposition;
  $("fuelBtn").onclick = drivingRef.refuel;
  $("hornBtn").onclick = drivingRef.honk;
  $("hintBtn").onclick = () => {
    state.hudHint = !state.hudHint;
    $("hintBtn").textContent = "👁️ Gợi ý HUD: " + (state.hudHint ? "BẬT" : "TẮT") + " (H)";
  };
  $("sndBtn").onclick = () => {
    state.soundOn = !state.soundOn;
    setSoundEnabled(state.soundOn);
    $("sndBtn").textContent = (state.soundOn ? "🔊 Âm thanh: BẬT" : "🔇 Âm thanh: TẮT") + " (M)";
  };

  addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = 1;
    if (k === "t") {
      if (garageEl.classList.contains("open")) garageEl.classList.remove("open");
      tablet.toggleTablet();
    }
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
    const spd = drivingRef.getSpeed();
    const bike = getActiveBike();
    updateEngineSound(state.soundOn, spd, state.fuel <= 0.05, bike);

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

      $("compass").textContent = "🧭 " + compassDir(drivingRef.getHeading());

      const nearSt = world.stations.some((st) => Math.hypot(st.x - mx, st.z - mz) < 11);
      const cost = Math.max(1000, Math.round(((100 - state.fuel) * 250) / 1000) * 1000);
      const fb = $("fuelBtn");
      fb.classList.toggle("show", nearSt && state.fuel < 99);
      if (nearSt && state.fuel < 99) fb.textContent = "⛽ Đổ đầy bình (-" + cost.toLocaleString("vi-VN") + "đ) (F)";

      const kmh = Math.round(Math.abs(spd) * 3.6);
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
        "</b> · <b>" +
        kmh +
        " km/h</b> (" +
        bike.name +
        ")<br>Đường: <b>" +
        streetTxt +
        "</b> · <b>" +
        fps +
        " FPS</b>";
      saveProfile();
    }

    $("xp").style.width = (state.xp % 100) + "%";
    $("xpLbl").textContent = (state.xp % 100) + "%";
    const fp = Math.round(state.fuel);
    $("fuelBar").style.width = fp + "%";
    $("fuelLbl").textContent = fp + "%";
    $("fuelBar").style.background = fp > 35 ? "var(--ok)" : fp > 15 ? "var(--acc)" : "var(--bad)";
  })(last);
}

boot();
