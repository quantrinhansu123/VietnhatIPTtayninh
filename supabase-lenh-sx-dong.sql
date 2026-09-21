-- Bảng con: từng dòng SP của lệnh sản xuất (tab «Dữ liệu trong lệnh sản xuất»).
-- Chạy an toàn khi chạy lại. FK cascade khi xóa lenh_sx.
-- Lưu ý: lenh_sx.id trên DB production là UUID (không phải bigint).

create extension if not exists pgcrypto;

create table if not exists public.lenh_sx_dong (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lenh_sx_dong
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists lenh_sx_id uuid,
  add column if not exists ma_lenh_sx text,
  add column if not exists stt integer not null default 1,
  add column if not exists ma_sp text,
  add column if not exists ten_sp text,
  add column if not exists don_vi text,
  add column if not exists so_luong numeric,
  add column if not exists ma_don_hang text,
  -- Snapshot định mức từ Kho hàng (san_pham) lúc lưu lệnh
  add column if not exists dinh_muc_kg numeric,
  add column if not exists trong_luong_nhua_kg numeric,
  add column if not exists tong_kg numeric;

-- Nếu lần chạy trước tạo nhầm lenh_sx_id bigint → đổi sang uuid.
do $$
declare
  col_type text;
begin
  select c.data_type into col_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'lenh_sx_dong'
    and c.column_name = 'lenh_sx_id';

  if col_type is null then
    alter table public.lenh_sx_dong add column lenh_sx_id uuid;
  elsif col_type = 'bigint' or col_type = 'integer' or col_type = 'numeric' then
    alter table public.lenh_sx_dong drop constraint if exists lenh_sx_dong_lenh_sx_id_fkey;
    drop index if exists lenh_sx_dong_lenh_sx_id_idx;
    drop index if exists lenh_sx_dong_lenh_stt_uidx;
    alter table public.lenh_sx_dong drop column lenh_sx_id;
    alter table public.lenh_sx_dong add column lenh_sx_id uuid;
  end if;
exception
  when others then
    raise notice 'Điều chỉnh lenh_sx_id: %', SQLERRM;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lenh_sx_dong_lenh_sx_id_fkey'
  ) then
    alter table public.lenh_sx_dong
      add constraint lenh_sx_dong_lenh_sx_id_fkey
      foreign key (lenh_sx_id) references public.lenh_sx (id) on delete cascade;
  end if;
exception
  when undefined_table then null;
  when others then
    raise notice 'FK lenh_sx_dong: %', SQLERRM;
end $$;

create index if not exists lenh_sx_dong_lenh_sx_id_idx
  on public.lenh_sx_dong (lenh_sx_id);

create index if not exists lenh_sx_dong_ma_lenh_sx_idx
  on public.lenh_sx_dong (ma_lenh_sx);

create index if not exists lenh_sx_dong_ma_sp_idx
  on public.lenh_sx_dong (ma_sp);

create unique index if not exists lenh_sx_dong_lenh_stt_uidx
  on public.lenh_sx_dong (lenh_sx_id, stt)
  where lenh_sx_id is not null;

create or replace function public.set_lenh_sx_dong_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lenh_sx_dong_updated_at on public.lenh_sx_dong;
create trigger trg_lenh_sx_dong_updated_at
before update on public.lenh_sx_dong
for each row
execute function public.set_lenh_sx_dong_updated_at();

alter table public.lenh_sx_dong enable row level security;

drop policy if exists "lenh_sx_dong_select_all" on public.lenh_sx_dong;
create policy "lenh_sx_dong_select_all"
  on public.lenh_sx_dong for select using (true);

drop policy if exists "lenh_sx_dong_insert_all" on public.lenh_sx_dong;
create policy "lenh_sx_dong_insert_all"
  on public.lenh_sx_dong for insert with check (true);

drop policy if exists "lenh_sx_dong_update_all" on public.lenh_sx_dong;
create policy "lenh_sx_dong_update_all"
  on public.lenh_sx_dong for update using (true) with check (true);

drop policy if exists "lenh_sx_dong_delete_all" on public.lenh_sx_dong;
create policy "lenh_sx_dong_delete_all"
  on public.lenh_sx_dong for delete using (true);

comment on table public.lenh_sx_dong is
  'Dong SP cua lenh san xuat — 1 dong = 1 ma hang trong tab Du lieu trong lenh SX.';
comment on column public.lenh_sx_dong.lenh_sx_id is
  'FK uuid → lenh_sx.id';
comment on column public.lenh_sx_dong.dinh_muc_kg is
  'Dinh muc kg / 1 DVT (tu san_pham.tong_trong_luong).';
comment on column public.lenh_sx_dong.trong_luong_nhua_kg is
  'Trong luong nhua + phu gia kg / 1 DVT (tu san_pham.trong_luong_nhua).';
comment on column public.lenh_sx_dong.tong_kg is
  'Tong kg = dinh_muc_kg x so_luong.';

-- Backfill từ lenh_sx.san_pham khi là JSON mảng.
do $$
begin
  insert into public.lenh_sx_dong (
    lenh_sx_id,
    ma_lenh_sx,
    stt,
    ma_sp,
    ten_sp,
    don_vi,
    so_luong,
    ma_don_hang,
    dinh_muc_kg,
    trong_luong_nhua_kg,
    tong_kg
  )
  select
    ls.id,
    ls.ma_lenh_sx,
    ord.stt,
    nullif(trim(coalesce(ord.item ->> 'ma_sp', ord.item ->> 'ma_hang', '')), ''),
    nullif(trim(coalesce(ord.item ->> 'ten_sp', ord.item ->> 'ten_hang', '')), ''),
    nullif(trim(coalesce(ord.item ->> 'don_vi', '')), ''),
    nullif(replace(coalesce(ord.item ->> 'so_luong', '0'), ',', '.'), '')::numeric,
    nullif(trim(coalesce(ord.item ->> 'ma_don_hang', ls.ma_don_hang, '')), ''),
    sp.tong_trong_luong,
    sp.trong_luong_nhua,
    case
      when sp.tong_trong_luong is not null
        and nullif(replace(coalesce(ord.item ->> 'so_luong', '0'), ',', '.'), '')::numeric is not null
      then round(
        sp.tong_trong_luong
        * nullif(replace(coalesce(ord.item ->> 'so_luong', '0'), ',', '.'), '')::numeric,
        4
      )
      else null
    end
  from public.lenh_sx ls
  cross join lateral (
    select
      row_number() over ()::integer as stt,
      elem as item
    from jsonb_array_elements(
      case
        when ls.san_pham is null then '[]'::jsonb
        when trim(coalesce(ls.san_pham::text, '')) = '' then '[]'::jsonb
        when left(trim(ls.san_pham::text), 1) = '[' then trim(ls.san_pham::text)::jsonb
        else '[]'::jsonb
      end
    ) as elem
  ) ord
  left join lateral (
    select p.tong_trong_luong, p.trong_luong_nhua
    from public.san_pham p
    where trim(coalesce(p.ma_sp, '')) =
      trim(coalesce(ord.item ->> 'ma_sp', ord.item ->> 'ma_hang', ''))
    limit 1
  ) sp on true
  where not exists (
    select 1 from public.lenh_sx_dong d where d.lenh_sx_id::text = ls.id::text
  )
    and (
      nullif(trim(coalesce(ord.item ->> 'ma_sp', ord.item ->> 'ma_hang', '')), '') is not null
      or nullif(trim(coalesce(ord.item ->> 'ten_sp', ord.item ->> 'ten_hang', '')), '') is not null
    );
exception
  when others then
    raise notice 'Backfill san_pham JSON bỏ qua: %', SQLERRM;
end $$;

-- Backfill lệnh chỉ có cột phẳng (không JSON mảng SP).
do $$
begin
  insert into public.lenh_sx_dong (
    lenh_sx_id,
    ma_lenh_sx,
    stt,
    ma_sp,
    ten_sp,
    don_vi,
    so_luong,
    ma_don_hang,
    dinh_muc_kg,
    trong_luong_nhua_kg,
    tong_kg
  )
  select
    ls.id,
    ls.ma_lenh_sx,
    1,
    nullif(trim(coalesce(ls.ma_hang, '')), ''),
    nullif(trim(coalesce(ls.ten_hang, '')), ''),
    nullif(trim(coalesce(ls.don_vi, '')), ''),
    ls.so_luong,
    nullif(trim(coalesce(ls.ma_don_hang, '')), ''),
    sp.tong_trong_luong,
    sp.trong_luong_nhua,
    case
      when sp.tong_trong_luong is not null and ls.so_luong is not null
      then round(sp.tong_trong_luong * ls.so_luong, 4)
      else null
    end
  from public.lenh_sx ls
  left join lateral (
    select p.tong_trong_luong, p.trong_luong_nhua
    from public.san_pham p
    where trim(coalesce(p.ma_sp, '')) = trim(coalesce(split_part(ls.ma_hang, ',', 1), ''))
    limit 1
  ) sp on true
  where not exists (
    select 1 from public.lenh_sx_dong d where d.lenh_sx_id::text = ls.id::text
  )
    and (
      nullif(trim(coalesce(ls.ma_hang, '')), '') is not null
      or nullif(trim(coalesce(ls.ten_hang, '')), '') is not null
    );
exception
  when others then
    raise notice 'Backfill cột phẳng bỏ qua: %', SQLERRM;
end $$;
