-- Run in the main Supabase project (bfnsopyvgvhaegqijpum), after
-- supabase-bien-dong-chi-tiet-san-pham.sql.
-- One RPC transaction writes movement history and the current QR snapshot;
-- p_la_dieu_chinh separates inventory correction slips from ordinary in/out.
drop function if exists public.sync_chi_tiet_san_pham(text, jsonb);
drop function if exists public.sync_chi_tiet_san_pham(text, text, date, text, text, jsonb);

create or replace function public.sync_chi_tiet_san_pham(
  p_loai_phieu text,
  p_ma_phieu text,
  p_ngay_phieu date,
  p_kho text,
  p_ca text,
  p_items jsonb,
  p_la_dieu_chinh boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected_rows integer;
  unavailable_qrs text;
begin
  if p_loai_phieu is null or p_loai_phieu not in ('nhap', 'xuat') then
    raise exception 'loai_phieu chi nhan nhap hoac xuat' using errcode = '22023';
  end if;
  if nullif(btrim(p_ma_phieu), '') is null or p_ngay_phieu is null or nullif(btrim(p_kho), '') is null then
    raise exception 'Phieu can ma_phieu, ngay_phieu va kho' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'p_items phai la mang JSON' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
    where nullif(btrim(item.ma_sp_goc), '') is null
       or nullif(btrim(item.ma_sp_qr), '') is null
  ) then
    raise exception 'Moi ma QR can ma_sp_goc va ma_sp_qr' using errcode = '22023';
  end if;

  if p_loai_phieu = 'xuat' then
    -- Khóa các QR hiện có để hai phiếu xuất đồng thời không cùng lấy một mã.
    perform 1
    from public.chi_tiet_san_pham as detail
    where detail.ma_sp_qr in (
      select distinct btrim(item.ma_sp_qr)
      from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
    )
    for update;

    select string_agg(qr.ma_sp_qr, ', ' order by qr.ma_sp_qr)
      into unavailable_qrs
    from (
      select distinct btrim(item.ma_sp_qr) as ma_sp_qr
      from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
    ) as qr
    left join public.chi_tiet_san_pham as detail on detail.ma_sp_qr = qr.ma_sp_qr
    where detail.ma_sp_qr is null
       or detail.trang_thai is distinct from 'trong_kho';

    if unavailable_qrs is not null then
      raise exception 'Ma QR chua nhap kho hoac khong con ton: %', unavailable_qrs
        using errcode = '23514';
    end if;
  end if;

  insert into public.bien_dong_chi_tiet_san_pham (
    ma_sp_goc, ma_sp_qr, loai_bien_dong, ma_phieu, ngay_phieu, kho, ca, la_dieu_chinh
  )
  select distinct on (btrim(item.ma_sp_qr))
    btrim(item.ma_sp_goc),
    btrim(item.ma_sp_qr),
    p_loai_phieu,
    btrim(p_ma_phieu),
    p_ngay_phieu,
    btrim(p_kho),
    nullif(btrim(p_ca), ''),
    p_la_dieu_chinh
  from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
  order by btrim(item.ma_sp_qr)
  on conflict (loai_bien_dong, ma_phieu, ma_sp_qr) where ma_phieu is not null
  do update set
    ma_sp_goc = excluded.ma_sp_goc,
    ngay_phieu = excluded.ngay_phieu,
    kho = excluded.kho,
    ca = excluded.ca,
    la_dieu_chinh = excluded.la_dieu_chinh;

  if p_loai_phieu = 'nhap' then
    insert into public.chi_tiet_san_pham (ma_sp_goc, ma_sp_qr, kho, trang_thai, so_luong)
    select distinct on (btrim(item.ma_sp_qr))
      btrim(item.ma_sp_goc), btrim(item.ma_sp_qr), btrim(p_kho), 'trong_kho', 1
    from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
    order by btrim(item.ma_sp_qr)
    on conflict (ma_sp_qr) do update
      set ma_sp_goc = excluded.ma_sp_goc,
          kho = excluded.kho,
          trang_thai = 'trong_kho',
          so_luong = 1,
          updated_at = now()
      where p_la_dieu_chinh is true;
  else
    insert into public.chi_tiet_san_pham (ma_sp_goc, ma_sp_qr, kho, trang_thai, so_luong)
    select distinct on (btrim(item.ma_sp_qr))
      btrim(item.ma_sp_goc), btrim(item.ma_sp_qr), btrim(p_kho), 'da_xuat', 1
    from jsonb_to_recordset(p_items) as item(ma_sp_goc text, ma_sp_qr text)
    order by btrim(item.ma_sp_qr)
    on conflict (ma_sp_qr) do update
      set trang_thai = 'da_xuat', updated_at = now()
      where chi_tiet_san_pham.trang_thai is distinct from 'da_xuat';
  end if;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.sync_chi_tiet_san_pham(text, text, date, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.sync_chi_tiet_san_pham(text, text, date, text, text, jsonb, boolean) to service_role;
notify pgrst, 'reload schema';
