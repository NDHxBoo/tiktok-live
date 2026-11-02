# 🚔 Đi Tù Online 3D

Nhà tù hoạt hình **3D low-poly** chạy trên trình duyệt: nhiều người chơi cùng lúc, vào ngay không cần đăng nhập,
tối ưu cho điện thoại, cài được lên màn hình chính (PWA). Kèm **chế độ phát live TikTok**: người xem bình luận/tặng quà
thì nhân vật mang tên + avatar TikTok của họ xuất hiện và hành động trong nhà tù, chung phòng với người chơi web.

> Nhân vật, trại giam là **hư cấu, hoạt hình**: "Cảnh sát Bánh Bao" áo tím, mũ hồng gắn huy hiệu bánh donut.
> Không dùng quân phục, phù hiệu, logo hay tên lực lượng công an thật.
> Chỉ để giải trí: **không cược, không nạp tiền, không đổi thưởng.**

| Trang | Địa chỉ | Dùng để |
|---|---|---|
| Chơi | `/?phong=tu-1` | Trò chơi 3D (điện thoại + máy tính) |
| Live | `/live?phong=tu-1` | Browser Source dọc 1080×1920 cho OBS / TikTok LIVE Studio |
| Quản trị | `/admin` | Mật khẩu `ADMIN_PASSWORD` |

---

## 1. Chạy trên máy tính của bạn

Cần **Node.js 20+** (https://nodejs.org) và Git.

```bash
git clone https://github.com/NDHxBoo/tiktok-live.git
cd tiktok-live
git checkout claude/tiktok-live-prison-game-1d7zqh
npm install
cp .env.example .env          # Windows: copy .env.example .env  → mở .env, đặt ADMIN_PASSWORD
npm run dev
```

Mở http://localhost:3000 → nhập biệt danh → chọn tội → vào tù.
Mở thêm tab ẩn danh để thử 2 người chơi cùng phòng. Mở http://localhost:3000/live để xem trang live,
http://localhost:3000/admin để gửi bình luận/quà TikTok giả (hoặc bật **🤖 Bot demo**).

Chơi thử bằng điện thoại cùng mạng Wi-Fi: mở `http://<IP-máy-tính>:3000` (xem IP bằng `ipconfig` / `ifconfig`).

Lệnh khác: `npm run build` (đóng gói giao diện vào `dist/`), `npm start` (chạy bản đóng gói), `npm test` (kiểm thử luật chơi).
Thử ban đêm: thêm `?gio=21` vào địa chỉ.

## 2. Cách chơi (web)

1. Nhập biệt danh → chọn tội vui (trộm gà, ăn vụng, quỵt nợ trà sữa…) → Cảnh sát Bánh Bao dẫn bạn qua **bàn tiếp nhận** vào **ô tù**.
2. Đồng hồ án đếm ngược trên đầu nhân vật. Hết án → ra **sân** tự do.
3. Điều khiển: **joystick ảo** (nửa trái màn hình), kéo nửa phải để xoay camera. Máy tính: **WASD**, Shift chạy, kéo chuột xoay, cuộn để zoom.
4. Tương tác: 💬 chat bong bóng (≤60 ký tự, lọc từ cấm), 😀 biểu cảm (vẫy tay, khóc, nhảy, đập song sắt).
5. Hoạt động: **🏋️ tập tạ** ở sân, **🍲 xếp hàng** nhà ăn, **⛏️ đào hầm** khi ở tù (bấm liên tục – càng nhiều người cùng đào càng nhanh; thông hầm thì mọi tù nhân chui ra sân).
6. **🤝 Bảo lãnh** người khác ra tù (mỗi 60 giây 1 lần). **Không ai có thể tống người khác vào tù.**

Phòng: `?phong=tu-1`, tối đa 30 người chơi web/phòng; đầy thì tự chuyển sang `tu-2`, `tu-3`…

## 3. Chế độ live TikTok

1. Trong `.env`: `TIKTOK_USERNAME=ten_kenh` (hoặc nhập ở `/admin` → Kết nối).
2. OBS / TikTok LIVE Studio → thêm **Browser Source**: `http://localhost:3000/live?phong=tu-1`, kích thước **1080 × 1920**.
3. Camera tự lướt qua cổng, dãy phòng giam, sân tập, nhà ăn; tự lao tới chỗ có sự kiện. Không ai tương tác 2 phút → camera đi theo cảnh sát tuần tra và hiện lời mời chơi.

| Người xem làm gì | Kết quả |
|---|---|
| Bình luận từ khoá tội (vd `trộm gà`) | Nhân vật mang tên + avatar TikTok của **chính họ** xuất hiện ở cổng và bị dẫn vào ô |
| Bình luận thường | Hiện bong bóng chat trên đầu nhân vật của họ |
| Bình luận `đào` khi đang ở tù | Đào hầm cùng mọi người |
| 🎁 Quà nhỏ | Giảm 30 giây án của mình |
| 🎁 Quà vừa | Bảo lãnh 1 người (gõ `@tên` hoặc tên trước khi tặng; không chỉ định → người án dài nhất) |
| 🎁 Quà lớn | **Vượt ngục tập thể**: tường phòng giam nổ, mọi người chạy ra sân |
| 🎁 Quà rất lớn | Làm **Cai ngục** 5 phút (áo vàng, vương miện, tên trên đầu màn hình) |
| ❤️ Mỗi 50 like | Giảm 5 giây án |
| ➕ Follow lần đầu | Miễn bị bắt 1 lần |

Map quà ở `config.json → gifts` (hoặc `/admin`): xét theo **giftId** → **tên quà** → **số kim cương**. Mỗi lần có quà,
nhật ký ghi tên/giftId/kim cương để bạn khai báo cho đúng. Người chơi web và người xem TikTok ở chung phòng `rooms.liveRoom`.

## 4. Trang quản trị `/admin`

- Xem số người mỗi phòng (web / TikTok / đang ở tù / đang xem live), danh sách nhân vật, chat gần đây.
- **Kick**, **Chặn** (theo mã thiết bị + IP, lưu `data/bans.json`), bỏ chặn, **xoá chat**, thả hết tù nhân.
- Sửa **danh sách tội & mức án**, **bảng quà**, thông số, từ cấm, chữ chạy → lưu `config.json`, áp dụng ngay.
- Gửi **bình luận/quà/like/follow giả** để test khi chưa live; bật bot demo; kết nối/ngắt TikTok.

## 5. An toàn

- Tội chỉ áp lên **chính người gửi**. Gõ `@người_khác trộm gà` → người gõ đi tù. Trong code không có lệnh nào đưa người khác vào tù.
- Biệt danh web có từ cấm → bị từ chối. Tên TikTok có từ cấm → hiện "Ẩn danh #n", ẩn avatar. Chat có từ cấm → không hiển thị.
- Chống spam: giới hạn tốc độ chat, nhận án, di chuyển; server kiểm tra vị trí (không đi xuyên tường, không ra khỏi ô khi đang ở tù).
- Ảnh avatar TikTok đi qua proxy `/avatar` chỉ cho phép tên miền ảnh của TikTok.
- Mật khẩu admin so sánh an toàn, khoá 1 phút sau 5 lần sai.

## 6. Hiệu năng trên điện thoại

- Toàn bộ cảnh tĩnh gộp thành ~3 lưới (draw call) bằng vertex color, không texture lớn, không đổ bóng thật (dùng bóng tròn giả).
- Nhân vật dùng chung hình học/vật liệu; chỉ vẽ ~32 nhân vật gần nhất, ẩn bảng tên ở xa.
- Tự hạ độ phân giải khi FPS < 40. Three.js ~120 KB gzip, toàn bộ trang < 250 KB gzip.
- Server gửi vị trí 10 lần/giây, client nội suy cho mượt.

## 7. Deploy lên VPS (Docker)

Trên VPS Ubuntu 22.04/24.04:

```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/NDHxBoo/tiktok-live.git && cd tiktok-live
git checkout claude/tiktok-live-prison-game-1d7zqh
cp .env.example .env   # đặt ADMIN_PASSWORD, DOMAIN=ditu.tenmien.com, TRUST_PROXY=true
docker compose up -d --build
```

- Trỏ bản ghi **A** của tên miền về IP VPS trước; **Caddy** tự cấp HTTPS miễn phí (PWA và cài lên màn hình chính **bắt buộc HTTPS**).
- `config.json`, `logs/`, `data/` được gắn ra ngoài container nên sửa ở `/admin` không mất khi cập nhật.
- Cập nhật: `git pull && docker compose up -d --build`. Xem log: `docker compose logs -f app`.
- OBS trên máy bạn dùng `https://ditu.tenmien.com/live?phong=tu-1`.

> Dockerfile chưa được build thử trong môi trường phát triển (không có Docker daemon); nếu lỗi, gửi log `docker compose build` để sửa.

## 8. Chi phí thuê VPS (ước tính)

**Băng thông/người chơi:** ~15 KB/giây khi phòng đông (60 nhân vật × 10 lần/giây) ≈ 0,12 Mbps.
Một phòng đầy 30 người ≈ 3,6 Mbps. Nếu trung bình 30 người online 6 giờ/ngày → khoảng **300 GB/tháng** (đa số VPS cho 1–4 TB).
**CPU/RAM:** server Node.js nhẹ; 1 vCPU/1–2 GB chịu được ~3–5 phòng đầy, 2 vCPU/4 GB ~10 phòng (~300 người).

| Gói | Cấu hình | Phù hợp | Giá tham khảo/tháng |
|---|---|---|---|
| Thử nghiệm | 1 vCPU · 1–2 GB · 25–50 GB SSD | Live TikTok + vài chục người chơi | VPS Việt Nam ~100–200 nghìn đ · Vultr/DigitalOcean Singapore ~6–12 USD (~160–320 nghìn đ) |
| **Khuyến nghị** | 2 vCPU · 4 GB · 50–80 GB SSD | Tối đa ~10 phòng (~300 người) | VPS Việt Nam ~250–450 nghìn đ · Singapore ~24 USD (~630 nghìn đ) |
| Lớn | 4 vCPU · 8 GB | Nhiều phòng + nhiều buổi live song song | ~600 nghìn – 1,3 triệu đ |

Chi phí khác: tên miền `.com` ~300 nghìn đ/năm (`.vn` ~ 700–900 nghìn đ năm đầu), HTTPS **miễn phí** (Caddy + Let's Encrypt),
Cloudflare gói Free (tuỳ chọn, hỗ trợ WebSocket). **Tổng cho khởi đầu: khoảng 150–450 nghìn đ/tháng + tên miền.**

Lưu ý chọn VPS:
- Ưu tiên máy chủ **ở Việt Nam hoặc Singapore** để độ trễ thấp (~20–50 ms). Máy chủ châu Âu/Mỹ rẻ nhưng trễ 180–250 ms, nhân vật sẽ giật.
- Chọn gói có **băng thông không giới hạn hoặc ≥ 1 TB**, IPv4 riêng.
- Giá trên là mức tham khảo, thay đổi theo nhà cung cấp và khuyến mãi – kiểm tra lại trên trang của nhà cung cấp trước khi mua.
- Về sau muốn nhiều server chạy song song thì thêm Redis (socket.io adapter) – code đã tách phòng nên dễ mở rộng.

## 9. Cấu hình

`.env`: xem `.env.example` (mật khẩu admin, TikTok, cổng, proxy, log).
`config.json`:
- `rooms`: `maxPlayers` (30), `prefix` (`tu`), `maxRooms`, `liveRoom`.
- `game`: sức chứa ô, treo máy, án tối đa, chống spam, like, follow, Cai ngục, cooldown bảo lãnh web, số nhân vật TikTok tối đa,
  độ dài chat, thông số đào hầm (`digTapPercent`, `digDecayPercentPerSecond`, `digCooldownSeconds`, `digKeyword`).
- `crimes`, `gifts`, `bannedWords`, `ticker`.

## 10. Cấu trúc mã nguồn

```
shared/            Dùng chung server + client
  map.js           Bản đồ, ô tù, vật cản, lộ trình dẫn giải
  protocol.js      Mã hoạt ảnh, trạng thái
  filter.js text.js  Lọc từ cấm, xử lý tiếng Việt
server/
  index.js         Khởi động: Express + socket.io + Vite (dev)
  RoomManager.js   Chia phòng, kết nối người chơi, vòng lặp 10 lần/giây
  Room.js          Luật chơi trong phòng (nhận án, bảo lãnh, quà, đào hầm, nhà ăn, AI nhân vật TikTok)
  rules.js         Hàm luật thuần (khớp tội, map quà, chọn người bảo lãnh)
  admin.js         Kênh quản trị có mật khẩu
  bans.js avatarProxy.js config.js logger.js
  sources/         tiktokSource.js (tự kết nối lại), normalize.js, demoBot.js
client/
  index.html live.html admin.html
  src/play.js live.js admin.js
  src/three/       world.js (cảnh + ngày/đêm), character.js, actors.js, fx.js, build.js, renderer.js
  src/audio.js     Nhạc nền tự tổng hợp + hiệu ứng
  src/ui/joystick.js
  public/          manifest, service worker, icon, âm thanh
test/              node --test
Dockerfile docker-compose.yml Caddyfile
```
