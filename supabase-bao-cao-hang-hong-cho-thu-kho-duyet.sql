-- Quy trình báo cáo hàng hỏng chờ thủ kho kiểm tra.
-- Báo cáo mới KHÔNG tự động tăng tồn kho. Tồn kho chỉ tăng khi thủ kho lưu phiếu nhập.

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

-- Tắt cơ chế cũ ghi thẳng báo cáo vào kho.
drop trigger if exists bao_cao_hang_hong_tu_dong_nhap_kho on public.bao_cao_hang_hong;
drop function if exists public.dong_bo_bao_cao_hang_hong_vao_kho();

-- Không xóa các phiếu kho đã phát sinh trước đây để giữ nguyên lịch sử/tồn kho hiện tại.
comment on column public.phieu_xuat_nhap_kho.id_bao_cao_hang_hong is
  'ID dòng báo cáo hàng hỏng nguồn; chỉ được gắn khi thủ kho kiểm tra và lưu phiếu nhập kho.';
