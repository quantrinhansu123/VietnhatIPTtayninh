-- Chạy lại an toàn trong Supabase SQL Editor
-- Lưu kế hoạch sản xuất theo ngày để tra cứu / lọc lịch sử

create table if not exists public.ke_hoach_san_xuat (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.ke_hoach_san_xuat
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists ma_ke_hoach text,
  add column if not exists ngay_ke_hoach date not null default current_date,
  add column if not exists trang_thai text default 'Đã lập',
  add column if not exists so_lenh integer default 0,
  add column if not exists ghi_chu text,
  add column if not exists nguoi_lap text;

create table if not exists public.ke_hoach_san_xuat_dong (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.ke_hoach_san_xuat_dong
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists ke_hoach_id uuid references public.ke_hoach_san_xuat (id) on delete cascade,
  add column if not exists lenh_sx_id uuid,
  add column if not exists thu_tu_uu_tien integer default 0,
  add column if not exists vi_tri text,
  add column if not exists ghi_chu text,
  add column if not exists ma_lenh_sx text,
  add column if not exists ma_don_hang text,
  add column if not exists ca text,
  add column if not exists may text,
  add column if not exists nhan_su text,
  add column if not exists truong_ca text,
  add column if not exists nhan_su_chinh text,
  add column if not exists tho_phu text,
  add column if not exists hoc_viec text,
  add column if not exists san_pham jsonb not null default '[]'::jsonb;

-- Đổi lenh_sx_id bigint → uuid nếu bảng trống / cột cũ
do $$
declare
  col_type text;
  n bigint;
begin
  select c.data_type into col_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'ke_hoach_san_xuat_dong'
    and c.column_name = 'lenh_sx_id';

  if col_type in ('bigint', 'integer', 'numeric') then
    select count(*) into n from public.ke_hoach_san_xuat_dong;
    if coalesce(n, 0) = 0 then
      drop index if exists ke_hoach_san_xuat_dong_lenh_idx;
      alter table public.ke_hoach_san_xuat_dong drop column lenh_sx_id;
      alter table public.ke_hoach_san_xuat_dong add column lenh_sx_id uuid;
    else
      raise notice 'ke_hoach_san_xuat_dong.lenh_sx_id đang % và có dữ liệu — bỏ qua đổi kiểu.', col_type;
    end if;
  end if;
exception
  when others then
    raise notice 'Điều chỉnh ke_hoach_san_xuat_dong.lenh_sx_id: %', SQLERRM;
end $$;

create index if not exists ke_hoach_san_xuat_ngay_idx
  on public.ke_hoach_san_xuat (ngay_ke_hoach desc);

create index if not exists ke_hoach_san_xuat_ma_idx
  on public.ke_hoach_san_xuat (ma_ke_hoach);

create index if not exists ke_hoach_san_xuat_dong_ke_hoach_idx
  on public.ke_hoach_san_xuat_dong (ke_hoach_id);

create index if not exists ke_hoach_san_xuat_dong_lenh_idx
  on public.ke_hoach_san_xuat_dong (lenh_sx_id);

alter table public.ke_hoach_san_xuat enable row level security;
alter table public.ke_hoach_san_xuat_dong enable row level security;

drop policy if exists "ke_hoach_san_xuat_select_all" on public.ke_hoach_san_xuat;
create policy "ke_hoach_san_xuat_select_all"
  on public.ke_hoach_san_xuat for select using (true);

drop policy if exists "ke_hoach_san_xuat_insert_all" on public.ke_hoach_san_xuat;
create policy "ke_hoach_san_xuat_insert_all"
  on public.ke_hoach_san_xuat for insert with check (true);

drop policy if exists "ke_hoach_san_xuat_update_all" on public.ke_hoach_san_xuat;
create policy "ke_hoach_san_xuat_update_all"
  on public.ke_hoach_san_xuat for update using (true) with check (true);

drop policy if exists "ke_hoach_san_xuat_delete_all" on public.ke_hoach_san_xuat;
create policy "ke_hoach_san_xuat_delete_all"
  on public.ke_hoach_san_xuat for delete using (true);

drop policy if exists "ke_hoach_san_xuat_dong_select_all" on public.ke_hoach_san_xuat_dong;
create policy "ke_hoach_san_xuat_dong_select_all"
  on public.ke_hoach_san_xuat_dong for select using (true);

drop policy if exists "ke_hoach_san_xuat_dong_insert_all" on public.ke_hoach_san_xuat_dong;
create policy "ke_hoach_san_xuat_dong_insert_all"
  on public.ke_hoach_san_xuat_dong for insert with check (true);

drop policy if exists "ke_hoach_san_xuat_dong_update_all" on public.ke_hoach_san_xuat_dong;
create policy "ke_hoach_san_xuat_dong_update_all"
  on public.ke_hoach_san_xuat_dong for update using (true) with check (true);

drop policy if exists "ke_hoach_san_xuat_dong_delete_all" on public.ke_hoach_san_xuat_dong;
create policy "ke_hoach_san_xuat_dong_delete_all"
  on public.ke_hoach_san_xuat_dong for delete using (true);

comment on table public.ke_hoach_san_xuat is 'Ke hoach san xuat theo ngay (header).';
comment on column public.ke_hoach_san_xuat.ngay_ke_hoach is 'Ngay lap ke hoach san xuat.';
comment on column public.ke_hoach_san_xuat.ma_ke_hoach is 'Ma tham chieu ke hoach, vi du KHSX-20250629-AB12.';
comment on table public.ke_hoach_san_xuat_dong is 'Chi tiet tung lenh SX trong ke hoach.';
comment on column public.ke_hoach_san_xuat_dong.san_pham is 'Snapshot san pham cua lenh SX tai thoi diem lap ke hoach.';
