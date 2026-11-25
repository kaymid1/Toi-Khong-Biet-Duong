import { state, saveProfile, resetCityProgress, toast, geo, $ } from "./state.js?v=3";
import { playSuccess, playError, playDiscover } from "./audio.js?v=3";

const NS = "http://www.w3.org/2000/svg";
const mu = (x) => (((x - geo.minX) / geo.span) * 400).toFixed(1);
const mv = (y) => (((geo.maxY - y) / geo.span) * 400).toFixed(1);
const pd = (r) => {
  let s = "M";
  for (let j = 0; j < r.p.length; j += 2) s += (j ? " L" : "") + mu(r.p[j]) + " " + mv(r.p[j + 1]);
  return s;
};

function hint(cx, cy) {
  const dx = cx - geo.CX0;
  const dy = cy - geo.CY0;
  const T = geo.span * 0.08;
  const ns = dy > T ? "Bắc" : dy < -T ? "Nam" : "";
  const ew = dx > T ? "Đông" : dx < -T ? "Tây" : "";
  if (!ns && !ew) return "khu trung tâm";
  const d =
    ns && ew
      ? ns === "Bắc"
        ? ew === "Đông"
          ? "Đông Bắc"
          : "Tây Bắc"
        : ew === "Đông"
        ? "Đông Nam"
        : "Tây Nam"
      : ns || ew;
  return "phía " + d;
}

export function initTablet({ R0, SEEDS, LANDMARKS, WATER = [], stations, getSpeed, setSpeed, getMode, getHeading, rewards }) {
  const byN = new Map();
  R0.forEach((r, i) => {
    if (r.n && r.c >= 1 && r.c <= 3) {
      let o = byN.get(r.n);
      if (!o) byN.set(r.n, (o = { n: r.n, ids: [], sx: 0, sy: 0, k: 0 }));
      o.ids.push(i);
      for (let j = 0; j < r.p.length; j += 2) {
        o.sx += r.p[j];
        o.sy += r.p[j + 1];
        o.k++;
      }
    }
  });
  const STS = [...byN.values()];
  STS.forEach((s, i) => {
    s.i = i;
    s.h = hint(s.sx / s.k, s.sy / s.k);
    const r = R0[s.ids[0]];
    s.px = r.p[0];
    s.py = r.p[1];
  });
  const Q = SEEDS.map((n) => byN.get(n)).filter(Boolean).sort(() => Math.random() - 0.5);
  STS.forEach((s) => {
    if (!Q.includes(s)) Q.push(s);
  });

  const g = $("g");
  const svg = $("m");
  const mkp = (d, c) => {
    const e = document.createElementNS(NS, "path");
    e.setAttribute("d", d);
    e.setAttribute("class", c);
    g.appendChild(e);
    return e;
  };
  if (WATER.length) {
    const wPath = WATER.map((w) => {
      let s = "M";
      for (let j = 0; j < w.p.length; j += 2) s += (j ? " L" : "") + mu(w.p[j]) + " " + mv(w.p[j + 1]);
      return s + " Z";
    }).join(" ");
    mkp(wPath, "water");
  }
  const resEl = mkp(R0.filter((r) => r.c > 5).map(pd).join(""), "rs");
  mkp(R0.filter((r) => r.c >= 2 && r.c <= 5).map(pd).join(""), "bg");
  mkp(R0.filter((r) => r.c === 1).map(pd).join(""), "trunk");
  mkp(R0.filter((r) => r.c === 0).map(pd).join(""), "hw");

  STS.forEach((s) => {
    const d = s.ids.map((i) => pd(R0[i])).join("");
    s.el = mkp(d, "st" + (state.learned.has(s.n) ? " learned" : ""));
    const h = mkp(d, "hit");
    h.onclick = () => {
      if (!dragMoved) pick(s);
    };
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", mu(s.px));
    t.setAttribute("y", mv(s.py));
    t.setAttribute("class", "lb" + (state.learned.has(s.n) ? " on" : ""));
    t.textContent = s.n;
    g.appendChild(t);
    s.lb = t;
  });

  const scaledMarkers = [];
  const addScaledCircle = (parent, x, y, r, cls) => {
    const grp = document.createElementNS(NS, "g");
    grp.setAttribute("data-x", x);
    grp.setAttribute("data-y", y);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", "0");
    c.setAttribute("cy", "0");
    c.setAttribute("r", String(r));
    c.setAttribute("class", cls);
    grp.appendChild(c);
    parent.appendChild(grp);
    scaledMarkers.push(grp);
    return grp;
  };
  const labelOffsets = [];

  // Đánh dấu địa danh
  LANDMARKS.forEach((lm) => {
    const cx = +mu(lm.px);
    const cy = +mv(lm.py);
    addScaledCircle(g, cx, cy, 2.5, "lm-dot");
    const tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", (cx + 3.4).toFixed(1));
    tx.setAttribute("y", (cy + 1).toFixed(1));
    tx.setAttribute("class", "lm-tx");
    tx.textContent = "★ " + lm.name;
    g.appendChild(tx);
    labelOffsets.push({ el: tx, x: cx, y: cy, dx: 3.6, dy: 1.0 });
  });

  // Đánh dấu cây xăng lên tablet để người chơi tìm khi sắp hết xăng
  stations.forEach((st) => {
    addScaledCircle(g, +mu(st.px), +mv(st.py), 2.0, "gs-dot");
  });

  const partyLayer = document.createElementNS(NS, "g");
  partyLayer.setAttribute("id", "partyMapLayer");
  g.appendChild(partyLayer);

  let vb = [0, 0, 400, 400];
  let lastSelfPos = null;
  function markerScale() {
    return Math.max(0.14, Math.min(1.0, vb[2] / 360));
  }
  function applyMarkerScales() {
    const ds = markerScale();
    for (const grp of scaledMarkers) {
      const x = grp.dataset.x;
      const y = grp.dataset.y;
      grp.setAttribute("transform", `translate(${x} ${y}) scale(${ds.toFixed(3)})`);
    }
    for (const lo of labelOffsets) {
      lo.el.setAttribute("x", (lo.x + lo.dx * ds).toFixed(2));
      lo.el.setAttribute("y", (lo.y + lo.dy * ds).toFixed(2));
    }
    for (const grp of partyLayer.querySelectorAll("[data-x]")) {
      const rot = grp.dataset.rot ? ` rotate(${grp.dataset.rot})` : "";
      grp.setAttribute("transform", `translate(${grp.dataset.x} ${grp.dataset.y}) scale(${ds.toFixed(3)})${rot}`);
    }
    for (const tx of partyLayer.querySelectorAll("[data-lx]")) {
      tx.setAttribute("x", (+tx.dataset.lx + +tx.dataset.dx * ds).toFixed(2));
      tx.setAttribute("y", (+tx.dataset.ly + +tx.dataset.dy * ds).toFixed(2));
    }
  }

  function updatePartyMap(members = [], waypoint = null, selfWorldPos = null) {
    if (selfWorldPos) lastSelfPos = { x: selfWorldPos.x, z: selfWorldPos.z };
    partyLayer.innerHTML = "";
    const ds = markerScale();
    if (waypoint) {
      const wx = +mu(waypoint.x / geo.UX);
      const wy = +mv(-waypoint.z / geo.UZ);
      const wGrp = document.createElementNS(NS, "g");
      wGrp.setAttribute("data-x", wx);
      wGrp.setAttribute("data-y", wy);
      wGrp.setAttribute("transform", `translate(${wx} ${wy}) scale(${ds.toFixed(3)})`);
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("r", "4.0");
      ring.setAttribute("class", "wp-dot");
      wGrp.appendChild(ring);
      partyLayer.appendChild(wGrp);

      const tx = document.createElementNS(NS, "text");
      tx.dataset.lx = wx;
      tx.dataset.ly = wy;
      tx.dataset.dx = "4.8";
      tx.dataset.dy = "1";
      tx.setAttribute("x", (wx + 4.8 * ds).toFixed(2));
      tx.setAttribute("y", (wy + ds).toFixed(2));
      tx.setAttribute("class", "wp-tx");
      tx.textContent = "🚩 " + waypoint.label;
      partyLayer.appendChild(tx);
    }
    if (selfWorldPos) {
      const sx = +mu(selfWorldPos.x / geo.UX);
      const sy = +mv(-selfWorldPos.z / geo.UZ);
      const hdg = getHeading ? getHeading() : 0;
      const deg = ((-hdg * 180) / Math.PI).toFixed(1);
      const meGrp = document.createElementNS(NS, "g");
      meGrp.setAttribute("data-x", sx);
      meGrp.setAttribute("data-y", sy);
      meGrp.setAttribute("data-rot", deg);
      meGrp.setAttribute("transform", `translate(${sx} ${sy}) scale(${ds.toFixed(3)}) rotate(${deg})`);
      const halo = document.createElementNS(NS, "circle");
      halo.setAttribute("r", "5.2");
      halo.setAttribute("class", "me-ring");
      const arrow = document.createElementNS(NS, "polygon");
      arrow.setAttribute("points", "0,4.2 3.1,-3.2 0,-1.6 -3.1,-3.2");
      arrow.setAttribute("class", "me-arrow");
      meGrp.appendChild(halo);
      meGrp.appendChild(arrow);
      partyLayer.appendChild(meGrp);
    }
    members.forEach((m) => {
      const mx = +mu(m.x / geo.UX);
      const my = +mv(-m.z / geo.UZ);
      const mGrp = document.createElementNS(NS, "g");
      mGrp.setAttribute("data-x", mx);
      mGrp.setAttribute("data-y", my);
      mGrp.setAttribute("transform", `translate(${mx} ${my}) scale(${ds.toFixed(3)})`);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("r", "2.4");
      c.setAttribute("class", "mate-dot");
      mGrp.appendChild(c);
      partyLayer.appendChild(mGrp);

      const tx = document.createElementNS(NS, "text");
      tx.dataset.lx = mx;
      tx.dataset.ly = my;
      tx.dataset.dx = "3.4";
      tx.dataset.dy = "1";
      tx.setAttribute("x", (mx + 3.4 * ds).toFixed(2));
      tx.setAttribute("y", (my + ds).toFixed(2));
      tx.setAttribute("class", "mate-tx");
      tx.textContent = m.name;
      partyLayer.appendChild(tx);
    });
  }

  function setVB(b) {
    const w = Math.max(22, Math.min(480, b[2]));
    const x = Math.max(-120, Math.min(520 - w, b[0]));
    const y = Math.max(-120, Math.min(520 - w, b[1]));
    vb = [x, y, w, w];
    svg.setAttribute("viewBox", vb.join(" "));
    g.style.setProperty("--fs", (vb[2] / 36).toFixed(2) + "px");
    resEl.style.display = vb[2] < 150 ? "block" : "none";
    $("lvl").textContent = vb[2] > 280 ? "Toàn thành phố" : vb[2] > 120 ? "Khu vực" : "Chi tiết đường";
    applyMarkerScales();
  }
  setVB(vb);

  function centerOnMe(zoomWidth = null) {
    if (!lastSelfPos) return;
    const sx = +mu(lastSelfPos.x / geo.UX);
    const sy = +mv(-lastSelfPos.z / geo.UZ);
    const w = zoomWidth || Math.min(vb[2], 110);
    setVB([sx - w / 2, sy - w / 2, w, w]);
  }

  function zoomBy(factor, cxFrac = 0.5, cyFrac = 0.5) {
    const nw = Math.max(22, Math.min(480, vb[2] * factor));
    setVB([vb[0] + (vb[2] - nw) * cxFrac, vb[1] + (vb[3] - nw) * cyFrac, nw, nw]);
  }
  $("zi").onclick = () => zoomBy(0.65);
  $("zo").onclick = () => zoomBy(1.45);
  if ($("zm")) $("zm").onclick = () => centerOnMe();
  $("zr").onclick = () => setVB([0, 0, 400, 400]);

  let panning = false;
  let dragMoved = false;
  let psx = 0;
  let psy = 0;
  let pvb = null;
  svg.addEventListener("pointerdown", (e) => {
    panning = true;
    dragMoved = false;
    psx = e.clientX;
    psy = e.clientY;
    pvb = vb.slice();
  });
  addEventListener("pointermove", (e) => {
    if (!panning) return;
    const dx = e.clientX - psx;
    const dy = e.clientY - psy;
    if (Math.hypot(dx, dy) > 5) dragMoved = true;
    if (!dragMoved) return;
    const r = svg.getBoundingClientRect();
    setVB([pvb[0] - dx * (pvb[2] / r.width), pvb[1] - dy * (pvb[3] / r.height), pvb[2], pvb[3]]);
  });
  addEventListener("pointerup", () => (panning = false));
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      zoomBy(e.deltaY > 0 ? 1.18 : 0.84, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    },
    { passive: false }
  );

  // Hệ thống nhiệm vụ kép: Tìm trên Tablet + Thực địa Check-in (mỗi nhiệm vụ thứ 3)
  let cur = 0;
  let questCount = 0;
  let fieldTarget = null;
  let isManualReview = false;
  let busy = false;

  function renderCombo() {
    const el = $("combo");
    el.classList.toggle("on", state.combo >= 2);
    if (state.combo >= 2) el.textContent = "🔥 Chuỗi x" + state.combo;
  }

  function setQuestionByIndex(idx, forceTablet = false) {
    cur = idx >= 0 && idx < Q.length ? idx : 0;
    if (!forceTablet && questCount % 3 === 0) {
      fieldTarget = Q[cur];
      $("qType").textContent = "Nhiệm vụ Thực địa (lái xe tới nơi):";
      $("qText").innerHTML =
        'Hãy chạy xe tới đường <b id="qn">' +
        fieldTarget.n +
        '</b> <span id="qh" style="color:var(--mut)">(gợi ý: ' +
        fieldTarget.h +
        ")</span>";
    } else {
      fieldTarget = null;
      $("qType").textContent = "Nhiệm vụ Tablet:";
      $("qText").innerHTML =
        '“Đường <b id="qn">' +
        Q[cur].n +
        '</b> ở đâu vậy? <span id="qh" style="color:var(--mut)">(gợi ý: ' +
        Q[cur].h +
        ')</span>”';
    }
    renderCombo();
  }

  function nextQuestion() {
    isManualReview = false;
    questCount++;
    if (rewards && rewards.pickNextStreetIndex) {
      setQuestionByIndex(rewards.pickNextStreetIndex(Q));
      return;
    }
    const unlearned = Q.filter((s) => !state.learned.has(s.n));
    const pool = unlearned.length ? unlearned : Q;
    const idx = Q.indexOf(pool[Math.floor(Math.random() * Math.min(pool.length, 8))]);
    setQuestionByIndex(idx);
  }

  function focusStreet(name) {
    const idx = Q.findIndex((s) => s.n === name);
    if (idx < 0) return;
    isManualReview = true;
    setQuestionByIndex(idx, true);
    const canEarn = !rewards || !rewards.canEarnReviewReward || rewards.canEarnReviewReward(name);
    toast(
      canEarn
        ? "Đang ôn đường: " + name + " — mở Tablet (T) để chọn trên bản đồ"
        : "Luyện tập lại: " + name + " (đã nhận thưởng tuyến này trước đó)",
      "var(--acc)"
    );
  }

  const completeStreet = (s, isField) => {
    const firstTime = !state.learned.has(s.n);
    const canEarn = firstTime || (rewards && rewards.canEarnReviewReward ? rewards.canEarnReviewReward(s.n) : false);
    state.learned.add(s.n);
    s.el.classList.add("learned");
    s.lb.classList.add("on");

    if (canEarn) {
      state.combo++;
      const bonus = Math.min(30, (state.combo - 1) * 5);
      const rewardMoney = (isField ? 40000 : firstTime ? 25000 : 8000) + state.combo * 2000;
      const rewardXp = (isField ? 60 : firstTime ? (state.hudHint ? 25 : 40) : 15) + bonus;
      state.xp += rewardXp;
      state.money += rewardMoney;
      saveProfile();
      playSuccess(state.soundOn);
      toast(
        (isField ? "Check-in thành công! " : firstTime ? "" : "Ôn tập chuẩn xác! ") +
          "+" +
          rewardXp +
          " XP · +" +
          rewardMoney.toLocaleString("vi-VN") +
          "đ",
        "var(--ok)"
      );
    } else {
      saveProfile();
      playSuccess(state.soundOn);
      toast(
        (isManualReview ? "Luyện tập xong đường " : "Ôn tập xong đường ") +
          s.n +
          "! (Đã nhận thưởng trước đó)",
        "var(--ok)"
      );
    }
    if (rewards) rewards.onQuestComplete(s.n, isField, firstTime, canEarn);
  };

  function unlockStreetByDrive(streetName) {
    if (!streetName || streetName === "—" || state.learned.has(streetName)) return;
    const s = byN.get(streetName);
    if (!s) return;
    state.learned.add(streetName);
    s.el.classList.add("learned");
    s.lb.classList.add("on");
    state.xp += 5;
    state.money += 2000;
    saveProfile();
    playDiscover(state.soundOn);
    toast("Khám phá đường mới: " + streetName + " (+5 XP · +2.000đ)", "var(--ok)");
    if (rewards) rewards.onStreetDiscovered(streetName);
  }

  function pick(s) {
    if (busy) return;
    if (fieldTarget) {
      toast("Đây là nhiệm vụ Thực địa — hãy lái xe tới " + fieldTarget.n + "!", "var(--acc)");
      return;
    }
    if (s !== Q[cur]) {
      state.combo = 0;
      renderCombo();
      s.el.classList.add("bad");
      playError(state.soundOn);
      toast("Đó là đường " + s.n + " – thử lại!", "var(--bad)");
      if (rewards && Q[cur]) rewards.onWrongPick(Q[cur].n);
      setTimeout(() => s.el.classList.remove("bad"), 1400);
      return;
    }
    busy = true;
    s.el.classList.add("ok");
    completeStreet(s, false);
    setTimeout(() => {
      s.el.classList.remove("ok");
      tab.classList.remove("open");
      busy = false;
      nextQuestion();
    }, 1100);
  }

  function checkFieldQuest(nearStreetName) {
    if (!fieldTarget || busy) return;
    if (nearStreetName === fieldTarget.n) {
      busy = true;
      completeStreet(fieldTarget, true);
      setTimeout(() => {
        busy = false;
        nextQuestion();
      }, 1100);
    }
  }

  const tab = $("tab");
  function toggleTablet() {
    if (tab.classList.contains("open")) {
      tab.classList.remove("open");
      return;
    }
    const m = getMode ? getMode() : "drive";
    if (m === "drive" && Math.abs(getSpeed()) > 0.8) {
      toast("Hãy dừng xe hẳn để mở tablet!", "var(--acc)");
      return;
    }
    if (m === "drive") setSpeed(0);
    tab.classList.add("open");
  }
  $("tb").onclick = toggleTablet;
  $("x").onclick = () => tab.classList.remove("open");
  $("resetBtn").onclick = () => {
    resetCityProgress();
    STS.forEach((s) => {
      s.el.classList.remove("learned");
      s.lb.classList.remove("on");
    });
    questCount = 0;
    nextQuestion();
    toast("Đã đặt lại tiến độ khu vực này", "var(--acc)");
  };

  nextQuestion();

  return {
    STS,
    toggleTablet,
    isTabOpen: () => tab.classList.contains("open"),
    checkFieldQuest,
    unlockStreetByDrive,
    updatePartyMap,
    focusStreet,
  };
}
