-- Danh sach tung ma QR thanh pham theo san pham va kho.
-- Chay trong Supabase SQL Editor cua DB chinh (bfnsopyvgvhaegqijpum).

create table if not exists public.chi_tiet_san_pham (
  ma_sp_goc text not null,
  ma_sp_qr text not null,
  kho text not null,
  trang_thai text not null default 'trong_kho',
  so_luong integer not null default 1 check (so_luong = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chi_tiet_san_pham_pkey primary key (ma_sp_qr),
  constraint chi_tiet_san_pham_san_pham_fkey
    foreign key (ma_sp_goc) references public.san_pham (ma_sp)
    on update cascade on delete restrict
);

create index if not exists chi_tiet_san_pham_ton_kho_idx
  on public.chi_tiet_san_pham (ma_sp_goc, kho, trang_thai);

create or replace function public.set_chi_tiet_san_pham_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chi_tiet_san_pham_updated_at
  on public.chi_tiet_san_pham;
create trigger trg_chi_tiet_san_pham_updated_at
  before update on public.chi_tiet_san_pham
  for each row execute function public.set_chi_tiet_san_pham_updated_at();

alter table public.chi_tiet_san_pham enable row level security;

drop policy if exists chi_tiet_san_pham_select_all on public.chi_tiet_san_pham;
create policy chi_tiet_san_pham_select_all
  on public.chi_tiet_san_pham for select using (true);
drop policy if exists chi_tiet_san_pham_insert_all on public.chi_tiet_san_pham;
create policy chi_tiet_san_pham_insert_all
  on public.chi_tiet_san_pham for insert with check (true);
drop policy if exists chi_tiet_san_pham_update_all on public.chi_tiet_san_pham;
create policy chi_tiet_san_pham_update_all
  on public.chi_tiet_san_pham for update using (true) with check (true);
drop policy if exists chi_tiet_san_pham_delete_all on public.chi_tiet_san_pham;
create policy chi_tiet_san_pham_delete_all
  on public.chi_tiet_san_pham for delete using (true);

grant select, insert, update, delete
  on public.chi_tiet_san_pham to anon, authenticated, service_role;
