-- Sourced jobs from private channels (e.g. a WhatsApp jobs channel) often have no
-- public link: only an email or phone number to apply. The source link becomes
-- optional; when present it must still be http(s). Source name (provenance),
-- the "Sourced" label and an off-platform way to apply stay mandatory. (D-023)
alter table public.jobs drop constraint jobs_sourced_shape;
alter table public.jobs add constraint jobs_sourced_shape check (
  source_type <> 'sourced' or (
    company_id is null
    and source_name is not null and length(source_name) > 0
    and (source_url is null or source_url ~* '^https?://')
    and apply_method in ('email', 'phone', 'link')
    and apply_target is not null and length(apply_target) > 0
  )
);
