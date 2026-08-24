-- Bang staging nhap Excel dinh muc NVL / thanh phan SP
-- Chay trong Supabase SQL Editor (DB he-thong).
-- Ten bang: import_sp (Postgres snake_case; tuong ung "import_SP")

create extension if not exists pgcrypto;

create table if not exists public.import_sp (
  id uuid primary key default gen_random_uuid(),

  -- Cot dung Excel: Mã SP | Mã NVL | Loại | Giá trị | ĐVT
  ma_sp text not null,
  ma_nvl text not null,
  ten_nvl text,
  loai text,
  gia_tri numeric,
  dvt text,

  -- Cot chuan hoa (tu Excel)
  phan_tram numeric,
  so_luong numeric,
  khoi_luong_kg numeric,
  don_vi text,

  -- Meta batch import
  batch_id uuid not null default gen_random_uuid(),
  file_name text,
  so_dong_excel integer,
  trang_thai text not null default 'moi',
  ghi_chu text,
  imported_by text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint import_sp_trang_thai_check
    check (trang_thai in ('moi', 'da_ap_dung', 'loi', 'huy'))
);

create index if not exists idx_import_sp_ma_sp
  on public.import_sp (ma_sp);

create index if not exists idx_import_sp_ma_nvl
  on public.import_sp (ma_nvl);

create index if not exists idx_import_sp_batch_id
  on public.import_sp (batch_id);

create index if not exists idx_import_sp_imported_at
  on public.import_sp (imported_at desc);

create index if not exists idx_import_sp_trang_thai
  on public.import_sp (trang_thai);

create or replace function public.set_import_sp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_import_sp_updated_at on public.import_sp;
create trigger trg_import_sp_updated_at
before update on public.import_sp
for each row
execute function public.set_import_sp_updated_at();

alter table public.import_sp enable row level security;

drop policy if exists "import_sp_select_all" on public.import_sp;
create policy "import_sp_select_all"
  on public.import_sp for select
  using (true);

drop policy if exists "import_sp_insert_all" on public.import_sp;
create policy "import_sp_insert_all"
  on public.import_sp for insert
  with check (true);

drop policy if exists "import_sp_update_all" on public.import_sp;
create policy "import_sp_update_all"
  on public.import_sp for update
  using (true)
  with check (true);

drop policy if exists "import_sp_delete_all" on public.import_sp;
create policy "import_sp_delete_all"
  on public.import_sp for delete
  using (true);

comment on table public.import_sp is
  'Staging Excel dinh muc NVL (Mã SP, Mã NVL, Loại, Giá trị, ĐVT). Ma SP giu nguyen khoang trang (vd MT- MN001).';
comment on column public.import_sp.ma_sp is 'Ma san pham dung Excel (giu dau cach, vd MT- MN001).';
comment on column public.import_sp.ma_nvl is 'Ma NVL dung Excel (vd BDT, NTC).';
comment on column public.import_sp.loai is 'Loai dong Excel: Phan tram | So luong.';
comment on column public.import_sp.gia_tri is 'Gia tri dung cot Excel (khong lam tron khi import).';
comment on column public.import_sp.dvt is 'Don vi tinh Excel: %, Kg, Cai...';
comment on column public.import_sp.phan_tram is 'Chuan hoa khi Loai=Phan tram + DVT=%.';
comment on column public.import_sp.so_luong is 'Chuan hoa khi Loai=So luong + DVT khac Kg (vd Cai).';
comment on column public.import_sp.khoi_luong_kg is 'Chuan hoa khi Loai=So luong + DVT=Kg (vd BDT 0.0085).';
comment on column public.import_sp.batch_id is 'Cung 1 lan tai Excel.';
comment on column public.import_sp.trang_thai is 'moi | da_ap_dung | loi | huy.';
