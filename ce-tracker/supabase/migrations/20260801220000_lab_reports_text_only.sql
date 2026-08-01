-- Comptes rendus sans photo : les documents historiques importés n'ont pas
-- d'image source (file_paths vide côté application personnelle), seulement
-- une note riche — diagnostic, traitement en cours, contexte clinique. Plutôt
-- que d'inventer une troisième table, lab_reports accepte un compte rendu
-- texte seul, storage_path devenant facultatif.

alter table public.lab_reports alter column storage_path drop not null;
alter table public.lab_reports add column if not exists lab_name text;
alter table public.lab_reports add column if not exists import_batch text;

create index if not exists lab_reports_import_batch_idx
  on public.lab_reports (import_batch) where import_batch is not null;
