-- GAL-265: track user-discarded import drafts in parse_quality_logs.
-- Photo imports have no source URL, so relax the not-null constraint.
alter table parse_quality_logs alter column source_url drop not null;
alter table parse_quality_logs add column discarded boolean not null default false;
