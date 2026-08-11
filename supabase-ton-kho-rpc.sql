-- RPC bao cao "Ton kho" — gop ton dau ky / nhap / xuat / ton cuoi ky theo ma NVL hoac ma SP,
-- loc theo kho (ten_kho, tuy chon) va khoang ngay (p_tu_ngay/p_den_ngay, tuy chon, gom ca 2 dau).
-- Chay an toan trong Supabase SQL Editor.
--
-- Yeu cau: da chay supabase-kho-nvl-ten-kho.sql, supabase-san-pham-ten-kho.sql va
-- supabase-phieu-xuat-nhap-kho-ten-kho.sql truoc (can cot ten_kho tren ca 3 bang).
--
-- Cong thuc: ton_dau_ky (cua ky dang xem) = ton_dau_ky goc (kho_nvl/san_pham.ton_dau_ky)
--   + nhap truoc p_tu_ngay - xuat truoc p_tu_ngay (neu p_tu_ngay khong null).
-- ton_cuoi_ky = ton_dau_ky + nhap_trong_ky - xuat_trong_ky.
--
-- Ma lo/hau to: mot ma NVL/SP co the co nhieu dong voi hau to lo/serial sau dau "_"
-- (VD "L30cm_3701190208G"), moi hau to la mot `ma` rieng o day (chi tiet). Ten/don_vi cho
-- cac ma hau to duoc muon tu ma goc (tien to truoc "_") trong danh muc khi khong khop dung.
-- Trang /ton-kho gop cac dong cung tien to lai o Bang tong hop (xu ly rieng, khong trong RPC nay).

create or replace function public.ton_kho_nvl_gop(p_ten_kho text, p_tu_ngay date, p_den_ngay date)
returns table (
  ma text,
  ten text,
  don_vi text,
  ten_kho text,
  ton_dau_ky numeric,
  nhap_trong_ky numeric,
  xuat_trong_ky numeric,
  ton_cuoi_ky numeric
)
language sql
stable
as $$
  with catalog as (
    select k.ma_npl as ma, k.ten_npl as ten, k.don_vi, k.ten_kho, coalesce(k.ton_dau_ky, 0) as baseline
    from public.kho_nvl k
    where p_ten_kho is null or k.ten_kho = p_ten_kho
  ),
  movement_codes as (
    select distinct m.ma_npl as ma
    from public.phieu_xuat_nhap_kho m
    where (m.loai_kho = 'nvl' or m.loai_kho is null)
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and m.ma_npl is not null and m.ma_npl <> ''
  ),
  codes as (
    select ma from catalog
    union
    select ma from movement_codes
  ),
  opening_adj as (
    select m.ma_npl as ma,
      sum(case when m.loai_phieu = 'nhap' then m.so_luong else 0 end) -
      sum(case when m.loai_phieu = 'xuat' then m.so_luong else 0 end) as adj
    from public.phieu_xuat_nhap_kho m
    where (m.loai_kho = 'nvl' or m.loai_kho is null)
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and p_tu_ngay is not null
      and m.ngay_phieu < p_tu_ngay
    group by m.ma_npl
  ),
  period_totals as (
    select m.ma_npl as ma,
      sum(case when m.loai_phieu = 'nhap' then m.so_luong else 0 end) as nhap,
      sum(case when m.loai_phieu = 'xuat' then m.so_luong else 0 end) as xuat
    from public.phieu_xuat_nhap_kho m
    where (m.loai_kho = 'nvl' or m.loai_kho is null)
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and (p_tu_ngay is null or m.ngay_phieu >= p_tu_ngay)
      and (p_den_ngay is null or m.ngay_phieu <= p_den_ngay)
    group by m.ma_npl
  )
  select
    c.ma,
    -- Mã lô/hậu tố (VD "L30cm_3701190208G") không có trong danh mục — mượn tên/đơn vị của mã
    -- gốc (tiền tố trước dấu "_") nếu có, để chi tiết không hiển thị tên trống/mã thô.
    coalesce(cat.ten, cat_prefix.ten, c.ma) as ten,
    coalesce(cat.don_vi, cat_prefix.don_vi) as don_vi,
    coalesce(cat.ten_kho, cat_prefix.ten_kho, p_ten_kho) as ten_kho,
    coalesce(cat.baseline, 0) + coalesce(oa.adj, 0) as ton_dau_ky,
    coalesce(pt.nhap, 0) as nhap_trong_ky,
    coalesce(pt.xuat, 0) as xuat_trong_ky,
    coalesce(cat.baseline, 0) + coalesce(oa.adj, 0) + coalesce(pt.nhap, 0) - coalesce(pt.xuat, 0) as ton_cuoi_ky
  from codes c
  left join catalog cat on cat.ma = c.ma
  left join catalog cat_prefix on cat.ma is null and cat_prefix.ma = split_part(c.ma, '_', 1)
  left join opening_adj oa on oa.ma = c.ma
  left join period_totals pt on pt.ma = c.ma
  order by c.ma;
$$;

create or replace function public.ton_kho_san_pham_gop(p_ten_kho text, p_tu_ngay date, p_den_ngay date)
returns table (
  ma text,
  ten text,
  don_vi text,
  ten_kho text,
  ton_dau_ky numeric,
  nhap_trong_ky numeric,
  xuat_trong_ky numeric,
  ton_cuoi_ky numeric
)
language sql
stable
as $$
  with catalog as (
    select trim(s.ma_sp) as ma, s.ten_sp as ten, s.don_vi, s.ten_kho, coalesce(s.ton_dau_ky, 0) as baseline
    from public.san_pham s
    where p_ten_kho is null or s.ten_kho = p_ten_kho
  ),
  movement_codes as (
    select distinct trim(m.ma_sp) as ma
    from public.phieu_xuat_nhap_kho m
    where m.loai_kho = 'san_pham'
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and m.ma_sp is not null and m.ma_sp <> ''
  ),
  codes as (
    select ma from catalog
    union
    select ma from movement_codes
  ),
  opening_adj as (
    select trim(m.ma_sp) as ma,
      sum(case when m.loai_phieu = 'nhap' then m.so_luong else 0 end) -
      sum(case when m.loai_phieu = 'xuat' then m.so_luong else 0 end) as adj
    from public.phieu_xuat_nhap_kho m
    where m.loai_kho = 'san_pham'
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and p_tu_ngay is not null
      and m.ngay_phieu < p_tu_ngay
    group by trim(m.ma_sp)
  ),
  period_totals as (
    select trim(m.ma_sp) as ma,
      sum(case when m.loai_phieu = 'nhap' then m.so_luong else 0 end) as nhap,
      sum(case when m.loai_phieu = 'xuat' then m.so_luong else 0 end) as xuat
    from public.phieu_xuat_nhap_kho m
    where m.loai_kho = 'san_pham'
      and (p_ten_kho is null or m.ten_kho = p_ten_kho)
      and (p_tu_ngay is null or m.ngay_phieu >= p_tu_ngay)
      and (p_den_ngay is null or m.ngay_phieu <= p_den_ngay)
    group by trim(m.ma_sp)
  )
  select
    c.ma,
    coalesce(cat.ten, cat_prefix.ten, c.ma) as ten,
    coalesce(cat.don_vi, cat_prefix.don_vi) as don_vi,
    coalesce(cat.ten_kho, cat_prefix.ten_kho, p_ten_kho) as ten_kho,
    coalesce(cat.baseline, 0) + coalesce(oa.adj, 0) as ton_dau_ky,
    coalesce(pt.nhap, 0) as nhap_trong_ky,
    coalesce(pt.xuat, 0) as xuat_trong_ky,
    coalesce(cat.baseline, 0) + coalesce(oa.adj, 0) + coalesce(pt.nhap, 0) - coalesce(pt.xuat, 0) as ton_cuoi_ky
  from codes c
  left join catalog cat on upper(replace(cat.ma, ' ', '')) = upper(replace(c.ma, ' ', ''))
  left join catalog cat_prefix on cat.ma is null
    and upper(replace(cat_prefix.ma, ' ', '')) = upper(replace(split_part(c.ma, '_', 1), ' ', ''))
  left join opening_adj oa on oa.ma = c.ma
  left join period_totals pt on pt.ma = c.ma
  order by c.ma;
$$;

grant execute on function public.ton_kho_nvl_gop(text, date, date) to anon, authenticated, service_role;
grant execute on function public.ton_kho_san_pham_gop(text, date, date) to anon, authenticated, service_role;

comment on function public.ton_kho_nvl_gop(text, date, date) is
  'Bao cao ton kho NVL: ton dau ky, nhap/xuat trong ky, ton cuoi ky theo ma_npl. p_ten_kho null = tat ca kho, p_tu_ngay/p_den_ngay null = khong gioi han dau/cuoi.';
comment on function public.ton_kho_san_pham_gop(text, date, date) is
  'Bao cao ton kho thanh pham: ton dau ky, nhap/xuat trong ky, ton cuoi ky theo ma_sp. p_ten_kho null = tat ca kho, p_tu_ngay/p_den_ngay null = khong gioi han dau/cuoi.';
