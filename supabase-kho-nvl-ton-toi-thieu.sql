-- Chay trong Supabase SQL Editor (DB he thong)
-- Them cot ton toi thieu cho kho_nvl (san_pham da co so_luong_ton_toi_thieu) de trang Kiem soat ton canh bao.

alter table public.kho_nvl
  add column if not exists so_luong_ton_toi_thieu numeric;

comment on column public.kho_nvl.so_luong_ton_toi_thieu is 'Nguong ton toi thieu. Ton cuoi < nguong thi canh bao tren trang Kiem soat ton.';
