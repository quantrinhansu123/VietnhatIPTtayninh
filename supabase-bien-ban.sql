-- =============================================================================
-- Biên bản kiểm định tem — lập sau khi quét QR tem (đối chiếu trạm cân AI)
-- Chạy trên DB chính (SUPABASE_URL) trong SQL Editor → Run
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.bien_ban (
  id uuid primary key default gen_random_uuid(),
  ma_bien_ban text not null,
  loai text not null default 'kiem_dinh_tem',
  ngay_lap date not null default (timezone('Asia/Ho_Chi_Minh', now()))::date,
  ma_qr text not null,
  ma_sp text,
  ngay_sx date,
  ca text,
  may text,
  lenh_sx text,
  nguoi_san_xuat text,
  da_len_tram_can boolean not null default false,
  thoi_diem_can timestamptz,
  du_lieu_can jsonb,
  ket_luan text not null default 'dat',
  noi_dung text,
  ghi_chu text,
  anh_url text,
  nguoi_lap text,
  created_at timestamptz not null default now(),
  constraint uq_bien_ban_ma unique (ma_bien_ban),
  constraint chk_bien_ban_ket_luan check (ket_luan in ('dat', 'khong_dat'))
);

-- Bổ sung cho DB đã có bảng biên bản.
alter table public.bien_ban add column if not exists anh_url text;

create index if not exists idx_bien_ban_ngay_lap on public.bien_ban (ngay_lap desc);
create index if not exists idx_bien_ban_ma_qr on public.bien_ban (ma_qr);

comment on table public.bien_ban is 'Bien ban kiem dinh tem (quet QR, doi chieu tram can AI can_tu_dong).';

alter table public.bien_ban enable row level security;

drop policy if exists "bien_ban_select_all" on public.bien_ban;
create policy "bien_ban_select_all" on public.bien_ban for select using (true);
drop policy if exists "bien_ban_insert_all" on public.bien_ban;
create policy "bien_ban_insert_all" on public.bien_ban for insert with check (true);
drop policy if exists "bien_ban_delete_all" on public.bien_ban;
create policy "bien_ban_delete_all" on public.bien_ban for delete using (true);
