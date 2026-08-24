-- Xóa hết Thành phần NVL trên tất cả sản phẩm (cột san_pham.npl_phan_tram).
-- Chạy trên Supabase SQL Editor, rồi nhập lại từ UI / Excel.

-- Xem trước: bao nhiêu SP đang có thành phần
-- select count(*) as sp_co_thanh_phan
-- from public.san_pham
-- where coalesce(jsonb_array_length(npl_phan_tram), 0) > 0;

update public.san_pham
set npl_phan_tram = '[]'::jsonb
where npl_phan_tram is distinct from '[]'::jsonb;

-- Kiểm tra sau khi chạy (phải = 0)
-- select count(*) as sp_con_thanh_phan
-- from public.san_pham
-- where coalesce(jsonb_array_length(npl_phan_tram), 0) > 0;
