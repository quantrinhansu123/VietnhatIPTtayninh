-- Goi y nhap kho tu Bao cao san luong (bang bao_cao_nghiem_thu).
-- Khi lap phieu NHAP KHO, chon kho + ngay -> hien cac dong bao cao san luong
-- cua ngay do chua duoc nhap kho, de thu kho nap xuong phieu.
--   Kho thanh pham  <- loai_vat_tu = 'Thành phẩm'
--   Kho gia cong    <- loai_vat_tu = 'Gia công'
--   Kho hang hong   <- loai_vat_tu = 'SP lỗi'
--   Kho rac         <- loai_vat_tu = 'SP rác'
-- Luu phieu nhap -> gan id dong bao cao vao phieu -> lan sau khong hien nua.
-- Chay lai an toan.

alter table public.phieu_xuat_nhap_kho
  add column if not exists id_bao_cao_nghiem_thu uuid;

create unique index if not exists phieu_xuat_nhap_kho_bao_cao_nghiem_thu_uidx
  on public.phieu_xuat_nhap_kho (id_bao_cao_nghiem_thu)
  where id_bao_cao_nghiem_thu is not null;

comment on column public.phieu_xuat_nhap_kho.id_bao_cao_nghiem_thu is
  'ID dong bao_cao_nghiem_thu nguon; chi gan khi thu kho kiem tra va luu phieu nhap kho.';
