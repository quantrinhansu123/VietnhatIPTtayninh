-- Đổi mã NVL ĐN → DN trên các bảng có tồn tại.
-- An toàn: bỏ qua bảng/cột chưa tạo (không lỗi 42P01).
-- Đã chạy xong qua API: node scripts/migrate-dn-replace-dn.mjs
-- Chạy lại SQL (tùy chọn): paste vào Supabase SQL Editor hoặc
--   node scripts/run-sql-file.mjs supabase-migrate-dn-replace-dn.sql

do $$
declare
  stmt text;
begin
  -- helper: chỉ UPDATE khi table + column tồn tại
  -- Text columns
  foreach stmt in array array[
    'update public.kho_nvl set ma_npl = replace(ma_npl, ''ĐN'', ''DN'') where ma_npl like ''%ĐN%''',
    'update public.import_sp set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.phieu_xuat_nhap_kho set ma_npl = replace(ma_npl, ''ĐN'', ''DN'') where ma_npl like ''%ĐN%''',
    'update public.kiem_kho set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.kiem_kho_tong_hop set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bao_cao_hang_hong set ma_vat_tu = replace(ma_vat_tu, ''ĐN'', ''DN'') where ma_vat_tu like ''%ĐN%''',
    'update public.ma_qr_nvl set ma_npl_goc = replace(coalesce(ma_npl_goc, ''''), ''ĐN'', ''DN''), ma_qr = replace(coalesce(ma_qr, ''''), ''ĐN'', ''DN'') where coalesce(ma_npl_goc, '''') like ''%ĐN%'' or coalesce(ma_qr, '''') like ''%ĐN%''',
    'update public.bao_cao_san_luong set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bao_cao_san_luong_nvl_dinh_muc set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bao_cao_tieu_hao_nguyen_vat_lieu set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bao_cao_du_lieu_ton_dau_ca set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.du_lieu_xuat_kho set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.du_lieu_trong_bao_cao_hang_loi_hong set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.du_lieu_trong_bao_cao_kiem_ton_cuoi_ca set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bang_tron_vat_tu_dinh_muc set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%''',
    'update public.bao_cao_thanh_pham_dat_nhap_kho set ma_nvl = replace(ma_nvl, ''ĐN'', ''DN'') where ma_nvl like ''%ĐN%'''
  ]
  loop
    begin
      execute stmt;
    exception
      when undefined_table then
        raise notice 'skip missing table: %', stmt;
      when undefined_column then
        raise notice 'skip missing column: %', stmt;
    end;
  end loop;

  -- JSONB
  foreach stmt in array array[
    'update public.san_pham set npl_phan_tram = replace(npl_phan_tram::text, ''ĐN'', ''DN'')::jsonb where npl_phan_tram::text like ''%ĐN%''',
    'update public.bao_cao_may_nvl_ton set chi_tiet = replace(chi_tiet::text, ''ĐN'', ''DN'')::jsonb where chi_tiet::text like ''%ĐN%''',
    'update public.bao_cao_phoi_tron set chi_tiet = replace(chi_tiet::text, ''ĐN'', ''DN'')::jsonb where chi_tiet::text like ''%ĐN%''',
    'update public.bang_tron_vat_tu_dinh_muc set chi_tiet = replace(chi_tiet::text, ''ĐN'', ''DN'')::jsonb where chi_tiet::text like ''%ĐN%''',
    'update public.danh_sach_may set ty_le_tron = replace(ty_le_tron::text, ''ĐN'', ''DN'')::jsonb where ty_le_tron::text like ''%ĐN%''',
    'update public.bb_bao_cao_tinh_toan set payload = replace(payload::text, ''ĐN'', ''DN'')::jsonb where payload::text like ''%ĐN%''',
    'update public.phieu_tron_thuc_te set chi_tiet = replace(chi_tiet::text, ''ĐN'', ''DN'')::jsonb where chi_tiet::text like ''%ĐN%''',
    'update public.bc_lsx set dinh_muc_nvl = replace(dinh_muc_nvl::text, ''ĐN'', ''DN'')::jsonb where dinh_muc_nvl::text like ''%ĐN%''',
    'update public.bao_cao_tong_hop set payload = replace(payload::text, ''ĐN'', ''DN'')::jsonb where payload::text like ''%ĐN%'''
  ]
  loop
    begin
      execute stmt;
    exception
      when undefined_table then
        raise notice 'skip missing table: %', stmt;
      when undefined_column then
        raise notice 'skip missing column: %', stmt;
    end;
  end loop;
end $$;
