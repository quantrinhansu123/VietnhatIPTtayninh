-- Xóa sản phẩm + mã chi tiết chắc chắn (bypass RLS).
-- Chạy toàn bộ file này trên Supabase SQL Editor, rồi restart server.

-- 1) Quyền + policy DELETE trên mã chi tiết
grant select, insert, update, delete on table public.ma_san_pham_chi_tiet to anon, authenticated, service_role;

drop policy if exists "ma_san_pham_chi_tiet_delete_all" on public.ma_san_pham_chi_tiet;
create policy "ma_san_pham_chi_tiet_delete_all"
  on public.ma_san_pham_chi_tiet for delete using (true);

-- 2) Đổi FK: xóa SP thì tự xóa mã chi tiết
alter table public.ma_san_pham_chi_tiet
  drop constraint if exists ma_san_pham_chi_tiet_san_pham_id_fkey;

alter table public.ma_san_pham_chi_tiet
  add constraint ma_san_pham_chi_tiet_san_pham_id_fkey
  foreign key (san_pham_id) references public.san_pham(id) on delete cascade;

-- 3) RPC xóa hàng loạt (SECURITY DEFINER — không bị RLS chặn)
create or replace function public.xoa_san_pham_hang_loat(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_codes integer := 0;
  v_deleted_products integer := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('success', false, 'error', 'Thiếu danh sách id sản phẩm.', 'deleted', 0);
  end if;

  delete from public.ma_san_pham_chi_tiet
  where san_pham_id = any (p_ids);
  get diagnostics v_deleted_codes = row_count;

  delete from public.san_pham
  where id = any (p_ids);
  get diagnostics v_deleted_products = row_count;

  return jsonb_build_object(
    'success', true,
    'deleted', v_deleted_products,
    'deleted_codes', v_deleted_codes,
    'ids', to_jsonb(p_ids)
  );
end;
$$;

revoke all on function public.xoa_san_pham_hang_loat(uuid[]) from public;
grant execute on function public.xoa_san_pham_hang_loat(uuid[]) to anon, authenticated, service_role;
