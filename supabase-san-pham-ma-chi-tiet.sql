-- Quản lý từng mã QR/serial của thành phẩm và tạo tồn kho khởi tạo theo từng mã.
-- Chạy trong Supabase DB chính (he-thong) sau các migration san_pham và phieu_xuat_nhap_kho.

-- Một số DB cũ đã có cột san_pham.id nhưng cột này chưa phải PK/UNIQUE.
-- Chuẩn hóa id trước khi tạo khóa ngoại từ bảng mã chi tiết.
alter table public.san_pham
  add column if not exists id uuid default gen_random_uuid();

alter table public.san_pham
  alter column id set default gen_random_uuid();

update public.san_pham
set id = gen_random_uuid()
where id is null;

-- Phòng trường hợp dữ liệu cũ từng bị trùng UUID: giữ dòng đầu, cấp UUID mới cho các dòng sau.
with duplicated_ids as (
  select ctid,
         row_number() over (partition by id order by ctid) as duplicate_order
  from public.san_pham
)
update public.san_pham as product
set id = gen_random_uuid()
from duplicated_ids
where product.ctid = duplicated_ids.ctid
  and duplicated_ids.duplicate_order > 1;

alter table public.san_pham
  alter column id set not null;

create unique index if not exists san_pham_id_unique_idx
  on public.san_pham (id);

create table if not exists public.ma_san_pham_chi_tiet (
  id uuid primary key default gen_random_uuid(),
  san_pham_id uuid not null references public.san_pham(id) on delete restrict,
  ma_sp_goc text not null,
  ma_sp_day_du text not null,
  ten_kho text,
  trang_thai text not null default 'trong_kho',
  dot_tao text,
  so_lan_in integer not null default 0,
  ngay_in_gan_nhat timestamptz,
  ma_phieu_nhap text,
  ma_phieu_xuat text,
  nguoi_tao text,
  ghi_chu text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ma_san_pham_chi_tiet_ma_day_du_key unique (ma_sp_day_du),
  constraint ma_san_pham_chi_tiet_trang_thai_check check (
    trang_thai in ('trong_kho', 'da_xuat', 'that_lac', 'da_huy')
  )
);

create index if not exists ma_san_pham_chi_tiet_san_pham_idx
  on public.ma_san_pham_chi_tiet (san_pham_id, created_at);
create index if not exists ma_san_pham_chi_tiet_ma_goc_idx
  on public.ma_san_pham_chi_tiet (ma_sp_goc);
create index if not exists ma_san_pham_chi_tiet_kho_trang_thai_idx
  on public.ma_san_pham_chi_tiet (ten_kho, trang_thai);

alter table public.ma_san_pham_chi_tiet enable row level security;

drop policy if exists "ma_san_pham_chi_tiet_select_all" on public.ma_san_pham_chi_tiet;
create policy "ma_san_pham_chi_tiet_select_all"
  on public.ma_san_pham_chi_tiet for select using (true);
drop policy if exists "ma_san_pham_chi_tiet_insert_all" on public.ma_san_pham_chi_tiet;
create policy "ma_san_pham_chi_tiet_insert_all"
  on public.ma_san_pham_chi_tiet for insert with check (true);
drop policy if exists "ma_san_pham_chi_tiet_update_all" on public.ma_san_pham_chi_tiet;
create policy "ma_san_pham_chi_tiet_update_all"
  on public.ma_san_pham_chi_tiet for update using (true) with check (true);

grant select, insert, update on table public.ma_san_pham_chi_tiet to anon, authenticated, service_role;

-- Một transaction: tạo danh mục sản phẩm, đăng ký các mã chi tiết và ghi phiếu nhập khởi tạo.
create or replace function public.tao_san_pham_voi_ma_chi_tiet(
  p_san_pham jsonb,
  p_ma_chi_tiet jsonb,
  p_ma_phieu text,
  p_ngay_phieu date default current_date,
  p_nguoi_tao text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_input public.san_pham%rowtype;
  v_product public.san_pham%rowtype;
  v_code text;
  v_count integer;
begin
  if jsonb_typeof(p_ma_chi_tiet) <> 'array' then
    raise exception 'INVALID_PRODUCT_CODES';
  end if;

  v_count := jsonb_array_length(p_ma_chi_tiet);
  if v_count < 1 or v_count > 999 then
    raise exception 'INVALID_INITIAL_QUANTITY';
  end if;

  v_input := jsonb_populate_record(null::public.san_pham, p_san_pham);
  if coalesce(trim(v_input.ma_sp), '') = '' then
    raise exception 'PRODUCT_CODE_REQUIRED';
  end if;

  insert into public.san_pham (
    ma_sp, ma_sp_moi, ma_amis, ten_sp, tinh_chat, nhom_vthh, don_vi, ten_kho,
    tong_trong_luong, kho_cuon, chieu_dai_cuon, trong_luong_loi, trong_luong_tui,
    trong_luong_nhua, ton_dau_ky, nhap_trong_ky, xuat_trong_ky, sl_ton,
    so_luong_ton_toi_thieu, nguon_goc, mo_ta, npl_phan_tram
  ) values (
    v_input.ma_sp, v_input.ma_sp_moi, v_input.ma_amis, v_input.ten_sp,
    v_input.tinh_chat, v_input.nhom_vthh, v_input.don_vi, v_input.ten_kho,
    v_input.tong_trong_luong, v_input.kho_cuon, v_input.chieu_dai_cuon,
    v_input.trong_luong_loi, v_input.trong_luong_tui, v_input.trong_luong_nhua,
    0, 0, 0, 0, v_input.so_luong_ton_toi_thieu, v_input.nguon_goc,
    v_input.mo_ta, coalesce(v_input.npl_phan_tram, '[]'::jsonb)
  ) returning * into v_product;

  for v_code in select jsonb_array_elements_text(p_ma_chi_tiet)
  loop
    insert into public.ma_san_pham_chi_tiet (
      san_pham_id, ma_sp_goc, ma_sp_day_du, ten_kho, trang_thai,
      dot_tao, ma_phieu_nhap, nguoi_tao
    ) values (
      v_product.id, v_product.ma_sp, v_code, v_product.ten_kho, 'trong_kho',
      p_ma_phieu, p_ma_phieu, p_nguoi_tao
    );

    insert into public.phieu_xuat_nhap_kho (
      ma_phieu, loai_phieu, ngay_phieu, ma_sp, ten_sp, don_vi, so_luong,
      ly_do, ghi_chu, nguoi_lap, loai_kho, ten_kho
    ) values (
      p_ma_phieu, 'nhap', coalesce(p_ngay_phieu, current_date), v_code,
      v_product.ten_sp, v_product.don_vi, 1,
      'Nhập kho khởi tạo khi thêm sản phẩm', 'Tạo tự động theo mã QR chi tiết',
      p_nguoi_tao, 'san_pham', v_product.ten_kho
    );
  end loop;

  return jsonb_build_object(
    'product', to_jsonb(v_product),
    'codes', p_ma_chi_tiet,
    'ma_phieu', p_ma_phieu,
    'quantity', v_count
  );
end;
$$;

grant execute on function public.tao_san_pham_voi_ma_chi_tiet(jsonb, jsonb, text, date, text)
  to anon, authenticated, service_role;

create or replace function public.danh_dau_in_ma_san_pham(p_codes jsonb)
returns integer
language plpgsql
as $$
declare
  v_updated integer;
begin
  if jsonb_typeof(p_codes) <> 'array' then
    raise exception 'INVALID_PRODUCT_CODES';
  end if;

  update public.ma_san_pham_chi_tiet
  set so_lan_in = so_lan_in + 1,
      ngay_in_gan_nhat = now(),
      updated_at = now()
  where ma_sp_day_du in (select jsonb_array_elements_text(p_codes));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.danh_dau_in_ma_san_pham(jsonb)
  to anon, authenticated, service_role;

comment on table public.ma_san_pham_chi_tiet is
  'Mỗi dòng là một mã QR/serial đầy đủ của một sản phẩm gốc.';
comment on function public.tao_san_pham_voi_ma_chi_tiet(jsonb, jsonb, text, date, text) is
  'Tạo sản phẩm + mã QR chi tiết + phiếu nhập khởi tạo trong cùng transaction.';
comment on function public.danh_dau_in_ma_san_pham(jsonb) is
  'Tăng số lần in và lưu thời điểm mở lệnh in cho các mã QR chi tiết.';
