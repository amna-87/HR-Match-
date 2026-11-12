// Shared (server + client) job form values. Keep this module free of "use client".
export interface JobValues {
  id?: string;
  title: string;
  description_summary: string;
  required_skills: string[];
  nice_skills: string[];
  required_certifications: string[];
  domains: string[];
  min_exp: number | null;
  max_exp: number | null;
  location: string | null;
  work_mode: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  expires_at: string | null;
  source_name?: string | null;
  source_url?: string | null;
  source_company_name?: string | null;
  apply_method?: string;
  apply_target?: string | null;
}

export const emptyJob: JobValues = {
  title: "",
  description_summary: "",
  required_skills: [],
  nice_skills: [],
  required_certifications: [],
  domains: [],
  min_exp: null,
  max_exp: null,
  location: "",
  work_mode: "onsite",
  employment_type: "full_time",
  salary_min: null,
  salary_max: null,
  salary_currency: "",
  expires_at: null,
  apply_method: "platform",
};

export type SaveState = {
  error?: string;
  duplicates?: { job_id: string; title: string; company: string | null; location: string | null }[];
};
