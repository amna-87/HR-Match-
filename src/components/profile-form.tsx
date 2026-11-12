"use client";
import { useState } from "react";
import type { ProfileInput } from "@/lib/profile-schema";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/submit-button";

type Exp = ProfileInput["experiences"][number];
type Edu = ProfileInput["education"][number];
type Cert = ProfileInput["certifications"][number];

const blankExp: Exp = { title: "", company: "", start_date: "", end_date: "", is_current: false, description: "" };
const blankEdu: Edu = { institution: "", degree: "", field: "", start_date: "", end_date: "" };
const blankCert: Cert = { name: "", issuer: "" };
const toMonth = (d: string) => (d ? d.slice(0, 7) : "");
const fromMonth = (m: string) => (m ? `${m}-01` : "");

export function ProfileForm({ initial, action }: { initial: ProfileInput; action: (fd: FormData) => Promise<void> }) {
  const [p, setP] = useState<ProfileInput>(initial);
  const [skillsText, setSkillsText] = useState(initial.skills.join(", "));
  const [langText, setLangText] = useState(initial.languages.join(", "));
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setP((s) => ({ ...s, [k]: v }));
  const payload = JSON.stringify({
    ...p,
    skills: skillsText.split(",").map((s) => s.trim()).filter(Boolean),
    languages: langText.split(",").map((s) => s.trim()).filter(Boolean),
  });

  function updateRow<T>(key: "experiences" | "education" | "certifications", i: number, patch: Partial<T>) {
    setP((s) => ({ ...s, [key]: (s[key] as T[]).map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }
  function removeRow(key: "experiences" | "education" | "certifications", i: number) {
    setP((s) => ({ ...s, [key]: (s[key] as unknown[]).filter((_, j) => j !== i) }));
  }

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="payload" value={payload} />
      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" value={p.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Headline" htmlFor="headline" hint="e.g. Social Media Marketing Manager">
          <Input id="headline" value={p.headline} onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Location" htmlFor="location" hint="City, Country">
          <Input id="location" value={p.location} onChange={(e) => set("location", e.target.value)} />
        </Field>
        <Field label="Contact email (shared only with employers you apply to)" htmlFor="contact_email">
          <Input id="contact_email" type="email" value={p.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
        </Field>
        <Field label="Contact phone (shared only with employers you apply to)" htmlFor="contact_phone">
          <Input id="contact_phone" value={p.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
        </Field>
        <Field label="Languages" htmlFor="languages" hint="Comma separated">
          <Input id="languages" value={langText} onChange={(e) => setLangText(e.target.value)} />
        </Field>
        <Field label="Summary" htmlFor="summary" className="sm:col-span-2">
          <Textarea id="summary" rows={4} value={p.summary} onChange={(e) => set("summary", e.target.value)} />
        </Field>
        <Field label="Skills" htmlFor="skills" hint="Comma separated. These drive matching." className="sm:col-span-2">
          <Textarea id="skills" rows={2} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Work experience</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => set("experiences", [...p.experiences, { ...blankExp }])}>
            Add role
          </Button>
        </div>
        {p.experiences.map((e, i) => (
          <fieldset key={i} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm text-muted-foreground">Role {i + 1}</legend>
            <Field label="Title" htmlFor={`exp-title-${i}`}>
              <Input id={`exp-title-${i}`} value={e.title} onChange={(ev) => updateRow<Exp>("experiences", i, { title: ev.target.value })} />
            </Field>
            <Field label="Company" htmlFor={`exp-co-${i}`}>
              <Input id={`exp-co-${i}`} value={e.company} onChange={(ev) => updateRow<Exp>("experiences", i, { company: ev.target.value })} />
            </Field>
            <Field label="Start" htmlFor={`exp-start-${i}`}>
              <Input id={`exp-start-${i}`} type="month" value={toMonth(e.start_date)} onChange={(ev) => updateRow<Exp>("experiences", i, { start_date: fromMonth(ev.target.value) })} />
            </Field>
            <Field label="End" htmlFor={`exp-end-${i}`}>
              <Input id={`exp-end-${i}`} type="month" disabled={e.is_current} value={toMonth(e.end_date)} onChange={(ev) => updateRow<Exp>("experiences", i, { end_date: fromMonth(ev.target.value) })} />
            </Field>
            <Checkbox label="I currently work here" checked={e.is_current} onChange={(ev) => updateRow<Exp>("experiences", i, { is_current: ev.target.checked, end_date: "" })} />
            <Field label="Description" htmlFor={`exp-desc-${i}`} className="sm:col-span-2">
              <Textarea id={`exp-desc-${i}`} value={e.description} onChange={(ev) => updateRow<Exp>("experiences", i, { description: ev.target.value })} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow("experiences", i)}>
              Remove role
            </Button>
          </fieldset>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Education</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => set("education", [...p.education, { ...blankEdu }])}>
            Add education
          </Button>
        </div>
        {p.education.map((e, i) => (
          <fieldset key={i} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm text-muted-foreground">Education {i + 1}</legend>
            <Field label="Institution" htmlFor={`edu-inst-${i}`}>
              <Input id={`edu-inst-${i}`} value={e.institution} onChange={(ev) => updateRow<Edu>("education", i, { institution: ev.target.value })} />
            </Field>
            <Field label="Degree" htmlFor={`edu-deg-${i}`}>
              <Input id={`edu-deg-${i}`} value={e.degree} onChange={(ev) => updateRow<Edu>("education", i, { degree: ev.target.value })} />
            </Field>
            <Field label="Field" htmlFor={`edu-field-${i}`}>
              <Input id={`edu-field-${i}`} value={e.field} onChange={(ev) => updateRow<Edu>("education", i, { field: ev.target.value })} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow("education", i)}>
              Remove
            </Button>
          </fieldset>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Certifications</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => set("certifications", [...p.certifications, { ...blankCert }])}>
            Add certification
          </Button>
        </div>
        {p.certifications.map((c, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <Field label="Name" htmlFor={`cert-name-${i}`} className="flex-1">
              <Input id={`cert-name-${i}`} value={c.name} onChange={(ev) => updateRow<Cert>("certifications", i, { name: ev.target.value })} />
            </Field>
            <Field label="Issuer" htmlFor={`cert-iss-${i}`} className="flex-1">
              <Input id={`cert-iss-${i}`} value={c.issuer} onChange={(ev) => updateRow<Cert>("certifications", i, { issuer: ev.target.value })} />
            </Field>
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRow("certifications", i)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      <SubmitButton pendingText="Saving…">Save profile</SubmitButton>
    </form>
  );
}
