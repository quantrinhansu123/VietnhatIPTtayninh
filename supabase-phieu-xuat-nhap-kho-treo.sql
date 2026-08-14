-- Cột "treo" cho phiếu xuất kho treo (chờ thủ kho xác nhận).
-- Phiếu xuất treo (treo = true) CHƯA tính vào tồn kho / lịch sử xuất nhập kho.
-- Khi thủ kho bấm Xác nhận, treo chuyển thành false và phiếu trở thành phiếu xuất kho chính thức.

alter table public.phieu_xuat_nhap_kho
  add column if not exists treo boolean not null default false;

create index if not exists phieu_xuat_nhap_kho_treo_idx
  on public.phieu_xuat_nhap_kho (treo)
  where treo = true;

comment on column public.phieu_xuat_nhap_kho.treo is
  'true = phiếu xuất kho treo, chờ thủ kho xác nhận; chưa ảnh hưởng tồn kho. false = phiếu chính thức (mặc định).';
