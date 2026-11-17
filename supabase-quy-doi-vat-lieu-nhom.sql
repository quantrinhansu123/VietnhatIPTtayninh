-- Nhóm quy đổi: 1 vật tư gốc → nhiều vật tư đích (cùng nhom_id).
begin;

alter table public.quy_doi_vat_lieu
  add column if not exists nhom_id uuid;

comment on column public.quy_doi_vat_lieu.nhom_id is
  'Nhóm quy đổi: cùng nhom_id = một nguồn quy ra nhiều đích. Bản ghi cũ có thể null.';

create index if not exists quy_doi_vat_lieu_nhom_id_idx
  on public.quy_doi_vat_lieu (nhom_id)
  where nhom_id is not null;

notify pgrst, 'reload schema';
commit;
