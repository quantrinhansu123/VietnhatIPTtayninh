-- Hợp nhất "Theo chứng từ" và "Thực nhập" thành một cột Số lượng.
-- Chạy trên Supabase DB chính (he-thong).
--
-- Cột so_luong vốn là số lượng thực tế dùng để tính tồn kho. Với dữ liệu cũ
-- bị thiếu so_luong, lấy so_luong_chung_tu làm giá trị dự phòng trước khi xóa.

begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'phieu_xuat_nhap_kho'
      and column_name = 'so_luong_chung_tu'
  ) then
    update public.phieu_xuat_nhap_kho
    set so_luong = so_luong_chung_tu
    where so_luong is null
      and so_luong_chung_tu is not null;

    alter table public.phieu_xuat_nhap_kho
      drop column so_luong_chung_tu;
  end if;
end $$;

comment on column public.phieu_xuat_nhap_kho.so_luong is
  'Số lượng duy nhất của dòng phiếu, dùng để tính tồn kho và thành tiền.';

-- Cập nhật RPC tạo sản phẩm để phiếu nhập khởi tạo không còn ghi cột đã bỏ.
create or replace function public.tao_san_pham_voi_ma_chi_tiet(
  p_san_pham jsonb,
  p_ma_chi_tiet jsonb,
  p_ma_phieu text,
  p_ngay_phieu date default current_date,
  p_nguoi_tao text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_input public.san_pham%rowtype;
  v_product public.san_pham%rowtype;
  v_code text;
  v_count integer;
begin
  if jsonb_typeof(p_ma_chi_tiet) <> 'array' then
    raise exception 'INVALID_PRODUCT_CODES';
  end if;

  v_count := jsonb_array_length(p_ma_chi_tiet);
  if v_count < 1 or v_count > 999 then
    raise exception 'INVALID_INITIAL_QUANTITY';
  end if;

  v_input := jsonb_populate_record(null::public.san_pham, p_san_pham);
  if coalesce(trim(v_input.ma_sp), '') = '' then
    raise exception 'PRODUCT_CODE_REQUIRED';
  end if;

  insert into public.san_pham (
    ma_sp, ma_sp_moi, ma_amis, ten_sp, tinh_chat, nhom_vthh, don_vi, ten_kho,
    tong_trong_luong, kho_cuon, chieu_dai_cuon, trong_luong_loi, trong_luong_tui,
    trong_luong_nhua, ton_dau_ky, nhap_trong_ky, xuat_trong_ky, sl_ton,
    so_luong_ton_toi_thieu, nguon_goc, mo_ta, npl_phan_tram
  ) values (
    v_input.ma_sp, v_input.ma_sp_moi, v_input.ma_amis, v_input.ten_sp,
    v_input.tinh_chat, v_input.nhom_vthh, v_input.don_vi, v_input.ten_kho,
    v_input.tong_trong_luong, v_input.kho_cuon, v_input.chieu_dai_cuon,
    v_input.trong_luong_loi, v_input.trong_luong_tui, v_input.trong_luong_nhua,
    0, 0, 0, 0, v_input.so_luong_ton_toi_thieu, v_input.nguon_goc,
    v_input.mo_ta, coalesce(v_input.npl_phan_tram, '[]'::jsonb)
  ) returning * into v_product;

  for v_code in select jsonb_array_elements_text(p_ma_chi_tiet)
  loop
    insert into public.ma_san_pham_chi_tiet (
      san_pham_id, ma_sp_goc, ma_sp_day_du, ten_kho, trang_thai,
      dot_tao, ma_phieu_nhap, nguoi_tao
    ) values (
      v_product.id, v_product.ma_sp, v_code, v_product.ten_kho, 'trong_kho',
      p_ma_phieu, p_ma_phieu, p_nguoi_tao
    );

    insert into public.phieu_xuat_nhap_kho (
      ma_phieu, loai_phieu, ngay_phieu, ma_sp, ten_sp, don_vi, so_luong,
      ly_do, ghi_chu, nguoi_lap, loai_kho, ten_kho
    ) values (
      p_ma_phieu, 'nhap', coalesce(p_ngay_phieu, current_date), v_code,
      v_product.ten_sp, v_product.don_vi, 1,
      'Nhập kho khởi tạo khi thêm sản phẩm', 'Tạo tự động theo mã QR chi tiết',
      p_nguoi_tao, 'san_pham', v_product.ten_kho
    );
  end loop;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'codes', p_ma_chi_tiet,
    'ma_phieu', p_ma_phieu,
    'quantity', v_count
  );
end;
$$;

grant execute on function public.tao_san_pham_voi_ma_chi_tiet(jsonb, jsonb, text, date, text)
  to anon, authenticated, service_role;

commit;
