"use client";
import { useActionState, useState, useEffect } from "react";
import type { ParsedJob } from "@/lib/parsing/schemas";
import type { JobValues, SaveState } from "@/lib/job-values";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ExtractState = { parsed?: ParsedJob; error?: string };
import type { ImageState } from "@/app/recruiter/jobs/image-actions";

const list = (fd: FormData, k: string) =>
  String(fd.get(k) ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const num = (fd: FormData, k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : Number(fd.get(k)));

function valuesFromForm(fd: FormData, prev: JobValues): JobValues {
  const str = (k: string) => String(fd.get(k) ?? "");
  return {
    ...prev,
    title: str("title"),
    description_summary: str("description_summary"),
    required_skills: list(fd, "required_skills"),
    nice_skills: list(fd, "nice_skills"),
    required_certifications: list(fd, "required_certifications"),
    domains: list(fd, "domains"),
    min_exp: num(fd, "min_exp"),
    max_exp: num(fd, "max_exp"),
    location: str("location"),
    work_mode: str("work_mode"),
    employment_type: str("employment_type"),
    salary_min: num(fd, "salary_min"),
    salary_max: num(fd, "salary_max"),
    salary_currency: str("salary_currency"),
    expires_at: str("expires_at") || null,
    source_name: fd.has("source_name") ? str("source_name") : prev.source_name,
    source_url: fd.has("source_url") ? str("source_url") : prev.source_url,
    source_company_name: fd.has("source_company_name") ? str("source_company_name") : prev.source_company_name,
    apply_method: fd.has("apply_method") ? str("apply_method") : prev.apply_method,
    apply_target: fd.has("apply_target") ? str("apply_target") : prev.apply_target,
    apply_instructions: fd.has("apply_instructions") ? str("apply_instructions") : prev.apply_instructions,
  };
}

function fromParsed(p: ParsedJob, prev: JobValues, sourced: boolean): JobValues {
  return {
    ...prev,
    title: p.title || prev.title,
    description_summary: p.description_summary || prev.description_summary,
    required_skills: p.required_skills,
    nice_skills: p.nice_skills,
    required_certifications: p.required_certifications,
    domains: p.domains,
    min_exp: p.min_exp,
    max_exp: p.max_exp,
    location: p.location,
    work_mode: p.work_mode,
    employment_type: p.employment_type,
    salary_min: p.salary_min,
    salary_max: p.salary_max,
    salary_currency: p.salary_currency,
    ...(sourced
      ? {
          source_company_name: p.company_name || prev.source_company_name,
          apply_method: p.apply_method === "unknown" ? prev.apply_method : p.apply_method,
          apply_target: p.apply_target || prev.apply_target,
        }
      : {}),
  };
}

export function JobEditor({
  initial,
  mode,
  extractAction,
  saveAction,
  allowPublicBoard = false,
  imageAction,
  imageUrl,
}: {
  initial: JobValues;
  mode: "verified" | "sourced";
  /** Admins can put a job from another source straight on the public board (D-034). */
  allowPublicBoard?: boolean;
  /** Upload a flyer / screenshot of the job (D-036). */
  imageAction?: (s: ImageState, fd: FormData) => Promise<ImageState>;
  /** Existing picture of this job (served through a signed URL). */
  imageUrl?: string | null;
  extractAction: (s: ExtractState, fd: FormData) => Promise<ExtractState>;
  saveAction: (s: SaveState, fd: FormData) => Promise<SaveState>;
}) {
  const [values, setValues] = useState<JobValues>(initial);
  const [state, extract, extracting] = useActionState(extractAction, {});
  const [formKey, setFormKey] = useState(0);
  const [saveState, save, saving] = useActionState(saveAction, {});
  const duplicates = saveState.duplicates;
  // React resets uncontrolled fields after an action; remount with the values captured on submit.
  useEffect(() => {
    if (saveState.error) setFormKey((k) => k + 1);
  }, [saveState]);
  const sourced = mode === "sourced";
  const noImage = async (): Promise<ImageState> => ({});
  const [imgState, uploadImage, uploadingImage] = useActionState(imageAction ?? noImage, {});
  const [preview, setPreview] = useState<string | null>(imageUrl ?? null);

  useEffect(() => {
    if (imgState.imagePath) {
      setValues((v) => {
        const next = { ...v, image_path: imgState.imagePath };
        return imgState.parsed ? fromParsed(imgState.parsed, next, sourced) : next;
      });
      setFormKey((k) => k + 1);
    }
  }, [imgState, sourced]);

  useEffect(() => {
    if (state.parsed) {
      setValues((v) => fromParsed(state.parsed!, v, sourced));
      setFormKey((k) => k + 1); // remount uncontrolled inputs with new defaults
    }
  }, [state.parsed, sourced]);

  const v = values;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Paste a job posting</CardTitle>
          <CardDescription>
            We&apos;ll extract the fields into the form below for you to review. Nothing is published until you click
            publish.
            {sourced && " For sourced jobs we store a summary in our own words, not the original text."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={extract} className="space-y-3">
            <label htmlFor="raw" className="sr-only">
              Job posting text
            </label>
            <Textarea id="raw" name="raw" rows={6} placeholder="Paste the full job description here…" />
            <Button type="submit" variant="secondary" disabled={extracting}>
              {extracting ? "Extracting…" : "Extract fields"}
            </Button>
            {state.error && <Alert tone="warning">{state.error}</Alert>}
            {state.parsed && <Alert tone="success">Fields extracted — please review them below.</Alert>}
          </form>
          {imageAction && (
            <form action={uploadImage} className="border-border mt-4 space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Or upload a picture of the job post (flyer or screenshot)</p>
              <FileInput
                id="job-image"
                name="image"
                aria-label="Or upload a picture of the job post (flyer or screenshot)"
                label="Choose a picture"
                hint="PNG, JPG or WebP"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setPreview(URL.createObjectURL(f));
                }}
              />
              <Button type="submit" variant="secondary" disabled={uploadingImage}>
                {uploadingImage ? "Reading the picture…" : "Upload picture"}
              </Button>
              {imgState.error && <Alert tone="warning">{imgState.error}</Alert>}
              {imgState.note && <Alert tone={imgState.parsed ? "success" : "info"}>{imgState.note}</Alert>}
            </form>
          )}
        </CardContent>
      </Card>

      {duplicates && duplicates.length > 0 && (
        <Alert tone="warning">
          Possible duplicate{duplicates.length > 1 ? "s" : ""}:{" "}
          {duplicates.map((d) => `${d.title} (${d.company ?? "?"}, ${d.location ?? "?"})`).join("; ")}. Tick
          &ldquo;publish anyway&rdquo; if this is a different role.
        </Alert>
      )}

      {saveState.error && <Alert tone="error">{saveState.error}</Alert>}
      <form
        key={formKey}
        action={save}
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget); // read synchronously; currentTarget is cleared later
          setValues((prev) => valuesFromForm(fd, prev));
        }}
        className="space-y-6"
      >
        {v.id && <input type="hidden" name="id" value={v.id} />}
        {v.image_path && <input type="hidden" name="image_path" value={v.image_path} />}
        {v.image_path && (
          <Card>
            <CardHeader>
              <CardTitle>Job picture</CardTitle>
              <CardDescription>
                Shown on the job page. Many flyers show a phone number or personal email: then it is shown only to
                signed-in users, unless you confirm below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Job picture"
                  className="border-border max-h-72 rounded-xl border object-contain"
                />
              )}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="image_public" defaultChecked={v.image_public} className="mt-1" />
                This picture shows no personal phone numbers or email addresses, so anyone can see it
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="remove_image" /> Remove the picture
              </label>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Job details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" htmlFor="title" className="sm:col-span-2">
              <Input id="title" name="title" required defaultValue={v.title} maxLength={200} />
            </Field>
            <Field
              label={sourced ? "Summary (in our own words)" : "Description"}
              htmlFor="description_summary"
              className="sm:col-span-2"
            >
              <Textarea
                id="description_summary"
                name="description_summary"
                rows={6}
                defaultValue={v.description_summary}
              />
            </Field>
            <Field label="Required skills" htmlFor="required_skills" hint="Comma separated">
              <Input id="required_skills" name="required_skills" defaultValue={v.required_skills.join(", ")} />
            </Field>
            <Field label="Nice-to-have skills" htmlFor="nice_skills" hint="Comma separated">
              <Input id="nice_skills" name="nice_skills" defaultValue={v.nice_skills.join(", ")} />
            </Field>
            <Field
              label="Required certifications"
              htmlFor="required_certifications"
              hint="Only if truly mandatory (hard filter)"
            >
              <Input
                id="required_certifications"
                name="required_certifications"
                defaultValue={v.required_certifications.join(", ")}
              />
            </Field>
            <Field
              label="Domains"
              htmlFor="domains"
              hint="e.g. marketing, content. Used for interview-vetted matching."
            >
              <Input id="domains" name="domains" defaultValue={v.domains.join(", ")} />
            </Field>
            <Field label="Min experience (years)" htmlFor="min_exp">
              <Input id="min_exp" name="min_exp" type="number" min={0} step="0.5" defaultValue={v.min_exp ?? ""} />
            </Field>
            <Field label="Max experience (years)" htmlFor="max_exp">
              <Input id="max_exp" name="max_exp" type="number" min={0} step="0.5" defaultValue={v.max_exp ?? ""} />
            </Field>
            <Field label="Location" htmlFor="location" hint="City, Country">
              <Input id="location" name="location" defaultValue={v.location ?? ""} />
            </Field>
            <Field label="Work mode" htmlFor="work_mode">
              <Select id="work_mode" name="work_mode" defaultValue={v.work_mode}>
                <option value="onsite">On-site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </Select>
            </Field>
            <Field label="Employment type" htmlFor="employment_type">
              <Select id="employment_type" name="employment_type" defaultValue={v.employment_type}>
                {["full_time", "part_time", "contract", "internship", "temporary", "freelance"].map((t) => (
                  <option key={t} value={t}>
                    {t.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expiry date" htmlFor="expires_at" hint={sourced ? "Defaults to 30 days" : "Optional"}>
              <Input
                id="expires_at"
                name="expires_at"
                type="date"
                defaultValue={v.expires_at ? v.expires_at.slice(0, 10) : ""}
              />
            </Field>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <Field label="Salary min (optional)" htmlFor="salary_min">
                <Input id="salary_min" name="salary_min" type="number" min={0} defaultValue={v.salary_min ?? ""} />
              </Field>
              <Field label="Salary max" htmlFor="salary_max">
                <Input id="salary_max" name="salary_max" type="number" min={0} defaultValue={v.salary_max ?? ""} />
              </Field>
              <Field label="Currency" htmlFor="salary_currency">
                <Input
                  id="salary_currency"
                  name="salary_currency"
                  maxLength={3}
                  defaultValue={v.salary_currency ?? ""}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        {sourced ? (
          <Card className="border-amber-400">
            <CardHeader>
              <CardTitle>Source &amp; how to apply</CardTitle>
              <CardDescription>
                Only one way to apply is required; company and source are optional. Use company hiring addresses (jobs@,
                careers@) where possible, not someone&apos;s personal contact, unless it was published as the apply
                contact. Phone and WhatsApp numbers are hidden from anonymous visitors.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Where it was posted (optional)"
                htmlFor="source_name"
                hint="e.g. Northwind careers page, a WhatsApp group. Empty shows “Source: not specified”"
              >
                <Input id="source_name" name="source_name" defaultValue={v.source_name ?? ""} />
              </Field>
              <Field
                label="Source URL (optional)"
                htmlFor="source_url"
                hint="Leave empty if the post has no public link"
              >
                <Input id="source_url" name="source_url" type="url" defaultValue={v.source_url ?? ""} />
              </Field>
              <Field
                label="Hiring company (optional)"
                htmlFor="source_company_name"
                hint="Empty shows “Hiring directly”"
              >
                <Input id="source_company_name" name="source_company_name" defaultValue={v.source_company_name ?? ""} />
              </Field>
              <Field label="Apply via" htmlFor="apply_method">
                <Select
                  id="apply_method"
                  name="apply_method"
                  defaultValue={v.apply_method === "platform" ? "link" : v.apply_method}
                >
                  <option value="link">Link</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="whatsapp">WhatsApp</option>
                </Select>
              </Field>
              <Field
                label="Apply link / email / phone / WhatsApp number"
                htmlFor="apply_target"
                hint="Numbers with country code, e.g. +92 300 1234567"
              >
                <Input id="apply_target" name="apply_target" required defaultValue={v.apply_target ?? ""} />
              </Field>
              <Field
                label="How to apply (optional)"
                htmlFor="apply_instructions"
                className="sm:col-span-2"
                hint="e.g. Put the job title in the email subject. Attach your CV as PDF."
              >
                <Textarea
                  id="apply_instructions"
                  name="apply_instructions"
                  rows={2}
                  maxLength={2000}
                  defaultValue={v.apply_instructions ?? ""}
                />
              </Field>
              {allowPublicBoard && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="public_board" /> Put this job on the public job board (admin)
                </label>
              )}
              {duplicates && duplicates.length > 0 && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="allow_duplicate" /> Publish anyway (not a duplicate)
                </label>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>How to apply</CardTitle>
              <CardDescription>
                Candidates apply on-platform: matched candidates are asked first, and only those who approve appear in
                your pipeline. Tell them what happens next.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field
                label="Next steps for applicants (optional)"
                htmlFor="apply_instructions"
                hint="e.g. We reply within 5 working days. Stage 1 is a 30-minute video call, then a short task."
              >
                <Textarea
                  id="apply_instructions"
                  name="apply_instructions"
                  rows={3}
                  maxLength={2000}
                  defaultValue={v.apply_instructions ?? ""}
                />
              </Field>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="publish" disabled={saving}>
            {v.id ? "Save & publish" : "Publish"}
          </Button>
          <Button type="submit" name="intent" value="draft" variant="outline" disabled={saving}>
            Save as draft
          </Button>
        </div>
      </form>
    </div>
  );
}
