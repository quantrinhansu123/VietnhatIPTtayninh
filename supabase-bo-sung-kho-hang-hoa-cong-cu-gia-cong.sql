-- Chạy trong Supabase SQL Editor (DB chính hệ thống).
-- Bổ sung idempotent 3 kho vật lý mới vào danh mục Quản lý kho.

insert into public.quan_ly_kho (ten_kho, vi_tri, ten_vi_tri)
select v.ten_kho, v.vi_tri, v.ten_vi_tri
from (values
  ('Kho hàng hóa', 'KHH', 'Khu vực hàng hóa'),
  ('Kho công cụ dụng cụ', 'KCCDC', 'Khu vực công cụ dụng cụ'),
  ('Kho gia công', 'KGC', 'Khu vực gia công')
) as v(ten_kho, vi_tri, ten_vi_tri)
where not exists (
  select 1
  from public.quan_ly_kho q
  where lower(trim(q.ten_kho)) = lower(trim(v.ten_kho))
);
