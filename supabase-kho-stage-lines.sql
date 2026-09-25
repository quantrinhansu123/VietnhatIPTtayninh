-- Cho phép lưu các dòng quét vào nhap_kho/xuat_kho trước khi lập header phiếu.
-- Header phieu_nhap/phieu_xuat chỉ được tạo khi người dùng bấm "Lưu phiếu".
alter table public.nhap_kho
  drop constraint if exists fk_nhap_kho_ma_phieu;

alter table public.xuat_kho
  drop constraint if exists fk_xuat_kho_ma_phieu;
