drop index if exists public.uq_nhap_kho_qr_san_pham;
drop index if exists public.uq_xuat_kho_qr_san_pham;

create index if not exists idx_nhap_kho_qr_san_pham
  on public.nhap_kho (ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';

create index if not exists idx_xuat_kho_qr_san_pham
  on public.xuat_kho (ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';
