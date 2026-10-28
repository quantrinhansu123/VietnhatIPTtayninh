# du_lieu_trong_bao_cao_kiem_ton_cuoi_ca

| | |
|---|---|
| **Bảng** | `du_lieu_trong_bao_cao_kiem_ton_cuoi_ca` |
| **Tab** | `/phan-tich-tu-dong` · **Dữ liệu trong báo cáo kiểm tồn cuối ca** |
| **SQL** | `supabase-du-lieu-trong-bao-cao-kiem-ton-cuoi-ca.sql` |

Snapshot riêng — **không** trùng `bao_cao_may_nvl_ton`. Ghi khi **Tính toán**.

## Công thức (giống tồn đầu ca)

Nguồn kg = phiếu kiểm tồn cuối ca (`bao_cao_may_nvl_ton`, `reportKind = cuoi_ca`).

UI khớp Excel «Tồn cuối kỳ» — **cùng logic** tab tồn đầu ca:

- **Tỉ lệ thực tế** = `bao_cao_phoi_tron` (KL ÷ tổng KL, ngày·ca·máy)
- **Đã trộn** = SL TỒN **NHUA-TRON** trên phiếu × tỉ lệ thực tế
- **Tồn ngoài** = SL TỒN / KL của từng mã trên CHI TIẾT TỒN CUỐI CA
- **Tổng cuối** = Đã trộn + Tồn ngoài

UI tab tính **live** từ phiếu (không phụ thuộc snapshot cũ để xem).

## API

| Method | Path |
|--------|------|
| GET/PUT | `/api/du-lieu-trong-bao-cao-kiem-ton-cuoi-ca` |

```bash
node scripts/run-sql-file.mjs supabase-du-lieu-trong-bao-cao-kiem-ton-cuoi-ca.sql
```

## Liên quan

`bao_cao_du_lieu_ton_dau_ca`, `bao_cao_may_nvl_ton`, `bao_cao_phoi_tron`
