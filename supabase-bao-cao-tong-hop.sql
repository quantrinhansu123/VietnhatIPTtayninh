-- bao_cao_tong_hop — snapshot khối KPI «Báo cáo tổng hợp» + «Tổng hợp nhựa»
-- trên /phan-tich-tu-dong. 1 dòng = 1 khoa_on_dinh. Ghi khi «Tính toán».
-- Chạy an toàn khi chạy lại.

create extension if not exists pgcrypto;

create table if not exists public.bao_cao_tong_hop (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bao_cao_tong_hop
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists khoa_on_dinh text not null default '',
  add column if not exists ngay_tu text not null default '',
  add column if not exists ngay_den text not null default '',
  add column if not exists ca text not null default '',
  add column if not exists may text not null default '',
  add column if not exists nguon_san_luong text not null default '',
  -- Ô TL nhựa yêu cầu
  add column if not exists sl_yeu_cau numeric,
  add column if not exists tl_nhua_yeu_cau_kg numeric,
  -- Ô TL xuất
  add column if not exists tl_xuat_tong_kg numeric,
  add column if not exists tl_xuat_nhua_kg numeric,
  add column if not exists tl_xuat_khac_kg numeric,
  -- Ô tồn đầu / cuối ca
  add column if not exists ton_dau_tong_kg numeric,
  add column if not exists ton_dau_nhua_kg numeric,
  add column if not exists ton_dau_khac_kg numeric,
  add column if not exists ton_cuoi_tong_kg numeric,
  add column if not exists ton_cuoi_nhua_kg numeric,
  add column if not exists ton_cuoi_khac_kg numeric,
  -- Ô báo cáo sản lượng
  add column if not exists sl_san_luong numeric,
  add column if not exists tl_san_luong_kg numeric,
  add column if not exists tl_mang_kg numeric,
  add column if not exists tl_nhua_thanh_pham_kg numeric,
  add column if not exists tl_nhua_dinh_muc_kg numeric,
  -- Ô lỗi hỏng
  add column if not exists loi_hong_tong_kg numeric,
  add column if not exists loi_hong_nhua_kg numeric,
  add column if not exists loi_hong_khac_kg numeric,
  -- Hàng «Tổng hợp nhựa»
  add column if not exists xuat_thuc_dung_kg numeric,
  add column if not exists chenh_lech_nhua_kg numeric,
  add column if not exists chenh_lech_dinh_muc_kg numeric;

create unique index if not exists bao_cao_tong_hop_khoa_uidx
  on public.bao_cao_tong_hop (khoa_on_dinh)
  where khoa_on_dinh <> '';

create index if not exists bao_cao_tong_hop_ngay_idx
  on public.bao_cao_tong_hop (ngay_tu desc, ngay_den desc);

create or replace function public.set_bao_cao_tong_hop_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bao_cao_tong_hop_updated_at on public.bao_cao_tong_hop;
create trigger trg_bao_cao_tong_hop_updated_at
before update on public.bao_cao_tong_hop
for each row execute function public.set_bao_cao_tong_hop_updated_at();

alter table public.bao_cao_tong_hop enable row level security;

drop policy if exists "bao_cao_tong_hop_select_all" on public.bao_cao_tong_hop;
create policy "bao_cao_tong_hop_select_all"
  on public.bao_cao_tong_hop for select using (true);

drop policy if exists "bao_cao_tong_hop_insert_all" on public.bao_cao_tong_hop;
create policy "bao_cao_tong_hop_insert_all"
  on public.bao_cao_tong_hop for insert with check (true);

drop policy if exists "bao_cao_tong_hop_update_all" on public.bao_cao_tong_hop;
create policy "bao_cao_tong_hop_update_all"
  on public.bao_cao_tong_hop for update using (true) with check (true);

drop policy if exists "bao_cao_tong_hop_delete_all" on public.bao_cao_tong_hop;
create policy "bao_cao_tong_hop_delete_all"
  on public.bao_cao_tong_hop for delete using (true);

comment on table public.bao_cao_tong_hop is
  'Snapshot KPI Bao cao tong hop + Tong hop nhua (/phan-tich-tu-dong). 1 dong / khoa_on_dinh. Ghi khi Tinh toan.';
