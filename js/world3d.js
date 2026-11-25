import { geo, WD, $ } from "./state.js";

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

  // Đặt biển tên đường 2 mặt ngay đầu ngã tư
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
    R0.forEach((r) => {
      if (!r.n || r.c > 3 || r.p.length < 4) return;
      const pts = [
        [0, 2],
        [r.p.length - 2, r.p.length - 4],
      ];
      pts.forEach(([i0, i1]) => {
        const ix = r.p[i0] * geo.UX;
        const iz = -r.p[i0 + 1] * geo.UZ;
        const st = nodeNames.get(nKey(ix, iz));
        if (!st || st.size < 2) return;
        const nx = r.p[i1] * geo.UX;
        const nz = -r.p[i1 + 1] * geo.UZ;
        const dx = nx - ix;
        const dz = nz - iz;
        const l = Math.hypot(dx, dz) || 1;
        if (l < 5) return;
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec9e8);
  scene.fog = new THREE.Fog(0x9ec9e8, 95, 270);

  const cam = new THREE.PerspectiveCamera(62, 1, 0.1, 450);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 0.8);
  sun.position.set(30, 50, 20);
  scene.add(sun);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lam(0x7a9a68));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const bG = new THREE.BoxGeometry(1, 1, 1);
  const bM = lam(0xffffff);
  const rM = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const pal = [0xe9d8b4, 0xd9a79a, 0xb7c9d6, 0xf2e3a0, 0xc9b8d8];
  const poleG = new THREE.CylinderGeometry(0.07, 0.07, 3.1, 6);
  const poleM = lam(0xd0d7de);
  const boardG = new THREE.PlaneGeometry(2.6, 0.72);
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
    ctx.font = "bold 24px system-ui,sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = text.length > 20 ? text.slice(0, 19) + "…" : text;
    ctx.fillText(label, 128, 37);
    const tex = new THREE.CanvasTexture(cv);
    m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    signTexCache.set(text, m);
    return m;
  }

  function makeBillboard(text, bg = "#101820cc", fg = "#ffb020", font = "bold 26px system-ui") {
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
    if (own.length) {
      let qCount = 0;
      own.forEach((s) => {
        qCount += 3 + (s[6] <= 3 ? 1 : 0);
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
        const sw = s[6] <= 3 ? 1.45 : 0.95;
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
        pushQuad(ax, az, bx, bz, ux * (h + sw), uz * (h + sw), ySw, 0.56, 0.59, 0.62);
        pushQuad(ax, az, bx, bz, ux * (h + curb), uz * (h + curb), yCb, 0.82, 0.84, 0.87);
        const rc = s[6] <= 3 ? 0.27 : 0.2;
        pushQuad(ax, az, bx, bz, ux * h, uz * h, yRd, rc, rc * 1.03, rc * 1.08);
        if (s[6] <= 3) pushQuad(s[0], s[1], s[2], s[3], ux * 0.09, uz * 0.09, yRd + 0.004, 0.88, 0.74, 0.32);
      });
      const gm = new THREE.BufferGeometry();
      gm.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      gm.setAttribute("color", new THREE.BufferAttribute(col, 3));
      gm.setIndex(new THREE.BufferAttribute(idx, 1));
      grp.add(new THREE.Mesh(gm, rM));
    }

    const bl = [];
    for (let t = 0; t < 18 && bl.length < 10; t++) {
      const w = 6 + rnd(cx, cz, t) * 8;
      const x = cx * CH + 12 + rnd(cx, cz, t + 30) * (CH - 24);
      const z = cz * CH + 12 + rnd(cx, cz, t + 60) * (CH - 24);
      if (L.some((s) => dseg(x, z, s) < s[4] / 2 + w * 0.75 + 2.8)) continue;
      bl.push([x, z, w, 6 + Math.pow(rnd(cx, cz, t + 90), 2) * 28]);
    }
    if (bl.length) {
      const im = new THREE.InstancedMesh(bG, bM, bl.length);
      const M = new THREE.Matrix4();
      bl.forEach((b, i) => {
        M.makeScale(b[2], b[3], b[2]).setPosition(b[0], b[3] / 2, b[1]);
        im.setMatrixAt(i, M);
        im.setColorAt(i, new THREE.Color(pal[(i + cx + cz + 50) % 5]));
      });
      grp.add(im);
    }

    const sg = signCell.get(cx + "," + cz);
    if (sg) {
      sg.forEach((item) => {
        const pMesh = new THREE.Mesh(poleG, poleM);
        pMesh.position.set(item.x, 1.55, item.z);
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
    scene.add(grp);
    return grp;
  }

  function stream(px, pz) {
    const cx = Math.floor(px / CH);
    const cz = Math.floor(pz / CH);
    const want = new Set();
    for (let i = -RAD; i <= RAD; i++) {
      for (let j = -RAD; j <= RAD; j++) {
        const k = cx + i + "," + (cz + j);
        want.add(k);
        if (!chunks.has(k)) {
          chunks.set(k, build(cx + i, cz + j));
          loaded++;
        }
      }
    }
    for (const [k, gp] of chunks) {
      if (!want.has(k)) {
        scene.remove(gp);
        gp.children.forEach((c) => {
          if (c.isInstancedMesh) c.dispose();
          else if (c.geometry !== poleG && c.geometry !== boardG) c.geometry.dispose();
        });
        chunks.delete(k);
        unloaded++;
      }
    }
  }

  function onRoad(x, z, margin = 0.25) {
    const cx = Math.floor(x / CH);
    const cz = Math.floor(z / CH);
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        const L = cell.get(cx + a + "," + (cz + b));
        if (!L) continue;
        for (const s of L) if (dseg(x, z, s) < s[4] / 2 + margin) return true;
      }
    }
    return false;
  }

  function nearestRoad(x, z, rad) {
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
    const off = s[4] / 2 + 2.4;
    const sx = p[0] + (-dz / l) * off;
    const sz = p[1] + (dx / l) * off;
    const grp = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 4.5), lam(0xe65100));
    roof.position.y = 4.2;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.22, 4.6), lam(0xffd54f));
    stripe.position.y = 4.05;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), lam(0xeeeeee));
    p1.position.set(-2.3, 2, 0);
    const p2 = p1.clone();
    p2.position.set(2.3, 2, 0);
    const pm1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.6), lam(0xd32f2f));
    pm1.position.set(-0.9, 0.7, 0);
    const pm2 = pm1.clone();
    pm2.position.set(0.9, 0.7, 0);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.12, 4.8), lam(0x455a64));
    pad.position.y = 0.06;
    const lbl = makeBillboard("⛽ " + st.label, "#0d2b1f", "#3ddc97", "bold 17px system-ui");
    lbl.position.y = 6.8;
    lbl.scale.set(11, 2.6, 1);
    grp.add(roof, stripe, p1, p2, pm1, pm2, pad, lbl);
    grp.position.set(sx, 0, sz);
    grp.rotation.y = Math.atan2(dx, dz);
    scene.add(grp);
    stations.push({ x: sx, z: sz, px: sx / geo.UX, py: -sz / geo.UZ, label: st.label });
  });

  // Địa danh điểm neo
  LANDMARKS.forEach((lm) => {
    const gLm = new THREE.Group();
    if (lm.type === "bridge" || lm.type === "bridge2") {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(14, 1.2, 8, 20, Math.PI),
        lam(lm.type === "bridge" ? 0xffb020 : 0x4fc3f7)
      );
      arch.position.y = 2;
      gLm.add(arch);
    } else if (lm.type === "cable") {
      const tw = new THREE.Mesh(new THREE.ConeGeometry(3, 28, 4), lam(0xe8eef5));
      tw.position.y = 14;
      gLm.add(tw);
    } else if (lm.type === "airport") {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 22, 8), lam(0x90a4ae));
      tw.position.y = 11;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 2.4, 3.5, 8), lam(0x4fc3f7));
      top.position.y = 23;
      gLm.add(tw, top);
    } else if (lm.type === "beach") {
      const umb = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 8), lam(0x29b6f6));
      umb.position.y = 9;
      const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 9, 6), lam(0xffe082));
      pl.position.y = 4.5;
      gLm.add(umb, pl);
    } else {
      const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 12), lam(0xd9a79a));
      hall.position.y = 4;
      const rf = new THREE.Mesh(new THREE.ConeGeometry(12, 5, 4), lam(0xb71c1c));
      rf.position.y = 10.5;
      rf.rotation.y = Math.PI / 4;
      gLm.add(hall, rf);
    }
    const sp = makeBillboard("★ " + lm.name, "#131d29dd", "#ffb020");
    sp.position.y = 29;
    gLm.add(sp);
    gLm.position.set(lm.x, 0, lm.z);
    scene.add(gLm);
  });

  // Xe người chơi & NPC
  const root = new THREE.Group();
  const body = new THREE.Group();
  const dk = lam(0x222831);
  const bdMat = lam(0xe0392d);
  const bd = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 1.6), bdMat);
  const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), dk);
  const w2 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.15, 10), dk);
  const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 8), lam(0x2d6cdf));
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lam(0xffb020));
  bd.position.y = 0.6;
  w1.rotation.z = w2.rotation.z = Math.PI / 2;
  w1.position.set(0, 0.35, 0.7);
  w2.position.set(0, 0.35, -0.7);
  rb.position.set(0, 1.3, -0.1);
  hd.position.set(0, 1.95, -0.05);
  body.add(bd, w1, w2, rb, hd);
  root.add(body);
  root.userData = { body, w1, w2, bdMat };
  scene.add(root);

  const npcs = [];
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Group();
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.4, 8),
      lam(new THREE.Color().setHSL(Math.random(), 0.6, 0.55))
    );
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), lam(0xffd7b0));
    b.position.y = 0.7;
    h.position.y = 1.7;
    p.add(b, h);
    p.userData.t = new THREE.Vector3();
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

  return {
    CH,
    NSEG,
    scene,
    renderer,
    cam,
    ground,
    me: root,
    npcs,
    cell,
    stations,
    stream,
    onRoad,
    nearestRoad,
    scatter,
    setBikeColor: (hex) => bdMat.color.setHex(hex),
    getChunkStats: () => ({ active: chunks.size, loaded, unloaded }),
  };
}
