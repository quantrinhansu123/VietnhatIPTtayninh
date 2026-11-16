-- Thêm cột trọng lượng bì trên bảng cân AI (DB weighing / can_tu_dong).
-- Chạy trên project Supabase cân (SUPABASE_WEIGHING_*), không phải DB chính.
begin;

alter table public.can_tu_dong
  add column if not exists trong_luong_bi numeric;

comment on column public.can_tu_dong.trong_luong_bi is
  'Trọng lượng bì (kg). Ưu tiên cột này; đồng bộ với metadata.SOURCE_BI_KG. Mặc định UI 0,16 khi null.';

-- Backfill từ metadata nếu cột còn trống.
update public.can_tu_dong
set trong_luong_bi = round(
  coalesce(
    nullif(metadata->>'SOURCE_BI_KG', '')::numeric,
    nullif(metadata->>'source_bi_kg', '')::numeric,
    nullif(metadata->>'trong_luong_bi', '')::numeric,
    nullif(metadata->>'bi_kg', '')::numeric
  ),
  3
)
where trong_luong_bi is null
  and metadata is not null
  and (
    nullif(metadata->>'SOURCE_BI_KG', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    or nullif(metadata->>'source_bi_kg', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    or nullif(metadata->>'trong_luong_bi', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    or nullif(metadata->>'bi_kg', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
  );

-- Bảng Đà Nẵng (nếu đã tạo) — cùng cột.
alter table if exists public.bang_can_da_nang
  add column if not exists trong_luong_bi numeric;

comment on column public.bang_can_da_nang.trong_luong_bi is
  'Trọng lượng bì (kg). Đồng bộ với metadata.SOURCE_BI_KG.';

notify pgrst, 'reload schema';
commit;
