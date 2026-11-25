# Hiệu năng & kiến trúc streaming

## Công cụ đo
- `?perf=1` hoặc phím **F3**: overlay frame avg/p95/p99/max, hitch >33ms, draw calls, triangles, geometry/texture, heap, số chunk + hàng đợi, thời gian dựng chunk.
- `window.__perf.snapshot()` và `window.__world` để debug trong console.
- `python3 tools/bench.py 20` (cần `python3 -m http.server 8080`): chạy headless, giữ phím `W`, in báo cáo JSON. GPU phần mềm nên **FPS không đại diện**; draw calls, triangles, chunk build ms là đáng tin. FPS thật phải đo trên máy/GPU thật (F3).

## Kết quả đo hiện tại (Đà Nẵng, 30 chunk, headless)
| Chỉ số | Giá trị | Nhận xét |
|---|---|---|
| Dựng 1 chunk | avg 0.9ms, max 7ms (lần đầu, JIT) | Rẻ; vấn đề cũ là dựng nhiều chunk **cùng một khung** khi qua biên ô |
| Draw calls | ~180 | Mỗi chunk ~6 InstancedMesh + mesh biển riêng lẻ |
| Triangles | ~8k | Nhẹ, chưa phải nút thắt |
| Heap JS | ~15MB | Ổn |

Kết luận: hiện **hình học và CPU-JS chưa phải nút thắt**. Rủi ro thật: (1) hitch khi stream, (2) shadow map + pixel ratio trên GPU yếu, (3) tải 940KB JSON + dựng index toàn thành phố lúc boot, (4) thêm nhiều thành phố/asset thì mọi thứ nằm trong bộ nhớ.

## Đã làm
`stream()` trong [world3d.js](../js/world3d.js):
- **Hàng đợi ưu tiên** (chunk phía trước theo hướng xe đi trước), tối đa 2 chunk / 3ms mỗi khung.
- Chunk dưới chân chưa có (spawn/teleport) thì dựng đồng bộ ngay.
- Dỡ chunk có **độ trễ 1 ô** để không nhấp nháy ở biên.
- Chỉnh qua `world.streamCfg`, đọc số liệu qua `world.getBuildStats()`.

## Thiết kế tile streaming (bước tiếp theo)
Hiện tại: tải **toàn bộ** `danang.json`, dựng index `cell` cho mọi đoạn đường lúc boot, rồi sinh nhà/cây theo seed mỗi chunk. Khi có nhiều thành phố:

1. **Tiền xử lý offline** (`tools/build_tiles.py`): OSM/JSON → tile `128m × 128m` ra `data/<city>/tiles/{x}_{z}.bin` (đường, tên, nhà đặt sẵn, biển báo) + `index.json` (bbox, tên đường → tile, landmark, cây xăng).
2. **Runtime**: `TileStore` fetch tile theo hàng đợi trên, cache LRU (~100 tile), giải mã trong **Web Worker** (typed array vị trí/màu, `transferable`); luồng chính chỉ tạo BufferGeometry/InstancedMesh.
3. **Truy vấn đường** (`roadInfoAt`, `nearestRoad`, `findOnStreet`) đọc từ tile đã nạp; tìm theo tên đường dùng `index.json` (cần cho tablet/nhiệm vụ).
4. **Gộp draw call**: pool InstancedMesh dùng chung nhiều chunk; biển báo thành InstancedMesh.
5. **LOD**: chunk xa chỉ đường + khối nhà đơn giản, không bóng; chunk gần mới có awning/cây/đèn.
6. **Chất lượng tự động**: p95 > 25ms trong 5s thì hạ dần pixel ratio → tắt bóng → giảm `RAD`.

Thứ tự đề xuất: (6) → (4) → (1–3) → (5). Làm (1–3) khi thêm thành phố thứ hai.

## Hệ thống thưởng/thành tựu (làm tiếp)
Gắn vào dữ liệu có sẵn (`state.learned`, XP, nhiệm vụ tablet): thành tựu theo quận/đường đã thuộc, chuỗi ngày chơi, huy hiệu địa danh, sổ tay đường phố, ôn tập lặp lại ngắt quãng cho đường hay quên.
