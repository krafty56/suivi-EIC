-- Un traitement de fond peut n'avoir aucun rapport avec l'entéropathie (ex.
-- prégabaline pour l'anxiété) : sans ce marqueur, le repère personnel
-- l'affichait quand même comme contexte de traitement digestif, ce qui
-- brouille la lecture de la règle. Vrai par défaut : la plupart des
-- traitements enregistrés dans l'app concernent la digestion.
alter table public.dog_medications
  add column if not exists pertinent_digestif boolean not null default true;
