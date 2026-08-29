-- QR được cấp từ nút "In mã QR" trong Danh mục Kho hàng hóa.
-- Chạy trên Supabase DB chính (he-thong), sau supabase-san-pham.sql.

create table if not exists public.ma_qr_hang_hoa (
  id uuid primary key default gen_random_uuid(),
  ma_qr text not null,
  ma_sp_goc text not null,
  san_pham_id uuid not null references public.san_pham(id) on delete cascade,
  ten_sp text not null,
  ten_kho text,
  so_lan_in integer not null default 0 check (so_lan_in >= 0),
  ngay_in_gan_nhat timestamptz,
  nguoi_tao text,
  trang_thai text not null default 'dang_dung' check (trang_thai in ('dang_dung', 'da_huy')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ma_qr_hang_hoa_ma_qr_key unique (ma_qr)
);

create index if not exists ma_qr_hang_hoa_san_pham_idx
  on public.ma_qr_hang_hoa (san_pham_id, created_at desc);
create index if not exists ma_qr_hang_hoa_ma_goc_idx
  on public.ma_qr_hang_hoa (ma_sp_goc);

alter table public.ma_qr_hang_hoa enable row level security;
drop policy if exists "ma_qr_hang_hoa_select_all" on public.ma_qr_hang_hoa;
create policy "ma_qr_hang_hoa_select_all" on public.ma_qr_hang_hoa for select using (true);
drop policy if exists "ma_qr_hang_hoa_insert_all" on public.ma_qr_hang_hoa;
create policy "ma_qr_hang_hoa_insert_all" on public.ma_qr_hang_hoa for insert with check (true);
drop policy if exists "ma_qr_hang_hoa_update_all" on public.ma_qr_hang_hoa;
create policy "ma_qr_hang_hoa_update_all" on public.ma_qr_hang_hoa for update using (true) with check (true);
grant select, insert, update, delete on public.ma_qr_hang_hoa to anon, authenticated, service_role;

-- Cấp QR trong DB để UNIQUE(ma_qr) chống trùng cả khi nhiều người in đồng thời.
-- Hậu tố luôn đúng 11 ký tự, có tối thiểu một chữ hoa và một số.
create or replace function public.cap_ma_qr_hang_hoa(p_items jsonb, p_nguoi_tao text default null)
returns table (id uuid, ma_qr text, ma_sp_goc text, san_pham_id uuid, ten_sp text, ten_kho text)
language plpgsql
as $$
declare
  v_item record;
  v_product public.san_pham%rowtype;
  v_suffix text;
  v_code text;
  v_inserted public.ma_qr_hang_hoa%rowtype;
  v_total integer := 0;
  v_try integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'QR_ITEMS_REQUIRED';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(san_pham_id uuid, so_luong integer)
  loop
    if v_item.san_pham_id is null or coalesce(v_item.so_luong, 0) < 1 or v_item.so_luong > 999 then
      raise exception 'INVALID_QR_QUANTITY';
    end if;
    v_total := v_total + v_item.so_luong;
    if v_total > 999 then raise exception 'QR_BATCH_TOO_LARGE'; end if;

    select * into v_product from public.san_pham where san_pham.id = v_item.san_pham_id;
    if not found or coalesce(trim(v_product.ma_sp), '') = '' then
      raise exception 'PRODUCT_NOT_FOUND';
    end if;

    for v_try in 1..v_item.so_luong loop
      loop
        v_suffix := '';
        while length(v_suffix) < 11 loop
          v_suffix := v_suffix || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', floor(random() * 36)::integer + 1, 1);
        end loop;
        if v_suffix !~ '[A-Z]' or v_suffix !~ '[0-9]' then continue; end if;
        v_code := trim(v_product.ma_sp) || '_' || v_suffix;
        begin
          insert into public.ma_qr_hang_hoa (
            ma_qr, ma_sp_goc, san_pham_id, ten_sp, ten_kho, nguoi_tao
          ) values (
            v_code, trim(v_product.ma_sp), v_product.id, coalesce(v_product.ten_sp, ''), v_product.ten_kho, nullif(trim(p_nguoi_tao), '')
          ) returning * into v_inserted;
          exit;
        exception when unique_violation then
          -- Một phiên khác vừa giữ mã này; sinh lại và thử tiếp.
        end;
      end loop;
      id := v_inserted.id;
      ma_qr := v_inserted.ma_qr;
      ma_sp_goc := v_inserted.ma_sp_goc;
      san_pham_id := v_inserted.san_pham_id;
      ten_sp := v_inserted.ten_sp;
      ten_kho := v_inserted.ten_kho;
      return next;
    end loop;
  end loop;
end;
$$;

create or replace function public.danh_dau_in_ma_qr_hang_hoa(p_codes jsonb)
returns integer
language plpgsql
as $$
declare v_updated integer;
begin
  if jsonb_typeof(p_codes) <> 'array' then raise exception 'INVALID_QR_CODES'; end if;
  update public.ma_qr_hang_hoa
  set so_lan_in = so_lan_in + 1, ngay_in_gan_nhat = now(), updated_at = now()
  where ma_qr in (select jsonb_array_elements_text(p_codes));
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.cap_ma_qr_hang_hoa(jsonb, text) to anon, authenticated, service_role;
grant execute on function public.danh_dau_in_ma_qr_hang_hoa(jsonb) to anon, authenticated, service_role;
