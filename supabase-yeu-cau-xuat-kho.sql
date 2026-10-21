-- Yêu cầu xuất vật tư (công nhân gửi → thủ kho xác nhận ở /phieu-xuat-nhap-kho)
-- Chạy trên DB kho (SUPABASE_KHO_URL) — SQL Editor → Run.

create extension if not exists pgcrypto;

create table if not exists public.yeu_cau_xuat_kho (
  id uuid primary key default gen_random_uuid(),
  ma_yeu_cau text not null unique,
  ngay date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  ca text,
  may text,
  nguoi_yc text,
  trang_thai text not null default 'cho_xu_ly', -- cho_xu_ly | da_xuat
  ma_phieu_xuat text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nvl_yeu_cau (
  id uuid primary key default gen_random_uuid(),
  ma_yeu_cau text not null references public.yeu_cau_xuat_kho (ma_yeu_cau) on delete cascade,
  ma_nvl text not null,
  ten_nvl text,
  don_vi text,
  so_luong numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_yeu_cau_xuat_kho_trang_thai on public.yeu_cau_xuat_kho (trang_thai, ngay desc);
create index if not exists idx_nvl_yeu_cau_ma_yeu_cau on public.nvl_yeu_cau (ma_yeu_cau);

alter table public.yeu_cau_xuat_kho enable row level security;
alter table public.nvl_yeu_cau enable row level security;

do $$
declare t text;
begin
  foreach t in array array['yeu_cau_xuat_kho', 'nvl_yeu_cau'] loop
    execute format('drop policy if exists "%s_all" on public.%I', t, t);
    execute format('create policy "%s_all" on public.%I for all using (true) with check (true)', t, t);
  end loop;
end $$;
