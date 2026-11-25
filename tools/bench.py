"""Benchmark headless: python3 tools/bench.py [giây] — cần server tĩnh ở :8080 và playwright + chrome.
Lưu ý: GPU phần mềm (swiftshader) nên FPS không đại diện; draw calls/tris/chunk build ms thì đáng tin."""
import json, sys, time
from playwright.sync_api import sync_playwright
dur = float(sys.argv[1]) if len(sys.argv) > 1 else 20
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1280, "height": 720})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("http://localhost:8080/?perf=1", wait_until="load")
    pg.wait_for_function("window.__perf", timeout=60000)
    time.sleep(2)
    pg.evaluate("window.__perf.reset()")
    pg.keyboard.down("w")
    t0 = time.time(); series = []
    while time.time() - t0 < dur:
        time.sleep(2); series.append(pg.evaluate("window.__perf.snapshot()"))
    pg.keyboard.up("w")
    print(json.dumps(series[-1], indent=1, ensure_ascii=False))
    print("position:", pg.evaluate("[__world.me.position.x|0, __world.me.position.z|0]"))
    print("errors:", errs[:5])
    pg.screenshot(path="/tmp/bench.png")
    b.close()
