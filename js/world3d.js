import { geo, WD, $ } from "./state.js?v=3";
import {
  makeFacadeTexture,
  makeShopSignTexture,
  createPlayerBikeRig,
  createWalkerRig,
  createNpcMesh,
  createNpcBikeMesh,
  createGasStationMesh,
  createLandmarkMesh,
  getHighwayBanMat,
  createWaypointBeacon,
} from "./models.js?v=3";

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

export function initWorld3D({ R0, LANDMARKS, REAL_STATIONS, WATER = [] }) {
  const cell = new Map();
  const signCell = new Map();
  const hwSignCell = new Map();
  const crossCell = new Map();
  const nodeAdj = new Map();
  const segMeta = new Map();
  const allSegs = [];
  let NSEG = 0;

  const adjKey = (x, z) => Math.round(x / 2) + "," + Math.round(z / 2);
  const addAdj = (x, z, seg, end) => {
    const k = adjKey(x, z);
    let arr = nodeAdj.get(k);
    if (!arr) nodeAdj.set(k, (arr = []));
    arr.push({ seg, end });
  };

  const MAX_SEG_LEN = 80;
  R0.forEach((r, ri) => {
    const w = WD[r.c];
    const isBridge = !!(r.n && /^Cầu /i.test(r.n) && r.c <= 3);
    for (let j = 0; j + 3 < r.p.length; j += 2) {
      const rx1 = r.p[j] * geo.UX;
      const rz1 = -r.p[j + 1] * geo.UZ;
      const rx2 = r.p[j + 2] * geo.UX;
      const rz2 = -r.p[j + 3] * geo.UZ;
      const totalL = Math.hypot(rx2 - rx1, rz2 - rz1);
      const nSub = Math.max(1, Math.ceil(totalL / MAX_SEG_LEN));
      for (let k = 0; k < nSub; k++) {
        const t0 = k / nSub;
        const t1 = (k + 1) / nSub;
        const x1 = rx1 + (rx2 - rx1) * t0;
        const z1 = rz1 + (rz2 - rz1) * t0;
        const x2 = rx1 + (rx2 - rx1) * t1;
        const z2 = rz1 + (rz2 - rz1) * t1;
        const s = [x1, z1, x2, z2, w, ri, r.c];
        NSEG++;
        allSegs.push(s);
        if (isBridge) segMeta.set(s, { dual: false, isBridge: true });
        if (r.c >= 1 && r.c <= 5 && Math.hypot(x2 - x1, z2 - z1) >= 2) {
          addAdj(x1, z1, s, 0);
          addAdj(x2, z2, s, 1);
        }
        const a0 = Math.floor(Math.min(x1, x2) / CH);
        const a1 = Math.floor(Math.max(x1, x2) / CH);
        const b0 = Math.floor(Math.min(z1, z2) / CH);
        const b1 = Math.floor(Math.max(z1, z2) / CH);
        for (let a = a0; a <= a1; a++) {
          for (let b = b0; b <= b1; b++) {
            const ck = a + "," + b;
            let L = cell.get(ck);
            if (!L) cell.set(ck, (L = []));
            L.push(s);
          }
        }
      }
    }
  });

  function getNearSegs(cx, cz) {
    const seen = new Set();
    const out = [];
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const s of L) {
          if (!seen.has(s)) {
            seen.add(s);
            out.push(s);
          }
        }
      }
    }
    return out;
  }

  // Phát hiện đường đôi có dải phân cách (2 làn ngược chiều chạy song song 5.2–25m)
  for (const s of allSegs) {
    if (s[6] > 3) continue;
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l = Math.hypot(dx, dz);
    if (l < 6) continue;
    const dirX = dx / l;
    const dirZ = dz / l;
    const mx = (s[0] + s[2]) / 2;
    const mz = (s[1] + s[3]) / 2;
    const ux = -dirZ;
    const uz = dirX;
    const sName = R0[s[5]].n;
    const near = getNearSegs(Math.floor(mx / CH), Math.floor(mz / CH));
    let bestDist = 999;
    let bestSide = 0;
    for (const p of near) {
      if (p === s || p[6] > 3) continue;
      const pName = R0[p[5]].n;
      const sameRoad = (sName && pName === sName) || (s[6] <= 1 && p[6] <= 1);
      if (!sameRoad) continue;
      const pdx = p[2] - p[0];
      const pdz = p[3] - p[1];
      const pl = Math.hypot(pdx, pdz);
      if (pl < 6) continue;
      const dot = Math.abs((pdx / pl) * dirX + (pdz / pl) * dirZ);
      if (dot < 0.9) continue;
      const t = ((mx - p[0]) * pdx + (mz - p[1]) * pdz) / (pl * pl);
      if (t < -0.15 || t > 1.15) continue;
      const px = p[0] + t * pdx;
      const pz = p[1] + t * pdz;
      const dist = Math.hypot(px - mx, pz - mz);
      if (dist >= 5.2 && dist <= 25 && dist < bestDist) {
        bestDist = dist;
        bestSide = (px - mx) * ux + (pz - mz) * uz >= 0 ? 1 : -1;
      }
    }
    if (bestSide !== 0) {
      const prev = segMeta.get(s) || { isBridge: false };
      const maxCarriageway = Math.max(5.0, bestDist - 2.0);
      s[4] = Math.min(WD[s[6]] * 0.62, maxCarriageway);
      segMeta.set(s, { ...prev, dual: true, medianSide: bestSide, partnerDist: bestDist });
    }
  }

  // Biển nước (Sông Hàn & Biển Mỹ Khê) ở định dạng world XZ để tránh mọc cây/nhà xuống sông và dựng mặt nước 3D
  const waterWorldPolys = WATER.map((w) => {
    const pts = [];
    for (let j = 0; j + 1 < w.p.length; j += 2) {
      pts.push([w.p[j] * geo.UX, -w.p[j + 1] * geo.UZ]);
    }
    return { name: w.name, pts };
  });

  function pointInWater(x, z) {
    for (const wp of waterWorldPolys) {
      const pts = wp.pts;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], zi = pts[i][1];
        const xj = pts[j][0], zj = pts[j][1];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-6) + xi) {
          inside = !inside;
        }
      }
      if (inside) return true;
    }
    return false;
  }

  function hitsAnyRoad(x, z, extraMargin = 0, ignoreSeg = null) {
    const cx = Math.floor(x / CH);
    const cz = Math.floor(z / CH);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const seg of L) {
          if (seg === ignoreSeg) continue;
          if (dseg(x, z, seg) < seg[4] / 2 + extraMargin) return true;
        }
      }
    }
    return false;
  }

  // Biển tên đường 2 mặt, vạch qua đường & biển cấm xe máy đầu cao tốc (c === 0)
  {
    const nodeNames = new Map();
    const nodeMaxHalfW = new Map();
    const nKey = (x, z) => Math.round(x / 3) + "," + Math.round(z / 3);
    R0.forEach((r) => {
      if (r.c > 5 || r.p.length < 4) return;
      const nm = r.n || "_u" + r.c;
      const hw = WD[r.c] / 2;
      for (let j = 0; j < r.p.length; j += 2) {
        const x = r.p[j] * geo.UX;
        const z = -r.p[j + 1] * geo.UZ;
        const k = nKey(x, z);
        if (hw > (nodeMaxHalfW.get(k) || 0)) nodeMaxHalfW.set(k, hw);
        if (j > 0 && j < r.p.length - 2) continue;
        let st = nodeNames.get(k);
        if (!st) nodeNames.set(k, (st = new Set()));
        st.add(nm);
      }
    });
    const placedByName = new Map();
    const hwPlaced = [];
    const crossPlaced = new Set();
    R0.forEach((r, ri) => {
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
        if (l < 6) return;
        const dirX = dx / l;
        const dirZ = dz / l;
        const maxHW = nodeMaxHalfW.get(nKey(ix, iz)) || WD[r.c] / 2;

        // Biển CAO TỐC - CẤM XE MÁY tại lối vào đường c === 0
        if (r.c === 0) {
          const pull = Math.min(l * 0.4, Math.max(4.5, maxHW + 1.6));
          const off = WD[0] / 2 + 0.75;
          const hx = ix + dirX * pull + -dirZ * off;
          const hz = iz + dirZ * pull + dirX * off;
          if (!hwPlaced.some((p) => Math.hypot(p[0] - hx, p[1] - hz) < 40) && !hitsAnyRoad(hx, hz, 0.35)) {
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

        // Vạch qua đường tại đầu ngã tư đường lớn (đặt lùi ra ngoài phần đường cắt ngang)
        const pullC = maxHW + 1.8;
        const ck = Math.round(ix / 8) + "," + Math.round(iz / 8) + "," + Math.round(dirX * 2) + "," + Math.round(dirZ * 2);
        if (!crossPlaced.has(ck) && l > pullC + 3.5) {
          const cx = ix + dirX * pullC;
          const cz = iz + dirZ * pullC;
          // Chỉ đặt vạch nếu không nằm đè lên lòng đường cắt ngang
          const nearSegs = getNearSegs(Math.floor(cx / CH), Math.floor(cz / CH));
          const crossesOther = nearSegs.some((seg) => {
            if (seg[5] === ri) return false;
            const sdx = seg[2] - seg[0];
            const sdz = seg[3] - seg[1];
            const sl = Math.hypot(sdx, sdz) || 1;
            const dot = Math.abs((sdx / sl) * dirX + (sdz / sl) * dirZ);
            return dot < 0.82 && dseg(cx, cz, seg) < seg[4] / 2 + 0.6;
          });
          if (!crossesOther) {
            crossPlaced.add(ck);
            const kC = Math.floor(cx / CH) + "," + Math.floor(cz / CH);
            let cL = crossCell.get(kC);
            if (!cL) crossCell.set(kC, (cL = []));
            cL.push({ x: cx, z: cz, dx: dirX, dz: dirZ, w: WD[r.c], c: r.c });
          }
        }

        if (!r.n) return;
        const pull = Math.min(l * 0.42, Math.max(4.5, maxHW + 1.5));
        if (l < pull + 2.0) return;
        const off = WD[r.c] / 2 + 0.65;
        const sx = ix + dirX * pull + -dirZ * off;
        const sz = iz + dirZ * pull + dirX * off;
        if (hitsAnyRoad(sx, sz, 0.25)) return;
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
  scene.fog = new THREE.Fog(0xd8e5ef, 130, 350);

  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 480);

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

  if (waterWorldPolys.length) {
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x1d6f9e, side: THREE.DoubleSide });
    for (const wp of waterWorldPolys) {
      if (wp.pts.length < 3) continue;
      const shape = new THREE.Shape();
      shape.moveTo(wp.pts[0][0], -wp.pts[0][1]);
      for (let i = 1; i < wp.pts.length; i++) {
        shape.lineTo(wp.pts[i][0], -wp.pts[i][1]);
      }
      shape.closePath();
      const wg = new THREE.ShapeGeometry(shape);
      const wm = new THREE.Mesh(wg, waterMat);
      wm.rotation.x = -Math.PI / 2;
      wm.position.y = 0.01;
      wm.receiveShadow = true;
      scene.add(wm);
    }
  }

  // Shared geometries & materials (never disposed per chunk)
  const bG = new THREE.BoxGeometry(1, 1, 1);
  const facadeMats = [0, 1, 2].map(
    (v) => new THREE.MeshLambertMaterial({ map: makeFacadeTexture(v), color: 0xffffff })
  );
  const signBoardMats = [0, 1, 2, 3].map(
    (v) => new THREE.MeshLambertMaterial({ map: makeShopSignTexture(v), color: 0xffffff })
  );
  const parapetMat = lam(0xcfd8dc);
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
    const nearSegs = getNearSegs(cx, cz);
    const grp = new THREE.Group();
    const own = L.filter(
      (s) => Math.floor((s[0] + s[2]) / 2 / CH) === cx && Math.floor((s[1] + s[3]) / 2 / CH) === cz
    );
    const cList = crossCell.get(cx + "," + cz) || [];
    const sgList = signCell.get(cx + "," + cz) || [];

    if (own.length || cList.length) {
      let qCount = 0;
      own.forEach((s) => {
        const meta = segMeta.get(s);
        qCount += meta?.dual ? 10 : 4;
      });
      cList.forEach((cr) => {
        qCount += Math.max(4, Math.floor(cr.w / 1.3));
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
      const pushSideQuad = (ax, az, bx, bz, sx, sz, o1, o2, y, r, g, b) => {
        const o = qi * 12;
        pos.set(
          [
            ax + sx * o2, y, az + sz * o2,
            ax + sx * o1, y, az + sz * o1,
            bx + sx * o1, y, bz + sz * o1,
            bx + sx * o2, y, bz + sz * o2,
          ],
          o
        );
        for (let k = 0; k < 4; k++) {
          col[o + k * 3] = r;
          col[o + k * 3 + 1] = g;
          col[o + k * 3 + 2] = b;
        }
        idx.set([qi * 4, qi * 4 + 1, qi * 4 + 2, qi * 4, qi * 4 + 2, qi * 4 + 3], qi * 6);
        qi++;
      };
      own.forEach((s) => {
        const meta = segMeta.get(s);
        let dx = s[2] - s[0];
        let dz = s[3] - s[1];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        const h = s[4] / 2;
        const sw = s[6] <= 3 ? 2.2 : 1.35;
        const curb = 0.28;
        const e = Math.min(h * 0.38, l * 0.35);
        const ax = s[0] - dx * e;
        const az = s[1] - dz * e;
        const bx = s[2] + dx * e;
        const bz = s[3] + dz * e;
        const ux = -dz;
        const uz = dx;
        const isBridge = !!meta?.isBridge;
        const ySw = isBridge ? 0.13 : 0.015 + (7 - s[6]) * 0.002;
        const yCb = isBridge ? 0.24 : 0.028 + (7 - s[6]) * 0.002;
        const yRd = isBridge ? 0.15 : 0.055 + (7 - s[6]) * 0.005;
        const yLn = isBridge ? 0.158 : 0.096 + (7 - s[6]) * 0.001;
        if (s[6] === 0) {
          pushQuad(ax, az, bx, bz, ux * (h + 1.3), uz * (h + 1.3), ySw, 0.24, 0.48, 0.3);
          pushQuad(ax, az, bx, bz, ux * (h + 0.36), uz * (h + 0.36), yCb, 0.92, 0.65, 0.2);
          pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, 0.16, 0.18, 0.21);
          pushQuad(s[0], s[1], s[2], s[3], ux * 0.16, uz * 0.16, yLn, 0.95, 0.95, 0.95);
        } else if (meta?.dual) {
          const outS = -meta.medianSide;
          const medS = meta.medianSide;
          const medW = Math.min(1.25, Math.max(0.65, (meta.partnerDist - s[4]) * 0.48));
          const swR = isBridge ? 0.66 : 0.58;
          const swG = isBridge ? 0.68 : 0.56;
          const swB = isBridge ? 0.71 : 0.52;
          pushSideQuad(ax, az, bx, bz, ux * outS, uz * outS, h, h + sw, ySw, swR, swG, swB);
          pushSideQuad(ax, az, bx, bz, ux * outS, uz * outS, h, h + curb, yCb, 0.82, 0.83, 0.85);
          // Dải phân cách giữa 2 làn ngược chiều (cỏ xanh đô thị hoặc bê tông trên cầu)
          if (isBridge) {
            pushSideQuad(ax, az, bx, bz, ux * medS, uz * medS, h, h + medW, yCb, 0.64, 0.66, 0.7);
          } else {
            pushSideQuad(ax, az, bx, bz, ux * medS, uz * medS, h, h + medW, ySw + 0.014, 0.22, 0.5, 0.28);
            pushSideQuad(ax, az, bx, bz, ux * medS, uz * medS, h, h + curb, yCb + 0.012, 0.86, 0.86, 0.84);
          }
          const rc = s[6] <= 3 ? 0.23 : 0.18;
          pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, rc, rc * 1.03, rc * 1.08);
          // Vạch đứt trắng chia làn trên đường 1 chiều
          const dashes = Math.min(4, Math.max(1, Math.floor(l / 14)));
          for (let di = 0; di < dashes; di++) {
            const tA = (di + 0.18) / dashes;
            const tB = (di + 0.68) / dashes;
            pushQuad(
              s[0] + dx * l * tA,
              s[1] + dz * l * tA,
              s[0] + dx * l * tB,
              s[1] + dz * l * tB,
              ux * 0.09,
              uz * 0.09,
              yLn,
              0.88,
              0.9,
              0.92
            );
          }
        } else {
          const swR = isBridge ? 0.66 : 0.58;
          const swG = isBridge ? 0.68 : 0.56;
          const swB = isBridge ? 0.71 : 0.52;
          pushQuad(ax, az, bx, bz, ux * (h + sw), uz * (h + sw), ySw, swR, swG, swB);
          pushQuad(ax, az, bx, bz, ux * (h + curb), uz * (h + curb), yCb, 0.8, 0.81, 0.82);
          const rc = s[6] <= 3 ? 0.23 : 0.18;
          pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, rc, rc * 1.03, rc * 1.08);
          if (s[6] <= 3) {
            pushQuad(
              s[0],
              s[1],
              s[2],
              s[3],
              ux * (s[6] === 1 ? 0.14 : 0.1),
              uz * (s[6] === 1 ? 0.14 : 0.1),
              yLn,
              0.9,
              0.74,
              0.28
            );
          }
        }
      });

      // Vạch qua đường trắng tại ngã tư (nằm trên tất cả lớp mặt đường)
      cList.forEach((cr) => {
        const ux = -cr.dz;
        const uz = cr.dx;
        const nStripes = Math.max(4, Math.floor(cr.w / 1.3));
        const yCr = 0.104 + (7 - cr.c) * 0.001;
        const ax = cr.x - cr.dx * 1.15;
        const az = cr.z - cr.dz * 1.15;
        const bx = cr.x + cr.dx * 1.15;
        const bz = cr.z + cr.dz * 1.15;
        for (let si = 0; si < nStripes; si++) {
          const lat = -cr.w * 0.41 + (si / Math.max(1, nStripes - 1)) * (cr.w * 0.82);
          pushQuad(
            ax + ux * lat,
            az + uz * lat,
            bx + ux * lat,
            bz + uz * lat,
            ux * 0.28,
            uz * 0.28,
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

    // Nhà ống hướng mặt tiền ra đường, bảng hiệu, cây vỉa hè & cột đèn
    const houses = [[], [], []];
    const placedHouses = [];
    const roofs = [];
    const parapets = [];
    const awnings = [];
    const shopSigns = [[], [], [], []];
    const trees = [];
    const lamps = [];

    for (let i = 0; i < own.length; i++) {
      const s = own[i];
      if (s[6] === 0 || s[6] > 4) continue;
      const meta = segMeta.get(s);
      const isBridge = !!meta?.isBridge;
      const dx = s[2] - s[0];
      const dz = s[3] - s[1];
      const l = Math.hypot(dx, dz);
      if (l < 7) continue;
      const ux = -dz / l;
      const uz = dx / l;
      const ang = Math.atan2(dx, dz); // hướng dọc đường
      const sw = s[6] <= 3 ? 2.2 : 1.35;

      // Đặt nhà ống dọc theo 2 bên đường (không đặt trên cầu hoặc phía dải phân cách)
      if (!isBridge) {
        const steps = Math.min(6, Math.floor(l / 10));
        for (let st = 0; st < steps; st++) {
          if (placedHouses.length >= 42) break;
          const t = (st + 0.5) / steps;
          const mx = s[0] + dx * t;
          const mz = s[1] + dz * t;
          for (const side of [-1, 1]) {
            if (placedHouses.length >= 42) break;
            if (meta?.dual && side === meta.medianSide) continue;
            if (rnd(cx, cz, i * 17 + st * 3 + side) < 0.34) continue;
            const w = 4.6 + rnd(cx, cz, i * 19 + st + side) * 2.2;
            const d = 6.5 + rnd(cx, cz, i * 23 + st + side) * 3.5;
            const h = 7.5 + rnd(cx, cz, i * 29 + st + side) * 10.5;
            const off = s[4] / 2 + sw + d / 2 + 1.15;
            const hx = mx + ux * off * side;
            const hz = mz + uz * off * side;
            const diag = Math.hypot(w, d) * 0.5;
            if (pointInWater(hx, hz)) continue;
            if (nearSegs.some((seg) => dseg(hx, hz, seg) < seg[4] / 2 + diag + 1.0)) continue;
            if (placedHouses.some((p) => Math.hypot(hx - p.x, hz - p.z) < diag + p.r - 0.5)) continue;
            if (stations.some((stn) => Math.hypot(hx - stn.x, hz - stn.z) < diag + 9.5)) continue;
            if (LANDMARKS.some((lm) => Math.hypot(hx - lm.x, hz - lm.z) < diag + 14.0)) continue;

            placedHouses.push({ x: hx, z: hz, r: diag });
            const varIdx = Math.floor(rnd(cx, cz, i * 31 + st + side) * 3) % 3;
            const faceAng = ang + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
            const seed = i * 41 + st * 7 + side;
            houses[varIdx].push({ x: hx, z: hz, w, d, h, ang: faceAng, seed });

            // Phối hợp mái ngói (~38%) và mái bằng có lan can sân thượng (~62%) giống nhà phố VN
            if (rnd(cx, cz, seed + 5) > 0.62) {
              roofs.push({ x: hx, z: hz, w: w + 0.4, d: d + 0.4, h, ang: faceAng, seed });
            } else {
              parapets.push({ x: hx, z: hz, w: w + 0.25, d: d + 0.25, h, ang: faceAng });
            }
            // Mái hiên tầng trệt & bảng hiệu cửa hàng hướng ra mặt đường
            if (rnd(cx, cz, seed + 9) > 0.28) {
              const ax = hx - ux * (d / 2 + 0.45) * side;
              const az = hz - uz * (d / 2 + 0.45) * side;
              awnings.push({ x: ax, z: az, w: w * 0.88, ang: faceAng, seed });
              if (rnd(cx, cz, seed + 13) > 0.42) {
                const bx = hx - ux * (d / 2 + 0.1) * side;
                const bz = hz - uz * (d / 2 + 0.1) * side;
                const sbIdx = Math.abs(seed) % 4;
                shopSigns[sbIdx].push({ x: bx, z: bz, w: w * 0.72, ang: faceAng });
              }
            }
          }
        }
      }

      // Cây vỉa hè & cột đèn dọc đường lớn (rải đều mỗi ~26m)
      if (s[6] <= 3 && l >= 12) {
        const clearItem = (px, pz, pad) =>
          !pointInWater(px, pz) &&
          !nearSegs.some((seg) => dseg(px, pz, seg) < seg[4] / 2 + pad) &&
          !placedHouses.some((p) => Math.hypot(px - p.x, pz - p.z) < p.r + 0.6) &&
          !sgList.some((sg) => Math.hypot(px - sg.x, pz - sg.z) < 2.2) &&
          !stations.some((stn) => Math.hypot(px - stn.x, pz - stn.z) < 8.5);
        const nItems = Math.min(3, Math.max(1, Math.floor(l / 26)));
        const off = s[4] / 2 + sw * 0.72;
        for (let k = 0; k < nItems; k++) {
          const tPos = (k + 0.5) / nItems;
          const side = meta?.dual ? -meta.medianSide : (i + k) % 2 === 0 ? 1 : -1;
          if (!isBridge && trees.length < 24) {
            const tx = s[0] + dx * tPos + ux * off * side;
            const tz = s[1] + dz * tPos + uz * off * side;
            if (clearItem(tx, tz, 0.75)) trees.push({ x: tx, z: tz, seed: i * 13 + k + cx + cz });
          }
          if (lamps.length < 14) {
            const lampSide = meta?.dual ? -meta.medianSide : -side;
            const lx = s[0] + dx * Math.min(0.9, tPos + 0.18) + ux * off * lampSide;
            const lz = s[1] + dz * Math.min(0.9, tPos + 0.18) + uz * off * lampSide;
            if (isBridge || clearItem(lx, lz, 0.55)) {
              lamps.push({ x: lx, z: lz, ux: ux * lampSide, uz: uz * lampSide, ang });
            }
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

    if (parapets.length) {
      const im = new THREE.InstancedMesh(bG, parapetMat, parapets.length);
      im.castShadow = true;
      parapets.forEach((p, idx) => {
        E.set(0, p.ang, 0);
        Q.setFromEuler(E);
        P.set(p.x, p.h + 0.22, p.z);
        S.set(p.w, 0.44, p.d);
        M.compose(P, Q, S);
        im.setMatrixAt(idx, M);
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

    shopSigns.forEach((arr, si) => {
      if (!arr.length) return;
      const im = new THREE.InstancedMesh(bG, signBoardMats[si], arr.length);
      arr.forEach((sb, idx) => {
        E.set(0, sb.ang, 0);
        Q.setFromEuler(E);
        P.set(sb.x, 3.85, sb.z);
        S.set(sb.w, 0.72, 0.16);
        M.compose(P, Q, S);
        im.setMatrixAt(idx, M);
      });
      grp.add(im);
    });

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

  // Cây xăng thực tế (đặt bên ngoài vỉa hè, chọn phía không đè lên đường khác)
  const stations = [];
  REAL_STATIONS.forEach((st) => {
    const p = findOnStreet(st.street, st.gx * geo.UX, -st.gy * geo.UZ);
    if (!p || !p[2]) return;
    const s = p[2];
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l = Math.hypot(dx, dz) || 1;
    const sw = s[6] <= 3 ? 2.2 : 1.35;
    const off = s[4] / 2 + sw + 2.9;
    let sx = p[0] + (-dz / l) * off;
    let sz = p[1] + (dx / l) * off;
    if (hitsAnyRoad(sx, sz, 2.4)) {
      const altX = p[0] - (-dz / l) * off;
      const altZ = p[1] - (dx / l) * off;
      if (!hitsAnyRoad(altX, altZ, 2.4)) {
        sx = altX;
        sz = altZ;
      }
    }
    const grp = createGasStationMesh(st, makeBillboard);
    grp.position.set(sx, 0, sz);
    grp.rotation.y = Math.atan2(dx, dz);
    scene.add(grp);
    stations.push({ x: sx, z: sz, px: sx / geo.UX, py: -sz / geo.UZ, label: st.label });
  });

  // Địa danh điểm neo (cầu bắc qua đường theo đúng hướng đường; địa danh khác đặt gọn bên lề đường)
  LANDMARKS.forEach((lm) => {
    const gLm = createLandmarkMesh(lm, makeBillboard);
    const nr = nearestRoad(lm.x, lm.z, 2, true);
    if (lm.type === "bridge" || lm.type === "bridge2" || lm.type === "cable") {
      if (nr && nr[2]) {
        const s = nr[2];
        const dx = s[2] - s[0];
        const dz = s[3] - s[1];
        const l = Math.hypot(dx, dz) || 1;
        const ux = -dz / l;
        const uz = dx / l;
        const meta = segMeta.get(s);
        if (meta?.dual) {
          lm.x = nr[0] + ux * meta.medianSide * (meta.partnerDist * 0.5);
          lm.z = nr[1] + uz * meta.medianSide * (meta.partnerDist * 0.5);
        } else {
          lm.x = nr[0];
          lm.z = nr[1];
        }
        // Cầu Rồng đầu hướng Đông (+X)
        const dirSign = lm.type === "bridge" && dx < 0 ? -1 : 1;
        gLm.rotation.y = Math.atan2(dx * dirSign, dz * dirSign);
      }
    } else if (nr && nr[2]) {
      const s = nr[2];
      const d = Math.hypot(lm.x - nr[0], lm.z - nr[1]);
      const minClear = s[4] / 2 + 10.5;
      if (d < minClear) {
        const dx = s[2] - s[0];
        const dz = s[3] - s[1];
        const l = Math.hypot(dx, dz) || 1;
        const ux = -dz / l;
        const uz = dx / l;
        let side = 1;
        if (lm.type === "beach" && ux < 0) side = -1;
        const candX = nr[0] + ux * minClear * side;
        const candZ = nr[1] + uz * minClear * side;
        if (!hitsAnyRoad(candX, candZ, 6)) {
          lm.x = candX;
          lm.z = candZ;
        } else {
          lm.x = nr[0] - ux * minClear * side;
          lm.z = nr[1] - uz * minClear * side;
        }
      }
    }
    lm.px = lm.x / geo.UX;
    lm.py = -lm.z / geo.UZ;
    gLm.position.set(lm.x, 0, lm.z);
    scene.add(gLm);
  });

  // Xe người chơi, xe đỗ, nhân vật đi bộ, cột mốc tập kết & NPC (chia rõ đi bộ trên lề & xe máy giữa đường)
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
  for (let i = 0; i < 12; i++) {
    const p = createNpcMesh(i);
    scene.add(p);
    npcs.push(p);
  }
  for (let i = 0; i < 12; i++) {
    const b = createNpcBikeMesh(i);
    scene.add(b);
    npcs.push(b);
  }

  function pickSegNear(x, z, maxC = 5) {
    const cx = Math.floor(x / CH);
    const cz = Math.floor(z / CH);
    const cands = [];
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const s of L) {
          if (s[6] >= 1 && s[6] <= maxC && Math.hypot(s[2] - s[0], s[3] - s[1]) >= 8) {
            cands.push(s);
          }
        }
      }
    }
    return cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;
  }

  function pedSidewalkPos(s, t, side) {
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l = Math.hypot(dx, dz) || 1;
    const sw = s[6] <= 3 ? 2.2 : 1.35;
    const off = s[4] / 2 + sw * 0.55;
    const ux = -dz / l;
    const uz = dx / l;
    return [s[0] + dx * t + ux * off * side, s[1] + dz * t + uz * off * side, dx / l, dz / l, l];
  }

  function bikeLanePos(s, t, dir) {
    const dx = s[2] - s[0];
    const dz = s[3] - s[1];
    const l = Math.hypot(dx, dz) || 1;
    const fx = (dx / l) * dir;
    const fz = (dz / l) * dir;
    // Làn phải theo luật GT Việt Nam: right = (-fz, fx)
    const laneOff = Math.min(2.5, s[4] * 0.24);
    return [s[0] + dx * t + -fz * laneOff, s[1] + dz * t + fx * laneOff, fx, fz, l];
  }

  function scatter(n) {
    const isBike = n.userData.npcType === "bike";
    for (let tries = 0; tries < 8; tries++) {
      const rx = root.position.x + (Math.random() - 0.5) * 150;
      const rz = root.position.z + (Math.random() - 0.5) * 150;
      let seg = pickSegNear(rx, rz, 4);
      if (!seg) {
        const nr = nearestRoad(rx, rz, 3, false);
        if (nr && nr[2]) seg = nr[2];
      }
      if (!seg) continue;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const t = 0.2 + Math.random() * 0.6;
      if (isBike) {
        n.userData.seg = seg;
        n.userData.tParam = t;
        n.userData.dir = dir;
        n.userData.spd = 6.2 + Math.random() * 4.2;
        const [px, pz, fx, fz] = bikeLanePos(seg, t, dir);
        n.position.set(px, 0, pz);
        n.rotation.y = Math.atan2(fx, fz);
        return;
      }
      for (const side of Math.random() < 0.5 ? [1, -1] : [-1, 1]) {
        const [px, pz, dxn, dzn] = pedSidewalkPos(seg, t, side);
        if (!hitsAnyRoad(px, pz, 0.35)) {
          n.userData.seg = seg;
          n.userData.tParam = t;
          n.userData.dir = dir;
          n.userData.side = side;
          n.userData.spd = 1.15 + Math.random() * 0.55;
          n.position.set(px, 0, pz);
          n.rotation.y = Math.atan2(dxn * dir, dzn * dir);
          return;
        }
      }
    }
    n.userData.seg = null;
  }

  function advanceAlongNextSeg(n, isBike) {
    const s = n.userData.seg;
    const endX = n.userData.dir > 0 ? s[2] : s[0];
    const endZ = n.userData.dir > 0 ? s[3] : s[1];
    const arr = nodeAdj.get(adjKey(endX, endZ)) || [];
    const maxC = isBike ? 4 : 5;
    let cands = arr.filter((it) => it.seg !== s && it.seg[6] >= 1 && it.seg[6] <= maxC);
    if (!cands.length) cands = arr.filter((it) => it.seg !== s && it.seg[6] >= 1);
    if (!cands.length) {
      n.userData.dir *= -1;
      n.userData.tParam = Math.max(0.05, Math.min(0.95, n.userData.tParam));
      return;
    }
    const pick = cands[Math.floor(Math.random() * cands.length)];
    n.userData.seg = pick.seg;
    n.userData.dir = pick.end === 0 ? 1 : -1;
    n.userData.tParam = pick.end === 0 ? 0.04 : 0.96;
  }

  function updateNpcs(dt, playerPos) {
    for (const n of npcs) {
      if (n.position.distanceTo(playerPos) > 135 || !n.userData.seg) {
        scatter(n);
        continue;
      }
      const isBike = n.userData.npcType === "bike";
      const s = n.userData.seg;
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1;
      let spd = n.userData.spd || (isBike ? 8 : 1.4);

      if (isBike && n.position.distanceTo(playerPos) < 4.5) {
        spd *= 0.25;
      }

      const nextT = n.userData.tParam + (n.userData.dir * spd * dt) / l;
      if (nextT >= 0.98 || nextT <= 0.02) {
        advanceAlongNextSeg(n, isBike);
        continue;
      }

      if (isBike) {
        n.userData.tParam = nextT;
        const [px, pz, fx, fz] = bikeLanePos(s, nextT, n.userData.dir);
        n.position.set(px, 0, pz);
        n.rotation.y = Math.atan2(fx, fz);
        if (n.userData.spinWheels) n.userData.spinWheels(spd * dt * 2.2);
      } else {
        const [px, pz, dxn, dzn] = pedSidewalkPos(s, nextT, n.userData.side || 1);
        // Nếu vỉa hè cắt ngang lòng đường khác thì quay đầu lại để luôn đi trên lề đường
        if (hitsAnyRoad(px, pz, 0.2)) {
          n.userData.dir *= -1;
        } else {
          n.userData.tParam = nextT;
          n.position.set(px, 0, pz);
          n.rotation.y = Math.atan2(dxn * n.userData.dir, dzn * n.userData.dir);
          if (n.userData.animateWalk) n.userData.animateWalk(spd, dt);
        }
      }
    }
  }

  function onHonk(playerPos) {
    for (const n of npcs) {
      if (n.userData.npcType === "bike" && n.position.distanceTo(playerPos) < 16) {
        n.userData.spd = Math.min(13, (n.userData.spd || 8) + 2.5);
      }
    }
  }

  function compassBearing(dx, dz) {
    const deg = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
    const dirs = ["Nam", "Đông Nam", "Đông", "Đông Bắc", "Bắc", "Tây Bắc", "Tây", "Tây Nam"];
    return dirs[Math.round(deg / 45) % 8];
  }

  function getLocationContext(x, z) {
    const nearSegs = getNearSegs(Math.floor(x / CH), Math.floor(z / CH));
    let bestD = 32;
    let street = "—";
    let roadClass = 2;
    for (const s of nearSegs) {
      const r = R0[s[5]];
      if (!r.n) continue;
      const d = dseg(x, z, s);
      if (d < bestD) {
        bestD = d;
        street = r.n;
        roadClass = s[6];
      }
    }

    let crossStreet = null;
    let crossDist = 70;
    if (street !== "—") {
      for (const s of nearSegs) {
        const r = R0[s[5]];
        if (!r.n || r.n === street || r.c > 4) continue;
        const d = dseg(x, z, s);
        if (d < crossDist) {
          crossDist = d;
          crossStreet = r.n;
        }
      }
    }

    let nearLandmark = null;
    let lmBest = 1e9;
    for (const lm of LANDMARKS) {
      const d = Math.hypot(lm.x - x, lm.z - z);
      if (d < lmBest) {
        lmBest = d;
        nearLandmark = { name: lm.name, dist: Math.round(d), dir: compassBearing(lm.x - x, lm.z - z) };
      }
    }

    let nearStation = null;
    let stBest = 1e9;
    for (const st of stations) {
      const d = Math.hypot(st.x - x, st.z - z);
      if (d < stBest) {
        stBest = d;
        nearStation = { label: st.label, dist: Math.round(d), dir: compassBearing(st.x - x, st.z - z) };
      }
    }

    return { street, roadClass, crossStreet, crossDist: Math.round(crossDist), nearLandmark, nearStation };
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
    updateNpcs,
    onHonk,
    getLocationContext,
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
