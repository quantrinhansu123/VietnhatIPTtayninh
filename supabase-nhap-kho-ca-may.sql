-- Cot theo dong nhap_kho: may, ca, ngay, nguoi thao tac, trang thai.
-- Chay tren DB kho (project SUPABASE_KHO_*).
alter table public.nhap_kho add column if not exists ca text;
alter table public.nhap_kho add column if not exists may text;
alter table public.nhap_kho add column if not exists ngay date;
alter table public.nhap_kho add column if not exists nguoi_thao_tac text;
alter table public.nhap_kho add column if not exists trang_thai text not null default 'Đang chờ';

comment on column public.nhap_kho.ca is 'Ca san xuat cua dong nhap.';
comment on column public.nhap_kho.may is 'May san xuat cua dong nhap.';
comment on column public.nhap_kho.ngay is 'Ngay phieu cua dong nhap.';
comment on column public.nhap_kho.nguoi_thao_tac is 'Nguoi thao tac khi ghi dong nhap.';
comment on column public.nhap_kho.trang_thai is 'Trang thai dong nhap. Mac dinh Dang cho, giong luc quet QR chua chot phieu.';
