-- Tổng hợp Số cuộn thực tế + Tổng trọng lượng thực tế từ can_tu_dong
-- theo Ngày · Ca · Máy — DB hệ thống (không kéo từng phiếu cân lên /phan-tich-tu-dong).
--
-- Chạy:
--   node scripts/run-sql-file.mjs supabase-can-tu-dong-tong-hop.sql
--
create extension if not exists pgcrypto;

create table if not exists public.can_tu_dong_tong_hop (
  id uuid primary key default gen_random_uuid(),
  khoa_on_dinh text not null unique,
  ngay text not null,
  ca text not null default '',
  may text not null default '',
  so_cuon integer not null default 0,
  tong_trong_luong_kg numeric not null default 0,
  tong_trong_luong_nhua_kg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_can_tu_dong_tong_hop_khoa
  on public.can_tu_dong_tong_hop (khoa_on_dinh);

create index if not exists idx_can_tu_dong_tong_hop_ngay
  on public.can_tu_dong_tong_hop (ngay desc);

create index if not exists idx_can_tu_dong_tong_hop_ngay_ca_may
  on public.can_tu_dong_tong_hop (ngay, ca, may);

create or replace function public.set_can_tu_dong_tong_hop_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_can_tu_dong_tong_hop_updated_at on public.can_tu_dong_tong_hop;

create trigger trg_can_tu_dong_tong_hop_updated_at
before update on public.can_tu_dong_tong_hop
for each row
execute function public.set_can_tu_dong_tong_hop_updated_at();

comment on table public.can_tu_dong_tong_hop is
  'Tổng hợp cân AI theo ngày/ca/máy: số cuộn thực tế + tổng trọng lượng thực tế (cân SP). Tab Dữ liệu cân thực tế trên /phan-tich-tu-dong chỉ đọc bảng này.';
comment on column public.can_tu_dong_tong_hop.so_cuon is
  'Số cuộn thực tế = số lần cân (số dòng can_tu_dong).';
comment on column public.can_tu_dong_tong_hop.tong_trong_luong_kg is
  'Tổng trọng lượng thực tế (kg) = Σ Cân sản phẩm (weight).';
comment on column public.can_tu_dong_tong_hop.tong_trong_luong_nhua_kg is
  'Σ Trọng lượng nhựa = Cân SP − Cân lõi − bì 0,16 kg.';
