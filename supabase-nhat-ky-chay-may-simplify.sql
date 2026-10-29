/* Nhat ky chay may: gio bat dau / gio ket thuc / anh thong so */
alter table public.nhat_ky_chay_may
  add column if not exists gio text,
  add column if not exists gio_dung text,
  add column if not exists anh_thong_so text;

comment on column public.nhat_ky_chay_may.gio is 'Gio bat dau (HH:MM) — tu dong theo ca, chinh duoc.';
comment on column public.nhat_ky_chay_may.gio_dung is 'Gio ket thuc (HH:MM) — tu dong theo ca, chinh duoc.';
comment on column public.nhat_ky_chay_may.anh_thong_so is 'URL Cloudinary anh thong so may (anh dau neu nhieu anh).';
