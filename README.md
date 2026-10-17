# Orange Cloud

Trang chủ studio cá nhân của **Cường Lê Sỹ** (GitHub [@sycu8](https://github.com/sycu8)).

Mười bốn hồ sơ sản phẩm — giới thiệu ngắn, mốc, và stack — để cho thấy Cloudflare Developer Platform khi được giao việc thật. Trang có tiếng Việt và tiếng Anh.

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

Worker phục vụ static assets, thêm security header, và trả `GET /api/health`.

Đang chạy: https://orange-cloud-vn.sycu-lee.workers.dev

Deploy tay, khi đã có token trong môi trường:

```bash
npm run deploy
```

## Tài trợ

[Buy Me a Coffee](https://buymeacoffee.com/sycule) — lời mời ủng hộ cá nhân, tự nguyện.
