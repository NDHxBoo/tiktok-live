# 🚔 Đi Tù Online – game TikTok LIVE treo máy

Game tương tác cho TikTok LIVE: người xem **tự "phạm tội" bằng bình luận** để bị cảnh sát hoạt hình bắt vào tù,
dùng **quà tặng / like / follow** để giảm án, bảo lãnh người khác hoặc phá ngục. Game chạy tự động,
hiển thị qua một trang web overlay để đưa vào **OBS** hoặc **TikTok LIVE Studio**.

> Toàn bộ nhân vật và trại giam là **hư cấu, hoạt hình** ("Cảnh sát Bánh Bao" áo tím, mũ hồng, huy hiệu bánh donut).
> Không dùng quân phục, phù hiệu hay logo của lực lượng công an thật. Game chỉ để giải trí:
> **không cược, không thắng quà, không đổi thưởng.**

---

## 1. Cài đặt

Yêu cầu: **Node.js 20 trở lên** (https://nodejs.org).

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm start
```

Mở trình duyệt:

| Trang | Địa chỉ | Dùng để |
|---|---|---|
| Overlay | http://localhost:3000/overlay | Đưa vào OBS / LIVE Studio (1080 × 1920) |
| Điều khiển | http://localhost:3000/control | Bật/tắt, reset, âm lượng, test, sửa tội |

Chạy test luật chơi: `npm test`

## 2. Làm theo thứ tự

### Bước 1 – Chế độ test (chưa cần live)
Để `MODE=test` trong `.env`. Bot demo tự sinh bình luận/quà giả để bạn xem game chạy.
Trên trang điều khiển có thể:
- Gõ bình luận giả (vd `trộm gà`, `@meou cứu với`), bấm nút tội nhanh.
- Bấm **Quà nhỏ / vừa / lớn / rất lớn**, hoặc nhập tên quà TikTok + số kim cương để thử cách map quà.
- Gửi like, follow giả. Đổi người chơi bằng nút 🎲.
- Tắt/bật bot demo.

### Bước 2 – Chỉnh đồ hoạ và luật chơi
- Sửa danh sách tội & mức án, thông số, từ cấm, dòng chữ chạy **ngay trên trang điều khiển** (tự lưu vào `config.json`).
- Hoặc sửa trực tiếp `config.json` rồi khởi động lại.

### Bước 3 – Kết nối TikTok thật
Trong `.env`:
```
MODE=live
TIKTOK_USERNAME=ten_kenh_cua_ban
```
Khởi động lại `npm start`. Hoặc nhập username trên trang điều khiển rồi bấm **Kết nối**.
Nếu bạn chưa lên live, game tự thử lại liên tục (5 s → 10 s → … tối đa 120 s) cho tới khi kết nối được;
mất kết nối giữa chừng cũng tự nối lại.

> `tiktok-live-connector` là thư viện không chính thức. Nếu hay bị lỗi kết nối / giới hạn,
> đăng ký API key miễn phí tại https://www.eulerstream.com rồi điền `EULER_API_KEY` trong `.env`.

## 3. Đưa vào OBS / TikTok LIVE Studio

1. **Thêm nguồn → Browser (Trình duyệt)**.
2. URL: `http://localhost:3000/overlay`
3. Width **1080**, Height **1920**.
4. Tích **"Control audio via OBS"** nếu muốn chỉnh tiếng trong OBS.
5. Muốn nền trong suốt để chồng lên camera: dùng `http://localhost:3000/overlay?transparent=1`.

Tham số overlay: `?mute=1` tắt tiếng (dùng khi xem thử), `?transparent=1` bỏ nền trời.
Khi mở overlay trong trình duyệt thường, có thể cần bấm nút **🔊 Bấm để bật âm thanh** (OBS không cần).

## 4. Luật chơi

| Hành động | Kết quả |
|---|---|
| Bình luận có từ khoá tội (vd `trộm gà`) | **Chính người đó** bị bắt vào một ô tù, đồng hồ đếm ngược án |
| Gõ tội khác khi đang ở tù | Cộng dồn án (tối đa `maxSentenceSeconds`) |
| Hết án | Được thả, chạy ra khỏi màn hình kèm pháo giấy |
| 🎁 Quà nhỏ | Giảm 30 giây án cho chính mình (× số lượng quà) |
| 🎁 Quà vừa | Bảo lãnh một người khác ra tù |
| 🎁 Quà lớn | **Vượt ngục tập thể** – nổ tường, thả toàn bộ |
| 🎁 Quà rất lớn | Làm **Cai ngục** 5 phút, tên hiện trên đầu màn hình |
| ❤️ Mỗi 50 like của một người | Giảm 5 giây án cho người đó |
| ➕ Follow lần đầu | Miễn bị bắt 1 lần |

**Bảo lãnh chọn ai?** Game đọc bình luận gần nhất (trong 3 phút) của người tặng quà:
1. `@username` hoặc `@tên` khớp với một tù nhân → bảo lãnh người đó.
2. Bình luận có chứa tên hiển thị của tù nhân (vd `tha cho Mèo Ú`) → bảo lãnh người đó.
3. Không chỉ định được → bảo lãnh người đang có án dài nhất.
Người tặng **không bao giờ** tự bảo lãnh chính mình bằng quà vừa.

**Quá tải:** nhà tù tối đa 24 ô; khi đầy, người có án còn lại ngắn nhất được thả sớm để nhường chỗ.

**Bảng xếp hạng (trong phiên):**
- 🔥 *Tội phạm nguy hiểm nhất*: tổng thời gian án đã nhận.
- 😇 *Người tốt nhất*: số người đã cứu (bảo lãnh + số tù nhân được thả khi người đó phá ngục).

**Treo máy:** không ai tương tác 2 phút → cảnh sát đi tuần với đèn pin và hiện lời mời chơi.

## 5. An toàn

- Chỉ người bình luận mới **tự đưa mình** vào tù. Gõ `@người_khác trộm gà` thì **người gõ** đi tù, không phải người bị nhắc tên.
  Trong code không có đường nào để tống người khác vào tù – người khác chỉ có thể được bảo lãnh **ra**.
- **Lọc từ cấm** (`bannedWords` trong `config.json` hoặc trang điều khiển):
  - Bình luận chứa từ cấm bị **bỏ qua hoàn toàn**: không hiển thị, không tính.
  - Tên/username chứa từ cấm hiển thị thành **"Ẩn danh #n"** và **ẩn ảnh đại diện**.
  - So khớp theo nguyên từ, giữ nguyên dấu (để "đeo kính", "lớn" không bị bắt nhầm), bắt được kiểu tách chữ `v c l`, `đ.ị.t`.
    Vì vậy hãy khai báo cả bản có dấu và không dấu nếu cần (vd `địt`, `dit`).
- Overlay **không bao giờ hiển thị nội dung bình luận** của người xem, chỉ hiện tên tội trong danh sách bạn cấu hình.
- Chống spam: mỗi người phải cách nhau `commentCooldownSeconds` giây mới phạm tội tiếp được.
- Trang điều khiển chỉ mở được **từ chính máy chạy game**. Nếu muốn mở từ máy khác: đặt `HOST=0.0.0.0`
  và `CONTROL_TOKEN=matkhau`, rồi vào `http://IP:3000/control?token=matkhau`.
- Không có cơ chế cược, thắng quà hay đổi thưởng.

## 6. Cấu hình

### `.env`
| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `MODE` | `test` (dữ liệu giả) / `live` (kết nối TikTok) | `test` |
| `TIKTOK_USERNAME` | username kênh đang live | |
| `PORT`, `HOST` | cổng / địa chỉ web | `3000`, `127.0.0.1` |
| `DEMO_BOT` | bật bot demo; để trống = bật ở test, tắt ở live | |
| `EULER_API_KEY` | API key Euler Stream (tuỳ chọn) | |
| `CONTROL_TOKEN` | mật khẩu mở trang điều khiển từ máy khác | |
| `LOG_DIR`, `LOG_LEVEL` | thư mục log, mức log (`debug`/`info`/`warn`/`error`) | `logs`, `info` |
| `RECONNECT_MIN_SECONDS`, `RECONNECT_MAX_SECONDS` | thời gian chờ kết nối lại | `5`, `120` |

### `config.json`
```jsonc
{
  "game": {
    "maxCells": 24,               // số ô tù (1–24)
    "idleSeconds": 120,           // treo máy bao lâu thì đi tuần
    "maxSentenceSeconds": 3600,   // án tối đa
    "commentCooldownSeconds": 2,  // chống spam
    "likesPerReduction": 50,      // số like / 1 lần giảm án
    "likeReductionSeconds": 5,
    "followImmunity": 1,          // số lần miễn bắt khi follow lần đầu
    "wardenMinutes": 5,           // thời gian làm Cai ngục
    "bailMemorySeconds": 180      // bình luận cũ bao lâu vẫn dùng để chọn người bảo lãnh
  },
  "crimes": [ { "keyword": "trộm gà", "seconds": 60, "label": "Trộm gà 🐔" } ],
  "gifts": {
    "small":  { "displayName": "...", "names": ["Rose"], "ids": [], "minDiamonds": 1, "reduceSeconds": 30 },
    "medium": { "names": ["Doughnut"], "ids": [], "minDiamonds": 10 },
    "large":  { "names": ["Hand Hearts"], "ids": [], "minDiamonds": 100 },
    "huge":   { "names": ["Money Gun"], "ids": [], "minDiamonds": 500 },
    "useDiamondFallback": true
  },
  "bannedWords": ["..."],
  "ticker": ["câu chạy thêm ở cuối màn hình"],
  "audio": { "volume": 0.7 }
}
```

**Map quà:** game xét theo thứ tự `ids` (giftId) → `names` (tên quà TikTok, không phân biệt hoa thường/dấu)
→ nếu `useDiamondFallback` bật thì xếp hạng theo giá kim cương (`minDiamonds`, xét từ hạng cao xuống).
Tên quà TikTok trả về thường là tiếng Anh (Rose, Doughnut, Hand Hearts…). Mỗi khi có quà, nhật ký
ghi rõ tên quà, giftId và số kim cương – dùng để khai báo thêm vào `config.json`. Quà combo (giftType 1) chỉ được tính **một lần khi kết thúc combo**, với đúng số lượng.

## 7. Âm thanh

Các file trong `public/assets/sounds/` được tạo bằng code (`npm run sounds`), không lo bản quyền:
`siren.wav` (còi), `door.wav` (đóng cửa sắt), `escape.wav` (nổ tường vượt ngục), `release.wav` (được thả),
`warden.wav` (Cai ngục), `ding.wav` (giảm án), `whistle.wav` (đi tuần).
Muốn dùng tiếng của riêng bạn: chép đè file **cùng tên**. Âm lượng chỉnh trên trang điều khiển.

## 8. Cấu trúc mã nguồn

```
src/
  index.js               Khởi động, nối các module với nhau
  config.js              Đọc .env và config.json, lưu config
  logger.js              Ghi log ra console + logs/YYYY-MM-DD.log
  game/PrisonGame.js     Luật chơi (bắt, cộng án, thả, quà, like, follow, bảng xếp hạng, treo máy)
  game/filter.js         Bộ lọc từ cấm
  sources/tiktokSource.js Kết nối TikTok LIVE + tự kết nối lại
  sources/normalize.js   Chuẩn hoá dữ liệu TikTok
  sources/demoBot.js     Bot sinh sự kiện giả
  web/server.js          Express + socket.io (/overlay, /control)
  utils/text.js          Xử lý tiếng Việt (bỏ dấu, tách từ)
public/
  overlay.html, css/overlay.css, js/overlay.js, js/art.js (nhân vật SVG), js/sound.js
  control.html, css/control.css, js/control.js
  assets/sounds/*.wav
scripts/generate-sounds.js
test/                    Kiểm thử luật chơi, bộ lọc, chuẩn hoá dữ liệu (node --test)
```

Luồng dữ liệu: `TikTok / trang điều khiển / bot demo → PrisonGame → socket.io → overlay`.
Server giữ toàn bộ trạng thái; overlay mở lại hay mất kết nối thì tự đồng bộ lại.

## 9. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| `Streamer chưa live` | Bình thường – game tự thử lại tới khi bạn lên live |
| `Failed to retrieve Room ID` liên tục | Kiểm tra username, mạng; thử thêm `EULER_API_KEY` |
| Overlay không có tiếng | Trong OBS: tích "Control audio via OBS"; trình duyệt: bấm nút 🔊 |
| Không thấy avatar | Một số ảnh TikTok chặn tải – game tự hiện chữ cái đầu thay thế |
| Quà không có tác dụng | Xem nhật ký (dòng `Quà "…" (giftId=…)`) rồi thêm tên/giftId vào `config.json` |
| `Không mở được cổng 3000` | Đổi `PORT` trong `.env` |

Log được ghi ở thư mục `logs/` theo ngày.
