# tra_kho_nvl

| | |
|---|---|
| **Bảng** | Header: `tra_kho_nvl`; dòng: `tra_kho_nvl_dong` |
| **Tab** | `tra-kho-nvl` → `/tra-kho-nvl` · cũng là tab trong hub `/phieu-bao-cao` (Nhập báo cáo) |
| **DB** | Chính — `SUPABASE_URL` |
| **SQL** | `supabase-tra-kho-nvl.sql` |

## API (`server.ts`)

| Method | Path | Việc |
|--------|------|------|
| GET | `/api/tra-kho-nvl` | Danh sách; lọc `from`/`to`/`ca`/`may`/`status` |
| GET | `/api/tra-kho-nvl/:ma_phieu` | Header + dòng |
| POST | `/api/tra-kho-nvl` | Tạo/cập nhật nháp (`chua_chot`) + replace dòng |
| POST | `/api/tra-kho-nvl/:ma_phieu/chot` | Chốt → tạo `phieu_nhap`/`nhap_kho` (loai=`nvl`) trên DB kho, cập nhật tồn, ghi `ma_phieu_nhap` |
| DELETE | `/api/tra-kho-nvl/:ma_phieu` | Xóa nếu còn `chua_chot` |

## Frontend

| File | Nội dung |
|------|----------|
| `src/features/tra-kho-nvl/index.tsx` | Danh sách + form lập phiếu (ngày · ca · máy · kho · dòng NVL) · Lưu nháp · Chốt |
| `src/App.tsx` | Import + route tab |
| `src/app/menus.tsx` | Card **Trả kho NVL** trong menu Kho |

**Tự điền mã NVL:** phiếu mới / nút **Tự điền theo tồn** điền các mã NVL **theo đúng thứ tự Tồn đầu / Tồn cuối** (`compareMaterialMisaCode` / mẫu MISA). Ưu tiên lấy mã từ phiếu `bao_cao_may_nvl_ton` cùng **Ngày · Ca · Máy** (cuối ca trước, rồi đầu ca); không có phiếu tồn thì lấy mã ưu tiên trong danh mục `kho-nvl`. SL để trống để nhập số trả.

## Quyền

Alias `tra-kho-nvl` → `warehouse-slip-vat-tu` (`src/app/tabAccess.ts`).

## Liên quan

Khi chốt ghi sổ nhập NVL qua DB kho — xem [kho.md](./kho.md), danh mục NVL [kho_nvl.md](./kho_nvl.md). Tồn đầu/cuối — [bao_cao_may_nvl_ton.md](./bao_cao_may_nvl_ton.md).
