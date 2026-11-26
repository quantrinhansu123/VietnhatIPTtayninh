-- Chạy trên DB cân (SUPABASE_WEIGHING_URL).
create table if not exists public.can_tu_dong_thoi_gian (
  khoa_bo_loc text primary key,
  ket_qua jsonb not null default '[]'::jsonb,
  tinh_luc timestamptz not null default now()
);
alter table public.can_tu_dong_thoi_gian enable row level security;
revoke all on public.can_tu_dong_thoi_gian from anon, authenticated;
grant all on public.can_tu_dong_thoi_gian to service_role;
