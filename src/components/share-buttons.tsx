"use client";
import { useState } from "react";
import { Link2, Linkedin, MessageCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/** Share a job: copy link, WhatsApp, LinkedIn (7c). */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const text = `${title} — ${url}`;
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonClasses("outline", "sm")}
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => {});
          setCopied(true);
        }}
      >
        <Link2 className="h-4 w-4" aria-hidden /> {copied ? "Link copied" : "Copy link"}
      </button>
      <a
        className={buttonClasses("outline", "sm")}
        href={`https://wa.me/?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
      </a>
      <a
        className={buttonClasses("outline", "sm")}
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Linkedin className="h-4 w-4" aria-hidden /> LinkedIn
      </a>
    </div>
  );
}
