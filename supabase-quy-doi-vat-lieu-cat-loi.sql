-- Bổ sung nghiệp vụ cắt lõi / quy đổi: chiều dài, định mức, TL/cái, ghi chú.
begin;

alter table public.quy_doi_vat_lieu
  add column if not exists chieu_dai_goc numeric,
  add column if not exists trong_luong_tren_cai_goc numeric,
  add column if not exists ghi_chu_goc text,
  add column if not exists chieu_dai_quy_doi numeric,
  add column if not exists dinh_muc numeric,
  add column if not exists kich_thuoc_tong numeric,
  add column if not exists trong_luong_tren_cai_quy_doi numeric,
  add column if not exists ghi_chu_quy_doi text;

comment on column public.quy_doi_vat_lieu.chieu_dai_goc is
  'Chiều dài vật tư gốc (cm) — snapshot khi lưu.';
comment on column public.quy_doi_vat_lieu.trong_luong_tren_cai_goc is
  'Trọng lượng / cái gốc (kg) — snapshot khi lưu.';
comment on column public.quy_doi_vat_lieu.ghi_chu_goc is
  'Ghi chú vật tư gốc (vd. Ống nguyên).';
comment on column public.quy_doi_vat_lieu.chieu_dai_quy_doi is
  'Chiều dài vật tư đích (cm) — snapshot khi lưu.';
comment on column public.quy_doi_vat_lieu.dinh_muc is
  'Định mức: số lượng đích cắt từ 1 cái gốc (Xuất gia công).';
comment on column public.quy_doi_vat_lieu.kich_thuoc_tong is
  'Kích thước tổng sau cắt (cm) = chiều dài đích × định mức.';
comment on column public.quy_doi_vat_lieu.trong_luong_tren_cai_quy_doi is
  'Trọng lượng / cái đích (kg) — snapshot khi lưu.';
comment on column public.quy_doi_vat_lieu.ghi_chu_quy_doi is
  'Ghi chú vật tư đích (vd. Lõi tận dụng).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_chieu_dai_goc_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_chieu_dai_goc_check
      check (chieu_dai_goc is null or (chieu_dai_goc >= 0 and chieu_dai_goc <> 'NaN'::numeric and chieu_dai_goc < 'Infinity'::numeric));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_chieu_dai_quy_doi_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_chieu_dai_quy_doi_check
      check (chieu_dai_quy_doi is null or (chieu_dai_quy_doi >= 0 and chieu_dai_quy_doi <> 'NaN'::numeric and chieu_dai_quy_doi < 'Infinity'::numeric));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_dinh_muc_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_dinh_muc_check
      check (dinh_muc is null or (dinh_muc > 0 and dinh_muc <> 'NaN'::numeric and dinh_muc < 'Infinity'::numeric));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
