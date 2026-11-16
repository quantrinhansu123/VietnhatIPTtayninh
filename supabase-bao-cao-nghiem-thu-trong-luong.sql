-- Lưu đầy đủ trọng lượng sản lượng trên DB chính. Không sửa trọng lượng tổng / số lượng.
begin;
alter table public.bao_cao_nghiem_thu
  add column if not exists trong_luong_loi numeric,
  add column if not exists trong_luong_bi numeric,
  add column if not exists trong_luong_mang numeric,
  add column if not exists trong_luong_nhua numeric,
  add column if not exists so_lan_can integer,
  add column if not exists trong_luong_dong_bo_luc timestamptz;
comment on column public.bao_cao_nghiem_thu.trong_luong_nhua is 'Snapshot nhựa thực tế: tổng Cân SP - lõi - bì - màng; null khi thiếu cân.';
comment on column public.bao_cao_nghiem_thu.trong_luong_mang is 'Snapshot tổng màng BOM theo các lần cân; 0 khi sản phẩm không có màng.';
notify pgrst, 'reload schema';
commit;
