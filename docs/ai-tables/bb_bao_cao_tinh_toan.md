# bb_bao_cao_tinh_toan

Snapshot báo cáo tổng hợp máy BB sau khi bấm **Tính toán** — `/phan-tich-tu-dong` · `/phan-tich` · bảng điều khiển.

Vào trang **không** tự tính lại; chỉ đọc bản đã lưu `bb_bao_cao_tinh_toan`. Bấm **Tính toán** mới build + upsert DB.

**Hiệu năng:** `ControlBoardBbMachineReportTable.tsx` lưu 9 bảng kết quả độc lập theo nhóm tối đa 3 request song song; chờ đủ kết quả và giữ báo lỗi từng bảng. Đồng bộ/cập nhật bản in đã tải nguồn thì không tải lại lần hai khi tính.

**Phân bổ ngược NVL trộn:** kg thành phẩm theo từng NVL = tổng kg nhựa thành phẩm × tỷ lệ trộn thực tế trong `bao_cao_phoi_tron` đúng ngày/ca/máy. Bảng đánh giá và phân bổ hao hụt cũng dùng tỷ lệ thực tế, không thay bằng BOM khi thiếu phiếu trộn. Cột % định mức giữ để đối chiếu. Test: `src/utils/bbActualMixAllocation.test.ts`.

**Phân bổ NHUA-TRON tồn đầu/cuối:** `buildBbDauCaMaterialLinesForOrder` seed đủ mã có kg trộn thực tế nếu phiếu có tồn `NHUA-TRON`, kể cả mã không có tồn rời; kg tồn rời của mã mới = 0, không sửa dòng kiểm kê. Cho phép NVL trộn ĐVT Lít (dầu) nhận tỉ lệ thực tế như kg. Sau đó phân bổ cùng công thức ở cả hai đầu: tồn rời + kg NHUA-TRON × tỉ lệ thực tế. Không nhân lại ở tiêu hao/in. LSX076: đầu VN bổ sung 622 × 9,529% = 59,2704 kg; tổng thực dùng theo nguồn = 1.025,54 kg, còn lệch thực 7,52 kg thay vì sai lệch thiếu phân bổ −52,09 kg. Bản tính cũ cần bấm Tính toán lại.

**Trọng lượng SP ngoài LSX:** `sanLuongGroups.productGroups` lưu `grossWeightKg` (Σ Cân SP) và `normKgPerUnit` từ danh mục lúc Tính toán. Phiếu in đọc hai field này khi không tải cân/catalog live; không dùng `weightKg` (kg nhựa) thay trọng lượng cân SP. Bản tính cũ cần Tính toán lại để bổ sung.

KPI header (sản lượng cân AI, lỗi hỏng, màng cách nhiệt, …) cũng **chỉ** lấy từ `payload.summary` — không cộng live từ `can_tu_dong` / phiếu.

Tab **Báo cáo sản lượng**: danh sách NVL lấy đủ từ `san_pham.npl_phan_tram`. NVL Cái: `SL = số cái/thành phẩm × SL SP`. Băng keo (Cuộn, `khoi_luong_kg` < Tổng kg/cuộn): kg trên 1 thành phẩm, tiêu hao làm tròn số cuộn. **TL NVL %** = Σ **Nhựa thực tế** (Thành phẩm) trên `can_tu_dong` (ngày·ca·máy·mã SP) × tỉ lệ %; không có lần cân thì fallback `trong_luong_nhua × SL`. Tính toán **không** tự ghi Thành phần SP. Phiếu xuất mã `ONGGIAY20` cộng vào `ONG-19.5CM`.

**Hiển thị tab sản lượng:** `BbSanLuongReportPanel.tsx` giữ Bảng tổng; chi tiết mỗi phiếu tách riêng **Bảng NVL trộn** và **Bảng vật tư khác** theo `isBbSanLuongNvlKgLine`, có tổng kg riêng và chỉ gộp ô SP trong từng bảng. Cả hai bảng luôn hiện đủ SP của nhóm, kể cả SP không có dòng NVL thuộc phần đó: hiện mã/tên/SL SP, kg để «—» và cảnh báo số SP/cuộn thiếu. Footer tổng SL SP không bỏ sản phẩm thiếu NVL; không giả lập dòng vật tư hoặc cộng kg chưa có vào tổng. Chỉ đổi bố cục, không sửa công thức hoặc snapshot.

**Phiếu in = mirror tab:** mục 3.1/3.2 lấy `thucDungGroups` (builder `buildBbTieuHaoNvlThucDungRows`); mục 4.1 lấy `danhGiaGroups.summaryRows`. Không tính độc lập trên `ControlBoardBbMachineReportPrintSheet`. Snapshot cũ thiếu field → bấm **Tính toán** lại.

## SQL

`supabase-bb-bao-cao-tinh-toan.sql` — chạy trên Supabase (DB hệ thống).

```bash
node scripts/run-sql-file.mjs supabase-bb-bao-cao-tinh-toan.sql
```

(Cần `SUPABASE_DB_PASSWORD` hoặc `SUPABASE_DB_URL` trong `.env`.)

## API (`server.ts`)

| Method | Path | Vai trò |
|--------|------|---------|
| GET | `/api/bb-bao-cao-tinh-toan?khoa_on_dinh=` | Tải 1 bản theo khóa |
| PUT | `/api/bb-bao-cao-tinh-toan` | Upsert `{ khoa_on_dinh, ngay_tu, ngay_den, ca, may, nguon_san_luong, include_all_machines, ma_lenh_filter, payload }` |

Khóa ổn định: `ngay_tu|ngay_den|ca|may|nguon_san_luong|include_all|ma_lenh(*)`.

`payload` (jsonb): toàn bộ groups/rows + summary KPI đã tính — gồm `thucDungRows`/`thucDungGroups` và `danhGiaGroups[].summaryRows` (mẫu Excel Báo cáo tổng hợp: STT=mã NVL · tỉ lệ hao hụt · ĐM vật tư · thực xuất · chênh lệch · đơn giá · thành tiền · đánh giá; tách **Vật tư trộn** / **Các vật tư còn lại** + dòng **Tổng**).

**Đơn giá trên báo cáo:** ưu tiên **Bảng giá NVL** (`kho_nvl.don_gia` / `/bang-gia-nvl`); không có giá danh mục thì mới lấy bình quân giá xuất kho theo ngày. Thành tiền = chênh lệch × đơn giá.

Tab **Dữ liệu trong lệnh sản xuất** còn ghi bảng riêng **`bc_lsx`** (cùng `khoa_on_dinh`) — xem [bc_lsx.md](./bc_lsx.md).

## UI / utils

| File | Vai trò |
|------|---------|
| `ControlBoardBbMachineReportTable.tsx` | Nút **Tính toán** + load snapshot; tab tiêu hao / đánh giá / thành phẩm |
| `src/utils/bbBaoCaoTinhToan.ts` | Key + `buildBbMachineReportSnapshot` |
| `src/utils/bbTieuHaoNvlPrintRows.ts` | Builder tiêu hao khớp phiếu in (nguồn tab + in) |

## Liên quan

`control_board`, `bb_phan_tich_danh_gia`, `bb_bao_cao_ly_do`
