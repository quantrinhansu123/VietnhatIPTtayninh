-- Chuyển việc sinh mã QR/serial từ trang Sản phẩm sang Phiếu nhập kho thành phẩm.
-- Chạy trên Supabase DB chính (he-thong) sau supabase-san-pham-ma-chi-tiet.sql.

create or replace function public.tao_phieu_nhap_san_pham_voi_ma_chi_tiet(
  p_ma_phieu text,
  p_ngay_phieu date,
  p_ten_kho text,
  p_ly_do text,
  p_ghi_chu text,
  p_nguoi_lap text,
  p_ca text,
  p_dong_hang jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_line jsonb;
  v_product public.san_pham%rowtype;
  v_code text;
  v_codes jsonb;
  v_unit_price numeric;
  v_total integer := 0;
  v_all_codes jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_ma_phieu), '') = '' then
    raise exception 'SLIP_CODE_REQUIRED';
  end if;
  if coalesce(trim(p_ten_kho), '') = '' then
    raise exception 'WAREHOUSE_REQUIRED';
  end if;
  if jsonb_typeof(p_dong_hang) <> 'array' or jsonb_array_length(p_dong_hang) < 1 then
    raise exception 'INVALID_PRODUCT_LINES';
  end if;

  for v_line in select value from jsonb_array_elements(p_dong_hang)
  loop
    select * into v_product
    from public.san_pham
    where id = (v_line->>'san_pham_id')::uuid
      and ma_sp = trim(v_line->>'ma_sp_goc')
    limit 1;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND:%', coalesce(v_line->>'ma_sp_goc', '');
    end if;

    v_codes := v_line->'codes';
    if jsonb_typeof(v_codes) <> 'array' or jsonb_array_length(v_codes) < 1 then
      raise exception 'INVALID_PRODUCT_CODES:%', v_product.ma_sp;
    end if;

    v_total := v_total + jsonb_array_length(v_codes);
    if v_total > 999 then
      raise exception 'PRODUCT_CODE_LIMIT_EXCEEDED';
    end if;

    v_unit_price := greatest(coalesce((v_line->>'don_gia')::numeric, 0), 0);

    for v_code in select jsonb_array_elements_text(v_codes)
    loop
      insert into public.ma_san_pham_chi_tiet (
        san_pham_id, ma_sp_goc, ma_sp_day_du, ten_kho, trang_thai,
        dot_tao, ma_phieu_nhap, nguoi_tao, ghi_chu
      ) values (
        v_product.id, v_product.ma_sp, v_code, p_ten_kho, 'trong_kho',
        p_ma_phieu, p_ma_phieu, p_nguoi_lap,
        'Sinh tự động khi lưu phiếu nhập kho thành phẩm'
      );

      insert into public.phieu_xuat_nhap_kho (
        ma_phieu, loai_phieu, loai_kho, ten_kho, ngay_phieu, ca,
        ma_sp, ten_sp, ma_npl, ten_npl, don_vi, so_luong,
        so_luong_chung_tu, don_gia, thanh_tien, ly_do, ghi_chu,
        nguoi_lap, nhan_su
      ) values (
        p_ma_phieu, 'nhap', 'san_pham', p_ten_kho,
        coalesce(p_ngay_phieu, current_date), coalesce(p_ca, ''),
        v_code, coalesce(nullif(trim(v_line->>'ten_sp'), ''), v_product.ten_sp, ''),
        '', '', coalesce(nullif(trim(v_line->>'don_vi'), ''), v_product.don_vi, ''), 1,
        null, v_unit_price, v_unit_price, coalesce(p_ly_do, ''), coalesce(p_ghi_chu, ''),
        coalesce(p_nguoi_lap, 'Hệ thống'), coalesce(p_nguoi_lap, 'Hệ thống')
      );

      v_all_codes := v_all_codes || jsonb_build_array(jsonb_build_object(
        'code', v_code,
        'baseCode', v_product.ma_sp,
        'name', coalesce(nullif(trim(v_line->>'ten_sp'), ''), v_product.ten_sp, ''),
        'unit', coalesce(nullif(trim(v_line->>'don_vi'), ''), v_product.don_vi, '')
      ));
    end loop;
  end loop;

  return jsonb_build_object(
    'slipCode', p_ma_phieu,
    'quantity', v_total,
    'codes', v_all_codes,
    'movements', coalesce((
      select jsonb_agg(to_jsonb(movement) order by movement.created_at, movement.id)
      from public.phieu_xuat_nhap_kho movement
      where movement.ma_phieu = p_ma_phieu
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.tao_phieu_nhap_san_pham_voi_ma_chi_tiet(
  text, date, text, text, text, text, text, jsonb
) to anon, authenticated, service_role;

comment on function public.tao_phieu_nhap_san_pham_voi_ma_chi_tiet(
  text, date, text, text, text, text, text, jsonb
) is 'Một transaction: sinh serial QR, đăng ký mã chi tiết và ghi phiếu nhập thành phẩm theo từng serial.';
