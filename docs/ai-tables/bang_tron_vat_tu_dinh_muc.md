# bang_tron_vat_tu_dinh_muc

| **Bảng** | `bang_tron_vat_tu_dinh_muc` |
| **Tab** | `/danh-sach-bao-cao-phoi-tron` → **Phiếu trộn định mức** |
| **SQL** | `supabase-bang-tron-vat-tu-dinh-muc.sql` |

**API:** `/api/bang-tron-vat-tu-dinh-muc`  
Query: `ngay`, `ca`, `q`  
**UI:** `MixingNormMaterialsTab.tsx` · in: `MixingNormRatioPrintSheet.tsx`  
Gợi ý sang form phối trộn: `MixingReportForm.tsx` + `utils/mixingNormSuggestion.ts`

## Mô hình

**1 form nhập = 1 dòng DB = 1 phiếu**

- `ma_lenh_sx`, `ngay`, `ca`, `ghi_chu`
- `chi_tiet` jsonb = mảng sản phẩm:

```json
[{
  "ma_sp": "...",
  "ten_sp": "...",
  "tong_trong_luong": 1000,
  "ghi_chu": "...",
  "nvl": [{ "ma_nvl", "ten_nvl", "gia_tri", "don_vi", "khoi_luong" }]
}]
```

`khoi_luong` (kg): nếu `don_vi = %` → `tong_trong_luong × gia_tri / 100`; nếu `kg` → bằng `gia_tri`.

Danh sách hiển thị **1 dòng / phiếu** (nhiều SP gộp trong phiếu). In theo lệnh/phiếu xếp chồng từng khối SP + Logo.
