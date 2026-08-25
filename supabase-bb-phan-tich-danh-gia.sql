-- Phân tích đánh giá hao hụt trên /phan-tich-tu-dong (tab Đánh giá).
-- Thay localStorage control-board-bb-phan-tich-v1.
create extension if not exists pgcrypto;

create table if not exists public.bb_phan_tich_danh_gia (
  id uuid primary key default gen_random_uuid(),
  -- Khoa ổn định: ngay|ca|may|ma_lenh
  khoa_on_dinh text not null unique,
  ngay text not null,
  ca text not null default '',
  may text not null default '',
  ma_lenh text not null default '',
  group_key text,
  noi_dung text not null default '',
  nguoi_lap text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bb_phan_tich_danh_gia_khoa
  on public.bb_phan_tich_danh_gia (khoa_on_dinh);

create index if not exists idx_bb_phan_tich_danh_gia_ngay
  on public.bb_phan_tich_danh_gia (ngay desc);

create index if not exists idx_bb_phan_tich_danh_gia_ma_lenh
  on public.bb_phan_tich_danh_gia (ma_lenh);

create or replace function public.set_bb_phan_tich_danh_gia_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bb_phan_tich_danh_gia_updated_at on public.bb_phan_tich_danh_gia;

create trigger trg_bb_phan_tich_danh_gia_updated_at
before update on public.bb_phan_tich_danh_gia
for each row
execute function public.set_bb_phan_tich_danh_gia_updated_at();

comment on table public.bb_phan_tich_danh_gia is
  'Phân tích đánh giá (gõ tay) trên tab Đánh giá hao hụt /phan-tich-tu-dong.';
