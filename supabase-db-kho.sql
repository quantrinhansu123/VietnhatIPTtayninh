-- =============================================================================
-- DB KHO MỚI (project riêng) — sổ xuất / nhập / tồn
-- =============================================================================
-- Cách chạy:
--   1. Tạo project Supabase mới (hoặc mở project kho riêng)
--   2. SQL Editor → New query → dán TOÀN BỘ file này → Run
--   3. Trong .env (khi gắn app sau này), ví dụ:
--        SUPABASE_KHO_DB_LABEL=kho
--        SUPABASE_KHO_URL=https://<project-ref>.supabase.co
--        SUPABASE_KHO_SERVICE_KEY=<service_role key>
--
-- Bảng:
--   • phieu_xuat   — header phiếu xuất (ma_phieu, ngay, gio, nhan_su)
--   • phieu_nhap   — header phiếu nhập (cùng cấu trúc; dùng cho nhap_kho.ma_phieu)
--   • xuat_kho     — dòng xuất (ma_sp gốc, ma_sp_quet, ten_sp, loai, so_luong, ma_phieu)
--   • nhap_kho     — dòng nhập (ma_sp gốc, ma_sp_quet, ten_sp, loai, so_luong, ma_phieu)
--   • kho          — tồn theo mã SP (ton_dau, xuat, nhap, ton_cuoi, ton_toi_thieu)
--
-- Công thức gợi ý: ton_cuoi = ton_dau + nhap - xuat
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1) Header phiếu xuất
-- -----------------------------------------------------------------------------
create table if not exists public.phieu_xuat (
  id uuid primary key default gen_random_uuid(),
  ma_phieu text not null,
  ngay date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  gio time,
  nhan_su text,
  kho text,
  ca text,
  may text,
  ghi_chu text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_phieu_xuat_ma_phieu unique (ma_phieu)
);

create index if not exists idx_phieu_xuat_ngay on public.phieu_xuat (ngay desc);
create index if not exists idx_phieu_xuat_nhan_su on public.phieu_xuat (nhan_su);

comment on table public.phieu_xuat is 'Header phieu xuat kho.';
comment on column public.phieu_xuat.ma_phieu is 'Ma phieu xuat — khoa nghiep vu, khop xuat_kho.ma_phieu.';
comment on column public.phieu_xuat.ngay is 'Ngay lap phieu.';
comment on column public.phieu_xuat.gio is 'Gio lap phieu.';
comment on column public.phieu_xuat.nhan_su is 'Nguoi lap / nhan su xuat kho.';
comment on column public.phieu_xuat.kho is 'Kho lap phieu (khong bat buoc).';
comment on column public.phieu_xuat.ca is 'Ca san xuat (khong bat buoc).';
comment on column public.phieu_xuat.may is 'May san xuat (khong bat buoc).';
comment on column public.phieu_xuat.ghi_chu is 'Ghi chu phieu (khong bat buoc).';

-- -----------------------------------------------------------------------------
-- 2) Header phiếu nhập (đối xứng — phục vụ nhap_kho.ma_phieu)
-- -----------------------------------------------------------------------------
create table if not exists public.phieu_nhap (
  id uuid primary key default gen_random_uuid(),
  ma_phieu text not null,
  ngay date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  gio time,
  nhan_su text,
  kho text,
  ca text,
  may text,
  ghi_chu text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_phieu_nhap_ma_phieu unique (ma_phieu)
);

create index if not exists idx_phieu_nhap_ngay on public.phieu_nhap (ngay desc);
create index if not exists idx_phieu_nhap_nhan_su on public.phieu_nhap (nhan_su);

comment on table public.phieu_nhap is 'Header phieu nhap kho.';
comment on column public.phieu_nhap.ma_phieu is 'Ma phieu nhap — khoa nghiep vu, khop nhap_kho.ma_phieu.';
comment on column public.phieu_nhap.kho is 'Kho lap phieu (khong bat buoc).';
comment on column public.phieu_nhap.ca is 'Ca san xuat (khong bat buoc).';
comment on column public.phieu_nhap.may is 'May san xuat (khong bat buoc).';
comment on column public.phieu_nhap.ghi_chu is 'Ghi chu phieu (khong bat buoc).';

alter table public.phieu_xuat add column if not exists kho text;
alter table public.phieu_xuat add column if not exists ca text;
alter table public.phieu_xuat add column if not exists may text;
alter table public.phieu_xuat add column if not exists ghi_chu text;
alter table public.phieu_nhap add column if not exists kho text;
alter table public.phieu_nhap add column if not exists ca text;
alter table public.phieu_nhap add column if not exists may text;
alter table public.phieu_nhap add column if not exists ghi_chu text;

-- -----------------------------------------------------------------------------
-- 3) Dòng xuất kho
-- -----------------------------------------------------------------------------
create table if not exists public.xuat_kho (
  id uuid primary key default gen_random_uuid(),
  ma_sp text not null,
  ma_sp_quet text,
  ten_sp text,
  loai text,
  so_luong numeric(18, 4) not null default 0,
  ma_phieu text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_xuat_kho_ma_phieu
    foreign key (ma_phieu) references public.phieu_xuat (ma_phieu)
    on update cascade on delete restrict
);

alter table public.xuat_kho add column if not exists ma_sp_quet text;
alter table public.xuat_kho add column if not exists ten_sp text;

create index if not exists idx_xuat_kho_ma_sp on public.xuat_kho (ma_sp);
create index if not exists idx_xuat_kho_ma_phieu on public.xuat_kho (ma_phieu);
create index if not exists idx_xuat_kho_loai on public.xuat_kho (loai);

comment on table public.xuat_kho is 'Dong xuat kho theo ma SP / ma phieu.';
comment on column public.xuat_kho.ma_sp is 'Ma san pham goc.';
comment on column public.xuat_kho.ma_sp_quet is 'Ma QR day du da quet, gom ca tien to va hau to.';
comment on column public.xuat_kho.ten_sp is 'Ten thanh pham duoc quet.';
comment on column public.xuat_kho.loai is 'Loai hang (NVL, thanh pham, ...).';
comment on column public.xuat_kho.so_luong is 'So luong xuat.';
comment on column public.xuat_kho.ma_phieu is 'Ma phieu xuat — tham chieu phieu_xuat.ma_phieu.';

-- -----------------------------------------------------------------------------
-- 4) Dòng nhập kho
-- -----------------------------------------------------------------------------
create table if not exists public.nhap_kho (
  id uuid primary key default gen_random_uuid(),
  ma_sp text not null,
  ma_sp_quet text,
  ten_sp text,
  loai text,
  so_luong numeric(18, 4) not null default 0,
  ma_phieu text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fk_nhap_kho_ma_phieu
    foreign key (ma_phieu) references public.phieu_nhap (ma_phieu)
    on update cascade on delete restrict
);

alter table public.nhap_kho add column if not exists ma_sp_quet text;
alter table public.nhap_kho add column if not exists ten_sp text;

create index if not exists idx_nhap_kho_ma_sp on public.nhap_kho (ma_sp);
create index if not exists idx_nhap_kho_ma_phieu on public.nhap_kho (ma_phieu);
create index if not exists idx_nhap_kho_loai on public.nhap_kho (loai);

comment on table public.nhap_kho is 'Dong nhap kho theo ma SP / ma phieu.';
comment on column public.nhap_kho.ma_sp is 'Ma san pham / NVL.';
comment on column public.nhap_kho.ma_sp_quet is 'Ma QR day du da quet, gom ca tien to va hau to.';
comment on column public.nhap_kho.ten_sp is 'Ten san pham duoc quet.';
comment on column public.nhap_kho.loai is 'Loai hang (NVL, thanh pham, ...).';
comment on column public.nhap_kho.so_luong is 'So luong nhap.';
comment on column public.nhap_kho.ma_phieu is 'Ma phieu nhap — tham chieu phieu_nhap.ma_phieu.';

-- -----------------------------------------------------------------------------
-- 5) Bảng tồn kho (Kho)
-- -----------------------------------------------------------------------------
create table if not exists public.kho (
  id uuid primary key default gen_random_uuid(),
  ma_sp text not null,
  ton_dau numeric(18, 4) not null default 0,
  xuat numeric(18, 4) not null default 0,
  nhap numeric(18, 4) not null default 0,
  ton_cuoi numeric(18, 4) not null default 0,
  ton_toi_thieu numeric(18, 4) not null default 0,
  loai text,
  ten_sp text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_kho_ma_sp unique (ma_sp)
);

create index if not exists idx_kho_ma_sp on public.kho (ma_sp);
create index if not exists idx_kho_loai on public.kho (loai);
create index if not exists idx_kho_ton_cuoi on public.kho (ton_cuoi);

comment on table public.kho is 'Ton kho theo ma SP: ton_dau, xuat, nhap, ton_cuoi, ton_toi_thieu.';
comment on column public.kho.ma_sp is 'Ma san pham / NVL — unique.';
comment on column public.kho.ton_dau is 'Ton dau ky.';
comment on column public.kho.xuat is 'Tong xuat trong ky (co the cap nhat tu bang xuat_kho).';
comment on column public.kho.nhap is 'Tong nhap trong ky (co the cap nhat tu bang nhap_kho).';
comment on column public.kho.ton_cuoi is 'Ton cuoi = ton_dau + nhap - xuat.';
comment on column public.kho.ton_toi_thieu is 'Nguong canh bao ton thap.';

-- -----------------------------------------------------------------------------
-- 6) Trigger updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['phieu_xuat', 'phieu_nhap', 'xuat_kho', 'nhap_kho', 'kho']
  loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 7) RLS + grant
-- -----------------------------------------------------------------------------
alter table public.phieu_xuat enable row level security;
alter table public.phieu_nhap enable row level security;
alter table public.xuat_kho enable row level security;
alter table public.nhap_kho enable row level security;
alter table public.kho enable row level security;

do $$
declare
  t text;
  p text;
begin
  foreach t in array array['phieu_xuat', 'phieu_nhap', 'xuat_kho', 'nhap_kho', 'kho']
  loop
    foreach p in array array['select', 'insert', 'update', 'delete']
    loop
      execute format('drop policy if exists "%s_%s_all" on public.%I', t, p, t);
      if p = 'select' then
        execute format(
          'create policy "%s_select_all" on public.%I for select using (true)',
          t, t
        );
      elsif p = 'insert' then
        execute format(
          'create policy "%s_insert_all" on public.%I for insert with check (true)',
          t, t
        );
      elsif p = 'update' then
        execute format(
          'create policy "%s_update_all" on public.%I for update using (true) with check (true)',
          t, t
        );
      else
        execute format(
          'create policy "%s_delete_all" on public.%I for delete using (true)',
          t, t
        );
      end if;
    end loop;

    execute format(
      'grant select, insert, update, delete on table public.%I to anon, authenticated, service_role',
      t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8) (Tuỳ chọn) View tồn nhanh = ton_dau + sum(nhap) - sum(xuat)
-- -----------------------------------------------------------------------------
create or replace view public.v_kho_tinh_ton as
select
  k.id,
  k.ma_sp,
  k.ten_sp,
  k.loai,
  k.ton_dau,
  coalesce(n.tong_nhap, 0) as nhap_tinh,
  coalesce(x.tong_xuat, 0) as xuat_tinh,
  k.ton_dau + coalesce(n.tong_nhap, 0) - coalesce(x.tong_xuat, 0) as ton_cuoi_tinh,
  k.ton_toi_thieu,
  k.ton_dau + coalesce(n.tong_nhap, 0) - coalesce(x.tong_xuat, 0) < k.ton_toi_thieu as duoi_ton_toi_thieu
from public.kho k
left join (
  select ma_sp, sum(so_luong) as tong_nhap
  from public.nhap_kho
  group by ma_sp
) n on n.ma_sp = k.ma_sp
left join (
  select ma_sp, sum(so_luong) as tong_xuat
  from public.xuat_kho
  group by ma_sp
) x on x.ma_sp = k.ma_sp;

grant select on public.v_kho_tinh_ton to anon, authenticated, service_role;

comment on view public.v_kho_tinh_ton is
  'Ton tinh lai: ton_dau + sum(nhap_kho) - sum(xuat_kho). Cot duoi_ton_toi_thieu = canh bao.';

-- -----------------------------------------------------------------------------
-- 9) Kiểm tra nhanh sau khi Run
-- -----------------------------------------------------------------------------
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('phieu_xuat','phieu_nhap','xuat_kho','nhap_kho','kho')
-- order by table_name;
