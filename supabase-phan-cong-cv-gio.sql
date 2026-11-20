begin;

alter table public.phan_cong_cv add column if not exists gio time;

create or replace function public.phan_cong_cv_replace(
  p_ngay date,
  p_ca text,
  p_items jsonb
)
returns setof public.phan_cong_cv
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ngay is null or p_ca is null or btrim(p_ca) = ''
    or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Thiếu ngày, ca hoặc danh sách phân công.';
  end if;

  perform pg_advisory_xact_lock(hashtext('phan_cong_cv'), hashtext(p_ngay::text || '|' || p_ca));

  delete from public.phan_cong_cv where ngay = p_ngay and ca = p_ca;

  return query
    insert into public.phan_cong_cv (ngay, ca, gio, nhan_su_phu_trach, cong_viec, thanh_pham, "dm_thanh_pham_TT", ghi_chu)
    select p_ngay, p_ca, item.gio, item.nhan_su_phu_trach, item.cong_viec, item.thanh_pham, item."dm_thanh_pham_TT", item.ghi_chu
    from jsonb_populate_recordset(null::public.phan_cong_cv, p_items) as item
    returning *;
end;
$$;

revoke execute on function public.phan_cong_cv_replace(date, text, jsonb) from public;
grant execute on function public.phan_cong_cv_replace(date, text, jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';

commit;
