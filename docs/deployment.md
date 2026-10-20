# Vườn hoa 20/10: hướng dẫn chạy và triển khai

Ứng dụng Node.js nhỏ: người gửi nhập **tên** và **ảnh** người nhận, hệ thống tự sinh
đường dẫn theo tên (ví dụ `Nguyễn Thị Đào` thành `/nguyen-thi-dao`, trùng tên thì thêm `-2`, `-3`)
để gửi tặng. Người nhận mở link sẽ thấy lá thư có tên, ảnh và bó hoa SVG nở dần.

## Nhiều tài khoản

Tài khoản đặt bằng `ADMIN_USERNAME` và `ADMIN_PASSWORD` là **chủ app**. Chủ app tạo, đặt lại mật khẩu
hoặc xoá tài khoản cho người khác ngay trong trang quản trị (mục **Tài khoản**).

- Mỗi tài khoản chỉ thấy và xoá được danh sách người nhận của chính mình, kể cả chủ app.
- Người dùng thường tự đổi mật khẩu được (nút **Đổi mật khẩu**). Đổi hoặc bị đặt lại mật khẩu thì
  mọi phiên đăng nhập cũ trên thiết bị khác đều bị đăng xuất.
- Mật khẩu chủ app chỉ đổi qua biến môi trường. Sửa `ADMIN_PASSWORD` rồi khởi động lại là áp dụng.
- Xoá một tài khoản sẽ xoá luôn các link tặng hoa và ảnh của tài khoản đó.
- Đường dẫn tặng hoa dùng chung một không gian tên, nên hai tài khoản cùng tặng "Lan" sẽ ra `/lan` và `/lan-2`.

Lần đầu chạy bản có tài khoản trên dữ liệu cũ, app tự sao lưu DB thành `gifts.before-accounts.<thời gian>.db`
trong `DATA_DIR`, rồi gán toàn bộ người nhận cũ cho chủ app.

## Cấu trúc

| Đường dẫn | Vai trò |
|---|---|
| `src/server.js` | Express: trang tặng hoa, khu quản trị ẩn, API |
| `src/config.js` | Đọc và kiểm tra biến môi trường (thiếu là dừng ngay) |
| `src/db.js` | SQLite tích hợp sẵn của Node (`node:sqlite`), file `data/gifts.db`. Bảng `users` và `recipients` |
| `src/auth.js` | Cookie phiên ký HMAC theo từng tài khoản, khoá đăng nhập 15 phút sau 5 lần sai |
| `src/password.js` | Băm mật khẩu bằng scrypt |
| `src/avatar-upload.js` | Nhận ảnh (≤5MB), kiểm tra magic bytes JPG/PNG/WEBP/GIF |
| `public/shared/slug.js` | Hàm tạo slug dùng chung cho server và trang quản trị |
| `public/gift/` | Trang tặng hoa: `bouquet.js` (bó hoa SVG), `petal-sky.js` (cánh hoa rơi), `gift.js`, `gift.css` |
| `public/admin/`, `views/` | Giao diện quản trị và các template HTML |
| `legacy/index-2025.html` | Bản tĩnh năm ngoái, chỉ để tham khảo, không được phục vụ |

Dữ liệu (DB + ảnh) nằm trong `DATA_DIR` (mặc định `./data`, trong container là `/app/data`, gắn volume `gift-data`).

## Biến môi trường

Xem `.env.example`.

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `ADMIN_PATH` | ✔ | Đoạn URL bí mật của trang quản trị, 6 đến 64 ký tự `a-z A-Z 0-9 - _`. Quản trị ở `https://domain/<ADMIN_PATH>` |
| `ADMIN_USERNAME` | ✔ | Tên đăng nhập của chủ app |
| `ADMIN_PASSWORD` | ✔ | Mật khẩu chủ app, nên đặt dài |
| `SESSION_SECRET` | ✔ trong compose | Chuỗi ngẫu nhiên ký phiên (`openssl rand -hex 32`). Thiếu khi chạy local thì phiên mất sau mỗi lần khởi động lại |
| `PORT` | | Mặc định `3000` |
| `DATA_DIR` | | Mặc định `./data` |

Không có tài khoản/mật khẩu mặc định trong code. Mọi URL lạ (kể cả `/admin`) đều trả về cùng một trang 404, nên không ai đoán được trang quản trị nằm ở đâu.
Toàn bộ trang có `noindex` + `robots.txt` chặn bot.

## Chạy local

Yêu cầu Node ≥ 22.13 (khuyên dùng Node 24).

```bash
npm install
cp .env.example .env   # rồi sửa giá trị
npm run dev            # http://localhost:3000 , quản trị: http://localhost:3000/<ADMIN_PATH>
```

## Triển khai trên Coolify (Docker Compose)

1. Đẩy repo lên GitHub.
2. Coolify → **New Resource** → chọn repo → Build Pack: **Docker Compose** (file `docker-compose.yml`).
3. Tab **Environment Variables**: điền `ADMIN_PATH`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`
   (compose dùng cú pháp `${VAR:?}` nên thiếu biến nào Coolify sẽ báo lỗi, không deploy nhầm).
4. Ở service `app`, đặt **Domain** kèm cổng container: `https://hoa.example.com:3000`
   (`:3000` chỉ báo proxy của Coolify chuyển vào cổng 3000 của container; người dùng vẫn truy cập `https://hoa.example.com`).
5. Deploy. Volume `gift-data` giữ DB và ảnh qua các lần deploy lại.

Compose dùng `expose` thay vì `ports`: cổng 3000 chỉ mở trong mạng Docker nội bộ,
không chiếm cổng của máy chủ, nên chạy nhiều app trên cùng server không bị trùng cổng.
App tin đúng 1 lớp reverse proxy (`trust proxy = 1`) để lấy IP thật cho giới hạn đăng nhập và cookie `Secure` khi chạy HTTPS.

Chạy thử compose trên máy (không có cổng ra host): `docker compose up -d --build`, rồi
`docker compose exec app wget -qO- http://127.0.0.1:3000/healthz`. Muốn mở trình duyệt thì dùng
`docker compose run --rm -p 3000:3000 app`.

## Sao lưu

Sao lưu cả volume (`/app/data`: `gifts.db*` + `uploads/`), ví dụ:

```bash
docker run --rm -v <tên-volume>:/data -v "$PWD":/backup alpine tar czf /backup/gift-data.tgz -C /data .
```
