-- Ghi chú bất thường cho kết quả cột lệch (tab Báo cáo trên /danh-sach-bao-cao).
create extension if not exists pgcrypto;

create table if not exists public.bao_cao_lech_ghi_chu (
  id uuid primary key default gen_random_uuid(),
  note_key text not null unique,
  ngay text not null default '',
  ca text not null default '',
  may text not null default '',
  ma_lenh text not null default '',
  ma_nvl text not null default '',
  ten_nvl text not null default '',
  chenh_lech_kg numeric,
  ghi_chu text not null default '',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bao_cao_lech_ghi_chu_note_key
  on public.bao_cao_lech_ghi_chu (note_key);

create index if not exists idx_bao_cao_lech_ghi_chu_ngay
  on public.bao_cao_lech_ghi_chu (ngay desc);

create or replace function public.set_bao_cao_lech_ghi_chu_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_lech_ghi_chu_updated_at on public.bao_cao_lech_ghi_chu;

create trigger trg_bao_cao_lech_ghi_chu_updated_at
before update on public.bao_cao_lech_ghi_chu
for each row
execute function public.set_bao_cao_lech_ghi_chu_updated_at();

comment on table public.bao_cao_lech_ghi_chu is
  'Ghi chú bất thường theo dòng lệch NVL (ngày|ca|máy|LSX|mã NVL).';
