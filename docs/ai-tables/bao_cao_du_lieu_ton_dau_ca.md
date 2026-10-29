# bao_cao_du_lieu_ton_dau_ca

| | |
|---|---|
| **Bảng** | `bao_cao_du_lieu_ton_dau_ca` |
| **Tab** | `/phan-tich-tu-dong` · **Báo cáo dữ liệu tồn đầu ca** |
| **SQL** | `supabase-bao-cao-du-lieu-ton-dau-ca.sql` |

## Vai trò

Snapshot **riêng** cho tab tồn đầu ca trên báo cáo BB.

**Không** dùng / ghi đè [`bao_cao_may_nvl_ton`](./bao_cao_may_nvl_ton.md) (phiếu nguồn trên `/bao-cao-may-nvl-ton`).

Nguồn kg = phiếu tồn đầu ca (`bao_cao_may_nvl_ton`) — **khớp đúng máy** lệnh SX. UI Excel «Tồn đầu kỳ»: **Đã trộn** = SL TỒN **NHUA-TRON** × tỉ lệ trộn thực tế (%); **Tồn ngoài** = SL TỒN từng mã trên phiếu; ẩn dòng NHUA-TRON/NNS-TRON. **Tổng đầu** = Đã trộn + Tồn ngoài. Không có NHUA-TRON → fallback máy+bồn+chưa trộn. ĐVT Lít/Cái/Cuộn → «NVL còn lại».

Ghi khi bấm **Tính toán** (cùng `khoa_on_dinh` với `bb_bao_cao_tinh_toan`, `bc_lsx`, `du_lieu_xuat_kho`).

1 dòng = 1 NVL trên phiếu tồn đầu (UI sổ xuống).

## Cột chính

| Cột | UI |
|-----|-----|
| `ngay` / `ca` / `ca_label` / `may` / `ma_lenh` | Ngày · Ca · Máy · Lệnh SX |
| `ma_nvl` / `ten_nvl` / `don_vi` | Mã · Tên · ĐVT |
| `ti_le_dinh_muc_percent` / `ti_le_thuc_te_tb_percent` | % ĐM · % TB thực tế |
| `ton_dau_sl` / `ton_dau_kg` | SL · Tồn đầu (kg) |
| `tu_nns_tron` / `nns_tron_ton_dau_kg` | Phân bổ từ NNS-TRON |

## API

| Method | Path |
|--------|------|
| GET | `/api/bao-cao-du-lieu-ton-dau-ca?khoa_on_dinh=` |
| PUT | `/api/bao-cao-du-lieu-ton-dau-ca` `{ khoa_on_dinh, items: [...] }` |

## Chạy SQL

```bash
node scripts/run-sql-file.mjs supabase-bao-cao-du-lieu-ton-dau-ca.sql
```

## Liên quan

`bao_cao_may_nvl_ton` (nguồn), `lenh_sx`, `bc_lsx`, `du_lieu_xuat_kho`, `bb_bao_cao_tinh_toan`, `control_board`
