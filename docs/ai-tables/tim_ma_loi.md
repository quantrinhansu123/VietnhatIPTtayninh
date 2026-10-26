# Tìm mã lỗi (tra QR ↔ nhap_kho)

| | |
|---|---|
| **Bảng** | `nhap_kho` (DB kho) |
| **Tab / Route** | `tim-ma-loi` · `/tim-ma-loi` |
| **Menu** | Nhà máy → Kho → **Tìm mã lỗi** |

## API (`server.ts`)

| Method | Path | Nội dung |
|--------|------|----------|
| POST | `/api/kho/tra-cuu-qr` | Body `{ ma_sp_quet }`. Trả `{ found, ma_sp_quet, rows }` từ `nhap_kho`. |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/tim-ma-loi/index.tsx` | Quét máy / camera / gõ tay → tra `nhap_kho`; không có → cảnh báo |
| `src/components/ProductQrScanner.tsx` | Modal quét QR |

Xem thêm [kho.md](./kho.md).
