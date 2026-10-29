/* Nhat ky chay may: su co (jsonb) + nhieu anh (jsonb).
   Form moi van co the luu su_co trong chi_tiet va anh trong anh_thong_so (JSON).
   Chay file nay de co cot rieng (tien truy van / bao cao). */
alter table public.nhat_ky_chay_may
  add column if not exists su_co jsonb not null default '[]'::jsonb,
  add column if not exists anh_urls jsonb not null default '[]'::jsonb;

comment on column public.nhat_ky_chay_may.su_co is
  'Mang su co: [{ ten_su_co, thoi_gian_xay_ra, thoi_gian_khac_phuc, thoi_gian_dung_phut }]';
comment on column public.nhat_ky_chay_may.anh_urls is
  'Mang URL Cloudinary anh thong so (nhieu anh).';
comment on column public.nhat_ky_chay_may.gio is 'Gio bat dau (HH:MM) — tu dong theo ca, chinh duoc.';
comment on column public.nhat_ky_chay_may.gio_dung is 'Gio ket thuc (HH:MM) — tu dong theo ca, chinh duoc.';
