-- Chạy trong Supabase SQL Editor.
-- Bổ sung căn cứ báo cáo nguồn cho từng dòng phiếu xuất/nhập kho.

begin;

alter table public.phieu_xuat_nhap_kho
  add column if not exists can_cu_bao_cao text;

comment on column public.phieu_xuat_nhap_kho.can_cu_bao_cao is
  'Mã/số báo cáo nguồn dùng làm căn cứ lập phiếu xuất nhập kho.';

commit;

-- Yêu cầu PostgREST cập nhật ngay schema cache sau khi thêm cột.
notify pgrst, 'reload schema';
