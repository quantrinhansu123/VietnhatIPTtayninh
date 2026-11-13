-- Ghi chu rieng tung dong, tach khoi ghi chu chung cua phieu.
alter table public.nhap_kho add column if not exists ghi_chu_dong text;
alter table public.xuat_kho add column if not exists ghi_chu_dong text;
notify pgrst, 'reload schema';
