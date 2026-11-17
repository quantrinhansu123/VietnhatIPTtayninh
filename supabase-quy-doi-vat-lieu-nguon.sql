-- Nguồn lấy (vật tư gốc) / Nguồn tới (vật tư quy đổi) trên quy_doi_vat_lieu (DB chính).
begin;

alter table public.quy_doi_vat_lieu
  add column if not exists nguon_lay text,
  add column if not exists nguon_toi text;

comment on column public.quy_doi_vat_lieu.nguon_lay is
  'Nguồn lấy của vật tư gốc (vd. Tồn máy / Tồn bồn / Kho NVL).';
comment on column public.quy_doi_vat_lieu.nguon_toi is
  'Nguồn tới của vật tư quy đổi (vd. Tồn máy / Tồn bồn / Kho NVL).';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_nguon_lay_len_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_nguon_lay_len_check
      check (nguon_lay is null or length(trim(nguon_lay)) between 1 and 200);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quy_doi_vat_lieu_nguon_toi_len_check'
      and conrelid = 'public.quy_doi_vat_lieu'::regclass
  ) then
    alter table public.quy_doi_vat_lieu
      add constraint quy_doi_vat_lieu_nguon_toi_len_check
      check (nguon_toi is null or length(trim(nguon_toi)) between 1 and 200);
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
