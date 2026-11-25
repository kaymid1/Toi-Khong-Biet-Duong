import { geo, WD, $ } from "./state.js";
import {
  makeFacadeTexture,
  createPlayerBikeRig,
  createWalkerRig,
  createNpcMesh,
  createGasStationMesh,
  createLandmarkMesh,
  getHighwayBanMat,
  createWaypointBeacon,
} from "./models.js";

const CH = 128;
const RAD = 2;

export const dseg = (x, z, s) => {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz);
};

export function initWorld3D({ R0, LANDMARKS, REAL_STATIONS }) {
  const cell = new Map();
  const signCell = new Map();
  const hwSignCell = new Map();
  const crossCell = new Map();
  let NSEG = 0;

  R0.forEach((r, ri) => {
    const w = WD[r.c];
    for (let j = 0; j + 3 < r.p.length; j += 2) {
      const x1 = r.p[j] * geo.UX;
      const z1 = -r.p[j + 1] * geo.UZ;
      const x2 = r.p[j + 2] * geo.UX;
      const z2 = -r.p[j + 3] * geo.UZ;
      const s = [x1, z1, x2, z2, w, ri, r.c];
      NSEG++;
      const a0 = Math.floor(Math.min(x1, x2) / CH);
      const a1 = Math.floor(Math.max(x1, x2) / CH);
      const b0 = Math.floor(Math.min(z1, z2) / CH);
      const b1 = Math.floor(Math.max(z1, z2) / CH);
      for (let a = a0; a <= a1; a++) {
        for (let b = b0; b <= b1; b++) {
          const k = a + "," + b;
          let L = cell.get(k);
          if (!L) cell.set(k, (L = []));
          L.push(s);
        }
      }
    }
  });

  // Biển tên đường 2 mặt, vạch qua đường & biển cấm xe máy đầu cao tốc (c === 0)
  {
    const nodeNames = new Map();
    const nKey = (x, z) => Math.round(x / 3) + "," + Math.round(z / 3);
    R0.forEach((r) => {
      if (r.c > 5 || r.p.length < 4) return;
      const nm = r.n || "_u" + r.c;
      for (let j = 0; j < r.p.length; j += 2) {
        if (j > 0 && j < r.p.length - 2) continue;
        const k = nKey(r.p[j] * geo.UX, -r.p[j + 1] * geo.UZ);
        let st = nodeNames.get(k);
        if (!st) nodeNames.set(k, (st = new Set()));
        st.add(nm);
      }
    });
    const placedByName = new Map();
    const hwPlaced = [];
    const crossPlaced = new Set();
    R0.forEach((r) => {
      if (r.c > 3 || r.p.length < 4) return;
      const pts = [
        [0, 2],
        [r.p.length - 2, r.p.length - 4],
      ];
      pts.forEach(([i0, i1]) => {
        const ix = r.p[i0] * geo.UX;
        const iz = -r.p[i0 + 1] * geo.UZ;
        const nx = r.p[i1] * geo.UX;
        const nz = -r.p[i1 + 1] * geo.UZ;
        const dx = nx - ix;
        const dz = nz - iz;
        const l = Math.hypot(dx, dz) || 1;
        if (l < 5) return;

        // Biển CAO TỐC - CẤM XE MÁY tại lối vào đường c === 0
        if (r.c === 0) {
          const pull = Math.min(4.0, l * 0.3);
          const off = WD[0] / 2 + 0.7;
          const hx = ix + (dx / l) * pull + (-dz / l) * off;
          const hz = iz + (dz / l) * pull + (dx / l) * off;
          if (!hwPlaced.some((p) => Math.hypot(p[0] - hx, p[1] - hz) < 40)) {
            hwPlaced.push([hx, hz]);
            const hk = Math.floor(hx / CH) + "," + Math.floor(hz / CH);
            let hL = hwSignCell.get(hk);
            if (!hL) hwSignCell.set(hk, (hL = []));
            hL.push({ x: hx, z: hz, ang: Math.atan2(dx, dz) });
          }
          return;
        }

        const st = nodeNames.get(nKey(ix, iz));
        if (!st || st.size < 2) return;

        // Vạch qua đường tại đầu ngã tư đường lớn
        const ck = Math.round(ix / 6) + "," + Math.round(iz / 6) + "," + Math.round((dx / l) * 2);
        if (!crossPlaced.has(ck) && l > 8) {
          crossPlaced.add(ck);
          const pullC = Math.min(4.8, l * 0.35);
          const cx = ix + (dx / l) * pullC;
          const cz = iz + (dz / l) * pullC;
          const kC = Math.floor(cx / CH) + "," + Math.floor(cz / CH);
          let cL = crossCell.get(kC);
          if (!cL) crossCell.set(kC, (cL = []));
          cL.push({ x: cx, z: cz, dx: dx / l, dz: dz / l, w: WD[r.c], c: r.c });
        }

        if (!r.n) return;
        const pull = Math.min(4.2, l * 0.35);
        const off = WD[r.c] / 2 + 0.55;
        const sx = ix + (dx / l) * pull + (-dz / l) * off;
        const sz = iz + (dz / l) * pull + (dx / l) * off;
        let arr = placedByName.get(r.n);
        if (!arr) placedByName.set(r.n, (arr = []));
        if (arr.some((p) => Math.hypot(p[0] - sx, p[1] - sz) < 45)) return;
        arr.push([sx, sz]);
        const k = Math.floor(sx / CH) + "," + Math.floor(sz / CH);
        let L = signCell.get(k);
        if (!L) signCell.set(k, (L = []));
        L.push({ x: sx, z: sz, name: r.n, ang: Math.atan2(dx, dz) });
      });
    });
  }

  const renderer = new THREE.WebGLRenderer({
    canvas: $("c"),
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcce2f2);
  scene.fog = new THREE.Fog(0xd8e5ef, 105, 290);

  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 460);

  // Sky Dome (nắng chiều ấm Việt Nam)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3a7ec2) },
      midColor: { value: new THREE.Color(0x8bc2ea) },
      botColor: { value: new THREE.Color(0xffe0b2) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 botColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(botColor, midColor, smoothstep(-0.04, 0.22, h));
        col = mix(col, topColor, smoothstep(0.22, 0.78, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 14), skyMat);
  scene.add(skyDome);

  scene.add(new THREE.HemisphereLight(0xdaf0ff, 0x5d6b52, 0.85));
  const sun = new THREE.DirectionalLight(0xffe5b8, 1.05);
  sun.position.set(45, 58, 32);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.bias = -0.001;
  scene.add(sun);
  scene.add(sun.target);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lam(0x6d8b58));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Shared geometries & materials (never disposed per chunk)
  const bG = new THREE.BoxGeometry(1, 1, 1);
  const facadeMats = [0, 1, 2].map(
    (v) => new THREE.MeshLambertMaterial({ map: makeFacadeTexture(v), color: 0xffffff })
  );
  const roofG = new THREE.ConeGeometry(0.75, 1, 4);
  roofG.rotateY(Math.PI / 4);
  const roofMat = lam(0xffffff);
  const awningMat = lam(0xffffff);

  const trunkG = new THREE.CylinderGeometry(0.14, 0.2, 1, 6);
  const trunkMat = lam(0x5d432c);
  const canopyG = new THREE.IcosahedronGeometry(1, 0);
  const canopyMat = lam(0xffffff);

  const lampPoleG = new THREE.CylinderGeometry(0.06, 0.08, 4.6, 6);
  const lampPoleMat = lam(0x52606d);
  const lampHeadG = new THREE.BoxGeometry(0.48, 0.14, 0.24);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffe4a0 });

  const rM = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const poleG = new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6);
  const poleM = lam(0xd0d7de);
  const boardG = new THREE.PlaneGeometry(2.6, 0.72);
  const boardHwG = new THREE.PlaneGeometry(2.7, 1.35);

  const sharedGeos = new Set([bG, roofG, trunkG, canopyG, lampPoleG, lampHeadG, poleG, boardG, boardHwG]);

  const housePal = [0xf4e7cc, 0xd4e6d8, 0xf7e4a3, 0xe8bfb0, 0xc9dce8, 0xf2d9c2];
  const roofPal = [0xb3432e, 0x2d6d7a, 0x9e3b28, 0x3b7a57];
  const awningPal = [0x1b6b45, 0xc63d2f, 0x1e5aa8, 0xe07a1f];
  const treePal = [0x3d8b40, 0x4ca64c, 0x2e7536, 0xd84315]; // xanh + điểm hoa phượng đỏ

  const rnd = (a, b, i) => {
    const s = Math.sin(a * 127.1 + b * 311.7 + i * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const signTexCache = new Map();
  function getSignMat(text) {
    let m = signTexCache.get(text);
    if (m) return m;
    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 72;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0b4da2";
    ctx.fillRect(0, 0, 256, 72);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 64);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 23px 'Be Vietnam Pro',system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = text.length > 20 ? text.slice(0, 19) + "…" : text;
    ctx.fillText(label, 128, 37);
    const tex = new THREE.CanvasTexture(cv);
    m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    signTexCache.set(text, m);
    return m;
  }

  function makeBillboard(
    text,
    bg = "#101820cc",
    fg = "#ffb020",
    font = "bold 26px 'Be Vietnam Pro',system-ui"
  ) {
    const cv = document.createElement("canvas");
    cv.width = 320;
    cv.height = 80;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(4, 4, 312, 72);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 312, 72);
    ctx.fillStyle = fg;
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 160, 41);
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: true })
    );
    sp.scale.set(14, 3.5, 1);
    return sp;
  }

  const chunks = new Map();
  let loaded = 0;
  let unloaded = 0;

  function build(cx, cz) {
    const L = cell.get(cx + "," + cz) || [];
    const grp = new THREE.Group();
    const own = L.filter(
      (s) => Math.floor((s[0] + s[2]) / 2 / CH) === cx && Math.floor((s[1] + s[3]) / 2 / CH) === cz
    );
    const cList = crossCell.get(cx + "," + cz) || [];

    if (own.length || cList.length) {
      let qCount = 0;
      own.forEach((s) => {
        qCount += 3 + (s[6] <= 3 ? 1 : 0);
      });
      cList.forEach((cr) => {
        qCount += Math.max(4, Math.floor(cr.w / 1.15));
      });
      const pos = new Float32Array(qCount * 12);
      const col = new Float32Array(qCount * 12);
      const idx = new Uint32Array(qCount * 6);
      let qi = 0;
      const pushQuad = (ax, az, bx, bz, nx, nz, y, r, g, b) => {
        const o = qi * 12;
        pos.set([ax + nx, y, az + nz, ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz], o);
        for (let k = 0; k < 4; k++) {
          col[o + k * 3] = r;
          col[o + k * 3 + 1] = g;
          col[o + k * 3 + 2] = b;
        }
        idx.set([qi * 4, qi * 4 + 1, qi * 4 + 2, qi * 4, qi * 4 + 2, qi * 4 + 3], qi * 6);
        qi++;
      };
      own.forEach((s) => {
        let dx = s[2] - s[0];
        let dz = s[3] - s[1];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        const h = s[4] / 2;
        const sw = s[6] <= 3 ? 1.75 : 1.05;
        const curb = 0.24;
        const e = h * 0.45;
        const ax = s[0] - dx * e;
        const az = s[1] - dz * e;
        const bx = s[2] + dx * e;
        const bz = s[3] + dz * e;
        const ux = -dz;
        const uz = dx;
        const ySw = 0.015 + (7 - s[6]) * 0.004;
        const yCb = ySw + 0.004;
        const yRd = 0.055 + (7 - s[6]) * 0.01;
        // Vỉa hè gạch tông ấm nhẹ (cao tốc không dùng vỉa hè đi bộ, dùng dải phân cách xanh)
        if (s[6] === 0) {
          pushQuad(ax, az, bx, bz, ux * (h + 1.2), uz * (h + 1.2), ySw, 0.24, 0.48, 0.3);
          pushQuad(ax, az, bx, bz, ux * (h + 0.32), uz * (h + 0.32), yCb, 0.92, 0.65, 0.2);
          pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, 0.16, 0.18, 0.21);
          pushQuad(s[0], s[1], s[2], s[3], ux * 0.14, uz * 0.14, yRd + 0.004, 0.95, 0.95, 0.95);
        } else {
          pushQuad(ax, az, bx, bz, ux * (h + sw), uz * (h + sw), ySw, 0.58, 0.56, 0.52);
          pushQuad(ax, az, bx, bz, ux * (h + curb), uz * (h + curb), yCb, 0.8, 0.81, 0.82);
          const rc = s[6] <= 3 ? 0.23 : 0.18;
          pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, rc, rc * 1.03, rc * 1.08);
          if (s[6] <= 3) {
            pushQuad(
              s[0],
              s[1],
              s[2],
              s[3],
              ux * (s[6] === 1 ? 0.13 : 0.09),
              uz * (s[6] === 1 ? 0.13 : 0.09),
              yRd + 0.004,
              0.9,
              0.74,
              0.28
            );
          }
        }
      });

      // Vạch qua đường trắng tại ngã tư
      cList.forEach((cr) => {
        const ux = -cr.dz;
        const uz = cr.dx;
        const nStripes = Math.max(4, Math.floor(cr.w / 1.15));
        const yCr = 0.062 + (7 - cr.c) * 0.01;
        const ax = cr.x - cr.dx * 1.1;
        const az = cr.z - cr.dz * 1.1;
        const bx = cr.x + cr.dx * 1.1;
        const bz = cr.z + cr.dz * 1.1;
        for (let si = 0; si < nStripes; si++) {
          const lat = -cr.w * 0.42 + (si / Math.max(1, nStripes - 1)) * (cr.w * 0.84);
          pushQuad(
            ax + ux * lat,
            az + uz * lat,
            bx + ux * lat,
            bz + uz * lat,
            ux * 0.24,
            uz * 0.24,
            yCr,
            0.92,
            0.93,
            0.95
          );
        }
      });

      const gm = new THREE.BufferGeometry();
      gm.setAttribute("position", new THREE.BufferAttribute(pos.subarray(0, qi * 12), 3));
      gm.setAttribute("color", new THREE.BufferAttribute(col.subarray(0, qi * 12), 3));
      gm.setIndex(new THREE.BufferAttribute(idx.subarray(0, qi * 6), 1));
      gm.computeVertexNormals();
      const rMesh = new THREE.Mesh(gm, rM);
      rMesh.receiveShadow = true;
      grp.add(rMesh);
    }

    // Nhà ống hướng mặt tiền ra đường, cây vỉa hè & cột đèn
    const houses = [[], [], []];
    const roofs = [];
    const awnings = [];
    const trees = [];
    const lamps = [];

    for (let i = 0; i < own.length; i++) {
      const s = own[i];
      if (s[6] === 0 || s[6] > 4) continue;
      const dx = s[2] - s[0];
      const dz = s[3] - s[1];
      const l = Math.hypot(dx, dz);
      if (l < 7) continue;
      const ux = -dz / l;
      const uz = dx / l;
      const ang = Math.atan2(dx, dz); // hướng dọc đường
      const sw = s[6] <= 3 ? 1.75 : 1.05;

      // Đặt nhà ống dọc theo 2 bên đường
      const steps = Math.min(4, Math.floor(l / 10));
      for (let st = 0; st < steps; st++) {
        const t = (st + 0.5) / steps;
        const mx = s[0] + dx * t;
        const mz = s[1] + dz * t;
        for (const side of [-1, 1]) {
          if (rnd(cx, cz, i * 17 + st * 3 + side) < 0.38) continue;
          const w = 4.4 + rnd(cx, cz, i * 19 + st + side) * 2.2;
          const d = 6.5 + rnd(cx, cz, i * 23 + st + side) * 3.5;
          const h = 7.5 + rnd(cx, cz, i * 29 + st + side) * 9.5;
          const off = s[4] / 2 + sw + d / 2 + 1.1;
          const hx = mx + ux * off * side;
          const hz = mz + uz * off * side;
          const diag = Math.hypot(w, d) * 0.5;
          if (L.some((seg) => dseg(hx, hz, seg) < seg[4] / 2 + diag + 0.8)) continue;
          if (houses[0].length + houses[1].length + houses[2].length > 34) break;

          const varIdx = Math.floor(rnd(cx, cz, i * 31 + st + side) * 3) % 3;
          const faceAng = ang + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          const seed = i * 41 + st * 7 + side;
          houses[varIdx].push({ x: hx, z: hz, w, d, h, ang: faceAng, seed });

          // Mái ngói / mái tôn cho ~65% nhà ống
          if (rnd(cx, cz, seed + 5) > 0.35) {
            roofs.push({ x: hx, z: hz, w: w + 0.4, d: d + 0.4, h, ang: faceAng, seed });
          }
          // Mái hiên tầng trệt hướng ra mặt đường
          if (rnd(cx, cz, seed + 9) > 0.3) {
            const ax = hx - ux * (d / 2 + 0.45) * side;
            const az = hz - uz * (d / 2 + 0.45) * side;
            awnings.push({ x: ax, z: az, w: w * 0.88, ang: faceAng, seed });
          }
        }
      }

      // Cây vỉa hè & cột đèn dọc đường lớn
      if (s[6] <= 3 && l >= 12) {
        const side = i % 2 === 0 ? 1 : -1;
        const off = s[4] / 2 + sw * 0.65;
        const tx = s[0] + dx * 0.35 + ux * off * side;
        const tz = s[1] + dz * 0.35 + uz * off * side;
        if (!L.some((seg) => dseg(tx, tz, seg) < seg[4] / 2 + 0.45) && trees.length < 18) {
          trees.push({ x: tx, z: tz, seed: i * 13 + cx + cz });
        }
        if (i % 2 === 0 && lamps.length < 10) {
          const lx = s[0] + dx * 0.72 - ux * off * side;
          const lz = s[1] + dz * 0.72 - uz * off * side;
          if (!L.some((seg) => dseg(lx, lz, seg) < seg[4] / 2 + 0.35)) {
            lamps.push({ x: lx, z: lz, ux: ux * side, uz: uz * side, ang });
          }
        }
      }
    }

    const M = new THREE.Matrix4();
    const Q = new THREE.Quaternion();
    const S = new THREE.Vector3();
    const P = new THREE.Vector3();
    const E = new THREE.Euler();
    const C = new THREE.Color();

    houses.forEach((arr, vi) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(bG, facadeMats[vi], arr.length);
      im.castShadow = true;
      im.receiveShadow = true;
      arr.forEach((b, idx) => {
        E.set(0, b.ang, 0);
        Q.setFromEuler(E);
        P.set(b.x, b.h / 2, b.z);
        S.set(b.w, b.h, b.d);
        M.compose(P, Q, S);
        im.setMatrixAt(idx, M);
        im.setColorAt(idx, C.setHex(housePal[Math.abs(b.seed + cx + cz) % housePal.length]));
      });
      grp.add(im);
    });

    if (roofs.length) {
      const im = new THREE.InstancedMesh(roofG, roofMat, roofs.length);
      im.castShadow = true;
      roofs.forEach((r, idx) => {
        const rh = 1.8 + (Math.abs(r.seed) % 3) * 0.45;
        E.set(0, r.ang, 0);
        Q.setFromEuler(E);
        P.set(r.x, r.h + rh / 2, r.z);
        S.set(r.w, rh, r.d);
        M.compose(P, Q, S);
        im.setMatrixAt(idx, M);
        im.setColorAt(idx, C.setHex(roofPal[Math.abs(r.seed) % roofPal.length]));
      });
      grp.add(im);
    }

    if (awnings.length) {
      const im = new THREE.InstancedMesh(bG, awningMat, awnings.length);
      awnings.forEach((a, idx) => {
        E.set(0.18, a.ang, 0);
        Q.setFromEuler(E);
        P.set(a.x, 3.05, a.z);
        S.set(a.w, 0.14, 1.05);
        M.compose(P, Q, S);
        im.setMatrixAt(idx, M);
        im.setColorAt(idx, C.setHex(awningPal[Math.abs(a.seed) % awningPal.length]));
      });
      grp.add(im);
    }

    if (trees.length) {
      const imTrunk = new THREE.InstancedMesh(trunkG, trunkMat, trees.length);
      const imCanopy = new THREE.InstancedMesh(canopyG, canopyMat, trees.length);
      imTrunk.castShadow = true;
      imCanopy.castShadow = true;
      trees.forEach((tr, idx) => {
        const th = 2.6 + (Math.abs(tr.seed) % 4) * 0.35;
        const cr = 1.5 + (Math.abs(tr.seed) % 3) * 0.35;
        E.set(0, 0, 0);
        Q.setFromEuler(E);
        P.set(tr.x, th / 2, tr.z);
        S.set(1, th, 1);
        M.compose(P, Q, S);
        imTrunk.setMatrixAt(idx, M);

        P.set(tr.x, th + cr * 0.65, tr.z);
        S.set(cr, cr * 0.85, cr);
        M.compose(P, Q, S);
        imCanopy.setMatrixAt(idx, M);
        const isFlame = Math.abs(tr.seed) % 7 === 0;
        imCanopy.setColorAt(idx, C.setHex(isFlame ? treePal[3] : treePal[Math.abs(tr.seed) % 3]));
      });
      grp.add(imTrunk, imCanopy);
    }

    if (lamps.length) {
      const imPole = new THREE.InstancedMesh(lampPoleG, lampPoleMat, lamps.length);
      const imHead = new THREE.InstancedMesh(lampHeadG, lampHeadMat, lamps.length);
      lamps.forEach((lp, idx) => {
        E.set(0, lp.ang, 0);
        Q.setFromEuler(E);
        P.set(lp.x, 2.3, lp.z);
        S.set(1, 1, 1);
        M.compose(P, Q, S);
        imPole.setMatrixAt(idx, M);

        P.set(lp.x + lp.ux * 0.2, 4.62, lp.z + lp.uz * 0.2);
        M.compose(P, Q, S);
        imHead.setMatrixAt(idx, M);
      });
      grp.add(imPole, imHead);
    }

    const sg = signCell.get(cx + "," + cz);
    if (sg) {
      sg.forEach((item) => {
        const pMesh = new THREE.Mesh(poleG, poleM);
        pMesh.position.set(item.x, 1.55, item.z);
        pMesh.castShadow = true;
        const mat = getSignMat(item.name);
        const bF = new THREE.Mesh(boardG, mat);
        bF.position.set(item.x + Math.sin(item.ang) * 0.03, 2.85, item.z + Math.cos(item.ang) * 0.03);
        bF.rotation.y = item.ang;
        const bB = new THREE.Mesh(boardG, mat);
        bB.position.set(item.x - Math.sin(item.ang) * 0.03, 2.85, item.z - Math.cos(item.ang) * 0.03);
        bB.rotation.y = item.ang + Math.PI;
        grp.add(pMesh, bF, bB);
      });
    }
    const hsg = hwSignCell.get(cx + "," + cz);
    if (hsg) {
      const hwMat = getHighwayBanMat();
      hsg.forEach((item) => {
        const pMesh = new THREE.Mesh(poleG, poleM);
        pMesh.position.set(item.x, 1.65, item.z);
        pMesh.castShadow = true;
        const bF = new THREE.Mesh(boardHwG, hwMat);
        bF.position.set(item.x + Math.sin(item.ang) * 0.04, 3.05, item.z + Math.cos(item.ang) * 0.04);
        bF.rotation.y = item.ang;
        const bB = new THREE.Mesh(boardHwG, hwMat);
        bB.position.set(item.x - Math.sin(item.ang) * 0.04, 3.05, item.z - Math.cos(item.ang) * 0.04);
        bB.rotation.y = item.ang + Math.PI;
        grp.add(pMesh, bF, bB);
      });
    }
    scene.add(grp);
    return grp;
  }

  // ---- Streaming: hàng đợi chunk theo khoảng cách, dựng theo ngân sách ms/khung ----
  const streamCfg = { budgetMs: 3, maxPerFrame: 2, lookAhead: 1.2, unloadPad: 1 };
  const buildStats = { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 };
  let queue = [];
  let lastPx = null;
  let lastPz = null;
  let lastKey = "";

  function disposeChunk(gp) {
    scene.remove(gp);
    gp.children.forEach((c) => {
      if (c.isInstancedMesh) c.dispose();
      else if (c.geometry && !sharedGeos.has(c.geometry)) c.geometry.dispose();
    });
  }

  function buildTimed(cx, cz) {
    const t0 = performance.now();
    const g = build(cx, cz);
    const ms = performance.now() - t0;
    buildStats.count++;
    buildStats.totalMs += ms;
    buildStats.lastMs = ms;
    if (ms > buildStats.maxMs) buildStats.maxMs = ms;
    loaded++;
    return g;
  }

  function stream(px, pz) {
    const cx = Math.floor(px / CH);
    const cz = Math.floor(pz / CH);
    // Hướng di chuyển (nạp trước phía trước xe)
    let vx = 0;
    let vz = 0;
    if (lastPx !== null) {
      vx = px - lastPx;
      vz = pz - lastPz;
      const l = Math.hypot(vx, vz);
      if (l > 0.001 && l < CH) {
        vx /= l;
        vz /= l;
      } else {
        vx = vz = 0;
      }
    }
    lastPx = px;
    lastPz = pz;

    const key = cx + "," + cz + "|" + Math.sign(Math.round(vx * 2)) + "," + Math.sign(Math.round(vz * 2));
    if (key !== lastKey) {
      lastKey = key;
      const want = new Set();
      const need = [];
      for (let i = -RAD; i <= RAD; i++) {
        for (let j = -RAD; j <= RAD; j++) {
          const k = cx + i + "," + (cz + j);
          want.add(k);
          if (!chunks.has(k)) {
            // chunk phía trước được ưu tiên hơn (khoảng cách trừ đi thành phần hướng)
            const pri = Math.hypot(i, j) - (i * vx + j * vz) * streamCfg.lookAhead;
            need.push({ k, x: cx + i, z: cz + j, pri });
          }
        }
      }
      need.sort((a, b) => a.pri - b.pri);
      queue = need;
      // Dỡ chunk ngoài vùng (có độ trễ 1 ô để tránh nhấp nháy ở biên)
      for (const [k, gp] of chunks) {
        if (want.has(k)) continue;
        const [x, z] = k.split(",").map(Number);
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > RAD + streamCfg.unloadPad) {
          disposeChunk(gp);
          chunks.delete(k);
          unloaded++;
        }
      }
    }

    // Chunk dưới chân chưa có (spawn/teleport) -> dựng đồng bộ ngay để không rơi vào hư không
    const centerKey = cx + "," + cz;
    if (!chunks.has(centerKey)) {
      chunks.set(centerKey, buildTimed(cx, cz));
      queue = queue.filter((q) => q.k !== centerKey);
    }

    const t0 = performance.now();
    let n = 0;
    while (queue.length && n < streamCfg.maxPerFrame && performance.now() - t0 < streamCfg.budgetMs) {
      const q = queue.shift();
      if (chunks.has(q.k)) continue;
      chunks.set(q.k, buildTimed(q.x, q.z));
      n++;
    }
  }

  // Dựng toàn bộ hàng đợi ngay (dùng khi khởi động/benchmark)
  function streamFlush() {
    while (queue.length) {
      const q = queue.shift();
      if (!chunks.has(q.k)) chunks.set(q.k, buildTimed(q.x, q.z));
    }
  }

  function roadInfoAt(x, z, margin = 0.25) {
    const cx = Math.floor(x / CH);
    const cz = Math.floor(z / CH);
    let legalHit = false;
    let hwHit = false;
    let bestC = 6;
    let bestD = 1e9;
    let bestStreet = "—";
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const s of L) {
          const d = dseg(x, z, s);
          if (d < s[4] / 2 + margin) {
            if (s[6] === 0) hwHit = true;
            else legalHit = true;
            if (d < bestD) {
              bestD = d;
              bestC = s[6];
              bestStreet = R0[s[5]].n || bestStreet;
            }
          }
        }
      }
    }
    return {
      onRoad: legalHit || hwHit,
      legalOnRoad: legalHit,
      motorwayOnly: hwHit && !legalHit,
      c: bestC,
      street: bestStreet,
    };
  }

  function onRoad(x, z, margin = 0.25, allowMotorway = false) {
    const info = roadInfoAt(x, z, margin);
    return allowMotorway ? info.onRoad : info.legalOnRoad;
  }

  function nearestRoad(x, z, rad, allowMotorway = false) {
    const cx = Math.floor(x / CH);
    const cz = Math.floor(z / CH);
    let best = null;
    let bd = 1e9;
    let bestS = null;
    for (let a = -rad; a <= rad; a++) {
      for (let b = -rad; b <= rad; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const s of L) {
          if (!allowMotorway && s[6] === 0) continue;
          const dx = s[2] - s[0];
          const dz = s[3] - s[1];
          const l2 = dx * dx + dz * dz;
          let t = l2 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          const px = s[0] + t * dx;
          const pz = s[1] + t * dz;
          const d = Math.hypot(x - px, z - pz);
          if (d < bd) {
            bd = d;
            best = [px, pz];
            bestS = s;
          }
        }
      }
    }
    return best ? [best[0], best[1], bestS] : null;
  }

  function findOnStreet(streetName, tx, tz) {
    let best = null;
    let bd = 1e9;
    R0.forEach((r, ri) => {
      if (!r.n || r.n.toLowerCase() !== streetName.toLowerCase()) return;
      for (let j = 0; j + 3 < r.p.length; j += 2) {
        const x1 = r.p[j] * geo.UX;
        const z1 = -r.p[j + 1] * geo.UZ;
        const x2 = r.p[j + 2] * geo.UX;
        const z2 = -r.p[j + 3] * geo.UZ;
        const dx = x2 - x1;
        const dz = z2 - z1;
        const l2 = dx * dx + dz * dz;
        let t = l2 ? ((tx - x1) * dx + (tz - z1) * dz) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = x1 + t * dx;
        const pz = z1 + t * dz;
        const d = Math.hypot(tx - px, tz - pz);
        if (d < bd) {
          bd = d;
          best = [px, pz, [x1, z1, x2, z2, WD[r.c], ri, r.c]];
        }
      }
    });
    return best || nearestRoad(tx, tz, 5);
  }

  // Cây xăng thực tế
  const stations = [];
  REAL_STATIONS.forEach((st) => {
    const p = findOnStreet(st.street, st.gx * geo.UX, -st.gy * geo.UZ);
    if (!p || !p[2]) return;
    const s = p[2];
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l = Math.hypot(dx, dz) || 1;
    const off = s[4] / 2 + 2.6;
    const sx = p[0] + (-dz / l) * off;
    const sz = p[1] + (dx / l) * off;
    const grp = createGasStationMesh(st, makeBillboard);
    grp.position.set(sx, 0, sz);
    grp.rotation.y = Math.atan2(dx, dz);
    scene.add(grp);
    stations.push({ x: sx, z: sz, px: sx / geo.UX, py: -sz / geo.UZ, label: st.label });
  });

  // Địa danh điểm neo
  LANDMARKS.forEach((lm) => {
    const gLm = createLandmarkMesh(lm, makeBillboard);
    gLm.position.set(lm.x, 0, lm.z);
    scene.add(gLm);
  });

  // Xe người chơi, xe đỗ, nhân vật đi bộ, cột mốc tập kết & NPC
  const root = createPlayerBikeRig();
  scene.add(root);

  const parkedVehicle = createPlayerBikeRig();
  parkedVehicle.userData.setRiderVisible(false);
  parkedVehicle.visible = false;
  scene.add(parkedVehicle);

  const walker = createWalkerRig();
  walker.visible = false;
  scene.add(walker);

  const waypointBeacon = createWaypointBeacon();
  scene.add(waypointBeacon);

  const npcs = [];
  for (let i = 0; i < 10; i++) {
    const p = createNpcMesh(i);
    scene.add(p);
    npcs.push(p);
  }

  function scatter(n) {
    const p = nearestRoad(
      root.position.x + (Math.random() - 0.5) * 160,
      root.position.z + (Math.random() - 0.5) * 160,
      3
    );
    if (p) n.position.set(p[0], 0, p[1]);
    else n.position.set(root.position.x, 0, root.position.z);
    n.userData.t.copy(n.position);
  }

  function updateSunTarget(x, z) {
    skyDome.position.set(x, 0, z);
    sun.position.set(x + 45, 58, z + 32);
    sun.target.position.set(x, 0, z);
  }

  function setQuality(high) {
    renderer.shadowMap.enabled = !!high;
    renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : 1);
  }

  function setWaypoint(wp) {
    if (!wp) {
      waypointBeacon.visible = false;
      return;
    }
    waypointBeacon.visible = true;
    waypointBeacon.position.set(wp.x, 0, wp.z);
  }

  return {
    CH,
    NSEG,
    scene,
    renderer,
    cam,
    ground,
    me: root,
    parkedVehicle,
    walker,
    npcs,
    cell,
    stations,
    stream,
    onRoad,
    roadInfoAt,
    nearestRoad,
    scatter,
    updateSunTarget,
    setQuality,
    setWaypoint,
    setBikeModel: (bikeId, hex) => {
      root.userData.setBikeModel(bikeId, hex);
      parkedVehicle.userData.setBikeModel(bikeId, hex);
    },
    setBikeColor: (hex) => {
      root.userData.bdMat.color.setHex(hex);
      parkedVehicle.userData.bdMat.color.setHex(hex);
    },
    setBrakeLight: (braking) => root.userData.setBrakeLight(braking),
    streamFlush,
    streamCfg,
    getBuildStats: () => ({ ...buildStats, queued: queue.length }),
    getChunkStats: () => ({ active: chunks.size, loaded, unloaded, queued: queue.length }),
  };
}
