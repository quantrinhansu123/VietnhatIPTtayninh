alter table public.phieu_nhap add column if not exists kho text;
alter table public.phieu_nhap add column if not exists ca text;
alter table public.phieu_nhap add column if not exists may text;
alter table public.phieu_nhap add column if not exists ghi_chu text;

alter table public.phieu_xuat add column if not exists kho text;
alter table public.phieu_xuat add column if not exists ca text;
alter table public.phieu_xuat add column if not exists may text;
alter table public.phieu_xuat add column if not exists ghi_chu text;

comment on column public.phieu_nhap.kho is 'Kho lap phieu (khong bat buoc).';
comment on column public.phieu_nhap.ca is 'Ca san xuat (khong bat buoc).';
comment on column public.phieu_nhap.may is 'May san xuat (khong bat buoc).';
comment on column public.phieu_nhap.ghi_chu is 'Ghi chu phieu (khong bat buoc).';
comment on column public.phieu_xuat.kho is 'Kho lap phieu (khong bat buoc).';
comment on column public.phieu_xuat.ca is 'Ca san xuat (khong bat buoc).';
comment on column public.phieu_xuat.may is 'May san xuat (khong bat buoc).';
comment on column public.phieu_xuat.ghi_chu is 'Ghi chu phieu (khong bat buoc).';
