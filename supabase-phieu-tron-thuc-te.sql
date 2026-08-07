-- Phiếu trộn thực tế được tạo từ phiếu trộn định mức theo ngày + ca.
create table if not exists public.phieu_tron_thuc_te (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ngay date not null,
  ca text not null,
  dinh_muc_id uuid not null references public.bang_tron_vat_tu_dinh_muc(id) on delete cascade,
  ma_lenh_sx text,
  ghi_chu text,
  chi_tiet jsonb not null default '[]'::jsonb,
  constraint phieu_tron_thuc_te_dinh_muc_unique unique (dinh_muc_id)
);

create index if not exists phieu_tron_thuc_te_ngay_ca_idx
  on public.phieu_tron_thuc_te (ngay desc, ca);

alter table public.phieu_tron_thuc_te enable row level security;
drop policy if exists "phieu_tron_thuc_te_select_all" on public.phieu_tron_thuc_te;
create policy "phieu_tron_thuc_te_select_all" on public.phieu_tron_thuc_te for select using (true);
drop policy if exists "phieu_tron_thuc_te_insert_all" on public.phieu_tron_thuc_te;
create policy "phieu_tron_thuc_te_insert_all" on public.phieu_tron_thuc_te for insert with check (true);
drop policy if exists "phieu_tron_thuc_te_update_all" on public.phieu_tron_thuc_te;
create policy "phieu_tron_thuc_te_update_all" on public.phieu_tron_thuc_te for update using (true) with check (true);
drop policy if exists "phieu_tron_thuc_te_delete_all" on public.phieu_tron_thuc_te;
create policy "phieu_tron_thuc_te_delete_all" on public.phieu_tron_thuc_te for delete using (true);
