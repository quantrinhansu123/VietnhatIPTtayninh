-- Bổ sung khối lượng gốc / quy đổi trên quy_doi_vat_lieu (DB chính).
begin;

alter table public.quy_doi_vat_lieu
  add column if not exists khoi_luong_goc numeric,
  add column if not exists khoi_luong_quy_doi numeric;

comment on column public.quy_doi_vat_lieu.khoi_luong_goc is
  'Khối lượng vật tư gốc (kg) = SL gốc × tong_trong_luong Kho NVL tại thời điểm lưu.';
comment on column public.quy_doi_vat_lieu.khoi_luong_quy_doi is
  'Khối lượng vật tư quy đổi (kg) = SL quy đổi × tong_trong_luong Kho NVL tại thời điểm lưu.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_khoi_luong_goc_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_khoi_luong_goc_check
      check (khoi_luong_goc is null or (khoi_luong_goc >= 0 and khoi_luong_goc <> 'NaN'::numeric and khoi_luong_goc < 'Infinity'::numeric));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_khoi_luong_quy_doi_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_khoi_luong_quy_doi_check
      check (khoi_luong_quy_doi is null or (khoi_luong_quy_doi >= 0 and khoi_luong_quy_doi <> 'NaN'::numeric and khoi_luong_quy_doi < 'Infinity'::numeric));
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
