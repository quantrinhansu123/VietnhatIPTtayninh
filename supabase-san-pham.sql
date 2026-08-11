-- Chay lai an toan trong Supabase SQL Editor
-- Tao bang san_pham neu chua co, sau do them/bo sung cac cot ung dung

create table if not exists public.san_pham (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- Bang da ton tai tu truoc (khong co cot id) -> them id
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'san_pham'
      and column_name = 'id'
  ) then
    alter table public.san_pham
      add column id uuid default gen_random_uuid();

    update public.san_pham
    set id = gen_random_uuid()
    where id is null;

    alter table public.san_pham
      alter column id set not null;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'san_pham_pkey'
        and conrelid = 'public.san_pham'::regclass
    ) then
      alter table public.san_pham
        add constraint san_pham_pkey primary key (id);
    end if;
  end if;
end $$;

alter table public.san_pham
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ma_sp text,
  add column if not exists ma_sp_moi text,
  add column if not exists ten_sp text,
  add column if not exists tinh_chat text,
  add column if not exists nhom_vthh text,
  add column if not exists don_vi text,
  add column if not exists sl_ton numeric,
  add column if not exists ton_dau_ky numeric,
  add column if not exists nhap_trong_ky numeric,
  add column if not exists xuat_trong_ky numeric,
  add column if not exists so_luong_ton_toi_thieu numeric,
  add column if not exists nguon_goc text,
  add column if not exists mo_ta text,
  add column if not exists ten_may_san_xuat text,
  add column if not exists npl_phan_tram jsonb not null default '[]'::jsonb,
  add column if not exists ma_amis text,
  add column if not exists tong_trong_luong numeric,
  add column if not exists kho_cuon numeric,
  add column if not exists chieu_dai_cuon numeric,
  add column if not exists trong_luong_loi numeric,
  add column if not exists trong_luong_tui numeric,
  add column if not exists trong_luong_nhua numeric;

create unique index if not exists san_pham_ma_sp_key on public.san_pham (ma_sp);
-- DB cũ có thể đã có một primary key khác tên/cột, khiến khối thêm san_pham_pkey phía trên
-- không bảo đảm riêng cột id là khóa tham chiếu. Unique index này giúp các bảng chi tiết FK tới id.
create unique index if not exists san_pham_id_unique_idx on public.san_pham (id);

alter table public.san_pham enable row level security;

drop policy if exists "san_pham_select_all" on public.san_pham;
create policy "san_pham_select_all"
  on public.san_pham for select
  using (true);

drop policy if exists "san_pham_insert_all" on public.san_pham;
create policy "san_pham_insert_all"
  on public.san_pham for insert
  with check (true);

drop policy if exists "san_pham_update_all" on public.san_pham;
create policy "san_pham_update_all"
  on public.san_pham for update
  using (true)
  with check (true);

drop policy if exists "san_pham_delete_all" on public.san_pham;
create policy "san_pham_delete_all"
  on public.san_pham for delete
  using (true);

comment on table public.san_pham is 'Danh muc san pham.';
comment on column public.san_pham.ma_sp is 'Ma san pham.';
comment on column public.san_pham.ma_sp_moi is 'Ma san pham moi.';
comment on column public.san_pham.ten_sp is 'Ten san pham.';
comment on column public.san_pham.ten_may_san_xuat is 'Ten may san xuat tuong ung voi ma_sp.';
comment on column public.san_pham.npl_phan_tram is
  'Danh sach NPL can thiet va ty le phan tram. VD: [{"ma_npl":"NPL-001","ten_npl":"Mang PE","phan_tram":40}]';
