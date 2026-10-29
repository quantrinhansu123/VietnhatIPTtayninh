-- Don gia mua gan nhat tren danh muc kho_nvl (khop tu Excel / dung cho goi y gia phieu).
alter table public.kho_nvl
  add column if not exists don_gia numeric;

comment on column public.kho_nvl.don_gia is 'Don gia mua gan nhat (VND / DVT).';
