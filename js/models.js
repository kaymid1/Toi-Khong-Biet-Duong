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

export function makeShopSignTexture(variant = 0) {
  const specs = [
    { bg: "#b71c1c", fg: "#ffd54f", txt: "PHỞ · BÚN BÒ" },
    { bg: "#1b5e20", fg: "#ffffff", txt: "CÀ PHÊ ĐÁ" },
    { bg: "#0d47a1", fg: "#fff59d", txt: "TẠP HÓA 24H" },
    { bg: "#4a148c", fg: "#80cbc4", txt: "NHÀ THUỐC" },
  ];
  const sp = specs[variant % specs.length];
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = sp.bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = sp.fg;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = sp.fg;
  ctx.font = "bold 26px 'Be Vietnam Pro',system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(sp.txt, 128, 33);
  return new THREE.CanvasTexture(cv);
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

  // 5. SEDAN (Ô tô 4 chỗ)
  const carGlassMat = mat(0x1f3040);
  const plateMat = mat(0xfafafa);
  {
    const g = new THREE.Group();
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.56, 3.45), bdMat);
    lower.position.set(0, 0.56, 0);
    lower.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.48, 1.75), bdMat);
    cabin.position.set(0, 1.06, -0.15);
    cabin.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.36, 1.56), carGlassMat);
    glass.position.set(0, 1.05, -0.15);
    const windF = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.42, 0.08), carGlassMat);
    windF.position.set(0, 1.02, 0.72);
    windF.rotation.x = -0.52;
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.18, 0.2), darkMat);
    bumperF.position.set(0, 0.34, 1.66);
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), headLightMat);
    hlL.position.set(-0.52, 0.56, 1.73);
    const hlR = hlL.clone();
    hlR.position.x = 0.52;
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.06), tailMat);
    tlL.position.set(-0.5, 0.62, -1.73);
    const tlR = tlL.clone();
    tlR.position.x = 0.5;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.04), plateMat);
    plate.position.set(0, 0.42, -1.74);
    g.add(lower, cabin, glass, windF, bumperF, hlL, hlR, tlL, tlR, plate);
    g.visible = false;
    variantGroups.sedan = g;
    body.add(g);
  }

  // 6. SUV (Ô tô phượt cao tốc)
  {
    const g = new THREE.Group();
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.66, 3.65), bdMat);
    lower.position.set(0, 0.66, 0);
    lower.castShadow = true;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.58, 2.35), bdMat);
    cabin.position.set(0, 1.24, -0.35);
    cabin.castShadow = true;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.42, 2.15), carGlassMat);
    glass.position.set(0, 1.23, -0.35);
    const rackL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.85), darkMat);
    rackL.position.set(-0.58, 1.56, -0.35);
    const rackR = rackL.clone();
    rackR.position.x = 0.58;
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.22, 0.24), darkMat);
    bumperF.position.set(0, 0.42, 1.76);
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), headLightMat);
    hlL.position.set(-0.58, 0.68, 1.83);
    const hlR = hlL.clone();
    hlR.position.x = 0.58;
    const tlL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.06), tailMat);
    tlL.position.set(-0.58, 0.72, -1.83);
    const tlR = tlL.clone();
    tlR.position.x = 0.58;
    const spare = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12), darkMat);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 0.78, -1.88);
    g.add(lower, cabin, glass, rackL, rackR, bumperF, hlL, hlR, tlL, tlR, spare);
    g.visible = false;
    variantGroups.suv = g;
    body.add(g);
  }

  // 4 Car wheels
  const carWheelGroup = new THREE.Group();
  const cwFL = makeWheel(0.35, 0.22);
  cwFL.position.set(-0.76, 0.35, 1.05);
  const cwFR = makeWheel(0.35, 0.22);
  cwFR.position.set(0.76, 0.35, 1.05);
  const cwRL = makeWheel(0.35, 0.22);
  cwRL.position.set(-0.76, 0.35, -1.05);
  const cwRR = makeWheel(0.35, 0.22);
  cwRR.position.set(0.76, 0.35, -1.05);
  carWheelGroup.add(cwFL, cwFR, cwRL, cwRR);
  carWheelGroup.visible = false;
  body.add(carWheelGroup);

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

  // Pillion passenger on rear motorbike seat
  const pillion = new THREE.Group();
  const pShirtMat = mat(0x3ddc97);
  const pTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.48, 0.22), pShirtMat);
  pTorso.position.set(0, 1.16, -0.5);
  pTorso.rotation.x = 0.2;
  pTorso.castShadow = true;
  const pLegL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.14), pantsMat);
  pLegL.position.set(-0.16, 0.72, -0.38);
  pLegL.rotation.x = -0.25;
  const pLegR = pLegL.clone();
  pLegR.position.x = 0.16;
  const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), skinMat);
  pHead.position.set(0, 1.53, -0.44);
  const pHelmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    mat(0xffffff)
  );
  pHelmet.position.set(0, 1.55, -0.44);
  pillion.add(pTorso, pLegL, pLegR, pHead, pHelmet);
  pillion.visible = false;

  body.add(wRear, frontFork, rider, pillion);

  let isCar = false;
  let riderVisible = true;
  let pillionActive = false;

  function syncVisibility() {
    wRear.visible = !isCar;
    frontFork.visible = !isCar;
    rider.visible = !isCar && riderVisible;
    carWheelGroup.visible = isCar;
    pillion.visible = !isCar && pillionActive;
    blob.scale.set(isCar ? 1.65 : 1.0, isCar ? 1.85 : 1.0, 1);
  }

  function setBikeModel(bikeId, hexColor) {
    bdMat.color.setHex(hexColor);
    isCar = bikeId === "sedan" || bikeId === "suv";
    Object.entries(variantGroups).forEach(([id, grp]) => {
      grp.visible = id === bikeId;
    });
    torso.rotation.x = bikeId === "pkl" || bikeId === "manual" ? 0.32 : 0.15;
    syncVisibility();
  }

  function setRiderVisible(v) {
    riderVisible = !!v;
    syncVisibility();
  }

  function setPillion(active, hexColor = 0x3ddc97) {
    pillionActive = !!active;
    pShirtMat.color.setHex(hexColor);
    syncVisibility();
  }

  function setBrakeLight(braking) {
    tailMat.emissive.setHex(braking ? 0xff1744 : 0x330000);
    tailMat.emissiveIntensity = braking ? 2.2 : 0.8;
  }

  function spinWheels(deltaAngle, steerAngle) {
    wFrontLocal.rotation.x += deltaAngle;
    wRear.rotation.x += deltaAngle;
    frontFork.rotation.y = steerAngle;
    cwFL.rotation.x += deltaAngle;
    cwFR.rotation.x += deltaAngle;
    cwRL.rotation.x += deltaAngle;
    cwRR.rotation.x += deltaAngle;
    cwFL.rotation.y = steerAngle * 0.7;
    cwFR.rotation.y = steerAngle * 0.7;
  }

  const chat = createChatBubbleHelper(root, 2.65);

  root.userData = {
    body,
    frontFork,
    w1: wFrontLocal,
    w2: wRear,
    bdMat,
    setBikeModel,
    setRiderVisible,
    setPillion,
    setBrakeLight,
    spinWheels,
    chat,
    say: chat.say,
    updateChat: chat.update,
  };
  return root;
}

export function createWalkerRig() {
  const root = new THREE.Group();
  const blobTex = makeBlobShadowTexture();
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  root.add(blob);

  const body = new THREE.Group();
  const shirtMat = mat(0x2d6cdf);
  const pantsMat = mat(0x283546);
  const skinMat = mat(0xf0c29c);
  const capMat = mat(0xf5b82e);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.15), pantsMat);
  legL.position.set(-0.1, 0.28, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.1;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.54, 0.24), shirtMat);
  torso.position.set(0, 0.84, 0);
  torso.castShadow = true;

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.46, 0.11), shirtMat);
  armL.position.set(-0.26, 0.84, 0);
  armL.castShadow = true;
  const armR = armL.clone();
  armR.position.x = 0.26;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), skinMat);
  head.position.set(0, 1.3, 0);
  head.castShadow = true;

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56),
    capMat
  );
  helmet.position.set(0, 1.32, 0);
  helmet.castShadow = true;

  body.add(legL, legR, torso, armL, armR, head, helmet);
  root.add(body);

  let walkPhase = 0;
  function animateWalk(speed, dt) {
    if (Math.abs(speed) > 0.2) {
      walkPhase += dt * Math.abs(speed) * 2.4;
      const swing = Math.sin(walkPhase) * 0.55;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      body.position.y = Math.abs(Math.cos(walkPhase)) * 0.04;
    } else {
      legL.rotation.x *= 0.8;
      legR.rotation.x *= 0.8;
      armL.rotation.x *= 0.8;
      armR.rotation.x *= 0.8;
      body.position.y *= 0.8;
    }
  }

  const chat = createChatBubbleHelper(root, 2.35);
  root.userData = {
    body,
    animateWalk,
    chat,
    say: chat.say,
    updateChat: chat.update,
  };
  return root;
}

function createChatBubbleHelper(rig, baseY = 2.65) {
  const cv = document.createElement("canvas");
  cv.width = 420;
  cv.height = 160;
  const ctx = cv.getContext("2d");
  const tex = new THREE.CanvasTexture(cv);
  const spMat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
  });
  const sp = new THREE.Sprite(spMat);
  sp.position.y = baseY;
  sp.scale.set(4.1, 1.56, 1);
  sp.visible = false;
  rig.add(sp);

  let startAt = 0;
  let expiresAt = 0;

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + w / 2 + 12, y + h);
    ctx.lineTo(x + w / 2, y + h + 16);
    ctx.lineTo(x + w / 2 - 12, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function say(rawText, durationMs = 5200) {
    const clean = String(rawText || "").trim().slice(0, 72);
    if (!clean) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.font = "700 24px 'Be Vietnam Pro',system-ui,sans-serif";

    const maxTextW = 340;
    const words = clean.split(/\s+/);
    const lines = [];
    let curLine = "";
    for (const w of words) {
      const test = curLine ? curLine + " " + w : w;
      if (ctx.measureText(test).width > maxTextW && curLine) {
        lines.push(curLine);
        curLine = w;
        if (lines.length >= 2) break;
      } else {
        curLine = test;
      }
    }
    if (curLine && lines.length < 2) lines.push(curLine);
    if (lines.length === 2 && words.join(" ").length > lines.join(" ").length) {
      lines[1] = lines[1].slice(0, Math.max(1, lines[1].length - 1)) + "…";
    }

    const lineH = 30;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width), 64);
    const bw = Math.min(396, textW + 46);
    const bh = lines.length * lineH + 28;
    const bx = (cv.width - bw) / 2;
    const by = cv.height - bh - 24;

    ctx.save();
    ctx.shadowColor = "rgba(8, 14, 22, 0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    drawRoundedRect(bx, by, bw, bh, 22);
    ctx.fillStyle = "#fffef9";
    ctx.fill();
    ctx.restore();

    drawRoundedRect(bx, by, bw, bh, 22);
    ctx.strokeStyle = "#2b3d50";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#141d26";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = by + bh / 2 - ((lines.length - 1) * lineH) / 2;
    lines.forEach((ln, i) => {
      ctx.fillText(ln, cv.width / 2, startY + i * lineH);
    });

    tex.needsUpdate = true;
    const now = performance.now();
    startAt = now;
    expiresAt = now + durationMs;
    sp.visible = true;
  }

  function update(now = performance.now()) {
    if (!sp.visible) return;
    if (now >= expiresAt) {
      sp.visible = false;
      return;
    }
    const elapsed = now - startAt;
    const pop = elapsed < 160 ? 0.65 + (elapsed / 160) * 0.42 : elapsed < 260 ? 1.07 - ((elapsed - 160) / 100) * 0.07 : 1;
    const rem = expiresAt - now;
    spMat.opacity = rem < 650 ? Math.max(0, rem / 650) : 1;
    sp.scale.set(4.1 * pop, 1.56 * pop, 1);
  }

  return {
    sprite: sp,
    setHeight: (y) => {
      sp.position.y = y;
    },
    say,
    update,
    dispose: () => {
      tex.dispose();
      spMat.dispose();
    },
  };
}

export function createNpcMesh(index) {
  const p = new THREE.Group();
  const body = new THREE.Group();
  const shirt = mat(new THREE.Color().setHSL((index * 0.17) % 1, 0.55, 0.5));
  const pants = mat(0x2b3642);
  const skin = mat(0xf0c29c);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.14), pants);
  legL.position.set(-0.09, 0.28, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.09;

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.52, 0.22), shirt);
  torso.position.y = 0.84;
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), skin);
  head.position.y = 1.3;
  head.castShadow = true;

  body.add(legL, legR, torso, head);

  // Every other NPC wears a traditional Vietnamese nón lá (conical hat)
  if (index % 2 === 0) {
    const nonLa = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.19, 12), mat(0xe6cf9a));
    nonLa.position.y = 1.44;
    nonLa.castShadow = true;
    body.add(nonLa);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.175, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      mat(0x1c1c1e)
    );
    hair.position.y = 1.32;
    body.add(hair);
  }
  p.add(body);

  let phase = index * 1.1;
  function animateWalk(speed, dt) {
    if (Math.abs(speed) > 0.15) {
      phase += dt * Math.abs(speed) * 2.8;
      const swing = Math.sin(phase) * 0.48;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      body.position.y = Math.abs(Math.cos(phase)) * 0.035;
    } else {
      legL.rotation.x *= 0.8;
      legR.rotation.x *= 0.8;
      body.position.y *= 0.8;
    }
  }

  p.userData.npcType = "ped";
  p.userData.t = new THREE.Vector3();
  p.userData.animateWalk = animateWalk;
  return p;
}

export function createNpcBikeMesh(index) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const bikeColors = [0xd32f2f, 0x1976d2, 0xf5f5f5, 0x2e7d32, 0xf9a825, 0x37474f];
  const shirtColors = [0x26a69a, 0x42a5f5, 0xff7043, 0xab47bc, 0x66bb6a, 0xec407a];
  const bikeMat = mat(bikeColors[index % bikeColors.length]);
  const darkMat = mat(0x1f262e);
  const metalMat = mat(0x9aa6b2);
  const shirtMat = mat(shirtColors[(index + 2) % shirtColors.length]);
  const helmetMat = mat(index % 3 === 0 ? 0xf5b82e : index % 3 === 1 ? 0xffffff : 0x1e88e5);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.14, 10);
  const wF = new THREE.Mesh(wheelGeo, darkMat);
  wF.rotation.z = Math.PI / 2;
  wF.position.set(0, 0.3, 0.64);
  wF.castShadow = true;
  const wR = wF.clone();
  wR.position.z = -0.62;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 1.15), bikeMat);
  frame.position.set(0, 0.5, -0.04);
  frame.castShadow = true;
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.46, 0.14), mat(0xedeae4));
  shield.position.set(0, 0.52, 0.36);
  shield.rotation.x = 0.2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.64), darkMat);
  seat.position.set(0, 0.74, -0.2);
  const hbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.58, 6), darkMat);
  hbar.rotation.z = Math.PI / 2;
  hbar.position.set(0, 0.96, 0.46);
  const headLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }));
  headLamp.position.set(0, 0.88, 0.56);
  const tailLamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.06), new THREE.MeshBasicMaterial({ color: 0xd32f2f }));
  tailLamp.position.set(0, 0.66, -0.74);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.22), shirtMat);
  torso.position.set(0, 1.14, -0.14);
  torso.rotation.x = 0.16;
  torso.castShadow = true;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.44, 0.18), darkMat);
  legs.position.set(0, 0.72, 0.02);
  legs.rotation.x = -0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xf0c29c));
  head.position.set(0, 1.52, -0.07);
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.185, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    helmetMat
  );
  helmet.position.set(0, 1.54, -0.07);
  helmet.castShadow = true;

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), metalMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.17, 0.28, -0.34);

  body.add(wF, wR, frame, shield, seat, hbar, headLamp, tailLamp, torso, legs, head, helmet, exhaust);
  root.userData.npcType = "bike";
  root.userData.t = new THREE.Vector3();
  root.userData.spinWheels = (da) => {
    wF.rotation.x += da;
    wR.rotation.x += da;
  };
  return root;
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
  if (lm.type === "bridge") {
    // Cầu Rồng: chuỗi vòm thân rồng vàng uốn lượn dọc cầu + đầu rồng phía Đông
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xffb300, emissive: 0x5c3800 });
    const bellyMat = mat(0xffe082);
    for (const [zOff, rad, yBase] of [
      [-42, 16, 4],
      [0, 21, 5],
      [42, 16, 4],
    ]) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(rad, 1.55, 8, 22, Math.PI), goldMat);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(0, yBase, zOff);
      arch.castShadow = true;
      const rib = new THREE.Mesh(new THREE.TorusGeometry(rad - 1.1, 0.55, 6, 18, Math.PI), bellyMat);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0, yBase, zOff);
      gLm.add(arch, rib);
    }
    // Đầu rồng vàng đặc trưng
    const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 6.2), goldMat);
    head.position.set(0, 14.5, 59);
    head.rotation.x = -0.22;
    const snout = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 3.4), goldMat);
    snout.position.set(0, 15.2, 63.2);
    const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.2, 6), bellyMat);
    hornL.position.set(-1.1, 17.2, 57.5);
    hornL.rotation.x = -0.5;
    const hornR = hornL.clone();
    hornR.position.x = 1.1;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3d00 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 6), eyeMat);
    eyeL.position.set(-1.5, 15.6, 61);
    const eyeR = eyeL.clone();
    eyeR.position.x = 1.5;
    gLm.add(head, snout, hornL, hornR, eyeL, eyeR);

    // Đuôi rồng phía Tây
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.8, 8.5, 6), goldMat);
    tail.position.set(0, 11.5, -59);
    tail.rotation.x = -Math.PI / 3;
    gLm.add(tail);

    const pierGeo = new THREE.BoxGeometry(1.5, 7, 2.4);
    const pierMat = mat(0x546e7a);
    for (const sx of [-11.5, 11.5]) {
      for (const sz of [-42, 0, 42]) {
        const pr = new THREE.Mesh(pierGeo, pierMat);
        pr.position.set(sx, 3.5, sz);
        pr.castShadow = true;
        gLm.add(pr);
      }
    }
  } else if (lm.type === "bridge2") {
    // Cầu Sông Hàn: tháp dây văng trung tâm + vòm xanh lam
    const towerMat = mat(0xe8eef5);
    const cableMat = mat(0x4fc3f7);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 30, 2.6), towerMat);
    tower.position.set(0, 15, 0);
    tower.castShadow = true;
    const topCap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 4), cableMat);
    topCap.position.set(0, 31.5, 0);
    topCap.rotation.y = Math.PI / 4;
    gLm.add(tower, topCap);
    for (const sz of [-24, -14, 14, 24]) {
      const stay = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 29, 6), cableMat);
      stay.position.set(0, 15, sz * 0.52);
      stay.rotation.x = sz > 0 ? -0.68 : 0.68;
      gLm.add(stay);
    }
  } else if (lm.type === "cable") {
    // A-frame cable-stayed bridge pylon straddling outside the roadway
    const legGeo = new THREE.BoxGeometry(1.4, 30, 1.8);
    const pylonMat = mat(0xe8eef5);
    const legL = new THREE.Mesh(legGeo, pylonMat);
    legL.position.set(-5.6, 14, 0);
    legL.rotation.z = -0.34;
    legL.castShadow = true;
    const legR = new THREE.Mesh(legGeo, pylonMat);
    legR.position.set(5.6, 14, 0);
    legR.rotation.z = 0.34;
    legR.castShadow = true;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 7, 6), pylonMat);
    crown.position.y = 29;
    gLm.add(legL, legR, crown);
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
    const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 10), mat(0xe3b8a6));
    hall.position.y = 4;
    hall.castShadow = true;
    const rf = new THREE.Mesh(new THREE.ConeGeometry(10.5, 5, 4), mat(0xb71c1c));
    rf.position.y = 10.5;
    rf.rotation.y = Math.PI / 4;
    rf.castShadow = true;
    gLm.add(hall, rf);
  }
  const sp = makeBillboard("★ " + lm.name, "#131d29dd", "#ffb020", "bold 24px 'Be Vietnam Pro',system-ui");
  sp.position.y = 33;
  sp.scale.set(17, 4.25, 1);
  gLm.add(sp);
  return gLm;
}

let highwayBanMat = null;
export function getHighwayBanMat() {
  if (highwayBanMat) return highwayBanMat;
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext("2d");

  // Green highway header + red prohibition circle
  ctx.fillStyle = "#126b3a";
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 120);

  // Red prohibition ring on left
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(54, 64, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d32f2f";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(54, 64, 34, 0, Math.PI * 2);
  ctx.stroke();

  // Simple motorbike silhouette inside circle
  ctx.fillStyle = "#1b242c";
  ctx.beginPath();
  ctx.arc(41, 74, 7, 0, Math.PI * 2);
  ctx.arc(67, 74, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(42, 61, 22, 7);
  ctx.fillRect(57, 52, 5, 11);

  // Red diagonal slash
  ctx.strokeStyle = "#d32f2f";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(31, 41);
  ctx.lineTo(77, 87);
  ctx.stroke();

  // Vietnamese legal text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px 'Be Vietnam Pro',system-ui";
  ctx.textAlign = "left";
  ctx.fillText("CAO TỐC", 104, 44);
  ctx.fillStyle = "#ffd54f";
  ctx.font = "bold 17px 'Be Vietnam Pro',system-ui";
  ctx.fillText("CẤM XE MÁY", 104, 74);
  ctx.fillStyle = "#dce8df";
  ctx.font = "13px 'Be Vietnam Pro',system-ui";
  ctx.fillText("Đi Quốc lộ / Đường gom", 104, 98);

  highwayBanMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(cv),
    side: THREE.FrontSide,
  });
  return highwayBanMat;
}

export function createPartyRiderRig(name, bikeId = "cub", hexColor = 0x3ddc97, isBot = false) {
  const rig = createPlayerBikeRig();
  rig.userData.setBikeModel(bikeId, hexColor);

  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const ctx = cv.getContext("2d");
  const spMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv),
    depthTest: true,
    transparent: true,
  });
  const labelSp = new THREE.Sprite(spMat);
  labelSp.position.y = 2.45;
  labelSp.scale.set(3.2, 0.8, 1);
  rig.add(labelSp);

  function updateLabel(displayName, fuelPct = 100) {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = fuelPct < 25 ? "rgba(140, 22, 34, 0.88)" : "rgba(14, 24, 34, 0.84)";
    ctx.fillRect(8, 8, 240, 48);
    ctx.strokeStyle = fuelPct < 25 ? "#ff5d73" : isBot ? "#ffb020" : "#3ddc97";
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, 240, 48);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px 'Be Vietnam Pro',system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const prefix = isBot ? "🏍️ " : "👥 ";
    const text = prefix + (displayName || "Đồng đội").slice(0, 14) + " · " + Math.round(fuelPct) + "%";
    ctx.fillText(text, 128, 33);
    spMat.map.needsUpdate = true;
  }

  updateLabel(name, 100);
  if (rig.userData.chat) rig.userData.chat.setHeight(3.45);
  rig.userData.updateLabel = updateLabel;
  rig.userData.disposeLabel = () => {
    spMat.map.dispose();
    spMat.dispose();
    if (rig.userData.chat) rig.userData.chat.dispose();
  };
  return rig;
}

export function createWaypointBeacon() {
  const grp = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.8, 42, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x3ddc97,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.y = 21;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 3.6, 24),
    new THREE.MeshBasicMaterial({ color: 0x3ddc97, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.14;
  grp.add(beam, ring);
  grp.visible = false;
  return grp;
}

