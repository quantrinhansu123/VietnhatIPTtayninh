-- Bản tính toán đã chốt của Báo cáo tổng hợp máy BB (/phan-tich-tu-dong, /phan-tich).
-- Bấm «Tính toán» mới ghi; vào trang chỉ đọc bản đã lưu theo bộ lọc.
create extension if not exists pgcrypto;

create table if not exists public.bb_bao_cao_tinh_toan (
  id uuid primary key default gen_random_uuid(),
  -- Khoa: ngay_tu|ngay_den|ca|may|nguon_san_luong|include_all
  khoa_on_dinh text not null unique,
  ngay_tu text not null default '',
  ngay_den text not null default '',
  ca text not null default 'all',
  may text not null default 'all',
  nguon_san_luong text not null default 'acceptance',
  include_all_machines boolean not null default false,
  ma_lenh_filter text[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  calculated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bb_bao_cao_tinh_toan_khoa
  on public.bb_bao_cao_tinh_toan (khoa_on_dinh);

create index if not exists idx_bb_bao_cao_tinh_toan_ngay
  on public.bb_bao_cao_tinh_toan (ngay_tu desc, ngay_den desc);

create or replace function public.set_bb_bao_cao_tinh_toan_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.calculated_at = coalesce(new.calculated_at, now());
  return new;
end;
$$;

drop trigger if exists trg_bb_bao_cao_tinh_toan_updated_at on public.bb_bao_cao_tinh_toan;

create trigger trg_bb_bao_cao_tinh_toan_updated_at
before update on public.bb_bao_cao_tinh_toan
for each row
execute function public.set_bb_bao_cao_tinh_toan_updated_at();

comment on table public.bb_bao_cao_tinh_toan is
  'Snapshot báo cáo tổng hợp máy BB đã tính toán — không tự tính lại mỗi lần mở trang.';
