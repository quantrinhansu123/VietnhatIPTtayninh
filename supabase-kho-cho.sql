-- kho_cho — cùng cấu trúc dòng với nhap_kho.
-- Chạy trên project grlcgkzotqishzxwpddc (SUPABASE_KHO_CHO_URL).
-- https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new

create table if not exists public.kho_cho (
  id uuid primary key default gen_random_uuid(),
  ma_sp text not null,
  ma_sp_quet text,
  ten_sp text,
  don_vi text,
  loai text,
  so_luong numeric(18, 4) not null default 0,
  ma_phieu text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kho_cho add column if not exists ma_sp_quet text;
alter table public.kho_cho add column if not exists ten_sp text;
alter table public.kho_cho add column if not exists don_vi text;
alter table public.kho_cho add column if not exists so_luong_chung_tu numeric(18, 4);
alter table public.kho_cho add column if not exists don_gia numeric(18, 4) not null default 0;
alter table public.kho_cho add column if not exists thanh_tien numeric(18, 4) not null default 0;
alter table public.kho_cho add column if not exists ly_do text;
alter table public.kho_cho add column if not exists can_cu_bao_cao text;
alter table public.kho_cho add column if not exists id_dong_nhap_nguon uuid;
alter table public.kho_cho add column if not exists ma_phieu_nhap_nguon text;
alter table public.kho_cho add column if not exists link_anh_can_thuc_te text;
alter table public.kho_cho add column if not exists link_anh_can_thuc_te_public_id text;
alter table public.kho_cho add column if not exists link_anh_bao_thuc_te text;
alter table public.kho_cho add column if not exists link_anh_bao_thuc_te_public_id text;
alter table public.kho_cho add column if not exists id_bao_cao_nghiem_thu uuid;
alter table public.kho_cho add column if not exists id_bao_cao_hang_hong uuid;

alter table public.kho_cho alter column so_luong set default 0;
alter table public.kho_cho alter column loai drop not null;
alter table public.kho_cho alter column loai drop default;
alter table public.kho_cho alter column ma_sp_quet drop not null;

update public.kho_cho set ma_phieu = '' where ma_phieu is null;
alter table public.kho_cho alter column ma_phieu set not null;

alter table public.kho_cho drop column if exists kho;
alter table public.kho_cho drop column if exists ngay;
alter table public.kho_cho drop column if exists nhan_su;
alter table public.kho_cho drop column if exists can_tu_dong_id;

drop index if exists uq_kho_cho_ma_sp_quet;
create index if not exists idx_kho_cho_ma_sp on public.kho_cho (ma_sp);
create index if not exists idx_kho_cho_ma_phieu on public.kho_cho (ma_phieu);
create index if not exists idx_kho_cho_loai on public.kho_cho (loai);
create unique index if not exists uq_kho_cho_qr_san_pham
  on public.kho_cho (ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';
create index if not exists idx_kho_cho_phieu_qr_san_pham
  on public.kho_cho (ma_phieu, ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';

alter table public.kho_cho enable row level security;

drop policy if exists "kho_cho_select_all" on public.kho_cho;
create policy "kho_cho_select_all"
  on public.kho_cho for select
  using (true);

drop policy if exists "kho_cho_insert_all" on public.kho_cho;
create policy "kho_cho_insert_all"
  on public.kho_cho for insert
  with check (true);

drop policy if exists "kho_cho_update_all" on public.kho_cho;
create policy "kho_cho_update_all"
  on public.kho_cho for update
  using (true)
  with check (true);

drop policy if exists "kho_cho_delete_all" on public.kho_cho;
create policy "kho_cho_delete_all"
  on public.kho_cho for delete
  using (true);

grant select, insert, update, delete on table public.kho_cho to anon, authenticated, service_role;

comment on table public.kho_cho is 'Dong cho nhap kho, cung cot voi nhap_kho. Can tu dong ghi vao day truoc, chua vao nhap_kho.';
comment on column public.kho_cho.ma_phieu is 'Ma phieu nhap da chon ben can.';

notify pgrst, 'reload schema';
