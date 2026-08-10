-- Chạy lại an toàn trong Supabase SQL Editor.
-- Bổ sung các trường quản lý khách hàng: công nợ, mã số thuế/CCCD, ĐT di động NLH,
-- đối tượng nội bộ và đơn vị quản lý.

alter table public.khach_hang
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists cong_no numeric(18,2) not null default 0,
  add column if not exists ma_so_thue text,
  add column if not exists dt_di_dong_nlh text,
  add column if not exists la_doi_tuong_noi_bo boolean not null default false,
  add column if not exists don_vi_quan_ly text,
  add column if not exists ghi_chu text;

create index if not exists khach_hang_created_at_idx
  on public.khach_hang (created_at desc);

comment on column public.khach_hang.cong_no is 'Công nợ hiện tại của khách hàng.';
comment on column public.khach_hang.ma_so_thue is 'Mã số thuế hoặc CCCD chủ hộ.';
comment on column public.khach_hang.dt_di_dong_nlh is 'Điện thoại di động của người liên hệ.';
comment on column public.khach_hang.la_doi_tuong_noi_bo is 'Khách hàng có phải đối tượng nội bộ hay không.';
comment on column public.khach_hang.don_vi_quan_ly is 'Đơn vị/chi nhánh quản lý khách hàng.';
comment on column public.khach_hang.ghi_chu is 'Ghi chú bổ sung về khách hàng.';


alter table public.khach_hang
  add column if not exists dia_chi_moi text;

comment on column public.khach_hang.dia_chi_moi
  is 'Địa chỉ mới của khách hàng; dia_chi lưu địa chỉ cũ.';
