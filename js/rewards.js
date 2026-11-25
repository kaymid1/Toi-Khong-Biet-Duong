import { profile, state, saveProfile, toast, $ } from "./state.js";
import { playSuccess } from "./audio.js";

export const ACHIEVEMENTS = [
  { id: "first_street", icon: "🌱", name: "Bước đầu xuống phố", desc: "Thuộc 1 tuyến đường đầu tiên", rewardXp: 20, rewardMoney: 10000, check: () => state.learned.size >= 1 },
  { id: "streets_10", icon: "🧭", name: "Thổ địa tập sự", desc: "Thuộc 10 tuyến đường", rewardXp: 50, rewardMoney: 25000, check: () => state.learned.size >= 10 },
  { id: "streets_30", icon: "🗺️", name: "Thuộc lòng ngã tư", desc: "Thuộc 30 tuyến đường", rewardXp: 120, rewardMoney: 60000, check: () => state.learned.size >= 30 },
  { id: "streets_75", icon: "👑", name: "Bản đồ sống", desc: "Thuộc 75 tuyến đường", rewardXp: 250, rewardMoney: 150000, check: () => state.learned.size >= 75 },
  { id: "combo_3", icon: "🔥", name: "Chuỗi chuẩn xác", desc: "Đạt combo 3 lần liên tiếp", rewardXp: 30, rewardMoney: 15000, check: () => profile.stats.maxCombo >= 3 },
  { id: "combo_5", icon: "⚡", name: "Không lạc nhịp", desc: "Đạt combo 5 lần liên tiếp", rewardXp: 80, rewardMoney: 40000, check: () => profile.stats.maxCombo >= 5 },
  { id: "field_3", icon: "📍", name: "Phượt thủ thực địa", desc: "Hoàn thành 3 nhiệm vụ check-in thực địa", rewardXp: 60, rewardMoney: 30000, check: () => profile.stats.fieldDone >= 3 },
  { id: "streak_3", icon: "📅", name: "Chăm chỉ 3 ngày", desc: "Duy trì chuỗi học 3 ngày liên tiếp", rewardXp: 75, rewardMoney: 40000, check: () => profile.streak.count >= 3 },
  { id: "km_10", icon: "🏍️", name: "Bánh xe bền bỉ", desc: "Lái xe tổng cộng 10 km", rewardXp: 50, rewardMoney: 25000, check: () => profile.stats.totalKm >= 10 },
  { id: "refuel_3", icon: "⛽", name: "Khách quen cây xăng", desc: "Đổ xăng 3 lần tại cây xăng", rewardXp: 25, rewardMoney: 15000, check: () => profile.stats.refuels >= 3 },
];

const DAILY_POOL = [
  { id: "learn_3", type: "learn", target: 3, rewardXp: 40, rewardMoney: 20000, label: "Thuộc thêm 3 tuyến đường" },
  { id: "quest_3", type: "quest", target: 3, rewardXp: 45, rewardMoney: 25000, label: "Hoàn thành 3 nhiệm vụ Tablet" },
  { id: "field_1", type: "field", target: 1, rewardXp: 50, rewardMoney: 30000, label: "Check-in 1 nhiệm vụ thực địa" },
  { id: "drive_2", type: "km", target: 2, rewardXp: 35, rewardMoney: 18000, label: "Lái xe khám phá 2 km" },
  { id: "combo_3", type: "combo", target: 3, rewardXp: 40, rewardMoney: 20000, label: "Đạt chuỗi combo 3" },
];

function localDayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(a, b) {
  if (!a || !b) return 999;
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

export function initRewards({ getStreets, onFocusStreet }) {
  const modal = $("rewardsModal");
  const bodyEl = $("rewBody");
  const banner = $("achBanner");
  let activeTab = "daily"; // "daily" | "notebook"
  let nbFilter = "all"; // "all" | "learned" | "review"
  let nbQuery = "";
  const bannerQueue = [];
  let bannerShowing = false;

  function showNextBanner() {
    if (bannerShowing || !bannerQueue.length || !banner) return;
    bannerShowing = true;
    const item = bannerQueue.shift();
    banner.innerHTML = `<span class="ach-ico">${item.icon}</span><div><b>${item.title}</b><small>${item.sub}</small></div>`;
    banner.classList.add("show");
    setTimeout(() => {
      banner.classList.remove("show");
      setTimeout(() => {
        bannerShowing = false;
        showNextBanner();
      }, 300);
    }, 3200);
  }

  function pushBanner(icon, title, sub) {
    bannerQueue.push({ icon, title, sub });
    showNextBanner();
  }

  function ensureDaily() {
    const today = localDayStr();
    if (profile.daily.day === today && Array.isArray(profile.daily.tasks) && profile.daily.tasks.length) {
      return;
    }
    // Chọn 3 nhiệm vụ ngày ổn định theo ngày
    const seed = today.split("-").reduce((a, b) => a + Number(b), 0);
    const picks = [];
    const pool = [...DAILY_POOL];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = (seed + i * 2) % pool.length;
      const tpl = pool.splice(idx, 1)[0];
      picks.push({ ...tpl, progress: 0, done: false });
    }
    profile.daily = { day: today, tasks: picks };
    saveProfile();
  }

  function touchStreak() {
    const today = localDayStr();
    if (profile.streak.lastDay === today) return;
    const diff = dayDiff(profile.streak.lastDay, today);
    profile.streak.count = diff === 1 ? profile.streak.count + 1 : 1;
    profile.streak.lastDay = today;
    const bonusMoney = Math.min(50000, profile.streak.count * 5000);
    const bonusXp = Math.min(50, profile.streak.count * 10);
    state.xp += bonusXp;
    state.money += bonusMoney;
    saveProfile();
    pushBanner(
      "🔥",
      `Chuỗi ${profile.streak.count} ngày!`,
      `Điểm danh ngày mới: +${bonusXp} XP · +${bonusMoney.toLocaleString("vi-VN")}đ`
    );
  }

  function advanceDaily(type, amount = 1, absolute = false) {
    ensureDaily();
    let changed = false;
    for (const t of profile.daily.tasks) {
      if (t.done || t.type !== type) continue;
      t.progress = absolute ? Math.max(t.progress, amount) : +(t.progress + amount).toFixed(2);
      if (t.progress >= t.target) {
        t.progress = t.target;
        t.done = true;
        state.xp += t.rewardXp;
        state.money += t.rewardMoney;
        playSuccess(state.soundOn);
        pushBanner(
          "✅",
          "Xong nhiệm vụ ngày!",
          `${t.label} (+${t.rewardXp} XP · +${t.rewardMoney.toLocaleString("vi-VN")}đ)`
        );
      }
      changed = true;
    }
    if (changed) saveProfile();
  }

  function checkAchievements() {
    const unlocked = new Set(profile.achievements);
    let added = false;
    for (const a of ACHIEVEMENTS) {
      if (unlocked.has(a.id)) continue;
      if (a.check()) {
        unlocked.add(a.id);
        profile.achievements.push(a.id);
        state.xp += a.rewardXp;
        state.money += a.rewardMoney;
        added = true;
        playSuccess(state.soundOn);
        pushBanner(
          a.icon,
          `Thành tựu: ${a.name}`,
          `${a.desc} (+${a.rewardXp} XP · +${a.rewardMoney.toLocaleString("vi-VN")}đ)`
        );
      }
    }
    if (added) saveProfile();
  }

  // Ôn tập lặp lại ngắt quãng
  function recordAnswer(streetName, correct) {
    if (!streetName) return;
    const now = Date.now();
    const cur = state.mastery[streetName] || { ok: 0, wrong: 0, lastAt: 0, nextAt: 0 };
    if (correct) {
      cur.ok = (cur.ok || 0) + 1;
      const hours = Math.min(72, Math.pow(2, Math.min(6, cur.ok - 1)));
      cur.nextAt = now + hours * 3600000;
    } else {
      cur.wrong = (cur.wrong || 0) + 1;
      cur.nextAt = now; // Đưa vào diện cần ôn lại ngay
      profile.stats.wrongPicks++;
    }
    cur.lastAt = now;
    state.mastery[streetName] = cur;
    saveProfile();
  }

  function pickNextStreetIndex(Q) {
    if (!Q.length) return 0;
    const now = Date.now();
    // 1. Ưu tiên đường cần ôn (đã từng sai hoặc đến hạn ôn tập)
    const due = [];
    const unlearned = [];
    for (let i = 0; i < Q.length; i++) {
      const n = Q[i].n;
      const m = state.mastery[n];
      if (m && (m.nextAt <= now || (m.wrong > m.ok && state.learned.has(n)))) {
        due.push(i);
      } else if (!state.learned.has(n)) {
        unlearned.push(i);
      }
    }
    if (due.length && Math.random() < 0.45) {
      return due[Math.floor(Math.random() * due.length)];
    }
    if (unlearned.length) {
      return unlearned[Math.floor(Math.random() * unlearned.length)];
    }
    if (due.length) {
      return due[Math.floor(Math.random() * due.length)];
    }
    return Math.floor(Math.random() * Q.length);
  }

  // Các hook sự kiện gameplay
  function onQuestComplete(streetName, isField, isFirstTime) {
    touchStreak();
    profile.stats.questsDone++;
    if (isField) profile.stats.fieldDone++;
    if (state.combo > profile.stats.maxCombo) profile.stats.maxCombo = state.combo;
    recordAnswer(streetName, true);
    if (isFirstTime) advanceDaily("learn", 1);
    advanceDaily("quest", 1);
    if (isField) advanceDaily("field", 1);
    advanceDaily("combo", state.combo, true);
    checkAchievements();
    if (isOpen()) render();
  }

  function onStreetDiscovered(streetName) {
    touchStreak();
    recordAnswer(streetName, true);
    advanceDaily("learn", 1);
    checkAchievements();
    if (isOpen()) render();
  }

  function onWrongPick(targetStreetName) {
    recordAnswer(targetStreetName, false);
    if (isOpen()) render();
  }

  function onRefuel() {
    profile.stats.refuels++;
    checkAchievements();
    saveProfile();
    if (isOpen()) render();
  }

  let kmAcc = 0;
  function onDriveDistance(meters) {
    if (!meters || meters <= 0) return;
    const km = meters / 1000;
    profile.stats.totalKm = +(profile.stats.totalKm + km).toFixed(3);
    kmAcc += km;
    if (kmAcc >= 0.2) {
      advanceDaily("km", kmAcc);
      kmAcc = 0;
      checkAchievements();
    }
  }

  function renderDailyTab() {
    ensureDaily();
    const doneDaily = profile.daily.tasks.filter((t) => t.done).length;
    const unlockedSet = new Set(profile.achievements);
    const tasksHtml = profile.daily.tasks
      .map((t) => {
        const pct = Math.min(100, Math.round((t.progress / t.target) * 100));
        const progTxt = Number.isInteger(t.target) && t.type !== "km" ? `${Math.floor(t.progress)}/${t.target}` : `${t.progress.toFixed(1)}/${t.target}`;
        return `<div class="rew-task ${t.done ? "done" : ""}">
          <div class="rew-task-top"><span>${t.done ? "✅" : "🎯"} ${t.label}</span><small>+${t.rewardXp} XP · +${t.rewardMoney.toLocaleString("vi-VN")}đ</small></div>
          <div class="rew-bar"><i style="width:${pct}%"></i><span>${progTxt}</span></div>
        </div>`;
      })
      .join("");

    const achHtml = ACHIEVEMENTS.map((a) => {
      const ok = unlockedSet.has(a.id);
      return `<div class="ach-card ${ok ? "ok" : ""}">
        <div class="ach-card-ico">${a.icon}</div>
        <div class="ach-card-info">
          <b>${a.name}</b>
          <small>${a.desc}</small>
          <span class="ach-rew">${ok ? "Đã mở khóa" : `+${a.rewardXp} XP · +${a.rewardMoney.toLocaleString("vi-VN")}đ`}</span>
        </div>
      </div>`;
    }).join("");

    bodyEl.innerHTML = `
      <div class="rew-summary">
        <div class="rew-stat"><span>🔥 Chuỗi ngày</span><b>${profile.streak.count} ngày</b></div>
        <div class="rew-stat"><span>🏆 Thành tựu</span><b>${unlockedSet.size}/${ACHIEVEMENTS.length}</b></div>
        <div class="rew-stat"><span>🏍️ Quãng đường</span><b>${profile.stats.totalKm.toFixed(1)} km</b></div>
        <div class="rew-stat"><span>🎯 Nhiệm vụ</span><b>${profile.stats.questsDone}</b></div>
      </div>
      <h4 class="rew-h">Nhiệm vụ hôm nay (${doneDaily}/3)</h4>
      <div class="rew-tasks">${tasksHtml}</div>
      <h4 class="rew-h">Huy hiệu thành tựu</h4>
      <div class="ach-grid">${achHtml}</div>
    `;
  }

  function renderNotebookTab() {
    const sts = getStreets ? getStreets() : [];
    const now = Date.now();
    const q = nbQuery.trim().toLowerCase();
    const rows = sts
      .filter((s) => {
        if (q && !s.n.toLowerCase().includes(q)) return false;
        const learned = state.learned.has(s.n);
        const m = state.mastery[s.n];
        const needReview = m && (m.wrong > 0 || (learned && m.nextAt <= now));
        if (nbFilter === "learned") return learned;
        if (nbFilter === "review") return needReview || !learned;
        return true;
      })
      .slice(0, 80);

    const listHtml = rows.length
      ? rows
          .map((s) => {
            const learned = state.learned.has(s.n);
            const m = state.mastery[s.n] || { ok: 0, wrong: 0 };
            const status = !learned
              ? '<span class="nb-tag new">Chưa thuộc</span>'
              : m.wrong > m.ok
              ? '<span class="nb-tag warn">Cần ôn</span>'
              : '<span class="nb-tag ok">Đã thuộc</span>';
            return `<div class="nb-row">
              <div>
                <b>${s.n}</b>
                <small>${s.h || ""} · Đúng ${m.ok || 0} / Sai ${m.wrong || 0}</small>
              </div>
              <div class="nb-acts">
                ${status}
                <button class="nb-btn" data-st="${s.n.replace(/"/g, "&quot;")}">Ôn ngay</button>
              </div>
            </div>`;
          })
          .join("")
      : `<div class="nb-empty">Không có đường nào khớp bộ lọc.</div>`;

    bodyEl.innerHTML = `
      <div class="nb-toolbar">
        <input id="nbSearch" type="text" placeholder="Tìm tên đường…" value="${nbQuery.replace(/"/g, "&quot;")}" />
        <button class="nb-f ${nbFilter === "all" ? "on" : ""}" data-f="all">Tất cả (${sts.length})</button>
        <button class="nb-f ${nbFilter === "learned" ? "on" : ""}" data-f="learned">Đã thuộc (${state.learned.size})</button>
        <button class="nb-f ${nbFilter === "review" ? "on" : ""}" data-f="review">Cần học/ôn</button>
      </div>
      <div class="nb-list">${listHtml}</div>
    `;

    const inp = $("nbSearch");
    if (inp) {
      inp.oninput = () => {
        nbQuery = inp.value;
        renderNotebookTab();
        const nInp = $("nbSearch");
        if (nInp) {
          nInp.focus();
          nInp.setSelectionRange(nbQuery.length, nbQuery.length);
        }
      };
    }
    bodyEl.querySelectorAll(".nb-f").forEach((b) => {
      b.onclick = () => {
        nbFilter = b.dataset.f;
        renderNotebookTab();
      };
    });
    bodyEl.querySelectorAll(".nb-btn").forEach((b) => {
      b.onclick = () => {
        const name = b.dataset.st;
        modal.classList.remove("open");
        if (onFocusStreet) onFocusStreet(name);
      };
    });
  }

  function render() {
    $("rewTabDaily")?.classList.toggle("on", activeTab === "daily");
    $("rewTabNb")?.classList.toggle("on", activeTab === "notebook");
    if (activeTab === "daily") renderDailyTab();
    else renderNotebookTab();
  }

  function isOpen() {
    return modal && modal.classList.contains("open");
  }

  function toggle(tab = null) {
    if (!modal) return;
    if (tab) activeTab = tab;
    if (isOpen() && !tab) {
      modal.classList.remove("open");
      return;
    }
    modal.classList.add("open");
    render();
  }

  $("rewTabDaily")?.addEventListener("click", () => {
    activeTab = "daily";
    render();
  });
  $("rewTabNb")?.addEventListener("click", () => {
    activeTab = "notebook";
    render();
  });
  $("rx")?.addEventListener("click", () => modal.classList.remove("open"));

  // Khởi tạo ngày mới khi vào game
  ensureDaily();
  touchStreak();
  checkAchievements();

  return {
    toggle,
    isOpen,
    pickNextStreetIndex,
    onQuestComplete,
    onStreetDiscovered,
    onWrongPick,
    onRefuel,
    onDriveDistance,
    getDailyDoneCount: () => profile.daily.tasks.filter((t) => t.done).length,
    getStreak: () => profile.streak.count,
  };
}
