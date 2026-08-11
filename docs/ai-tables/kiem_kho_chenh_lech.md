# kiem_kho_chenh_lech (màn "Xử lý chênh lệch")

| | |
|---|---|
| **Bảng** | `kiem_kho_chenh_lech_xu_ly` |
| **Tab** | `kiem-kho-chenh-lech` → `/xu-ly-chenh-lech` |
| **DB** | Riêng — label `kiem-kho` (project `grlcgkzotqishzxwpddc`), cùng chỗ với `kiem_kho`/`kiem_kho_tong_hop` |
| **SQL** | `supabase-kiem-kho-chenh-lech-xu-ly.sql` |

## Mục đích

Đối chiếu số lượng đã kiểm kê của 1 đợt kiểm kho ([kiem_kho](./kiem_kho.md)) với tồn cuối kỳ sổ sách ([ton_kho](./ton_kho.md)), rồi cho phép tạo phiếu nhập/xuất điều chỉnh tồn kho cho phần chênh lệch. 3 tab:

- **Danh sách chi tiết chênh lệch** — 1 dòng/**lượt kiểm** thực tế trong đợt đang chọn (nguồn: `GET /api/kiem-kho?dotKiemKho=...`, không gộp theo mã, không gộp thêm danh mục tồn kho hệ thống). Cột "Mã đã kiểm" là mã QR đầy đủ (kèm hậu tố lô nếu có) của lượt quét đó. Cột "Có trên hệ thống" = ✓/✗ tra theo `ma_nvl` của lượt quét trong bảng tổng hợp (`GET /api/kiem-kho/chenh-lech`) đã khớp được `loai_kho` hay chưa; cột "Có trên kiểm kê" luôn ✓ (vì bảng chỉ hiện các lượt đã quét).
- **Bảng tổng hợp chênh lệch** — gộp theo `ma_nvl`, **chỉ trong phạm vi các mã đã kiểm kê trong đợt đang chọn** (không tự thêm mã nào khác từ danh mục hệ thống — mã hệ thống chưa từng được quét trong đợt sẽ KHÔNG xuất hiện ở đây, vì nó không thuộc phạm vi đợt kiểm kê): đây là nơi thực sự so sánh tồn kiểm kê với tồn hệ thống và tính chênh lệch (gọi `GET /api/kiem-kho/chenh-lech`). Có stat tile tổng số mã khớp/thừa/thiếu/không xác định.
- **Phiếu Nhập/Xuất điều chỉnh tồn kho** — liệt kê theo **mã sản phẩm nguyên bản** (giữ đầy đủ hậu tố lô/serial), là hợp của mã còn tồn trên hệ thống và mã đã kiểm trong đợt. Tab này không gộp theo tiền tố; chỉ bảng tổng hợp mới gộp mã. Quy tắc lập phiếu cho từng mã nguyên bản:
  - Chỉ hiển thị mã thực sự có chênh lệch và cần lập phiếu; mã khớp (`chênh lệch = 0`, `loai_phieu = null`) bị ẩn riêng tại tab này.
  - Kiểm kê ít hơn hệ thống (`trang_thai: 'thieu'`) → phiếu **Xuất** phần chênh lệch.
  - Kiểm kê nhiều hơn hệ thống (`trang_thai: 'thua'`) → phiếu **Nhập** phần chênh lệch.
  - Có trên kiểm kê nhưng không khớp được danh mục hệ thống (`trang_thai: 'khong_xac_dinh'`) → vẫn phải lập phiếu **Nhập** cho toàn bộ số lượng đã kiểm kê; do không suy luận được là NVL hay thành phẩm, người dùng chọn tay loại kho cho từng mã (mặc định NVL) trước khi tạo phiếu.
  - Các mã đã chọn được gộp theo (loại phiếu, kho vật lý) để tạo phiếu, nhưng từng dòng hàng trong `phieu_xuat_nhap_kho` luôn lưu `ma_sp` nguyên bản. Loại phiếu (`nhap`/`xuat`) và số lượng là hai trường riêng. Ngày lập phiếu do người dùng chọn ở ô "Thời gian lập phiếu" của tab này (mặc định hôm nay); lý do phiếu ghi rõ đợt kiểm kho.

  ### Ghi tồn kho ở đâu
  Tạo phiếu **không** ghi đè trực tiếp cột `ton_dau_ky` trên `kho_nvl`/`san_pham`. Nó ghi thêm 1 dòng vào **ledger** `phieu_xuat_nhap_kho` (giống hệt việc tự tay lập phiếu nhập/xuất bình thường) — `ton_cuoi_ky` hiển thị ở trang Tồn kho được **tính lại** từ `ton_dau_ky + nhập trong kỳ − xuất trong kỳ`, nên tự động khớp đúng sau khi phiếu điều chỉnh được tạo. Phiếu này cũng hiện bình thường ở trang Lịch sử xuất nhập kho — không có cơ chế "âm thầm sửa số" nào khác.

### Trạng thái "Không xác định"

Mã kiểm kê (`kiem_kho.ma_nvl`) đôi khi lệch tiền tố so với danh mục tồn kho — VD kiểm kê ghi `MT-L30cm` (từ mã QR) trong khi `kho_nvl.ma_npl` chỉ lưu `L30cm`. Khi không khớp được cả 2 danh mục (NVL lẫn thành phẩm), route **không được** mặc định tồn hệ thống = 0 (sẽ ra chênh lệch giả) — trả `ton_he_thong: null`, `chenh_lech: null`, `trang_thai: 'khong_xac_dinh'`. Các mã này không tính vào số liệu thừa/thiếu và không xuất hiện ở tab "Phiếu điều chỉnh" (không có `loai_kho` nên không biết gọi RPC tồn kho nào) — cần đối chiếu lại quy ước đặt mã giữa kiểm kê và danh mục trước.

## Vì sao không JOIN SQL

`kiem_kho`/`kiem_kho_tong_hop` và `kho_nvl`/`san_pham`/`phieu_xuat_nhap_kho` nằm trên **2 Supabase project khác nhau** (xem `docs/ai-tables/kiem_kho.md` mục DB). Route `GET /api/kiem-kho/chenh-lech` gọi cả 2 nguồn rồi đối chiếu theo `ma_nvl` ở tầng Node (`server.ts`), tái dùng nguyên các hàm đã có:

- `loadTonKhoGop('nvl'|'san_pham', tenKho, tuNgay, denNgay)` — gọi RPC `ton_kho_nvl_gop`/`ton_kho_san_pham_gop`.
- `groupTonKhoRowsByPrefix()` — gộp các dòng lô/hậu tố về mã gốc.
- Số kiểm kê: đọc `kiem_kho_tong_hop` nếu đợt đã chốt, hoặc gọi RPC `kiem_kho_gop_theo_ma_nvl` nếu chưa chốt (giống route `/api/kiem-kho-tong-hop` và `/api/kiem-kho/dot-tong-hop-live`).

`ton_he_thong` lấy tại ngày chốt đợt (nếu đã chốt) hoặc ngày hiện tại (nếu chưa chốt). `loai_kho` của mỗi dòng được suy ra bằng cách khớp `ma_nvl` vào danh mục NVL trước, rồi danh mục thành phẩm — không khớp được ở cả hai thì `loai_kho: null` (không tạo được phiếu điều chỉnh cho dòng này).

## Bảng `kiem_kho_chenh_lech_xu_ly`

Không phải "trạng thái" tính toán được — chỉ là **lịch sử các lần đã tạo phiếu điều chỉnh**, để giao diện hiển thị "Đã xử lý" mà không phải suy luận lại. `ma_sp` lưu mã nguyên bản, gồm hậu tố lô/serial nếu có. Cột: `dot_kiem_kho`, `ma_sp`, `loai_phieu` (`nhap`/`xuat`), `so_luong_dieu_chinh`, `ma_phieu_dieu_chinh` (mã phiếu ở `phieu_xuat_nhap_kho`, DB chính), `ghi_chu`, `nguoi_xu_ly`, `xu_ly_luc`. Không có ràng buộc unique — 1 mã có thể được xử lý nhiều lần (mỗi lần thêm 1 dòng lịch sử); route GET chỉ lấy dòng mới nhất theo `ma_sp`.

## API (`server.ts`)

| Method | Path | Nội dung |
|---|---|---|
| GET | `/api/kiem-kho/chenh-lech` | Query `dotKiemKho` (bắt buộc), `tenKho` (tuỳ chọn). Trả bảng tổng hợp `records[]`, tồn nguyên bản `he_thong_chi_tiet[]` và lịch sử theo mã nguyên bản `xu_ly_chi_tiet[]`. Record tổng hợp có thêm `trang_thai_xu_ly`: `chua_xu_ly`, `dang_xu_ly`, `da_xu_ly` hoặc `khong_can_xu_ly`. |
| POST | `/api/kiem-kho/chenh-lech-xu-ly` | Body `{ dot_kiem_kho, ma_sp, loai_phieu, so_luong_dieu_chinh, ma_phieu_dieu_chinh, ghi_chu?, nguoi_xu_ly? }` — `ma_sp` là mã nguyên bản; insert 1 dòng lịch sử sau khi tạo phiếu kho thành công. |

## Frontend

`src/features/xu-ly-chenh-lech/index.tsx` (`XuLyChenhLechPanel`) — tab "Phiếu Nhập/Xuất điều chỉnh" đối chiếu từng mã nguyên bản, hiển thị riêng tồn hệ thống, số lần kiểm, chênh lệch, loại phiếu và số lượng. Các dòng được chọn gộp theo `(loaiPhieu, kho vật lý)` thành phiếu, nhưng mỗi item và mỗi dòng lịch sử vẫn giữ nguyên mã đầy đủ.

Tab phiếu điều chỉnh có bộ lọc combobox theo mã QR đầy đủ, mã gốc hoặc tên sản phẩm. Gợi ý **Mã gốc** lọc toàn bộ serial của sản phẩm; gợi ý **Mã QR** lọc đúng một mã. Chọn tất cả và thống kê chỉ áp dụng trên các dòng đang hiển thị.

## Thêm bảng trên DB đã có

Chạy `supabase-kiem-kho-chenh-lech-xu-ly.sql` trên:
https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new
