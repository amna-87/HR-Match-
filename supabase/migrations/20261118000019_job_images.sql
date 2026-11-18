-- Job pictures (D-036): a flyer or screenshot of a job post. Read by AI to fill
-- the job form, and shown on the job page. Flyers often show phone numbers, so
-- the picture is public only when the uploader confirms it has no personal
-- contact details (image_public); otherwise only signed-in users see it (7c).
-- Files are private; the app serves them through short-lived signed URLs.

alter table public.jobs
  add column image_path text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpe?g|webp)$'),
  add column image_public boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-images', 'job-images', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Workspace members upload into <workspace_id>/ ; nobody reads directly (signed URLs only).
create policy job_images_member_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'job-images' and public.is_company_member(((storage.foldername(name))[1])::uuid));
create policy job_images_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'job-images' and public.is_company_member(((storage.foldername(name))[1])::uuid));

-- image_path must point into the job's own workspace folder.
create or replace function public.guard_jobs_image() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.image_path is not null and new.image_path is distinct from (case when tg_op = 'UPDATE' then old.image_path end)
     and split_part(new.image_path, '/', 1) <> coalesce(new.owner_workspace_id, new.company_id)::text then
    raise exception 'job picture must belong to the job''s workspace' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_jobs_image before insert or update on public.jobs
  for each row execute function public.guard_jobs_image();
