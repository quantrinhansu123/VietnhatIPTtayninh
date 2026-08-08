-- RPC gộp/chốt kiểm kho — chạy trong Postgres thay vì kéo dữ liệu thô về Node.
-- Chạy an toàn trong Supabase SQL Editor (DB "kiem-kho", project grlcgkzotqishzxwpddc):
-- https://supabase.com/dashboard/project/grlcgkzotqishzxwpddc/sql/new
--
-- Yêu cầu: đã chạy supabase-kiem-kho.sql và supabase-kiem-kho-tong-hop.sql trước.

-- Gộp các dòng kiem_kho của 1 đợt theo mã NVL. Dùng cho:
--  (1) xem trước tổng hợp của đợt CHƯA chốt (chỉ đọc, không ghi gì);
--  (2) làm nguồn dữ liệu bên trong kiem_kho_chot_dot() khi chốt đợt.
create or replace function public.kiem_kho_gop_theo_ma_nvl(p_dot text)
returns table (
  ma_nvl text,
  ten_sp text,
  loai_sp text,
  tong_so_luong bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(trim(k.ma_nvl), ''), '(không xác định)') as ma_nvl,
    max(k.ten_sp) filter (where k.ten_sp is not null) as ten_sp,
    max(k.loai_sp) filter (where k.loai_sp is not null) as loai_sp,
    count(*)::bigint as tong_so_luong
  from public.kiem_kho k
  where k.dot_kiem_kho = p_dot
  group by 1;
$$;

-- Chốt đợt: set thoi_gian_xac_nhan cho mọi dòng chi tiết + gộp + upsert
-- kiem_kho_tong_hop, tất cả trong CÙNG 1 transaction / 1 round-trip DB.
-- Thay cho cách cũ: Node select(limit 20000) rồi group bằng JS rồi upsert.
create or replace function public.kiem_kho_chot_dot(p_dot text, p_nguoi text)
returns setof public.kiem_kho_tong_hop
language plpgsql
as $$
declare
  v_confirmed_at timestamptz := now();
begin
  if not exists (select 1 from public.kiem_kho where dot_kiem_kho = p_dot) then
    raise exception 'DOT_NOT_FOUND';
  end if;

  if not exists (
    select 1 from public.kiem_kho
    where dot_kiem_kho = p_dot and thoi_gian_xac_nhan is null
  ) then
    raise exception 'ALREADY_CONFIRMED';
  end if;

  update public.kiem_kho
  set thoi_gian_xac_nhan = v_confirmed_at
  where dot_kiem_kho = p_dot;

  insert into public.kiem_kho_tong_hop as t
    (dot_kiem_kho, ma_nvl, ten_sp, loai_sp, tong_so_luong, chot_luc, nguoi_chot)
  select p_dot, g.ma_nvl, g.ten_sp, g.loai_sp, g.tong_so_luong, v_confirmed_at, p_nguoi
  from public.kiem_kho_gop_theo_ma_nvl(p_dot) g
  on conflict (dot_kiem_kho, ma_nvl) do update set
    ten_sp = excluded.ten_sp,
    loai_sp = excluded.loai_sp,
    tong_so_luong = excluded.tong_so_luong,
    chot_luc = excluded.chot_luc,
    nguoi_chot = excluded.nguoi_chot;

  return query
    select * from public.kiem_kho_tong_hop where dot_kiem_kho = p_dot;
end;
$$;

grant execute on function public.kiem_kho_gop_theo_ma_nvl(text) to anon, authenticated, service_role;
grant execute on function public.kiem_kho_chot_dot(text, text) to anon, authenticated, service_role;

comment on function public.kiem_kho_gop_theo_ma_nvl(text) is
  'Gop cac dong kiem_kho cua 1 dot theo ma_nvl (GROUP BY trong Postgres). Dung cho xem truoc dot chua chot va ben trong kiem_kho_chot_dot().';
comment on function public.kiem_kho_chot_dot(text, text) is
  'Chot 1 dot kiem kho: set thoi_gian_xac_nhan + gop + upsert kiem_kho_tong_hop trong 1 transaction. Loi: DOT_NOT_FOUND, ALREADY_CONFIRMED.';
