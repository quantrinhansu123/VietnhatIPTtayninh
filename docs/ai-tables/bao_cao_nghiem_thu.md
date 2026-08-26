# bao_cao_nghiem_thu

| **Bảng** | `bao_cao_nghiem_thu` |
| **Tab** | `acceptance-report`, `acceptance-report-list` |
| **SQL** | `supabase-bao-cao-nghiem-thu.sql` |

**API:** `server.ts` 5708–5833  
**Components (đã tách):**
- `AcceptanceReportForm.tsx`
- `AcceptanceReportListView.tsx`
- `AcceptanceReportPrintSheet.tsx`

Modal quét máy/QR hiển thị **Tổng SL** màu đỏ ở góc phải dòng trạng thái đầu đọc, lấy từ số mặt hàng đã quét/điền trong danh sách hiện tại; đóng/mở lại modal vẫn giữ đúng tổng, mã trùng/lỗi không làm tăng.

`/bao-cao-san-luong` và `/danh-sach-bao-cao-san-luong`: mỗi phiếu (ngày + ca + máy + lần) hiện thành **một bảng**, xếp chồng vuốt xuống — không cần chọn dòng để xem. **Thêm mới** / Sửa mới mở form nhập. Nút **Xem** mở modal **NVL theo định mức**; **Đồng bộ** lấy Thành phần Kho sản phẩm và **lưu snapshot** bảng `bao_cao_san_luong_nvl_dinh_muc` ([manifest](./bao_cao_san_luong_nvl_dinh_muc.md)). Cột **Trọng lượng** + nút **Đồng bộ trọng lượng** (= `tong_trong_luong` SP × SL, fallback kg trong tên SP).

**Mã SP theo loại vật tư:** Thành phẩm / Gia công lấy `san_pham`. **SP lỗi** thêm mã `kho_nvl` thuộc Kho hàng hỏng (vd. NC). **SP rác** thêm mã kho rác. Vẫn gộp mã từ lệnh SX khớp ngày + ca + máy.

Route alias: `/bao-cao-nghiem-thu` → tab `acceptance-report`

Tab **Báo cáo sản lượng** trên `/phan-tich` lấy phiếu này theo **ngày + ca + máy** (`buildBbSanLuongGroups`, lọc `loai_vat_tu = Thành phẩm`).
Trên `/phan-tich-tu-dong`:
- Tab **Dữ liệu cân thực tế** lấy từ `can_tu_dong` (Cân AI)
- Tab **Báo cáo sản lượng** lấy từ `bao_cao_nghiem_thu` (Thành phẩm)
  - Sau **Tính toán**: chỉ từ bảng Báo cáo sản lượng — SL/`trong_luong` trên phiếu + snapshot NVL `bao_cao_san_luong_nvl_dinh_muc`
  - Hiện **từng sản phẩm** (mã SP + NVL của SP đó); **không** gộp NVL mọi SP thành một danh sách
  - **Không** lấy từ lệnh SX, Kho sản phẩm, tỉ lệ trộn máy, phối trộn hay kho NVL
  - Lệnh SX chỉ hiện mã (nếu khớp ngày/ca/máy) để tham chiếu
  - % NVL: kg = `trong_luong` phiếu × %; ĐVT khác: SL = ĐM × tổng SL phiếu
- Tab **Dữ liệu trong báo cáo hàng lỗi hỏng** lấy từ cùng bảng `bao_cao_nghiem_thu` — mục **Hàng hỏng (SP lỗi)** + **Hàng rác**; mở dòng con hiện **đủ NVL** (tỉ lệ trộn máy ∪ phối trộn ∪ BOM lệnh), phân bổ theo tỉ lệ trộn

## Menu

- QC `/nha-may/qc` → card **Kiểm tra kho thành phẩm** → `acceptance-report-list`
- Công nhân → Nhập báo cáo ca → `acceptance-report` / danh sách → `acceptance-report-list`
