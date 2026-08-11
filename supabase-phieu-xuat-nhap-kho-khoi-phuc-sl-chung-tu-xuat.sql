-- Khôi phục SL chứng từ chỉ dành cho phiếu xuất.
-- Phiếu nhập tiếp tục dùng duy nhất public.phieu_xuat_nhap_kho.so_luong.
-- Chạy trên Supabase DB chính (he-thong).

begin;

alter table public.phieu_xuat_nhap_kho
  add column if not exists so_luong_chung_tu numeric;

-- Dữ liệu xuất cũ được khôi phục giá trị chứng từ từ số lượng thực tế vì cột
-- cũ đã từng bị xóa. Người dùng có thể sửa lại khi cập nhật phiếu nếu cần.
update public.phieu_xuat_nhap_kho
set so_luong_chung_tu = so_luong
where loai_phieu = 'xuat'
  and so_luong_chung_tu is null
  and so_luong is not null;

-- Phiếu nhập không sử dụng trường này.
update public.phieu_xuat_nhap_kho
set so_luong_chung_tu = null
where loai_phieu = 'nhap'
  and so_luong_chung_tu is not null;

comment on column public.phieu_xuat_nhap_kho.so_luong_chung_tu is
  'Số lượng chứng từ của phiếu xuất; phiếu nhập để null.';

commit;
