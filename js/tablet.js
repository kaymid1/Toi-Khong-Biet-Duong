import { state, saveProfile, resetCityProgress, toast, geo, $ } from "./state.js";
import { playSuccess, playError, playDiscover } from "./audio.js";

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

export function initTablet({ R0, SEEDS, LANDMARKS, stations, getSpeed, setSpeed, getMode, rewards }) {
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

  // Đánh dấu địa danh
  LANDMARKS.forEach((lm) => {
    const cx = mu(lm.px);
    const cy = mv(lm.py);
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", cx);
    c.setAttribute("cy", cy);
    c.setAttribute("r", "2.4");
    c.setAttribute("class", "lm-dot");
    const tx = document.createElementNS(NS, "text");
    tx.setAttribute("x", +cx + 3.2);
    tx.setAttribute("y", +cy + 1);
    tx.setAttribute("class", "lm-tx");
    tx.textContent = "★ " + lm.name;
    g.appendChild(c);
    g.appendChild(tx);
  });

  // Đánh dấu cây xăng lên tablet để người chơi tìm khi sắp hết xăng
  stations.forEach((st) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", mu(st.px));
    c.setAttribute("cy", mv(st.py));
    c.setAttribute("r", "1.9");
    c.setAttribute("class", "gs-dot");
    g.appendChild(c);
  });

  const partyLayer = document.createElementNS(NS, "g");
  partyLayer.setAttribute("id", "partyMapLayer");
  g.appendChild(partyLayer);

  function updatePartyMap(members = [], waypoint = null, selfWorldPos = null) {
    partyLayer.innerHTML = "";
    if (waypoint) {
      const wx = mu(waypoint.x / geo.UX);
      const wy = mv(-waypoint.z / geo.UZ);
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("cx", wx);
      ring.setAttribute("cy", wy);
      ring.setAttribute("r", "4.2");
      ring.setAttribute("class", "wp-dot");
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", +wx + 5);
      tx.setAttribute("y", +wy + 1);
      tx.setAttribute("class", "wp-tx");
      tx.textContent = "🚩 " + waypoint.label;
      partyLayer.appendChild(ring);
      partyLayer.appendChild(tx);
    }
    if (selfWorldPos) {
      const sx = mu(selfWorldPos.x / geo.UX);
      const sy = mv(-selfWorldPos.z / geo.UZ);
      const meDot = document.createElementNS(NS, "circle");
      meDot.setAttribute("cx", sx);
      meDot.setAttribute("cy", sy);
      meDot.setAttribute("r", "2.6");
      meDot.setAttribute("class", "me-dot");
      partyLayer.appendChild(meDot);
    }
    members.forEach((m) => {
      const mx = mu(m.x / geo.UX);
      const my = mv(-m.z / geo.UZ);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", mx);
      c.setAttribute("cy", my);
      c.setAttribute("r", "2.3");
      c.setAttribute("class", "mate-dot");
      const tx = document.createElementNS(NS, "text");
      tx.setAttribute("x", +mx + 3.2);
      tx.setAttribute("y", +my + 1);
      tx.setAttribute("class", "mate-tx");
      tx.textContent = m.name;
      partyLayer.appendChild(c);
      partyLayer.appendChild(tx);
    });
  }

  let vb = [0, 0, 400, 400];
  function setVB(b) {
    const w = Math.max(22, Math.min(480, b[2]));
    const x = Math.max(-120, Math.min(520 - w, b[0]));
    const y = Math.max(-120, Math.min(520 - w, b[1]));
    vb = [x, y, w, w];
    svg.setAttribute("viewBox", vb.join(" "));
    g.style.setProperty("--fs", (vb[2] / 36).toFixed(2) + "px");
    resEl.style.display = vb[2] < 150 ? "block" : "none";
    $("lvl").textContent = vb[2] > 280 ? "Toàn thành phố" : vb[2] > 120 ? "Khu vực" : "Chi tiết đường";
  }
  setVB(vb);

  function zoomBy(factor, cxFrac = 0.5, cyFrac = 0.5) {
    const nw = Math.max(22, Math.min(480, vb[2] * factor));
    setVB([vb[0] + (vb[2] - nw) * cxFrac, vb[1] + (vb[3] - nw) * cyFrac, nw, nw]);
  }
  $("zi").onclick = () => zoomBy(0.65);
  $("zo").onclick = () => zoomBy(1.45);
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
    setQuestionByIndex(idx, true);
    toast("Đang ôn đường: " + name + " — hãy mở Tablet (T) để chọn trên bản đồ", "var(--acc)");
  }

  function completeStreet(s, isField) {
    const firstTime = !state.learned.has(s.n);
    state.learned.add(s.n);
    s.el.classList.add("learned");
    s.lb.classList.add("on");
    state.combo++;
    const bonus = Math.min(30, (state.combo - 1) * 5);
    const rewardMoney = (isField ? 40000 : firstTime ? 25000 : 10000) + state.combo * 2000;
    const rewardXp = (isField ? 60 : state.hudHint ? 25 : 40) + bonus;
    state.xp += rewardXp;
    state.money += rewardMoney;
    saveProfile();
    playSuccess(state.soundOn);
    toast(
      (isField ? "Check-in thành công! " : "") +
        "+" +
        rewardXp +
        " XP · +" +
        rewardMoney.toLocaleString("vi-VN") +
        "đ",
      "var(--ok)"
    );
    if (rewards) rewards.onQuestComplete(s.n, isField, firstTime);
  }

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
