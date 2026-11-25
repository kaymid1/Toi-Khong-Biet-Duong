// Profiler nhẹ: bật bằng ?perf=1 hoặc phím F3. Không tốn chi phí khi tắt.
// ?bench=1 -> tự lái camera dọc một tuyến đường và xuất báo cáo vào window.__bench.
export function initPerf({ world, R0, autoBench = false }) {
  const params = new URLSearchParams(location.search);
  let on = params.get("perf") === "1" || autoBench;
  const frames = new Float32Array(600);
  let fi = 0;
  let filled = 0;
  let hitches = 0;
  let lastNow = performance.now();
  let renderMs = 0;

  const el = document.createElement("pre");
  el.id = "perfHud";
  el.style.cssText =
    "position:fixed;left:6px;bottom:6px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 monospace;" +
    "color:#9fffb0;background:#000a;border-radius:6px;pointer-events:none;white-space:pre;display:" +
    (on ? "block" : "none");
  document.body.appendChild(el);
  addEventListener("keydown", (e) => {
    if (e.key === "F3") {
      e.preventDefault();
      on = !on;
      el.style.display = on ? "block" : "none";
    }
  });

  const pct = (arr, n, p) => {
    const a = Array.from(arr.subarray(0, n)).sort((x, y) => x - y);
    return a[Math.min(n - 1, Math.floor(n * p))] || 0;
  };

  function snapshot() {
    const n = filled;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += frames[i];
    const info = world.renderer.info;
    const bs = world.getBuildStats();
    const cs = world.getChunkStats();
    return {
      frames: n,
      avgMs: +(sum / Math.max(1, n)).toFixed(2),
      p95Ms: +pct(frames, n, 0.95).toFixed(2),
      p99Ms: +pct(frames, n, 0.99).toFixed(2),
      maxMs: +pct(frames, n, 1).toFixed(2),
      hitches,
      renderCpuMs: +renderMs.toFixed(2),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      chunks: cs.active,
      queued: cs.queued,
      chunkBuild: { n: bs.count, avgMs: +(bs.totalMs / Math.max(1, bs.count)).toFixed(2), maxMs: +bs.maxMs.toFixed(2) },
      heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }

  let acc = 0;
  function frame(now, rMs) {
    const dt = now - lastNow;
    lastNow = now;
    renderMs = renderMs * 0.9 + rMs * 0.1;
    frames[fi] = dt;
    fi = (fi + 1) % frames.length;
    filled = Math.min(frames.length, filled + 1);
    if (dt > 33) hitches++;
    acc += dt;
    if (on && acc > 500) {
      acc = 0;
      const s = snapshot();
      el.textContent =
        `frame avg ${s.avgMs}ms  p95 ${s.p95Ms}  p99 ${s.p99Ms}  max ${s.maxMs}\n` +
        `hitch>33ms: ${s.hitches}   render CPU ${s.renderCpuMs}ms\n` +
        `draws ${s.drawCalls}  tris ${s.triangles}\n` +
        `geo ${s.geometries}  tex ${s.textures}  heap ${s.heapMB ?? "?"}MB\n` +
        `chunks ${s.chunks} (+${s.queued} queue)  build avg ${s.chunkBuild.avgMs} max ${s.chunkBuild.maxMs}ms`;
    }
  }

  function reset() {
    fi = filled = hitches = 0;
  }
  return { frame, snapshot, reset, isOn: () => on };
}
