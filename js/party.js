import { profile, state, BIKES, saveProfile, getActiveBike, toast, geo, $ } from "./state.js";
import { createPartyRiderRig } from "./models.js";
import { playRefuel, playSuccess, playDiscover, playChatPop, speakChat } from "./audio.js";

const BC_NAME = "kbd_party_v1";
const PEER_PREFIX = "kbd-phut-";

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const AI_BUDDIES = [
  { name: "Minh Wave", bikeId: "cub", color: 0x1e88e5 },
  { name: "Lan Vision", bikeId: "scooter", color: 0xf4f6f8 },
  { name: "Tuấn Ex", bikeId: "manual", color: 0xffb020 },
];

export function initParty({ world, R0, LANDMARKS, getSelfState, onReceiveFuel }) {
  const modal = $("partyModal");
  const myPeerId = profile.friendCode + "-" + Math.floor(100 + Math.random() * 900);

  let roomCode = "";
  let isLeader = false;
  let waypoint = null; // { x, z, label }
  let bc = null;
  let peer = null;
  let hostConn = null;
  const guestConns = new Map(); // peerId -> DataConnection (when host)
  const remotes = new Map(); // id -> { id, name, friendCode, bikeId, color, fuel, x, z, heading, speed, tx, tz, th, mesh, isBot, lastSeen, lowWarned }
  let botCounter = 0;
  let syncTimer = 0;
  let uiTimer = 0;
  let wpCooldown = 0;

  // Build tour destination choices (Landmarks + Quốc lộ / đường phượt dài)
  const tourTargets = [];
  LANDMARKS.forEach((lm) => {
    tourTargets.push({ label: "★ " + lm.name, x: lm.x, z: lm.z });
  });
  const seenTour = new Set();
  R0.forEach((r) => {
    if (r.n && r.c === 1 && r.p.length >= 4 && !seenTour.has(r.n)) {
      seenTour.add(r.n);
      const m = Math.floor(r.p.length / 4) * 2;
      tourTargets.push({
        label: "🛣️ " + r.n + " (Quốc lộ)",
        x: r.p[m] * geo.UX,
        z: -r.p[m + 1] * geo.UZ,
      });
    }
  });

  // Populate destination selector
  const wpSel = $("partyWpSel");
  if (wpSel) {
    wpSel.innerHTML = '<option value="">-- Chọn điểm tập kết Phượt --</option>';
    tourTargets.forEach((t, idx) => {
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = t.label;
      wpSel.appendChild(opt);
    });
  }

  function ensureMesh(r) {
    if (r.mesh) return r.mesh;
    const m = createPartyRiderRig(r.name, r.bikeId || "cub", r.color ?? 0x3ddc97, !!r.isBot);
    m.position.set(r.x, 0, r.z);
    m.rotation.y = r.heading || 0;
    world.scene.add(m);
    r.mesh = m;
    return m;
  }

  function removeRemote(id) {
    const r = remotes.get(id);
    if (!r) return;
    if (r.mesh) {
      world.scene.remove(r.mesh);
      if (r.mesh.userData.disposeLabel) r.mesh.userData.disposeLabel();
    }
    remotes.delete(id);
  }

  function clearRemotes(botsOnly = false) {
    for (const [id, r] of remotes) {
      if (!botsOnly || r.isBot) removeRemote(id);
    }
  }

  function sendPacket(pkt, excludeId = null) {
    if (bc && roomCode) {
      try {
        bc.postMessage({ ...pkt, room: roomCode, city: geo.cityId });
      } catch (e) {}
    }
    if (isLeader) {
      for (const [pid, conn] of guestConns) {
        if (pid !== excludeId && conn.open) {
          try {
            conn.send(pkt);
          } catch (e) {}
        }
      }
    } else if (hostConn && hostConn.open) {
      try {
        hostConn.send(pkt);
      } catch (e) {}
    }
  }

  function handlePacket(pkt, fromConnId = null) {
    if (!pkt || !pkt.type) return;
    if (pkt.city && pkt.city !== geo.cityId) return;
    if (pkt.from === myPeerId) return;

    // Leader relays packets from one guest to other guests
    if (isLeader && fromConnId) {
      sendPacket(pkt, fromConnId);
    }

    if (pkt.type === "state") {
      let r = remotes.get(pkt.from);
      if (!r) {
        r = {
          id: pkt.from,
          name: pkt.name || "Đồng đội",
          friendCode: pkt.friendCode || "",
          bikeId: pkt.bikeId || "cub",
          color: pkt.color ?? 0x3ddc97,
          fuel: pkt.fuel ?? 100,
          x: pkt.x,
          z: pkt.z,
          heading: pkt.heading || 0,
          speed: pkt.speed || 0,
          tx: pkt.x,
          tz: pkt.z,
          th: pkt.heading || 0,
          isBot: false,
          lastSeen: performance.now(),
        };
        remotes.set(pkt.from, r);
        ensureMesh(r);
        toast("👥 " + r.name + " đã vào đoàn phượt!", "var(--ok)");
        playDiscover(state.soundOn);
      } else {
        if (r.bikeId !== pkt.bikeId || r.color !== pkt.color) {
          r.bikeId = pkt.bikeId;
          r.color = pkt.color;
          if (r.mesh) r.mesh.userData.setBikeModel(r.bikeId, r.color);
        }
        r.name = pkt.name || r.name;
        r.friendCode = pkt.friendCode || r.friendCode;
        r.fuel = pkt.fuel ?? r.fuel;
        r.tx = pkt.x;
        r.tz = pkt.z;
        r.th = pkt.heading || 0;
        r.speed = pkt.speed || 0;
        r.lastSeen = performance.now();
      }
      if (r.mesh && r.mesh.userData.updateLabel) {
        r.mesh.userData.updateLabel(r.name, r.fuel);
      }
    } else if (pkt.type === "waypoint") {
      waypoint = pkt.waypoint || null;
      world.setWaypoint(waypoint);
      if (waypoint) toast("🚩 Điểm tập kết Phượt: " + waypoint.label, "var(--acc)");
      renderPartyUI();
    } else if (pkt.type === "fuel_gift" && pkt.to === myPeerId) {
      const gained = onReceiveFuel(pkt.amount || 20);
      playRefuel(state.soundOn);
      toast("⛽ " + (pkt.fromName || "Đồng đội") + " vừa chiết +" + Math.round(gained) + "% xăng cho bạn!", "var(--ok)");
    } else if (pkt.type === "chat") {
      const r = remotes.get(pkt.from);
      if (r && r.mesh && r.mesh.userData.say) {
        r.mesh.userData.say(pkt.text);
      }
      playChatPop(state.soundOn);
      speakChat(pkt.text, state.ttsOn, {
        pitch: pkt.pitch || 1.12,
        rate: pkt.rate || 1.06,
        voiceIndex: pkt.voiceIndex ?? 1,
      });
    } else if (pkt.type === "leave") {
      const r = remotes.get(pkt.from);
      if (r) toast(r.name + " đã rời đoàn phượt", "var(--mut)");
      removeRemote(pkt.from);
      renderPartyUI();
    }
  }

  function setupBroadcast() {
    if (bc || typeof BroadcastChannel === "undefined") return;
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.room !== roomCode) return;
      handlePacket(msg);
    };
  }

  function cleanupPeer() {
    if (hostConn) {
      try {
        hostConn.close();
      } catch (e) {}
      hostConn = null;
    }
    for (const conn of guestConns.values()) {
      try {
        conn.close();
      } catch (e) {}
    }
    guestConns.clear();
    if (peer) {
      try {
        peer.destroy();
      } catch (e) {}
      peer = null;
    }
  }

  function connectPeerJS(code, leaderMode) {
    cleanupPeer();
    if (typeof window.Peer === "undefined") return;
    try {
      peer = leaderMode ? new window.Peer(PEER_PREFIX + code) : new window.Peer();
      peer.on("error", () => {
        // Fallback silently to BroadcastChannel / local mode
      });
      if (leaderMode) {
        peer.on("connection", (conn) => {
          conn.on("open", () => {
            guestConns.set(conn.peer, conn);
            if (waypoint) conn.send({ type: "waypoint", waypoint, from: myPeerId, city: geo.cityId });
          });
          conn.on("data", (data) => handlePacket(data, conn.peer));
          conn.on("close", () => guestConns.delete(conn.peer));
        });
      } else {
        peer.on("open", () => {
          hostConn = peer.connect(PEER_PREFIX + code);
          hostConn.on("data", (data) => handlePacket(data));
          hostConn.on("open", () => {
            toast("🌐 Đã kết nối P2P vào đoàn " + code, "var(--ok)");
          });
        });
      }
    } catch (e) {}
  }

  function createRoom(customCode = null) {
    leaveRoom(true);
    roomCode = (customCode || makeRoomCode()).toUpperCase();
    isLeader = true;
    setupBroadcast();
    connectPeerJS(roomCode, true);
    renderPartyUI();
    toast("🏍️ Đã tạo đoàn phượt: " + roomCode, "var(--ok)");
  }

  function joinRoom(code) {
    const clean = (code || "").trim().toUpperCase();
    if (clean.length < 4) {
      toast("Mã đoàn phượt chưa hợp lệ!", "var(--bad)");
      return;
    }
    leaveRoom(true);
    roomCode = clean;
    isLeader = false;
    setupBroadcast();
    connectPeerJS(roomCode, false);
    renderPartyUI();
    toast("🔗 Đã vào đoàn phượt: " + roomCode, "var(--ok)");
  }

  function leaveRoom(silent = false) {
    if (roomCode) sendPacket({ type: "leave", from: myPeerId, city: geo.cityId });
    roomCode = "";
    isLeader = false;
    waypoint = null;
    world.setWaypoint(null);
    cleanupPeer();
    clearRemotes(false);
    renderPartyUI();
    if (!silent) toast("Đã rời đoàn phượt", "var(--mut)");
  }

  function addBotBuddy() {
    if (!roomCode) createRoom();
    if (remotes.size >= 3) {
      toast("Đoàn phượt tối đa 4 xe!", "var(--acc)");
      return;
    }
    const tmpl = AI_BUDDIES[botCounter % AI_BUDDIES.length];
    botCounter++;
    const self = getSelfState();
    const angle = self.heading + Math.PI;
    const p = world.nearestRoad(
      self.x + Math.sin(angle) * (4 + botCounter * 2),
      self.z + Math.cos(angle) * (4 + botCounter * 2),
      2
    );
    const id = "bot-" + botCounter;
    const bot = {
      id,
      name: tmpl.name,
      friendCode: "BOT-" + botCounter,
      bikeId: tmpl.bikeId,
      color: tmpl.color,
      fuel: 58,
      x: p ? p[0] : self.x,
      z: p ? p[1] : self.z,
      heading: self.heading,
      speed: 0,
      tx: p ? p[0] : self.x,
      tz: p ? p[1] : self.z,
      th: self.heading,
      isBot: true,
      lastSeen: performance.now(),
      lowWarned: false,
    };
    remotes.set(id, bot);
    ensureMesh(bot);
    renderPartyUI();
    toast("🏍️ " + bot.name + " đã nhập đoàn chạy cùng bạn!", "var(--ok)");
  }

  function addFriend(code, name) {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) {
      toast("Vui lòng nhập mã bạn bè (vd: KBD-8A2F)", "var(--bad)");
      return;
    }
    if (cleanCode === profile.friendCode) {
      toast("Đó là mã của chính bạn!", "var(--acc)");
      return;
    }
    if (profile.friends.some((f) => f.code === cleanCode)) {
      toast("Đã có trong danh sách bạn bè", "var(--acc)");
      return;
    }
    profile.friends.push({
      code: cleanCode,
      name: (name || "Bạn " + cleanCode.slice(-4)).trim(),
      addedAt: Date.now(),
    });
    saveProfile();
    renderPartyUI();
    toast("🤝 Đã kết bạn với " + cleanCode, "var(--ok)");
  }

  function removeFriend(code) {
    profile.friends = profile.friends.filter((f) => f.code !== code);
    saveProfile();
    renderPartyUI();
  }

  function setWaypointIndex(idxStr) {
    if (!roomCode) createRoom();
    if (!isLeader) {
      toast("Chỉ Trưởng đoàn mới chọn được điểm tập kết!", "var(--acc)");
      return;
    }
    const idx = parseInt(idxStr, 10);
    waypoint = Number.isFinite(idx) && tourTargets[idx] ? { ...tourTargets[idx] } : null;
    world.setWaypoint(waypoint);
    sendPacket({ type: "waypoint", waypoint, from: myPeerId, city: geo.cityId });
    renderPartyUI();
    if (waypoint) toast("🚩 Cả đoàn hướng về: " + waypoint.label, "var(--ok)");
  }

  function getNearestFuelTarget() {
    const self = getSelfState();
    let best = null;
    let bd = 10.5;
    for (const r of remotes.values()) {
      if (r.fuel >= 80) continue;
      const d = Math.hypot(r.x - self.x, r.z - self.z);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  }

  function shareFuel() {
    const target = getNearestFuelTarget();
    if (!target) return false;
    if (state.fuel < 30) {
      toast("Xăng của bạn quá thấp (< 30%) để chiết!", "var(--bad)");
      return false;
    }
    state.fuel = Math.max(5, state.fuel - 20);
    target.fuel = Math.min(100, target.fuel + 20);
    if (target.mesh && target.mesh.userData.updateLabel) {
      target.mesh.userData.updateLabel(target.name, target.fuel);
    }
    if (!target.isBot) {
      sendPacket({
        type: "fuel_gift",
        to: target.id,
        amount: 20,
        from: myPeerId,
        fromName: profile.displayName,
        city: geo.cityId,
      });
    } else {
      target.lowWarned = false;
    }
    state.xp += 15;
    state.money += 5000;
    saveProfile();
    playRefuel(state.soundOn);
    toast("⛽ Đã chiết 20% xăng cho " + target.name + " (+15 XP · +5.000đ)", "var(--ok)");
    renderPartyUI();
    return true;
  }

  function renderPartyUI() {
    const nameInp = $("myNameInp");
    if (nameInp && document.activeElement !== nameInp) nameInp.value = profile.displayName;
    const codeEl = $("myFriendCode");
    if (codeEl) codeEl.textContent = profile.friendCode;

    const roomBox = $("partyRoomStatus");
    if (roomBox) {
      if (!roomCode) {
        roomBox.innerHTML = 'Chưa vào đoàn phượt · <i>Tạo đoàn để rủ bạn bè chạy Quốc lộ</i>';
      } else {
        roomBox.innerHTML =
          'Đoàn <b style="color:var(--ok)">' +
          roomCode +
          "</b> (" +
          (isLeader ? "Trưởng đoàn" : "Thành viên") +
          ") · <b>" +
          (1 + remotes.size) +
          "/4 xe</b>" +
          (waypoint ? "<br>🚩 Đích: <b>" + waypoint.label + "</b>" : "");
      }
    }

    const memEl = $("partyMembers");
    if (memEl) {
      const items = [
        '<div class="mate-row"><span>⭐ <b>' +
          profile.displayName +
          "</b> (" +
          getActiveBike().name +
          ")</span><span>⛽ " +
          Math.round(state.fuel) +
          "%</span></div>",
      ];
      for (const r of remotes.values()) {
        const canAdd =
          !r.isBot && r.friendCode && !profile.friends.some((f) => f.code === r.friendCode);
        items.push(
          '<div class="mate-row"><span>' +
            (r.isBot ? "🏍️ " : "👥 ") +
            r.name +
            '</span><span style="display:flex;gap:6px;align-items:center">⛽ ' +
            Math.round(r.fuel) +
            "%" +
            (canAdd
              ? ' <button class="mini-tag" data-add-code="' +
                r.friendCode +
                '" data-add-name="' +
                r.name +
                '">+ Bạn</button>'
              : "") +
            "</span></div>"
        );
      }
      memEl.innerHTML = items.join("");
      memEl.querySelectorAll("[data-add-code]").forEach((btn) => {
        btn.onclick = () => addFriend(btn.dataset.addCode, btn.dataset.addName);
      });
    }

    const frEl = $("friendList");
    if (frEl) {
      if (!profile.friends.length) {
        frEl.innerHTML = '<div class="set-help">Chưa có bạn bè. Nhập mã bạn bè để lưu danh bạ phượt!</div>';
      } else {
        frEl.innerHTML = profile.friends
          .map(
            (f) =>
              '<div class="mate-row"><span>🤝 <b>' +
              f.name +
              "</b> · <code>" +
              f.code +
              '</code></span><button class="mini-tag" data-del-friend="' +
              f.code +
              '">Xóa</button></div>'
          )
          .join("");
        frEl.querySelectorAll("[data-del-friend]").forEach((btn) => {
          btn.onclick = () => removeFriend(btn.dataset.delFriend);
        });
      }
    }

    const btn = $("partyBtn");
    if (btn) {
      btn.textContent = roomCode ? "👥 Đoàn " + roomCode + " (" + (1 + remotes.size) + ")" : "👥 Phượt / Bạn bè (P)";
    }
  }

  // Bind UI controls
  if ($("saveNameBtn")) {
    $("saveNameBtn").onclick = () => {
      const val = ($("myNameInp").value || "").trim().slice(0, 18);
      if (!val) return;
      profile.displayName = val;
      saveProfile();
      renderPartyUI();
      toast("Đã đổi tên: " + val, "var(--ok)");
    };
  }
  if ($("copyRoomBtn")) {
    $("copyRoomBtn").onclick = () => {
      if (!roomCode) createRoom();
      const url = location.origin + location.pathname + "?city=" + encodeURIComponent(geo.cityId) + "&room=" + roomCode;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      toast("Đã tạo link mời đoàn " + roomCode + "!", "var(--ok)");
    };
  }
  if ($("createPartyBtn")) $("createPartyBtn").onclick = () => createRoom();
  if ($("joinPartyBtn")) $("joinPartyBtn").onclick = () => joinRoom($("joinRoomInp").value);
  if ($("leavePartyBtn")) $("leavePartyBtn").onclick = () => leaveRoom(false);
  if ($("addBotBtn")) $("addBotBtn").onclick = addBotBuddy;
  if ($("addFriendBtn")) {
    $("addFriendBtn").onclick = () => {
      addFriend($("friendCodeInp").value, $("friendNameInp").value);
      $("friendCodeInp").value = "";
      $("friendNameInp").value = "";
    };
  }
  if (wpSel) {
    wpSel.onchange = () => setWaypointIndex(wpSel.value);
  }

  // Auto-join from URL ?room=XXXXXX
  const urlRoom = new URLSearchParams(location.search).get("room");
  if (urlRoom) {
    setTimeout(() => joinRoom(urlRoom), 400);
  }

  function update(dt) {
    const self = getSelfState();
    const now = performance.now();

    // Update AI bots (convoy formation on legal roads) & interpolate human peers
    let idx = 0;
    for (const [id, r] of remotes) {
      if (r.isBot) {
        // Target a spot slightly behind/beside the leader
        const sideOffset = idx % 2 === 0 ? -2.2 : 2.2;
        const backOffset = 4.2 + idx * 2.6;
        const fx = Math.sin(self.heading);
        const fz = Math.cos(self.heading);
        const ux = -fz;
        const uz = fx;
        const desiredX = self.x - fx * backOffset + ux * sideOffset;
        const desiredZ = self.z - fz * backOffset + uz * sideOffset;

        const dx = desiredX - r.x;
        const dz = desiredZ - r.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 75) {
          const p = world.nearestRoad(desiredX, desiredZ, 2);
          if (p) {
            r.x = p[0];
            r.z = p[1];
          }
        } else if (dist > 1.3) {
          const spd = Math.min(34, Math.max(4, dist * 2.4));
          const vx = (dx / dist) * spd * dt;
          const vz = (dz / dist) * spd * dt;
          if (world.onRoad(r.x + vx, r.z + vz, 0.8, false)) {
            r.x += vx;
            r.z += vz;
          } else {
            const nr = world.nearestRoad(r.x + vx, r.z + vz, 1);
            if (nr) {
              r.x += (nr[0] - r.x) * 0.4;
              r.z += (nr[1] - r.z) * 0.4;
            }
          }
          r.heading = Math.atan2(dx, dz);
          r.speed = spd;
          r.fuel = Math.max(5, r.fuel - spd * dt * 0.09);
          if (r.fuel < 35 && !r.lowWarned) {
            r.lowWarned = true;
            const helpMsg = "Sắp hết xăng rồi, ai chiết giúp mình với!";
            if (r.mesh && r.mesh.userData.say) r.mesh.userData.say(helpMsg);
            speakChat(helpMsg, state.ttsOn, { pitch: r.name.includes("Lan") ? 1.2 : 0.96, voiceIndex: idx + 1 });
            toast("⛽ " + r.name + ": 'Sắp hết xăng rồi! Lại gần bấm (E) chiết giúp với!'", "var(--acc)");
          }
        } else {
          r.speed = 0;
          r.heading = self.heading;
        }
      } else {
        if (now - r.lastSeen > 8000) {
          removeRemote(id);
          continue;
        }
        const k = Math.min(1, 10 * dt);
        r.x += (r.tx - r.x) * k;
        r.z += (r.tz - r.z) * k;
        let dh = r.th - r.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        r.heading += dh * k;
      }

      if (r.mesh) {
        r.mesh.position.set(r.x, 0, r.z);
        r.mesh.rotation.y = r.heading;
        if (r.mesh.userData.w1) r.mesh.userData.w1.rotation.x += (r.speed || 0) * dt * 2.2;
        if (r.mesh.userData.w2) r.mesh.userData.w2.rotation.x += (r.speed || 0) * dt * 2.2;
        if (r.mesh.userData.updateChat) r.mesh.userData.updateChat(now);
      }
      idx++;
    }

    if (world.me && world.me.userData.updateChat) {
      world.me.userData.updateChat(now);
    }

    // Broadcast own state at ~12 Hz when in a room
    syncTimer += dt;
    if (roomCode && syncTimer >= 0.085) {
      syncTimer = 0;
      const bike = getActiveBike();
      sendPacket({
        type: "state",
        from: myPeerId,
        city: geo.cityId,
        name: profile.displayName,
        friendCode: profile.friendCode,
        bikeId: bike.id,
        color: bike.color,
        fuel: +state.fuel.toFixed(1),
        x: +self.x.toFixed(2),
        z: +self.z.toFixed(2),
        heading: +self.heading.toFixed(3),
        speed: +self.speed.toFixed(2),
      });
    }

    // Check rally waypoint completion
    if (wpCooldown > 0) wpCooldown -= dt;
    if (waypoint && wpCooldown <= 0) {
      const d = Math.hypot(self.x - waypoint.x, self.z - waypoint.z);
      if (d < 26) {
        const teamBonus = remotes.size > 0 ? 50 : 25;
        const cashBonus = remotes.size > 0 ? 35000 : 15000;
        state.xp += teamBonus;
        state.money += cashBonus;
        saveProfile();
        playSuccess(state.soundOn);
        toast(
          "🚩 Tới điểm tập kết " +
            waypoint.label +
            "! +" +
            teamBonus +
            " XP · +" +
            cashBonus.toLocaleString("vi-VN") +
            "đ",
          "var(--ok)"
        );
        waypoint = null;
        world.setWaypoint(null);
        if (isLeader) sendPacket({ type: "waypoint", waypoint: null, from: myPeerId, city: geo.cityId });
        if (wpSel) wpSel.value = "";
        wpCooldown = 2;
        renderPartyUI();
      }
    }

    // Update nearby fuel-share button & bot labels every 0.35s
    uiTimer += dt;
    if (uiTimer >= 0.35) {
      uiTimer = 0;
      for (const r of remotes.values()) {
        if (r.isBot && r.mesh && r.mesh.userData.updateLabel) {
          r.mesh.userData.updateLabel(r.name, r.fuel);
        }
      }
      const shareTarget = getNearestFuelTarget();
      const sBtn = $("shareFuelBtn");
      if (sBtn) {
        const show = !!shareTarget && state.fuel >= 30;
        sBtn.classList.toggle("show", show);
        if (show) {
          sBtn.textContent = "⛽ Chiết xăng cho " + shareTarget.name + " (-20% → +20%) (E)";
        }
      }
      if (modal && modal.classList.contains("open")) renderPartyUI();
    }
  }

  function pickAiReply(text) {
    const low = text.toLowerCase();
    if (low.includes("xăng") || low.includes("đổ")) return "Gần đây có cây xăng đó, ghé đổ luôn đi!";
    if (low.includes("đợi") || low.includes("chờ") || low.includes("chậm")) return "Ok bạn ơi, mình giảm ga chờ nè!";
    if (low.includes("chào") || low.includes("hello") || low.includes("hi")) return "Chào bạn! Hôm nay đi phượt tuyến nào đây?";
    if (low.includes("tới") || low.includes("đâu") || low.includes("đường")) return "Nhớ mở tablet xem lại đường cho chắc nhé!";
    if (low.includes("cảm ơn") || low.includes("thanks")) return "Không có chi, anh em cùng đoàn mà!";
    const pool = [
      "Đoàn mình chạy đúng luật, giữ tốc độ nhé!",
      "Đường này đẹp ghê, đi phượt quá đã!",
      "Ok luôn bạn ơi, lên ga thôi!",
      "Nhớ đừng quẹo lên cao tốc kẻo bị phạt đó nha!",
    ];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function sendChat(rawText) {
    const clean = String(rawText || "").trim().slice(0, 72);
    if (!clean) return;
    if (world.me && world.me.userData.say) {
      world.me.userData.say(clean);
    }
    playChatPop(state.soundOn);
    speakChat(clean, state.ttsOn, { pitch: 1.02, rate: 1.06, voiceIndex: 0 });
    if (roomCode) {
      sendPacket({
        type: "chat",
        from: myPeerId,
        fromName: profile.displayName,
        text: clean,
        pitch: 1.12,
        voiceIndex: 1,
        city: geo.cityId,
      });
    }
    // AI teammate banter if any bot is in party
    const bots = [...remotes.values()].filter((r) => r.isBot);
    if (bots.length) {
      const responder = bots[Math.floor(Math.random() * bots.length)];
      const reply = pickAiReply(clean);
      setTimeout(() => {
        if (!remotes.has(responder.id)) return;
        if (responder.mesh && responder.mesh.userData.say) {
          responder.mesh.userData.say(reply);
        }
        playChatPop(state.soundOn);
        speakChat(reply, state.ttsOn, {
          pitch: responder.name.includes("Lan") ? 1.24 : 0.94,
          rate: 1.05,
          voiceIndex: 1,
        });
      }, 1150);
    }
  }

  function getMapSnapshot() {
    const members = [];
    for (const r of remotes.values()) members.push({ name: r.name, x: r.x, z: r.z });
    return { members, waypoint };
  }

  renderPartyUI();

  return {
    update,
    shareFuel,
    sendChat,
    renderPartyUI,
    getMapSnapshot,
    isOpen: () => modal && modal.classList.contains("open"),
  };
}
