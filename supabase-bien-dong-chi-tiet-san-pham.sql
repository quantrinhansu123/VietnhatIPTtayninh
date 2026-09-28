-- Run in the main Supabase project (bfnsopyvgvhaegqijpum).
-- One row per QR movement; ma_phieu intentionally has no FK because slip headers
-- live in the separate warehouse Supabase project.
create table if not exists public.bien_dong_chi_tiet_san_pham (
  id uuid primary key default gen_random_uuid(),
  ma_sp_goc text not null references public.san_pham (ma_sp)
    on update cascade on delete restrict,
  ma_sp_qr text not null,
  loai_bien_dong text not null
    check (loai_bien_dong in ('ton_dau', 'nhap', 'xuat')),
  la_dieu_chinh boolean not null default false,
  ma_phieu text,
  ngay_phieu date not null,
  kho text not null,
  ca text,
  created_at timestamptz not null default now(),
  constraint bien_dong_chi_tiet_ma_phieu_check check (
    (loai_bien_dong = 'ton_dau' and ma_phieu is null)
    or (loai_bien_dong in ('nhap', 'xuat') and nullif(btrim(ma_phieu), '') is not null)
  )
);

create unique index if not exists bien_dong_chi_tiet_phieu_qr_uidx
  on public.bien_dong_chi_tiet_san_pham (loai_bien_dong, ma_phieu, ma_sp_qr)
  where ma_phieu is not null;

create unique index if not exists bien_dong_chi_tiet_ton_dau_qr_uidx
  on public.bien_dong_chi_tiet_san_pham (ma_sp_qr)
  where loai_bien_dong = 'ton_dau';

create index if not exists bien_dong_chi_tiet_kho_ngay_ma_idx
  on public.bien_dong_chi_tiet_san_pham (kho, ngay_phieu, ma_sp_goc);
create index if not exists bien_dong_chi_tiet_qr_ngay_idx
  on public.bien_dong_chi_tiet_san_pham (ma_sp_qr, ngay_phieu desc);

comment on table public.bien_dong_chi_tiet_san_pham is
  'Lich su nhap/xuat/dieu chinh/ton dau cua tung QR thanh pham; moi dong la mot ma QR trong mot phieu.';
comment on column public.bien_dong_chi_tiet_san_pham.ma_phieu is
  'Ma phieu nhap/xuat tu project DB kho; NULL chi voi bien dong ton_dau.';
comment on column public.bien_dong_chi_tiet_san_pham.ngay_phieu is
  'Ngay nghiep vu tren header phieu, dung de loc ky ton kho.';
comment on column public.bien_dong_chi_tiet_san_pham.la_dieu_chinh is
  'True when the nhap/xuat movement comes from an inventory-count adjustment slip.';

alter table public.bien_dong_chi_tiet_san_pham enable row level security;
revoke all on public.bien_dong_chi_tiet_san_pham from anon, authenticated;
grant select, insert, update, delete on public.bien_dong_chi_tiet_san_pham to service_role;

notify pgrst, 'reload schema';
