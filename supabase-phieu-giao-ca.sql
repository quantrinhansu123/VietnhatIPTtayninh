-- Phiếu giao ca
create extension if not exists pgcrypto;

create table if not exists public.phieu_giao_ca (
  id uuid primary key default gen_random_uuid(),
  so_phieu text not null,
  ngay date not null,
  ca_giao text not null,
  ca_nhan text,
  ma_may text,
  ten_may text,
  nguoi_giao_ca text,
  nguoi_nhan_ca text,
  tinh_hinh_san_xuat text,
  san_luong_dat_duoc text,
  tinh_trang_may_moc text,
  ton_kho_cuoi_ca text,
  ghi_chu_chung text,
  chi_tiet jsonb not null default '[]'::jsonb,
  nguoi_giao_ky text,
  nguoi_nhan_ky text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_phieu_giao_ca_so_phieu
  on public.phieu_giao_ca (so_phieu);

create index if not exists idx_phieu_giao_ca_ngay
  on public.phieu_giao_ca (ngay desc);

create index if not exists idx_phieu_giao_ca_ma_may
  on public.phieu_giao_ca (ma_may);

create index if not exists idx_phieu_giao_ca_chi_tiet
  on public.phieu_giao_ca using gin (chi_tiet);

create or replace function public.set_phieu_giao_ca_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_phieu_giao_ca_updated_at on public.phieu_giao_ca;

create trigger trg_phieu_giao_ca_updated_at
before update on public.phieu_giao_ca
for each row
execute function public.set_phieu_giao_ca_updated_at();

comment on table public.phieu_giao_ca is 'Nhật ký sản xuất kiêm phiếu giao ca (QT-16-BM02) — thành phẩm, hàng lỗi/phế và báo cáo SX cuối ca.';
comment on column public.phieu_giao_ca.chi_tiet is 'JSON mẫu QT-16-BM02: loai=nk_sx, gio_tu, gio_den, thanh_pham[], hang_loi[], bao_cao_cuoi_ca[]. Phiếu cũ có thể là mảng việc bàn giao.';
comment on column public.phieu_giao_ca.nguoi_giao_ca is 'Người thực hiện / công nhân vận hành ca.';
comment on column public.phieu_giao_ca.ca_giao is 'Tên ca sản xuất.';
