-- Trạng thái phiếu kho: phiếu cũ đã lưu được xem là đã chốt.
alter table public.phieu_xuat
  add column if not exists status text not null default 'da_chot';

alter table public.phieu_nhap
  add column if not exists status text not null default 'da_chot';

create index if not exists idx_phieu_xuat_status_created_at
  on public.phieu_xuat (status, created_at desc);

create index if not exists idx_phieu_nhap_status_created_at
  on public.phieu_nhap (status, created_at desc);
