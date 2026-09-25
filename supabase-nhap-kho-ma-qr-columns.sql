-- Add scanned product code fields to an existing warehouse inbound detail table.
alter table public.nhap_kho add column if not exists ma_sp_quet text;
alter table public.nhap_kho add column if not exists ten_sp text;

comment on column public.nhap_kho.ma_sp_quet is 'Ma QR day du da quet, gom ca tien to va hau to.';
comment on column public.nhap_kho.ten_sp is 'Ten san pham duoc quet.';
