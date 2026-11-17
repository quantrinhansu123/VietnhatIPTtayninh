-- DB chính hệ thống (SUPABASE_URL). Chạy an toàn nhiều lần.
begin;
create table if not exists public.quy_doi_vat_lieu (
  id uuid primary key default gen_random_uuid(),
  ngay date not null,
  ca text not null check (length(trim(ca)) between 1 and 100),
  ma_may text not null check (length(trim(ma_may)) between 1 and 100),
  vat_tu_goc text not null check (length(trim(vat_tu_goc)) between 1 and 500),
  so_luong_goc numeric not null check (so_luong_goc > 0 and so_luong_goc <> 'NaN'::numeric and so_luong_goc < 'Infinity'::numeric),
  vat_tu_quy_doi text not null check (length(trim(vat_tu_quy_doi)) between 1 and 500),
  so_luong_quy_doi numeric not null check (so_luong_quy_doi > 0 and so_luong_quy_doi <> 'NaN'::numeric and so_luong_quy_doi < 'Infinity'::numeric),
  khoi_luong_goc numeric,
  khoi_luong_quy_doi numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bảng cũ (trước khi có ngày·ca·máy): bổ sung cột rồi siết NOT NULL khi đã có dữ liệu hợp lệ.
alter table public.quy_doi_vat_lieu add column if not exists ngay date;
alter table public.quy_doi_vat_lieu add column if not exists ca text;
alter table public.quy_doi_vat_lieu add column if not exists ma_may text;

-- Bản ghi cũ thiếu ngày·ca·máy: gán placeholder để có thể NOT NULL (sửa lại trên UI nếu cần).
update public.quy_doi_vat_lieu
set
  ngay = coalesce(ngay, (created_at at time zone 'Asia/Ho_Chi_Minh')::date),
  ca = nullif(trim(coalesce(ca, '')), ''),
  ma_may = nullif(trim(coalesce(ma_may, '')), '')
where ngay is null or nullif(trim(coalesce(ca, '')), '') is null or nullif(trim(coalesce(ma_may, '')), '') is null;

update public.quy_doi_vat_lieu set ca = 'CHUA_GAN' where nullif(trim(coalesce(ca, '')), '') is null;
update public.quy_doi_vat_lieu set ma_may = 'CHUA_GAN' where nullif(trim(coalesce(ma_may, '')), '') is null;

alter table public.quy_doi_vat_lieu alter column ngay set not null;
alter table public.quy_doi_vat_lieu alter column ca set not null;
alter table public.quy_doi_vat_lieu alter column ma_may set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_ca_len_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_ca_len_check check (length(trim(ca)) between 1 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_ma_may_len_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_ma_may_len_check check (length(trim(ma_may)) between 1 and 100);
  end if;
end $$;

create index if not exists quy_doi_vat_lieu_created_at_idx on public.quy_doi_vat_lieu (created_at desc, id);
create index if not exists quy_doi_vat_lieu_ngay_ca_may_idx on public.quy_doi_vat_lieu (ngay desc, ca, ma_may);

alter table public.quy_doi_vat_lieu enable row level security;
-- Chỉ backend dùng service role được truy cập, không mở quyền ghi công khai.
revoke all on public.quy_doi_vat_lieu from anon, authenticated;
grant all on public.quy_doi_vat_lieu to service_role;
comment on table public.quy_doi_vat_lieu is 'Quy đổi vật liệu theo ngày·ca·máy; không tự động xuất nhập hoặc thay đổi tồn kho.';
notify pgrst, 'reload schema';
commit;
