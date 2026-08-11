-- Đơn vị số lượng trên báo cáo hàng hỏng (Trạng thái VT + ĐVT + SL)
alter table public.bao_cao_hang_hong
  add column if not exists don_vi_vat_tu text;

comment on column public.bao_cao_hang_hong.don_vi_vat_tu is 'Don vi so luong: kg, cai, ...';
comment on column public.bao_cao_hang_hong.loai_hang_hong is 'Trang thai vat tu: nhua_khong_mang, nhua_dau_nong, nhua_dinh_mang, kl_mang, tl_loi_dinh_hh, vat_tu_khac (cu: nhua).';
comment on column public.bao_cao_hang_hong.so_luong_vat_tu is 'So luong theo don vi da chon.';
