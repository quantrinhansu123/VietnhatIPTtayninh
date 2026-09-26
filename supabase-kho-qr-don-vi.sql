-- Luu don vi tinh theo tung dong nhap/xuat kho.
alter table public.nhap_kho add column if not exists don_vi text;
alter table public.xuat_kho add column if not exists don_vi text;

comment on column public.nhap_kho.don_vi is 'Don vi tinh cua san pham tai thoi diem nhap/xuat.';
comment on column public.xuat_kho.don_vi is 'Don vi tinh cua san pham tai thoi diem nhap/xuat.';
