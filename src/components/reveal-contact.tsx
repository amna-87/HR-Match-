"use client";
import { useState, useTransition } from "react";
import { Eye, Mail, MessageCircle, Phone } from "lucide-react";
import { revealJobContact } from "@/app/jobs/_actions/reveal";
import { applyHref, APPLY_LABEL } from "@/lib/jobs/contact";
import { Button, buttonClasses } from "@/components/ui/button";

/** Private apply contact (phone, WhatsApp, personal email): masked until revealed (7c). */
export function RevealContact({
  jobId,
  title,
  method,
  masked,
  signedIn,
  challenge,
}: {
  jobId: string;
  title: string;
  method: string;
  masked: string;
  signedIn: boolean;
  challenge?: { question: string; token: string };
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, start] = useTransition();
  const Icon = method === "whatsapp" ? MessageCircle : method === "phone" ? Phone : Mail;

  const reveal = () =>
    start(async () => {
      setError(null);
      const r = await revealJobContact(jobId, challenge?.token, answer);
      if (r.error) setError(r.error);
      else {
        setTarget(r.target ?? null);
        setInstructions(r.instructions ?? null);
      }
    });

  if (target)
    return (
      <div className="space-y-3">
        <a
          href={applyHref(method, target, title) ?? "#"}
          rel="noopener noreferrer nofollow"
          target={method === "whatsapp" ? "_blank" : undefined}
          className={buttonClasses("default", "lg", "w-full text-center whitespace-normal")}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {APPLY_LABEL[method] ?? "Apply"}
        </a>
        <p className="text-center text-sm font-medium break-all">{target}</p>
        {instructions && (
          <div className="space-y-1 text-sm">
            <p className="font-semibold">How to apply</p>
            <p className="text-muted-foreground break-words whitespace-pre-line">{instructions}</p>
          </div>
        )}
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">{APPLY_LABEL[method] ?? "Apply"}:</span>{" "}
        <span className="text-muted-foreground">{masked}</span>
      </p>
      {!signedIn && challenge && (
        <div className="space-y-1">
          <label htmlFor="human-check" className="text-sm">
            Quick check to show the contact: {challenge.question}
          </label>
          <input
            id="human-check"
            inputMode="numeric"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className="border-border bg-background h-10 w-full rounded-lg border px-3"
          />
        </div>
      )}
      <Button className="w-full" size="lg" onClick={reveal} disabled={pending || (!signedIn && !answer)}>
        <Eye className="h-4 w-4" aria-hidden />
        {pending ? "Checking…" : "Show contact"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {!signedIn && (
        <p className="text-muted-foreground text-xs">
          Or{" "}
          <a href={`/login?next=/jobs/${jobId}`} className="underline">
            log in
          </a>{" "}
          to see contacts straight away. We hide numbers from bots to protect employers from spam.
        </p>
      )}
    </div>
  );
}
