-- Cơ chế trigger tự ghi phiếu đã được thay bằng thao tác kiểm tra/lưu trên UI.
-- Chạy file này nếu cần dọn trigger cũ còn sót từ phiên bản trước.
drop trigger if exists bao_cao_hang_hong_tu_dong_nhap_kho on public.bao_cao_hang_hong;
drop function if exists public.dong_bo_bao_cao_hang_hong_vao_kho();
