-- Lý do giải trình từng dòng SP trên báo cáo tổng hợp máy BB (in phiếu).
create extension if not exists pgcrypto;

create table if not exists public.bb_bao_cao_ly_do (
  id uuid primary key default gen_random_uuid(),
  -- Khoa ổn định: ngay|ca|may|ma_lenh|ma_sp
  khoa_on_dinh text not null unique,
  ngay text not null,
  ca text not null default '',
  may text not null default '',
  ma_lenh text not null default '',
  ma_sp text not null default '',
  ten_sp text,
  group_key text,
  line_key text,
  ly_do text not null default '',
  ghi_chu text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bb_bao_cao_ly_do_khoa
  on public.bb_bao_cao_ly_do (khoa_on_dinh);

create index if not exists idx_bb_bao_cao_ly_do_ngay
  on public.bb_bao_cao_ly_do (ngay desc);

create index if not exists idx_bb_bao_cao_ly_do_ma_lenh
  on public.bb_bao_cao_ly_do (ma_lenh);

create or replace function public.set_bb_bao_cao_ly_do_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bb_bao_cao_ly_do_updated_at on public.bb_bao_cao_ly_do;

create trigger trg_bb_bao_cao_ly_do_updated_at
before update on public.bb_bao_cao_ly_do
for each row
execute function public.set_bb_bao_cao_ly_do_updated_at();

comment on table public.bb_bao_cao_ly_do is
  'Lý do giải trình từng dòng SP trên phiếu in Báo cáo tổng hợp máy BB.';
