-- Chay trong Supabase SQL Editor (an toan khi chay lai)
-- Them cot danh dau "da in" cho cac bang phieu/bao cao co nut In.
-- Sau khi da_in = true, backend se tu choi moi yeu cau sua/cap nhat ban ghi tuong ung.

alter table public.phieu_xuat_nhap_kho
  add column if not exists da_in boolean not null default false;
comment on column public.phieu_xuat_nhap_kho.da_in is 'Phieu da duoc in, khong con sua duoc nua.';

alter table public.phieu_can_dinh_ki
  add column if not exists da_in boolean not null default false;
comment on column public.phieu_can_dinh_ki.da_in is 'Phieu can da duoc in, khong con sua duoc nua.';

alter table public.bao_cao_hang_hong
  add column if not exists da_in boolean not null default false;
comment on column public.bao_cao_hang_hong.da_in is 'Bao cao hang hong da duoc in, khong con sua duoc nua.';

alter table public.lenh_sx
  add column if not exists da_in boolean not null default false;
comment on column public.lenh_sx.da_in is 'Lenh san xuat da duoc in, khong con sua duoc nua.';

alter table public.ke_hoach_san_xuat
  add column if not exists da_in boolean not null default false;
comment on column public.ke_hoach_san_xuat.da_in is 'Ke hoach san xuat (phieu NVL) da duoc in, khong con sua duoc nua.';

alter table public.bao_cao_phoi_tron
  add column if not exists da_in boolean not null default false;
comment on column public.bao_cao_phoi_tron.da_in is 'Bao cao phoi tron da duoc in, khong con sua duoc nua.';

alter table public.bao_cao_nghiem_thu
  add column if not exists da_in boolean not null default false;
comment on column public.bao_cao_nghiem_thu.da_in is 'Bao cao nghiem thu da duoc in, khong con sua duoc nua.';

alter table public.bao_cao_may_nvl_ton
  add column if not exists da_in boolean not null default false;
comment on column public.bao_cao_may_nvl_ton.da_in is 'Bao cao may NVL ton da duoc in, khong con sua duoc nua.';

alter table public.don_hang
  add column if not exists da_in boolean not null default false;
comment on column public.don_hang.da_in is 'Don hang da duoc in, khong con sua duoc nua.';
