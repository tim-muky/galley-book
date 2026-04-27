-- GAL-123: prevent duplicate galleys created by form double-submit.
-- Drops the 4 empty duplicate galleys observed in prod, then adds a
-- unique index on (owner_id, lower(trim(name))) so the race can no
-- longer materialise a second row.

delete from public.galleys
where id in (
  '12df41ba-4623-4f09-af42-bd9036145283',
  '51c8e70e-d146-42b9-a580-699cca562f3f',
  'e42fe5eb-0661-4608-8201-600dceb139b6'
);

create unique index if not exists galleys_owner_name_unique
  on public.galleys (owner_id, lower(trim(name)));
