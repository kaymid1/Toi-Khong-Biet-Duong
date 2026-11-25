export const RANK = ["Mù đường", "Biết đường", "Thổ địa", "Xe ôm Pro"];
export const WD = [14, 12, 10, 8, 6, 4.5, 4, 3];

export const $ = (id) => document.getElementById(id);

export const BIKES = [
  {
    id: "cub",
    name: "Xe số phổ thông",
    desc: "Bền bỉ, tiết kiệm xăng, dễ luồn lách.",
    price: 0,
    color: 0xe0392d,
    maxSpd: 21,
    boostSpd: 36,
    accel: 24,
    fuelMult: 0.85,
    engineBase: 50,
    enginePitch: 2.3,
    hornFreq: [520, 520],
    hornType: "square",
  },
  {
    id: "scooter",
    name: "Xe tay ga",
    desc: "Chạy êm, tăng tốc mượt, cốp rộng.",
    price: 45000,
    color: 0xf4f6f8,
    maxSpd: 24,
    boostSpd: 42,
    accel: 28,
    fuelMult: 1.0,
    engineBase: 44,
    enginePitch: 2.0,
    hornFreq: [440, 554],
    hornType: "triangle",
  },
  {
    id: "manual",
    name: "Xe côn tay",
    desc: "Bốc, ôm cua gắt, tiếng pô thể thao.",
    price: 110000,
    color: 0x1e88e5,
    maxSpd: 27,
    boostSpd: 48,
    accel: 34,
    fuelMult: 1.15,
    engineBase: 58,
    enginePitch: 2.8,
    hornFreq: [415, 495],
    hornType: "sawtooth",
  },
  {
    id: "pkl",
    name: "Mô tô PKL",
    desc: "Tốc độ cực đại, pô trầm uy lực, hao xăng.",
    price: 250000,
    color: 0xffb020,
    maxSpd: 32,
    boostSpd: 58,
    accel: 42,
    fuelMult: 1.45,
    engineBase: 38,
    enginePitch: 3.1,
    hornFreq: [310, 390],
    hornType: "sawtooth",
  },
];

export const geo = {
  cityId: "default",
  cityName: "Thành phố",
  UX: 1.07,
  UZ: 1.1054,
  CX0: 9000,
  CY0: 9000,
  spawnX: 9000,
  spawnY: 9000,
  minX: 0,
  maxY: 18000,
  span: 18000,
};

export function initGeoFromCity(D, meta = {}) {
  const [minLon, minLat, maxLon, maxLat] = D.bbox;
  const unit = D.unit || 1e-5;
  const midLat = (minLat + maxLat) / 2;
  geo.UX = 111320 * Math.cos((midLat * Math.PI) / 180) * unit;
  geo.UZ = 110540 * unit;

  const spanX = (maxLon - minLon) / unit;
  const spanY = (maxLat - minLat) / unit;
  geo.CX0 = spanX / 2;
  geo.CY0 = spanY / 2;

  const sp = meta.spawn || [geo.CX0, geo.CY0];
  geo.spawnX = sp[0];
  geo.spawnY = sp[1];
  geo.cityId = meta.id || "default";
  geo.cityName = meta.name || "Thành phố";

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const r of D.roads) {
    for (let j = 0; j < r.p.length; j += 2) {
      const x = r.p[j], y = r.p[j + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const w = maxX - minX || spanX;
  const h = maxY - minY || spanY;
  const side = Math.max(w, h) * 1.06;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  geo.minX = cx - side / 2;
  geo.maxY = cy + side / 2;
  geo.span = side;
}

// ---- Profile chuẩn hóa sẵn sàng cho Cloud Sync (Google Auth / Supabase) ----
const PROFILE_KEY = "muduong_profile_v1";

export const profile = {
  userId: "guest",
  updatedAt: 0,
  xp: 0,
  money: 50000,
  ownedBikes: ["cub"],
  activeBike: "cub",
  cities: {},
};

export const state = {
  get xp() { return profile.xp; },
  set xp(v) { profile.xp = v; },
  get money() { return profile.money; },
  set money(v) { profile.money = v; },
  fuel: 100,
  combo: 0,
  hudHint: false,
  soundOn: false,
  learned: new Set(),
};

export function getActiveBike() {
  return BIKES.find((b) => b.id === profile.activeBike) || BIKES[0];
}

export function loadProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (raw) {
      profile.userId = raw.userId || "guest";
      profile.updatedAt = raw.updatedAt || 0;
      profile.xp = raw.xp || 0;
      profile.money = raw.money ?? 50000;
      profile.ownedBikes = Array.isArray(raw.ownedBikes) && raw.ownedBikes.length ? raw.ownedBikes : ["cub"];
      profile.activeBike = raw.activeBike || "cub";
      profile.cities = raw.cities || {};
    }
  } catch (e) {}

  // Di trú dữ liệu cũ nếu có
  try {
    const legacy = JSON.parse(localStorage.getItem("muduong_v1_" + geo.cityId) || "null");
    if (legacy && !profile.cities[geo.cityId]) {
      profile.xp = Math.max(profile.xp, legacy.xp || 0);
      profile.money = Math.max(profile.money, legacy.money ?? 50000);
      profile.cities[geo.cityId] = { fuel: legacy.fuel ?? 100, learned: legacy.learned || [] };
    }
  } catch (e) {}

  const cData = profile.cities[geo.cityId] || { fuel: 100, learned: [] };
  state.fuel = cData.fuel ?? 100;
  state.learned = new Set(cData.learned || []);
  state.combo = 0;
}

export function saveProfile() {
  profile.updatedAt = Date.now();
  profile.cities[geo.cityId] = {
    fuel: +state.fuel.toFixed(1),
    learned: [...state.learned],
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {}
}

export function resetCityProgress() {
  state.fuel = 100;
  state.combo = 0;
  state.learned.clear();
  saveProfile();
}

export function toast(text, color) {
  const e = $("toast");
  e.textContent = text;
  e.style.color = color;
  e.style.opacity = 1;
  clearTimeout(e._tm);
  e._tm = setTimeout(() => (e.style.opacity = 0), 2100);
}
