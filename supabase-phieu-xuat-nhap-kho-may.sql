-- Them cot may cho phieu xuat/nhap kho (khop phan tich theo ngay + ca + may)
alter table public.phieu_xuat_nhap_kho
  add column if not exists may text;

create index if not exists phieu_xuat_nhap_kho_may_idx
  on public.phieu_xuat_nhap_kho (may);
