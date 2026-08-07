-- Đã bỏ tính năng "Đồng bộ tồn đầu" (cộng số liệu kiểm kho vào san_pham.ton_dau_ky).
-- File này trước đây tạo bảng so cái + hàm RPC cho tính năng đó; nay dùng để dọn dẹp.
-- Chạy an toàn trong Supabase SQL Editor của DB CHÍNH:
-- https://supabase.com/dashboard/project/<project-id>/sql/new

drop function if exists public.dong_bo_kiem_kho_ton_dau(text, text, numeric);
drop table if exists public.kiem_kho_dong_bo_ton_dau;
