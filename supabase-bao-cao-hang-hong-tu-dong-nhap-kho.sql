-- Chạy trong Supabase SQL Editor (DB chính hệ thống).
-- Mỗi dòng báo cáo hàng hỏng tự tạo/cập nhật/xóa một dòng nhập Kho hàng hỏng.

insert into public.quan_ly_kho (ten_kho, vi_tri, ten_vi_tri)
select 'Kho hàng hỏng', 'KHH', 'Khu vực hàng hỏng'
where not exists (
  select 1
  from public.quan_ly_kho
  where lower(trim(ten_kho)) = lower('Kho hàng hỏng')
);

alter table public.phieu_xuat_nhap_kho
  add column if not exists id_bao_cao_hang_hong bigint;

create unique index if not exists phieu_xuat_nhap_kho_bao_cao_hang_hong_uidx
  on public.phieu_xuat_nhap_kho (id_bao_cao_hang_hong)
  where id_bao_cao_hang_hong is not null;

create or replace function public.dong_bo_bao_cao_hang_hong_vao_kho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ma text;
  v_ten text;
  v_so_luong numeric;
  v_don_vi text;
begin
  if tg_op = 'DELETE' then
    delete from public.phieu_xuat_nhap_kho
    where id_bao_cao_hang_hong = old.id;
    return old;
  end if;

  v_ma := case new.loai_hang_hong
    when 'nhua_khong_mang' then 'HH-NHUA-KHONG-MANG'
    when 'nhua_dau_nong' then 'HH-NHUA-DAU-NONG'
    when 'nhua_dinh_mang' then 'HH-NHUA-DINH-MANG'
    when 'kl_mang' then 'HH-MANG'
    when 'tl_loi_dinh_hh' then 'HH-LOI-DINH'
    when 'vat_tu_khac' then coalesce(nullif(trim(new.ma_vat_tu), ''), 'HH-VAT-TU-KHAC')
    else 'HH-KHAC'
  end;

  v_ten := case new.loai_hang_hong
    when 'nhua_khong_mang' then 'Nhựa không màng'
    when 'nhua_dau_nong' then 'Nhựa đầu nòng'
    when 'nhua_dinh_mang' then 'Nhựa dính màng'
    when 'kl_mang' then 'Màng hỏng'
    when 'tl_loi_dinh_hh' then 'Lõi dính hàng hỏng'
    when 'vat_tu_khac' then coalesce(
      (select nullif(trim(k.ten_npl), '') from public.kho_nvl k where trim(k.ma_npl) = trim(new.ma_vat_tu) limit 1),
      nullif(trim(new.ma_vat_tu), ''),
      'Vật tư khác'
    )
    else 'Hàng hỏng khác'
  end;

  v_so_luong := case
    when coalesce(trim(new.so_luong_vat_tu), '') ~ '^[+-]?[0-9]+([.,][0-9]+)?$'
      then replace(trim(new.so_luong_vat_tu), ',', '.')::numeric
    else 0
  end;
  v_don_vi := coalesce(nullif(trim(new.don_vi_vat_tu), ''), 'kg');

  -- Báo cáo cũ chỉ có ghi chú/không có số lượng thì không tạo dòng tồn kho 0.
  if v_so_luong <= 0 then
    delete from public.phieu_xuat_nhap_kho
    where id_bao_cao_hang_hong = new.id;
    return new;
  end if;

  insert into public.phieu_xuat_nhap_kho (
    ma_phieu, loai_phieu, ngay_phieu, ca, ma_npl, ten_npl, don_vi,
    so_luong, ly_do, ghi_chu, nguoi_lap, loai_kho, ten_kho,
    id_bao_cao_hang_hong
  ) values (
    'NHH-' || coalesce(nullif(trim(new.document_no), ''), new.id::text),
    'nhap', coalesce(new.ngay_san_xuat, new.report_date, current_date),
    new.ca_san_xuat, v_ma, v_ten, v_don_vi, v_so_luong,
    'Tự động nhập từ báo cáo hàng hỏng',
    concat_ws(' · ', nullif(trim(new.ten_may_san_xuat), ''), nullif(trim(new.ghi_chu), '')),
    new.ten_nguoi_can, 'hang_hong', 'Kho hàng hỏng', new.id
  )
  on conflict (id_bao_cao_hang_hong) where id_bao_cao_hang_hong is not null
  do update set
    ma_phieu = excluded.ma_phieu,
    ngay_phieu = excluded.ngay_phieu,
    ca = excluded.ca,
    ma_npl = excluded.ma_npl,
    ten_npl = excluded.ten_npl,
    don_vi = excluded.don_vi,
    so_luong = excluded.so_luong,
    ghi_chu = excluded.ghi_chu,
    nguoi_lap = excluded.nguoi_lap,
    loai_kho = excluded.loai_kho,
    ten_kho = excluded.ten_kho;

  return new;
end;
$$;

drop trigger if exists bao_cao_hang_hong_tu_dong_nhap_kho on public.bao_cao_hang_hong;
create trigger bao_cao_hang_hong_tu_dong_nhap_kho
after insert or update or delete on public.bao_cao_hang_hong
for each row execute function public.dong_bo_bao_cao_hang_hong_vao_kho();

-- Đồng bộ các báo cáo đã có trước khi cài trigger.
update public.bao_cao_hang_hong
set document_no = document_no;

comment on column public.phieu_xuat_nhap_kho.id_bao_cao_hang_hong is
  'ID dòng báo cáo hàng hỏng nguồn; dùng để tự đồng bộ phiếu nhập Kho hàng hỏng.';
