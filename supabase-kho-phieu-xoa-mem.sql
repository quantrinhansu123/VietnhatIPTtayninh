-- Xóa mềm phiếu đã chốt: giữ header + dòng, chỉ đánh dấu da_xoa và id tài khoản người xóa.
alter table public.phieu_nhap add column if not exists da_xoa boolean not null default false;
alter table public.phieu_nhap add column if not exists nguoi_xoa_id text;
alter table public.phieu_xuat add column if not exists da_xoa boolean not null default false;
alter table public.phieu_xuat add column if not exists nguoi_xoa_id text;
