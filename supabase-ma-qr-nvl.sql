-- QR NVL duoc cap tu phieu nhap kho NVL.
-- Chay file nay tren Supabase truoc khi nhap kho NVL co sinh tem QR.

create table if not exists public.ma_qr_nvl (
  id uuid primary key default gen_random_uuid(),
  ma_qr text not null,
  ma_npl_goc text not null,
  ten_npl text not null,
  ten_kho text,
  ma_phieu_nhap text,
  so_lan_in integer not null default 0 check (so_lan_in >= 0),
  ngay_in_gan_nhat timestamptz,
  nguoi_tao text,
  trang_thai text not null default 'dang_dung' check (trang_thai in ('dang_dung', 'da_huy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ma_qr_nvl_ma_qr_key unique (ma_qr)
);

create index if not exists ma_qr_nvl_ma_npl_idx
  on public.ma_qr_nvl (ma_npl_goc, created_at desc);
create index if not exists ma_qr_nvl_ma_phieu_idx
  on public.ma_qr_nvl (ma_phieu_nhap, created_at asc);

alter table public.ma_qr_nvl enable row level security;
drop policy if exists "ma_qr_nvl_select_all" on public.ma_qr_nvl;
create policy "ma_qr_nvl_select_all" on public.ma_qr_nvl for select using (true);
drop policy if exists "ma_qr_nvl_insert_all" on public.ma_qr_nvl;
create policy "ma_qr_nvl_insert_all" on public.ma_qr_nvl for insert with check (true);
drop policy if exists "ma_qr_nvl_update_all" on public.ma_qr_nvl;
create policy "ma_qr_nvl_update_all" on public.ma_qr_nvl for update using (true) with check (true);
grant select, insert, update, delete on public.ma_qr_nvl to anon, authenticated, service_role;

-- Moi don vi nhap kho co mot ma: ma NVL + hau to 11 ky tu.
-- Tao ma trong DB de UNIQUE(ma_qr) van an toan khi nhieu nguoi cap QR dong thoi.
create or replace function public.cap_ma_qr_nvl_tu_phieu(
  p_items jsonb,
  p_ten_kho text default null,
  p_ma_phieu_nhap text default null,
  p_nguoi_tao text default null
)
returns table (
  id uuid,
  ma_qr text,
  ma_npl_goc text,
  ten_npl text,
  ten_kho text,
  ma_phieu_nhap text
)
language plpgsql
as $$
declare
  v_item record;
  v_suffix text;
  v_code text;
  v_inserted public.ma_qr_nvl%rowtype;
  v_total integer := 0;
  v_try integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'QR_ITEMS_REQUIRED';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(ma_npl_goc text, ten_npl text, so_luong integer)
  loop
    if nullif(trim(v_item.ma_npl_goc), '') is null
      or coalesce(v_item.so_luong, 0) < 1
      or v_item.so_luong > 999 then
      raise exception 'INVALID_QR_QUANTITY';
    end if;
    v_total := v_total + v_item.so_luong;
    if v_total > 999 then raise exception 'QR_BATCH_TOO_LARGE'; end if;

    for v_try in 1..v_item.so_luong loop
      loop
        v_suffix := '';
        while length(v_suffix) < 11 loop
          v_suffix := v_suffix || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::integer + 1, 1);
        end loop;
        if v_suffix !~ '[A-Z]' or v_suffix !~ '[0-9]' then continue; end if;
        v_code := trim(v_item.ma_npl_goc) || '_' || v_suffix;
        begin
          insert into public.ma_qr_nvl (
            ma_qr, ma_npl_goc, ten_npl, ten_kho, ma_phieu_nhap, nguoi_tao
          ) values (
            v_code,
            trim(v_item.ma_npl_goc),
            coalesce(nullif(trim(v_item.ten_npl), ''), trim(v_item.ma_npl_goc)),
            nullif(trim(p_ten_kho), ''),
            nullif(trim(p_ma_phieu_nhap), ''),
            nullif(trim(p_nguoi_tao), '')
          ) returning * into v_inserted;
          exit;
        exception when unique_violation then
          -- Ma trung hiem khi xay ra se duoc sinh lai.
        end;
      end loop;

      id := v_inserted.id;
      ma_qr := v_inserted.ma_qr;
      ma_npl_goc := v_inserted.ma_npl_goc;
      ten_npl := v_inserted.ten_npl;
      ten_kho := v_inserted.ten_kho;
      ma_phieu_nhap := v_inserted.ma_phieu_nhap;
      return next;
    end loop;
  end loop;
end;
$$;

create or replace function public.danh_dau_in_ma_qr_nvl(p_codes jsonb)
returns integer
language plpgsql
as $$
declare
  v_updated integer;
begin
  if jsonb_typeof(p_codes) <> 'array' then raise exception 'INVALID_QR_CODES'; end if;
  update public.ma_qr_nvl
  set so_lan_in = so_lan_in + 1, ngay_in_gan_nhat = now(), updated_at = now()
  where ma_qr in (select jsonb_array_elements_text(p_codes));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.cap_ma_qr_nvl_tu_phieu(jsonb, text, text, text) to anon, authenticated, service_role;
grant execute on function public.danh_dau_in_ma_qr_nvl(jsonb) to anon, authenticated, service_role;
