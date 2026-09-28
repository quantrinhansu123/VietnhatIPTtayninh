-- Báo cáo hàng hỏng chỉ chờ thủ kho kiểm tra và lưu phiếu nhập.
-- Dữ liệu phiếu được lưu vào phieu_nhap/nhap_kho; không dùng trigger ghi kho tự động.

insert into public.quan_ly_kho (ten_kho, vi_tri, ten_vi_tri)
select 'Kho hàng hỏng', 'KHH', 'Khu vực hàng hỏng'
where not exists (
  select 1 from public.quan_ly_kho
  where lower(trim(ten_kho)) = lower('Kho hàng hỏng')
);

drop trigger if exists bao_cao_hang_hong_tu_dong_nhap_kho on public.bao_cao_hang_hong;
drop function if exists public.dong_bo_bao_cao_hang_hong_vao_kho();
