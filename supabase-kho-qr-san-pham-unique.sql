-- Chay mot lan tren DB kho hien tai truoc khi cap nhat app.
alter table public.nhap_kho add column if not exists ma_sp_quet text;
alter table public.xuat_kho add column if not exists ma_sp_quet text;

do $$
begin
  if exists (
    select 1
    from public.nhap_kho
    where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> ''
    group by ma_sp_quet
    having count(*) > 1
  ) then
    raise exception 'nhap_kho dang co ma QR thanh pham bi trung; hay xu ly cac dong trung truoc khi tao unique index.';
  end if;

  if exists (
    select 1
    from public.xuat_kho
    where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> ''
    group by ma_sp_quet
    having count(*) > 1
  ) then
    raise exception 'xuat_kho dang co ma QR thanh pham bi trung; hay xu ly cac dong trung truoc khi tao unique index.';
  end if;
end $$;

create unique index if not exists uq_nhap_kho_qr_san_pham
  on public.nhap_kho (ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';

create unique index if not exists uq_xuat_kho_qr_san_pham
  on public.xuat_kho (ma_sp_quet)
  where loai = 'san_pham' and ma_sp_quet is not null and ma_sp_quet <> '';
