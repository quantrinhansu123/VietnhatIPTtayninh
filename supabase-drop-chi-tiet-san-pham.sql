-- Tồn kho thành phẩm tính từ nhap_kho/xuat_kho/phieu_nhap/phieu_xuat (RPC ton_kho_san_pham_gop).
-- Chạy trên DB chính SAU KHI deploy code mới.
drop function if exists public.sync_chi_tiet_san_pham(text, text, date, text, text, jsonb, boolean);
drop table if exists public.bien_dong_chi_tiet_san_pham;
drop table if exists public.chi_tiet_san_pham;
