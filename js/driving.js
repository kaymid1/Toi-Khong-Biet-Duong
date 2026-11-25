import { state, saveProfile, getActiveBike, toast, geo, $ } from "./state.js";
import { playRefuel, playHorn, playError } from "./audio.js";

export function createDriving({ world, keys, isModalOpen, rewards }) {
  const { me, parkedVehicle, walker, cam, ground, npcs, stations, stream, onRoad, roadInfoAt, nearestRoad, scatter } =
    world;

  let mode = "drive"; // "drive" | "walk" | "passenger"
  let speed = 0;
  let heading = 0;
  let steer = 0;
  let lean = 0;
  let stuck = 0;
  let lowFuelWarned = false;
  let curRoadClass = 2;
  let motorwayWarnAt = 0;

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

  function enterDriveAt(x, z, h = heading) {
    mode = "drive";
    speed = 0;
    heading = h;
    me.position.set(x, 0, z);
    me.rotation.y = heading;
    me.visible = true;
    walker.visible = false;
    parkedVehicle.visible = false;
  }

  function reposition() {
    const allowHw = mode === "drive" && !!getActiveBike().allowHighway;
    const p = nearestRoad(me.position.x, me.position.z, 6, allowHw);
    if (p) {
      enterDriveAt(p[0], p[1], heading);
      alignToRoad(p);
      curRoadClass = p[2] ? p[2][6] : 2;
      stream(p[0], p[1]);
      snapCam();
      toast("Đã đưa xe về đường gần nhất", "var(--ok)");
    } else {
      toast("Không tìm thấy đường gần đây", "var(--bad)");
    }
  }

  function ensureLegalRoadAfterBikeChange() {
    if (mode !== "drive") return;
    const bike = getActiveBike();
    if (bike.allowHighway) return;
    const info = roadInfoAt ? roadInfoAt(me.position.x, me.position.z) : null;
    if (info && info.motorwayOnly) {
      reposition();
      toast("Đổi sang xe máy — tự động rời khỏi Cao tốc đúng luật VN", "var(--acc)");
    }
  }

  function toggleDismount() {
    if (mode === "passenger") {
      mode = "walk";
      speed = 0;
      me.position.x += Math.cos(heading) * 1.3;
      me.position.z -= Math.sin(heading) * 1.3;
      walker.position.copy(me.position);
      walker.rotation.y = heading;
      walker.visible = true;
      me.visible = false;
      toast("🚶 Đã xuống khỏi xe đồng đội", "var(--ok)");
      return mode;
    }

    if (mode === "drive") {
      if (Math.abs(speed) > 1.8) {
        toast("Hãy giảm tốc / dừng hẳn để xuống xe!", "var(--acc)");
        return mode;
      }
      speed = 0;
      parkedVehicle.position.copy(me.position);
      parkedVehicle.rotation.y = heading;
      parkedVehicle.visible = true;
      me.visible = false;

      // Step out to the sidewalk side
      const sx = me.position.x + Math.cos(heading) * 1.25;
      const sz = me.position.z - Math.sin(heading) * 1.25;
      const info = roadInfoAt ? roadInfoAt(sx, sz, 2.3) : { legalOnRoad: true };
      if (info.legalOnRoad) {
        me.position.set(sx, 0, sz);
      }
      walker.position.copy(me.position);
      walker.rotation.y = heading;
      walker.visible = true;
      mode = "walk";
      toast("🚶 Đã xuống xe đi bộ (Bấm V gần xe để lên lại)", "var(--ok)");
      return mode;
    }

    // mode === "walk"
    if (parkedVehicle.visible) {
      const d = Math.hypot(me.position.x - parkedVehicle.position.x, me.position.z - parkedVehicle.position.z);
      if (d <= 5.5) {
        enterDriveAt(parkedVehicle.position.x, parkedVehicle.position.z, parkedVehicle.rotation.y);
        toast("🏍️ Đã lên lại " + getActiveBike().name, "var(--ok)");
        return mode;
      }
      toast("Hãy lại gần xe đang đỗ (hoặc bấm R để gọi xe tới)", "var(--acc)");
    } else {
      reposition();
    }
    return mode;
  }

  function enterPassengerMode() {
    if (mode === "drive") {
      parkedVehicle.position.copy(me.position);
      parkedVehicle.rotation.y = heading;
      parkedVehicle.visible = true;
    }
    mode = "passenger";
    speed = 0;
    me.visible = false;
  }

  function updatePassengerPose(host) {
    if (mode !== "passenger" || !host) return;
    heading = host.heading || 0;
    speed = host.speed || 0;
    const isHostCar = host.bikeId === "sedan" || host.bikeId === "suv";
    me.position.set(host.x, 0, host.z);
    if (isHostCar) {
      walker.visible = false;
    } else {
      walker.visible = true;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      walker.position.set(host.x - fx * 0.52, 0.28, host.z - fz * 0.52);
      walker.rotation.y = heading;
      walker.userData.animateWalk(0, 0.016);
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
    if (rewards) rewards.onRefuel();
  }

  function honk() {
    if (mode !== "drive") return;
    playHorn(state.soundOn, getActiveBike());
    npcs.forEach((n) => {
      if (n.position.distanceTo(me.position) < 14) {
        const p = nearestRoad(n.position.x + (Math.random() - 0.5) * 14, n.position.z + (Math.random() - 0.5) * 14, 1);
        if (p) n.userData.t.set(p[0], 0, p[1]);
      }
    });
  }

  {
    const p = nearestRoad(geo.spawnX * geo.UX, -geo.spawnY * geo.UZ, 4, false);
    me.position.set(p ? p[0] : geo.spawnX * geo.UX, 0, p ? p[1] : -geo.spawnY * geo.UZ);
    alignToRoad(p);
  }
  npcs.forEach(scatter);
  stream(me.position.x, me.position.z);
  snapCam();

  function update(dt) {
    const bike = getActiveBike();
    const isCar = bike.vehicleType === "car";
    const blocked = isModalOpen();
    const th = !blocked && (keys.w || keys.arrowup ? 1 : 0);
    const bk = !blocked && (keys.s || keys.arrowdown ? 1 : 0);
    const stTarget = blocked ? 0 : (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    const boost = !blocked && !!keys.shift && (mode === "walk" || state.fuel > 0);
    steer += (stTarget - steer) * Math.min(1, 10 * dt);

    if (mode === "walk") {
      const maxWalk = boost ? 5.6 : 3.3;
      if (th) speed = Math.min(maxWalk, speed + 16 * dt);
      else if (bk) speed = Math.max(-2.2, speed - 12 * dt);
      else speed *= Math.max(0, 1 - 12 * dt);

      heading += steer * 3.1 * dt;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      if (Math.abs(speed) > 0.05) {
        const nx = me.position.x + fx * speed * dt;
        const nz = me.position.z + fz * speed * dt;
        const rInfo = roadInfoAt ? roadInfoAt(nx, nz, 2.3) : { legalOnRoad: true, c: 2 };
        if (rInfo.legalOnRoad) {
          me.position.x = nx;
          me.position.z = nz;
          curRoadClass = rInfo.c;
        } else {
          speed = 0;
        }
      }
      walker.position.copy(me.position);
      walker.rotation.y = heading;
      walker.userData.animateWalk(speed, dt);
      stuck = 0;
    } else if (mode === "drive") {
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
          toast("Hết xăng! Dắt xe tới cây xăng ⛽ gần nhất hoặc nhờ bạn chiết xăng", "var(--bad)");
        }
      }
      if (state.fuel > 5) lowFuelWarned = false;

      const turnBase = (isCar ? 1.95 : 2.55) - 0.75 * Math.min(1, Math.abs(speed) / 45);
      const turnScale = speed >= 0 ? Math.max(0.32, Math.min(1, speed / 5)) : -0.65;
      if (Math.abs(speed) > 0.15 || Math.abs(stTarget) > 0.1) {
        heading += steer * turnBase * (Math.abs(speed) > 0.15 ? turnScale : 0.45) * dt;
      }
      me.rotation.y = heading;

      const targetLean = isCar ? steer * 0.035 : -steer * Math.min(1, Math.abs(speed) / 14) * 0.36;
      lean += (targetLean - lean) * Math.min(1, 10 * dt);
      me.userData.body.rotation.z = lean;
      if (world.setBrakeLight) world.setBrakeLight(!!bk && speed > 0.3);
      if (me.userData.spinWheels) me.userData.spinWheels(speed * dt * 2.2, steer * 0.32);

      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const ox = me.position.x;
      const oz = me.position.z;
      const allowHw = !!bike.allowHighway;
      if (Math.abs(speed) > 0.02) {
        const nx = ox + fx * speed * dt;
        const nz = oz + fz * speed * dt;
        const rInfo = roadInfoAt
          ? roadInfoAt(nx, nz)
          : { onRoad: onRoad(nx, nz, 0.25, allowHw), legalOnRoad: onRoad(nx, nz), motorwayOnly: false, c: 2 };
        const canEnter = rInfo.legalOnRoad || (allowHw && rInfo.onRoad);
        if (canEnter) {
          me.position.x = nx;
          me.position.z = nz;
          curRoadClass = rInfo.c;
          stuck = 0;
        } else if (rInfo.motorwayOnly && !allowHw) {
          speed = -Math.sign(speed || 1) * Math.min(2.2, Math.abs(speed) * 0.25);
          const nowMs = performance.now();
          if (nowMs - motorwayWarnAt > 2600) {
            motorwayWarnAt = nowMs;
            playError(state.soundOn);
            toast("⛔ Cao tốc cấm xe máy! Đổi Ô tô trong Garage (G) để đi Cao tốc.", "var(--bad)");
          }
        } else {
          const nr = nearestRoad(nx, nz, 1, allowHw);
          let slid = false;
          if (nr) {
            const ix = nr[0] - nx;
            const iz = nr[1] - nz;
            const il = Math.hypot(ix, iz) || 1;
            for (const push of [0.35, 0.7, 1.1]) {
              const tx = nx + (ix / il) * push;
              const tz = nz + (iz / il) * push;
              if (onRoad(tx, tz, 0.25, allowHw)) {
                me.position.x = tx;
                me.position.z = tz;
                curRoadClass = nr[2][6];
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
      if (rewards) {
        const d = Math.hypot(me.position.x - ox, me.position.z - oz);
        if (d > 0.001) rewards.onDriveDistance(d);
      }
    }

    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    $("re").classList.toggle("pulse", stuck > 1.2);
    $("tb").classList.toggle("dim", mode === "drive" && Math.abs(speed) > 0.8);
    ground.position.set(me.position.x, 0, me.position.z);
    if (world.updateSunTarget) world.updateSunTarget(me.position.x, me.position.z);
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

    const camDist = mode === "walk" ? 7.2 : (isCar ? 13.0 : 11.0) + Math.min(5, Math.abs(speed) * 0.1);
    const camH = mode === "walk" ? 4.2 : (isCar ? 7.2 : 6.6) + Math.min(2, Math.abs(speed) * 0.04);
    _v2.set(me.position.x - fx * camDist, camH, me.position.z - fz * camDist);
    cam.position.lerp(_v2, 1 - Math.exp(-7.5 * dt));
    _v1.set(me.position.x + fx * (3 + Math.abs(speed) * 0.06), 1.4, me.position.z + fz * (3 + Math.abs(speed) * 0.06));
    _camLook.lerp(_v1, 1 - Math.exp(-10 * dt));
    cam.lookAt(_camLook);
  }

  return {
    update,
    reposition,
    ensureLegalRoadAfterBikeChange,
    toggleDismount,
    enterPassengerMode,
    updatePassengerPose,
    refuel,
    honk,
    getMode: () => mode,
    getSpeed: () => speed,
    setSpeed: (v) => {
      speed = v;
    },
    getHeading: () => heading,
    getRoadClass: () => curRoadClass,
  };
}
