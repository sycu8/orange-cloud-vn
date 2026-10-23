# Orange Cloud

Trang chủ studio cá nhân của **Cường Lê Sỹ** (GitHub [@sycu8](https://github.com/sycu8)).

**Đang chạy:** https://orangecloud.vn

Trường homepage trên GitHub (About → Website) nên là `https://orangecloud.vn`.

Các hồ sơ sản phẩm — giới thiệu ngắn, mốc, và stack — cho thấy Cloudflare Developer Platform khi được giao việc thật. Trang có tiếng Việt và tiếng Anh. Mỗi dự án có một trang riêng dưới `/projects/`, khai trong sitemap.

**Đây là dự án cá nhân.** Không phải ấn phẩm, sản phẩm, hay kênh của Cloudflare, Inc. Monogram trên trang là dấu gốc. Tuyên bố đầy đủ nằm ở mục Pháp lý trên chính trang.

## Chạy local

```bash
npm install
npm run dev
```

Mở địa chỉ Wrangler in ra, thường là `http://localhost:8787`.

```bash
npm test
npm run check
```

## Deploy

Đẩy lên `main` là GitHub Actions chạy `npx wrangler deploy`. Workflow dùng hai secret của repository:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Worker phục vụ static assets, thêm security header, và trả:

- `GET /api/health` — health check đơn giản
- `GET /api/status` — trạng thái + uptime % của các domain dự án (cron 5 phút, lưu KV)

Trang chủ có status bar sticky. Trang đầy đủ: https://orangecloud.vn/status/ (banner tổng quan, system status, lịch sử 7 ngày).

Host chính thức là https://orangecloud.vn. `workers_dev` và preview URL đang tắt, nên `*.workers.dev` không phải bản công khai. HTML trên host khác apex vẫn gửi `X-Robots-Tag: noindex`.

Deploy tay, khi đã có token trong môi trường:

```bash
npm run deploy
```

## Tài trợ

[Buy Me a Coffee](https://buymeacoffee.com/sycule) — lời mời ủng hộ cá nhân, tự nguyện.
