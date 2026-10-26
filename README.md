# BETMA ENGLISH — Dashboard tuyển sinh & tài chính 2026

Dashboard 4 tab (Tổng quan · Theo tháng · Theo tuần · Doanh thu & công nợ) giữ nguyên giao diện/công thức của bản HTML gốc, được đóng gói thành project **Vite + Chart.js**, deploy lên **GitHub Pages**, có chức năng **CẬP NHẬT DỮ LIỆU TUYỂN SINH** từ file Excel và **đồng bộ cho mọi người xem**.

## 0. Kiến trúc đã chọn và lý do

```
Excel (máy bạn) ──đọc & kiểm tra trong trình duyệt──► Xác nhận ──► Cloudflare Worker + R2 ◄── người xem (đăng nhập)
                                                                        (lưu 60 phiên bản)
GitHub Pages: chỉ chứa GIAO DIỆN (không chứa dữ liệu học viên)
```

GitHub Pages chỉ phục vụ file tĩnh, không ghi được dữ liệu. Dữ liệu của bạn có **tên học viên, thanh toán, công nợ**, nên:

| | Phương án A — file JSON trên Pages | **Phương án B — Worker + R2 (mặc định, khuyến nghị)** |
|---|---|---|
| Ai xem được dữ liệu | **Bất kỳ ai có đường dẫn** (Pages công khai, kể cả khi repo private, trừ gói Enterprise) | Chỉ người có mật khẩu xem |
| Cập nhật | Tải JSON → commit → deploy (thủ công) | Bấm nút trên website, có hiệu lực ngay |
| Sao lưu/khôi phục | Lịch sử git | 60 phiên bản, khôi phục 1 click |
| Chi phí | 0 đ | 0 đ ở quy mô này (gói free của Cloudflare) |

Project hỗ trợ cả hai qua biến `VITE_DATA_MODE` (`api` hoặc `static`). **Với dữ liệu thật hãy dùng `api`.** Bí mật (ADMIN_KEY, VIEWER_KEY) chỉ nằm trong Secrets của Cloudflare, không bao giờ ở mã nguồn frontend hay file JSON.

## 1. Cấu trúc thư mục

```
index.html                 khung giao diện (giữ nguyên markup gốc + nút cập nhật)
src/dashboard/dashboard.js logic dashboard gốc, bọc thành createDashboard(data)
src/data/normalize.js      chuẩn hóa Excel → dữ liệu (hàm thuần, có test)
src/data/schema.js         TÊN CỘT được nhận diện — sửa ở đây nếu file Excel đổi tiêu đề
src/data/store.js          đọc/ghi dữ liệu (api | static)
src/ui/updater.js          giao diện "Cập nhật dữ liệu tuyển sinh"
worker/                    Cloudflare Worker (API + xác thực + phiên bản)
shared/validate.js         kiểm tra cấu trúc dữ liệu (dùng chung frontend & Worker)
scripts/                   build-data.mjs (Excel→JSON cục bộ), push-data.mjs (nạp dữ liệu lên Worker)
tests/                     kiểm thử (node --test)
seed/initial-data.json     dữ liệu hiện tại trích từ dashboard gốc (KHÔNG commit — đã .gitignore)
.github/workflows/         deploy.yml (Pages), deploy-worker.yml (Worker)
```

## 2. Chạy trên máy tính

Cần Node.js ≥ 20.

```bash
npm install            # lần đầu sẽ tạo package-lock.json → hãy commit file này
npm test               # chạy kiểm thử
cp .env.example .env.local
```

**Chạy nhanh không cần backend** (dữ liệu từ seed, chỉ để xem/thử):
```bash
# trong .env.local đặt: VITE_DATA_MODE=static
cp seed/initial-data.json public/data/latest.json
npm run dev            # mở địa chỉ hiển thị (thường http://localhost:5173)
```
**Chạy với backend thật:** làm mục 4 trước, rồi đặt `VITE_DATA_MODE=api` và `VITE_API_URL=<địa chỉ Worker>` trong `.env.local`.

Build thử: `npm run build` → thư mục `dist/` (đường dẫn tương đối nên chạy được ở bất kỳ thư mục con nào).

## 3. Tạo repository và đưa code lên GitHub

1. Vào github.com → **New repository** → đặt tên (ví dụ `betma-dashboard`) → chọn **Private** → *không* tick thêm README/.gitignore.
2. Trong thư mục project:
```bash
git init -b main
git add .
git status          # KIỂM TRA: không thấy seed/initial-data.json, *.xlsx, public/data/latest.json
git commit -m "Dashboard tuyển sinh BETMA"
git remote add origin https://github.com/<username>/betma-dashboard.git
git push -u origin main
```
`.gitignore` đã loại trừ dữ liệu thật và mọi file Excel. Nếu `git status` vẫn liệt kê chúng, **dừng lại** và kiểm tra trước khi push.

## 4. Triển khai backend dữ liệu (Cloudflare Worker + R2)

1. Tạo tài khoản miễn phí tại cloudflare.com → vào **R2 Object Storage** → bật R2 (cần thêm phương thức thanh toán nhưng gói free 10 GB không tính phí) → **Create bucket** tên `betma-dashboard-data`.
2. Mở `worker/wrangler.toml`, sửa `ALLOWED_ORIGIN = "https://<username>.github.io"` (chỉ phần origin, không có `/betma-dashboard`).
3. Đăng nhập và deploy:
```bash
npx wrangler@3 login
npm run worker:deploy        # in ra địa chỉ dạng https://betma-dashboard-api.<tên>.workers.dev
```
4. Đặt khóa (tự tạo mật khẩu dài, khác nhau, ≥ 16 ký tự):
```bash
npx wrangler@3 secret put ADMIN_KEY  --config worker/wrangler.toml     # khóa của người cập nhật dữ liệu
npx wrangler@3 secret put VIEWER_KEY --config worker/wrangler.toml     # mật khẩu cho người chỉ xem
```
5. Nạp dữ liệu ban đầu (từ dashboard hiện tại), chạy trong terminal — khóa chỉ nằm trong biến môi trường tạm:
```bash
API_URL=https://betma-dashboard-api.<tên>.workers.dev ADMIN_KEY='<khóa admin>' npm run data:push -- seed/initial-data.json
```
(Windows PowerShell: `$env:API_URL="..."; $env:ADMIN_KEY="..."; npm run data:push -- seed/initial-data.json`)

## 5. Bật GitHub Pages

1. Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → tab Variables → New repository variable**:
   - `VITE_DATA_MODE` = `api`
   - `VITE_API_URL` = địa chỉ Worker ở bước 4.3 (không có `/` cuối)
3. (Tùy chọn, để Worker tự deploy khi sửa code) tab **Secrets**: `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare Workers") và `CLOUDFLARE_ACCOUNT_ID`.
4. Push lên `main` (hoặc **Actions → Deploy dashboard to GitHub Pages → Run workflow**). Khi xanh, website ở `https://<username>.github.io/betma-dashboard/`.

Mỗi lần push lên `main`, workflow chạy test → build → deploy. **Cập nhật dữ liệu không cần build lại.**

### Danh sách biến / secrets
| Nơi | Tên | Loại | Ghi chú |
|---|---|---|---|
| GitHub Variables | `VITE_DATA_MODE`, `VITE_API_URL` | công khai | nhúng vào website |
| GitHub Secrets (tùy chọn) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | bí mật | chỉ để deploy Worker |
| Cloudflare Secrets | `ADMIN_KEY`, `VIEWER_KEY` | bí mật | không đặt ở GitHub |
| `wrangler.toml` | `ALLOWED_ORIGIN` | công khai | chỉ origin Pages của bạn |

## 6. Cập nhật dữ liệu từ file Excel

### A. Qua website (chế độ api — mặc định)
1. Mở website, đăng nhập bằng mật khẩu xem (hoặc khóa admin).
2. Bấm **CẬP NHẬT DỮ LIỆU TUYỂN SINH** → **Chọn file Excel mới**.
3. Hệ thống đọc file **ngay trong trình duyệt** (file Excel không bị tải lên GitHub hay Cloudflare), hiển thị: tên file, dung lượng, thời điểm tải, số sheet nhận diện, số dòng đọc được, trường thiếu/sai cấu trúc, so sánh với dữ liệu đang chạy và 15 dòng xem trước.
4. Nếu có lỗi (đỏ) → **không có nút xác nhận**, dữ liệu đang chạy giữ nguyên. Sửa file Excel rồi chọn lại.
5. Nhập **Khóa quản trị** → **Xác nhận cập nhật dữ liệu**. Server kiểm tra lại cấu trúc, sao lưu bản cũ, rồi ghi bản mới.
6. Dashboard dựng lại toàn bộ từ dữ liệu vừa lưu; người mở website sau đó (trình duyệt/thiết bị khác) thấy dữ liệu mới. Người đang mở sẵn trang cần bấm **Tải lại**.
7. Nếu nhầm: **Phiên bản đã lưu & khôi phục** → chọn phiên bản → Khôi phục.

Có thể bấm **Tải bản dữ liệu đã chuẩn hóa (.json)** để lưu bản chuẩn hóa.

### B. Chế độ static (dữ liệu CÔNG KHAI trên Pages — chỉ dùng khi chấp nhận)
Đặt `VITE_DATA_MODE=static`. Chuyển Excel thành JSON trên máy rồi commit:
```bash
npm run data:build -- "C:/duong/dan/file.xlsx"        # ghi public/data/latest.json + version.json
# bỏ dòng "public/data/latest.json" trong .gitignore, rồi:
git add -f public/data && git commit -m "Cập nhật dữ liệu" && git push
```
Website tải `version.json` (không cache) rồi `latest.json?v=<phiên bản>` nên người xem không bị dữ liệu cũ. Giao diện hiện cảnh báo vàng "dữ liệu công khai".

### Quy tắc đọc Excel
- Sheet chính: tên bắt đầu bằng **TỔNG** (vd "TỔNG 2026"). Sheet khai giảng: tên chứa **KHAI GIẢNG** (lấy lớp/lịch/giáo viên và đối chiếu học phí, thanh toán).
- Cột bắt buộc: Mã HV, Họ và tên, Ngày đăng ký, Học phí áp dụng, và ít nhất một cột "Số tiền" thanh toán (đánh số lần 1, 2, …). Cột khác thiếu chỉ gây cảnh báo.
- Ngày sai năm được quy về năm chuẩn (năm xuất hiện nhiều nhất) và ghi vào "Chất lượng dữ liệu"; ngày sau hôm nay bị bỏ qua.
- Tình trạng: **Chưa đủ dữ liệu** (thiếu ngày ĐK/học phí) › **Cần đối soát** (lệch học phí/thanh toán/còn lại hoặc trả dư) › **Chưa hoàn tất** (còn nợ) › **Đã hoàn tất**.
- Thận trọng: nếu số học viên giảm >30% hoặc >50% dòng thiếu ngày đăng ký, hệ thống chặn hoặc bắt tích xác nhận.
- Nếu tiêu đề cột trong Excel khác tên đang nhận diện, sửa danh sách `alias` trong `src/data/schema.js` (không cần sửa logic).

## 7. Bảo mật dữ liệu

- Repo nên để **Private**. Lưu ý: website GitHub Pages vẫn **công khai** ngay cả khi repo private (trừ GitHub Enterprise) — vì vậy dữ liệu không nằm trong website mà lấy qua API có mật khẩu.
- Không commit Excel, `seed/initial-data.json`, `.env*`. Nếu lỡ commit dữ liệu thật lên repo công khai: đổi repo sang private, xóa khỏi lịch sử (git filter-repo) và coi dữ liệu là đã lộ.
- Khóa được kiểm tra bằng so sánh thời gian cố định; viewer không ghi/xem phiên bản được. Khóa trong trình duyệt chỉ lưu ở `sessionStorage` (mất khi đóng tab).
- Đổi khóa định kỳ hoặc khi nhân sự nghỉ: chạy lại `wrangler secret put`.
- Nên bật thêm quy tắc Rate limiting của Cloudflare cho đường dẫn `/api/*` để chặn dò mật khẩu.

## 8. Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Actions build đỏ ở bước `npm test` | Mở log, test nào fail; thường do sửa `schema.js`/`normalize.js` |
| Trang trắng, đường dẫn 404 | Settings → Pages phải chọn *Source: GitHub Actions*; build dùng `base: './'` nên không cần sửa đường dẫn |
| "Không kết nối được máy chủ dữ liệu" | `VITE_API_URL` sai/thiếu; `ALLOWED_ORIGIN` phải đúng `https://<username>.github.io` |
| Luôn hỏi lại mật khẩu | Sai `VIEWER_KEY`; kiểm tra bằng `wrangler secret list` |
| "Máy chủ chưa cấu hình ADMIN_KEY" | Chưa đặt secret hoặc ngắn hơn 12 ký tự |
| Báo thiếu cột bắt buộc | Xem mục "Quy tắc đọc Excel"; thêm tên cột vào `alias` |
| Deploy Worker lỗi bucket | Tạo bucket đúng tên `betma-dashboard-data` hoặc sửa `bucket_name` |

## 9. Kiểm thử đã thực hiện và giới hạn

**Đã chạy (xem `npm test`, 21 test):** đọc ngày/tiền, nhận diện tiêu đề, cờ chất lượng, trạng thái học viên, sheet khai giảng, từ chối file sai cấu trúc; quy tắc tính "Tình trạng" khớp 316/316 học viên của dashboard gốc; Worker (đăng nhập, phân quyền, từ chối dữ liệu hỏng không ghi đè, sao lưu, khôi phục, CORS).

**Giới hạn cần biết:**
- Chưa có file Excel gốc nên quy tắc đọc cột được dựng từ cấu trúc dữ liệu dashboard; **lần đầu hãy thử với file Excel thật** và xem báo cáo kiểm tra. Nếu lệch, chỉnh `schema.js`.
- `package-lock.json` chưa được tạo (cần mạng); `npm install` sẽ tạo, hãy commit.
- Thư viện đọc Excel là SheetJS 0.20.3 từ cdn.sheetjs.com (bản npm `xlsx` cũ có lỗ hổng đã biết).
- Chế độ static chưa kiểm thử; nó công khai dữ liệu.
- Người đang mở sẵn trang không tự cập nhật theo thời gian thực — cần Tải lại.
