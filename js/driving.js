import { state, saveProfile, getActiveBike, toast, geo, $ } from "./state.js";
import { playRefuel, playHorn } from "./audio.js";

export function createDriving({ world, keys, isModalOpen }) {
  const { me, cam, ground, npcs, stations, stream, onRoad, nearestRoad, scatter } = world;

  let speed = 0;
  let heading = 0;
  let steer = 0;
  let lean = 0;
  let stuck = 0;
  let lowFuelWarned = false;

  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _camLook = new THREE.Vector3();

  function alignToRoad(p) {
    if (p && p[2]) {
      heading = Math.atan2(p[2][2] - p[2][0], p[2][3] - p[2][1]);
      me.rotation.y = heading;
    }
  }

  function snapCam() {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    cam.position.set(me.position.x - fx * 11.5, 6.8, me.position.z - fz * 11.5);
    cam.lookAt(me.position.x + fx * 3, 1.4, me.position.z + fz * 3);
  }

  function reposition() {
    const p = nearestRoad(me.position.x, me.position.z, 6);
    if (p) {
      me.position.set(p[0], 0, p[1]);
      speed = 0;
      alignToRoad(p);
      stream(p[0], p[1]);
      snapCam();
      toast("Đã đưa về đường gần nhất", "var(--ok)");
    } else {
      toast("Không tìm thấy đường gần đây", "var(--bad)");
    }
  }

  function refuel() {
    const nearSt = stations.some((st) => Math.hypot(st.x - me.position.x, st.z - me.position.z) < 11);
    if (!nearSt) return;
    if (state.fuel >= 99) {
      toast("Bình xăng đã đầy!", "var(--ok)");
      return;
    }
    const cost = Math.max(1000, Math.round(((100 - state.fuel) * 250) / 1000) * 1000);
    if (state.money < cost) {
      toast("Không đủ tiền (" + cost.toLocaleString("vi-VN") + "đ). Làm nhiệm vụ để kiếm thêm!", "var(--bad)");
      return;
    }
    state.money -= cost;
    state.fuel = 100;
    saveProfile();
    playRefuel(state.soundOn);
    toast("Đã đổ đầy xăng (-" + cost.toLocaleString("vi-VN") + "đ)", "var(--ok)");
  }

  function honk() {
    playHorn(state.soundOn, getActiveBike());
    // NPC gần xe giật mình né nhẹ
    npcs.forEach((n) => {
      if (n.position.distanceTo(me.position) < 14) {
        const p = nearestRoad(n.position.x + (Math.random() - 0.5) * 14, n.position.z + (Math.random() - 0.5) * 14, 1);
        if (p) n.userData.t.set(p[0], 0, p[1]);
      }
    });
  }

  {
    const p = nearestRoad(geo.spawnX * geo.UX, -geo.spawnY * geo.UZ, 4);
    me.position.set(p ? p[0] : geo.spawnX * geo.UX, 0, p ? p[1] : -geo.spawnY * geo.UZ);
    alignToRoad(p);
  }
  npcs.forEach(scatter);
  stream(me.position.x, me.position.z);
  snapCam();

  function update(dt) {
    const bike = getActiveBike();
    const blocked = isModalOpen();
    const th = !blocked && (keys.w || keys.arrowup ? 1 : 0);
    const bk = !blocked && (keys.s || keys.arrowdown ? 1 : 0);
    const stTarget = blocked ? 0 : (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    const boost = !blocked && !!keys.shift && state.fuel > 0;
    steer += (stTarget - steer) * Math.min(1, 10 * dt);

    const outOfFuel = state.fuel <= 0.05;
    const maxSpd = outOfFuel ? 3.5 : boost ? bike.boostSpd : bike.maxSpd;
    if (th) {
      speed += (outOfFuel ? 8 : boost ? bike.accel * 1.9 : bike.accel) * dt;
      if (speed > maxSpd) speed = maxSpd;
    } else if (bk) {
      if (speed > 0.6) speed = Math.max(0, speed - 48 * dt);
      else speed = Math.max(-7.5, speed - 15 * dt);
    } else {
      const drag = 11 * dt;
      if (Math.abs(speed) <= drag) speed = 0;
      else speed -= Math.sign(speed) * drag;
    }

    if (Math.abs(speed) > 0.2 && !outOfFuel) {
      state.fuel = Math.max(0, state.fuel - Math.abs(speed) * dt * (boost ? 0.22 : 0.11) * bike.fuelMult);
      if (state.fuel <= 0 && !lowFuelWarned) {
        lowFuelWarned = true;
        toast("Hết xăng! Dắt xe tới cây xăng ⛽ gần nhất", "var(--bad)");
      }
    }
    if (state.fuel > 5) lowFuelWarned = false;

    const turnBase = 2.55 - 0.75 * Math.min(1, Math.abs(speed) / 45);
    const turnScale = speed >= 0 ? Math.max(0.32, Math.min(1, speed / 5)) : -0.65;
    if (Math.abs(speed) > 0.15 || Math.abs(stTarget) > 0.1) {
      heading += steer * turnBase * (Math.abs(speed) > 0.15 ? turnScale : 0.45) * dt;
    }
    me.rotation.y = heading;

    const targetLean = -steer * Math.min(1, Math.abs(speed) / 14) * 0.36;
    lean += (targetLean - lean) * Math.min(1, 10 * dt);
    me.userData.body.rotation.z = lean;
    me.userData.w1.rotation.x += speed * dt * 2.2;
    me.userData.w2.rotation.x += speed * dt * 2.2;

    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const ox = me.position.x;
    const oz = me.position.z;
    if (Math.abs(speed) > 0.02) {
      const nx = ox + fx * speed * dt;
      const nz = oz + fz * speed * dt;
      if (onRoad(nx, nz)) {
        me.position.x = nx;
        me.position.z = nz;
        stuck = 0;
      } else {
        const nr = nearestRoad(nx, nz, 1);
        let slid = false;
        if (nr) {
          const ix = nr[0] - nx;
          const iz = nr[1] - nz;
          const il = Math.hypot(ix, iz) || 1;
          for (const push of [0.35, 0.7, 1.1]) {
            const tx = nx + (ix / il) * push;
            const tz = nz + (iz / il) * push;
            if (onRoad(tx, tz)) {
              me.position.x = tx;
              me.position.z = tz;
              speed *= 0.94;
              slid = true;
              break;
            }
          }
        }
        if (!slid) {
          speed *= 0.4;
          stuck += dt;
        } else stuck = 0;
      }
    } else stuck = 0;

    $("re").classList.toggle("pulse", stuck > 1.2);
    $("tb").classList.toggle("dim", Math.abs(speed) > 0.8);
    ground.position.set(me.position.x, 0, me.position.z);
    stream(me.position.x, me.position.z);

    npcs.forEach((n) => {
      if (n.position.distanceTo(me.position) > 130) scatter(n);
      _v1.copy(n.userData.t).sub(n.position);
      if (_v1.length() < 1) {
        const p = nearestRoad(
          n.position.x + (Math.random() - 0.5) * 60,
          n.position.z + (Math.random() - 0.5) * 60,
          1
        );
        if (p) n.userData.t.set(p[0], 0, p[1]);
      } else {
        _v1.normalize();
        const nx = n.position.x + _v1.x * 2.2 * dt;
        const nz = n.position.z + _v1.z * 2.2 * dt;
        if (onRoad(nx, nz, 0.9)) {
          n.position.x = nx;
          n.position.z = nz;
          n.rotation.y = Math.atan2(_v1.x, _v1.z);
        } else {
          n.userData.t.copy(n.position);
        }
      }
    });

    const camDist = 11 + Math.min(5, Math.abs(speed) * 0.1);
    const camH = 6.6 + Math.min(2, Math.abs(speed) * 0.04);
    _v2.set(me.position.x - fx * camDist, camH, me.position.z - fz * camDist);
    cam.position.lerp(_v2, 1 - Math.exp(-7.5 * dt));
    _v1.set(me.position.x + fx * (3 + Math.abs(speed) * 0.06), 1.4, me.position.z + fz * (3 + Math.abs(speed) * 0.06));
    _camLook.lerp(_v1, 1 - Math.exp(-10 * dt));
    cam.lookAt(_camLook);
  }

  return {
    update,
    reposition,
    refuel,
    honk,
    getSpeed: () => speed,
    setSpeed: (v) => {
      speed = v;
    },
    getHeading: () => heading,
  };
}
