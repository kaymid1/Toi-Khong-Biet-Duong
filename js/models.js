// Procedural low-poly Vietnamese models & textures (no brand logos, CC0-safe fallback)

export function makeFacadeTexture(variant = 0) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const ctx = cv.getContext("2d");

  // Neutral plaster base (tinted by InstancedMesh color)
  ctx.fillStyle = "#f2efe9";
  ctx.fillRect(0, 0, 256, 256);

  // Subtle horizontal floor bands
  const floors = 4;
  const fh = 256 / floors;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    // Floor slab line
    ctx.fillStyle = "rgba(40, 48, 56, 0.16)";
    ctx.fillRect(0, y, 256, 4);

    if (f === floors - 1) {
      // Ground floor: Vietnamese shopfront rolling door / glass door
      ctx.fillStyle = "#2b3844";
      ctx.fillRect(28, y + 12, 200, fh - 12);
      ctx.strokeStyle = "#4d6173";
      ctx.lineWidth = 2;
      for (let sy = y + 18; sy < 254; sy += 7) {
        ctx.beginPath();
        ctx.moveTo(30, sy);
        ctx.lineTo(226, sy);
        ctx.stroke();
      }
      // Side pillars
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(10, y + 6, 14, fh - 6);
      ctx.fillRect(232, y + 6, 14, fh - 6);
    } else {
      // Upper floors: windows + balcony railing
      const cols = variant === 1 ? 3 : 2;
      const pad = 26;
      const gap = 18;
      const ww = (256 - pad * 2 - gap * (cols - 1)) / cols;
      for (let c = 0; c < cols; c++) {
        const wx = pad + c * (ww + gap);
        const wy = y + 12;
        const wh = fh - 26;
        // Window frame
        ctx.fillStyle = "#3a4b5c";
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        // Glass with subtle warm/sky reflection
        const grad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        grad.addColorStop(0, variant === 2 ? "#466885" : "#537895");
        grad.addColorStop(1, "#2a3e52");
        ctx.fillStyle = grad;
        ctx.fillRect(wx, wy, ww, wh);
        // Warm indoor glow on some windows
        if ((f + c + variant) % 3 === 0) {
          ctx.fillStyle = "rgba(255, 214, 130, 0.35)";
          ctx.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        }
        // Window muntins
        ctx.fillStyle = "rgba(235, 242, 248, 0.65)";
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        ctx.fillRect(wx, wy + wh / 2 - 1, ww, 2);
      }
      // Balcony railing bar
      ctx.fillStyle = "rgba(35, 45, 55, 0.55)";
      ctx.fillRect(18, y + fh - 12, 220, 3);
      for (let rx = 24; rx <= 232; rx += 16) {
        ctx.fillRect(rx, y + fh - 12, 2, 10);
      }
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function makeBlobShadowTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128;
  cv.height = 128;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  g.addColorStop(0, "rgba(10, 15, 22, 0.52)");
  g.addColorStop(0.55, "rgba(10, 15, 22, 0.25)");
  g.addColorStop(1, "rgba(10, 15, 22, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

const mat = (c, opts = {}) => new THREE.MeshLambertMaterial({ color: c, ...opts });

export function createPlayerBikeRig() {
  const root = new THREE.Group();

  // Blob shadow under the bike (always visible, great for Low quality too)
  const blobTex = makeBlobShadowTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.5),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  root.add(blob);

  const body = new THREE.Group();
  root.add(body);

  // Shared materials
  const bdMat = mat(0xe0392d);
  const darkMat = mat(0x1f262e);
  const metalMat = mat(0x9aa6b2);
  const seatMat = mat(0x23252a);
  const skinMat = mat(0xf0c29c);
  const shirtMat = mat(0x2d6cdf);
  const pantsMat = mat(0x283546);
  const helmetMat = mat(0xf5b82e);
  const headLightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const tailMat = new THREE.MeshLambertMaterial({
    color: 0x8b1111,
    emissive: 0x330000,
    emissiveIntensity: 1,
  });

  // Wheels (front & rear)
  const makeWheel = (r, w) => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), darkMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10), metalMat);
    rim.rotation.z = Math.PI / 2;
    wg.add(tire, rim);
    return wg;
  };

  const wFront = makeWheel(0.32, 0.14);
  const wRear = makeWheel(0.32, 0.16);
  wFront.position.set(0, 0.32, 0.68);
  wRear.position.set(0, 0.32, -0.66);

  // Front fork & handlebar group (rotates with steer)
  const frontFork = new THREE.Group();
  frontFork.position.set(0, 0.32, 0.68);
  const wFrontLocal = makeWheel(0.32, 0.14);
  frontFork.add(wFrontLocal);

  const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.68, 6), metalMat);
  forkL.position.set(-0.1, 0.34, -0.05);
  forkL.rotation.x = -0.22;
  const forkR = forkL.clone();
  forkR.position.x = 0.1;
  const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.64, 6), darkMat);
  hbar.rotation.z = Math.PI / 2;
  hbar.position.set(0, 0.72, -0.14);
  const headCowling = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.2), bdMat);
  headCowling.position.set(0, 0.66, -0.04);
  headCowling.castShadow = true;
  const headLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), headLightMat);
  headLamp.position.set(0, 0.66, 0.06);
  frontFork.add(forkL, forkR, hbar, headCowling, headLamp);

  // Variant chassis groups
  const variantGroups = {};

  // 1. CUB / WAVE (Xe số phổ thông)
  {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 1.15), bdMat);
    frame.position.set(0, 0.48, -0.08);
    frame.castShadow = true;
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.12), mat(0xedeae4)); // yếm xe trắng
    shield.position.set(0, 0.5, 0.35);
    shield.rotation.x = 0.22;
    shield.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.68), seatMat);
    seat.position.set(0, 0.76, -0.22);
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 0.3), metalMat);
    engine.position.set(0, 0.32, 0.05);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 8), metalMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.18, 0.28, -0.35);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), tailMat);
    tail.position.set(0, 0.68, -0.78);
    g.add(frame, shield, seat, engine, exhaust, tail);
    variantGroups.cub = g;
    body.add(g);
  }

  // 2. SCOOTER (Xe tay ga kiểu Vision/Lead)
  {
    const g = new THREE.Group();
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.28), bdMat);
    apron.position.set(0, 0.52, 0.42);
    apron.rotation.x = 0.15;
    apron.castShadow = true;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.56), darkMat);
    floor.position.set(0, 0.28, 0.08);
    const rearBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.38, 0.72), bdMat);
    rearBody.position.set(0, 0.56, -0.38);
    rearBody.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.66), seatMat);
    seat.position.set(0, 0.78, -0.28);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.6, 8), darkMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.22, 0.28, -0.45);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.06), tailMat);
    tail.position.set(0, 0.68, -0.76);
    g.add(apron, floor, rearBody, seat, exhaust, tail);
    g.visible = false;
    variantGroups.scooter = g;
    body.add(g);
  }

  // 3. MANUAL (Xe côn tay kiểu Exciter/Winner)
  {
    const g = new THREE.Group();
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.95), bdMat);
    fairing.position.set(0, 0.58, 0.05);
    fairing.castShadow = true;
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), bdMat);
    tank.position.set(0, 0.76, 0.22);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.64), seatMat);
    seat.position.set(0, 0.79, -0.26);
    seat.rotation.x = -0.1;
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.34), darkMat);
    engine.position.set(0, 0.36, 0.04);
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.75, 8), metalMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.rotation.y = -0.05;
    exhaust.position.set(0.2, 0.38, -0.42);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.08), tailMat);
    tail.position.set(0, 0.82, -0.76);
    g.add(fairing, tank, seat, engine, exhaust, tail);
    g.visible = false;
    variantGroups.manual = g;
    body.add(g);
  }

  // 4. PKL (Mô tô phân khối lớn)
  {
    const g = new THREE.Group();
    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.52), bdMat);
    tank.position.set(0, 0.78, 0.18);
    tank.castShadow = true;
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.44), darkMat);
    engine.position.set(0, 0.42, 0.05);
    engine.castShadow = true;
    const tailCowl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.58), bdMat);
    tailCowl.position.set(0, 0.78, -0.42);
    tailCowl.rotation.x = -0.14;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.46), seatMat);
    seat.position.set(0, 0.78, -0.22);
    const exL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.75, 8), metalMat);
    exL.rotation.x = Math.PI / 2;
    exL.position.set(-0.22, 0.34, -0.45);
    const exR = exL.clone();
    exR.position.x = 0.22;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.06), tailMat);
    tail.position.set(0, 0.84, -0.74);
    g.add(tank, engine, tailCowl, seat, exL, exR, tail);
    g.visible = false;
    variantGroups.pkl = g;
    body.add(g);
  }

  // Rider with half-shell helmet
  const rider = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.24), shirtMat);
  torso.position.set(0, 1.18, -0.16);
  torso.rotation.x = 0.18;
  torso.castShadow = true;

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.46, 0.15), pantsMat);
  legL.position.set(-0.16, 0.72, 0.04);
  legL.rotation.x = -0.35;
  const legR = legL.clone();
  legR.position.x = 0.16;

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), shirtMat);
  armL.position.set(-0.22, 1.16, 0.12);
  armL.rotation.x = -0.95;
  const armR = armL.clone();
  armR.position.x = 0.22;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skinMat);
  head.position.set(0, 1.56, -0.08);
  head.castShadow = true;

  // Half-shell Vietnamese helmet + visor
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    helmetMat
  );
  helmet.position.set(0, 1.58, -0.08);
  helmet.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.1), darkMat);
  visor.position.set(0, 1.59, 0.08);
  visor.rotation.x = 0.18;

  rider.add(torso, legL, legR, armL, armR, head, helmet, visor);
  body.add(wRear, frontFork, rider);

  function setBikeModel(bikeId, hexColor) {
    bdMat.color.setHex(hexColor);
    Object.entries(variantGroups).forEach(([id, grp]) => {
      grp.visible = id === bikeId;
    });
    // Adjust rider lean slightly for sporty bikes
    torso.rotation.x = bikeId === "pkl" || bikeId === "manual" ? 0.32 : 0.15;
  }

  function setBrakeLight(braking) {
    tailMat.emissive.setHex(braking ? 0xff1744 : 0x330000);
    tailMat.emissiveIntensity = braking ? 2.2 : 0.8;
  }

  root.userData = {
    body,
    frontFork,
    w1: wFrontLocal,
    w2: wRear,
    bdMat,
    setBikeModel,
    setBrakeLight,
  };
  return root;
}

export function createNpcMesh(index) {
  const p = new THREE.Group();
  const shirt = mat(new THREE.Color().setHSL((index * 0.17) % 1, 0.55, 0.5));
  const pants = mat(0x2b3642);
  const skin = mat(0xf0c29c);

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.72, 8), pants);
  legs.position.y = 0.36;
  legs.castShadow = true;

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.62, 8), shirt);
  torso.position.y = 1.02;
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 8), skin);
  head.position.y = 1.48;
  head.castShadow = true;

  p.add(legs, torso, head);

  // Every other NPC wears a traditional Vietnamese nón lá (conical hat)
  if (index % 2 === 0) {
    const nonLa = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 12), mat(0xe6cf9a));
    nonLa.position.y = 1.63;
    nonLa.castShadow = true;
    p.add(nonLa);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(0x1c1c1e)
    );
    hair.position.y = 1.5;
    p.add(hair);
  }

  p.userData.t = new THREE.Vector3();
  return p;
}

export function createGasStationMesh(st, makeBillboard) {
  const grp = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.14, 5.2), mat(0x4b5c68));
  pad.position.y = 0.07;
  pad.receiveShadow = true;

  // Petrolimex-inspired blue + orange canopy
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.58, 4.8), mat(0x0d47a1));
  roof.position.y = 4.3;
  roof.castShadow = true;

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.72, 0.26, 4.92), mat(0xef6c00));
  stripe.position.y = 4.02;

  const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 4.1, 0.42), mat(0xedf2f7));
  p1.position.set(-2.5, 2.05, 0);
  p1.castShadow = true;
  const p2 = p1.clone();
  p2.position.set(2.5, 2.05, 0);

  const makePump = (px) => {
    const pg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.45, 0.58), mat(0xef6c00));
    base.position.y = 0.75;
    base.castShadow = true;
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.61), mat(0x102027));
    screen.position.y = 1.1;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.22, 0.6), mat(0x0d47a1));
    top.position.y = 1.52;
    pg.add(base, screen, top);
    pg.position.set(px, 0.12, 0);
    return pg;
  };

  const lbl = makeBillboard("⛽ " + st.label, "#0b281d", "#3ddc97", "bold 17px 'Be Vietnam Pro',system-ui");
  lbl.position.y = 6.9;
  lbl.scale.set(11, 2.6, 1);

  grp.add(pad, roof, stripe, p1, p2, makePump(-1.0), makePump(1.0), lbl);
  return grp;
}

export function createLandmarkMesh(lm, makeBillboard) {
  const gLm = new THREE.Group();
  if (lm.type === "bridge" || lm.type === "bridge2") {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(32, 1.2, 6), mat(0x546e7a));
    deck.position.y = 2.2;
    deck.castShadow = true;
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(14, 1.15, 8, 22, Math.PI),
      mat(lm.type === "bridge" ? 0xffb020 : 0x4fc3f7)
    );
    arch.position.y = 2.5;
    arch.castShadow = true;
    gLm.add(deck, arch);
  } else if (lm.type === "cable") {
    const tw = new THREE.Mesh(new THREE.ConeGeometry(3, 28, 4), mat(0xe8eef5));
    tw.position.y = 14;
    tw.castShadow = true;
    gLm.add(tw);
  } else if (lm.type === "airport") {
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 22, 8), mat(0x90a4ae));
    tw.position.y = 11;
    tw.castShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.4, 3.5, 8), mat(0x4fc3f7));
    top.position.y = 23;
    gLm.add(tw, top);
  } else if (lm.type === "beach") {
    const umb = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 8), mat(0x29b6f6));
    umb.position.y = 9;
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 9, 6), mat(0xffe082));
    pl.position.y = 4.5;
    gLm.add(umb, pl);
  } else {
    const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 12), mat(0xe3b8a6));
    hall.position.y = 4;
    hall.castShadow = true;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(12, 5, 4), mat(0xb71c1c));
    rf.position.y = 10.5;
    rf.rotation.y = Math.PI / 4;
    rf.castShadow = true;
    gLm.add(hall, rf);
  }
  const sp = makeBillboard("★ " + lm.name, "#131d29dd", "#ffb020", "bold 24px 'Be Vietnam Pro',system-ui");
  sp.position.y = 29;
  gLm.add(sp);
  return gLm;
}
