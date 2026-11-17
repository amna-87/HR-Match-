/**
 * Renders a plain-text job description with light structure: lines starting with
 * "•", "-", "▸" or "✅" become list items, and a short line followed by a list
 * becomes a sub-heading. Everything is rendered as text (no HTML from the data).
 */
export function JobDescription({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks: ({ kind: "p" | "h"; text: string } | { kind: "ul"; items: string[] })[] = [];
  const bullet = /^([•\-–▸✅*]|\d+[.)])\s+/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    if (bullet.test(l)) {
      const item = l.replace(bullet, "");
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
      continue;
    }
    const next = lines.slice(i + 1).find(Boolean) ?? "";
    const isHeading = l.length <= 60 && !/[.:,;]$/.test(l) && bullet.test(next);
    blocks.push({ kind: isHeading ? "h" : "p", text: l });
  }
  return (
    <div className="space-y-4 leading-relaxed">
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="marker:text-primary list-disc space-y-1.5 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : b.kind === "h" ? (
          <h3 key={i} className="pt-2 text-base font-semibold tracking-tight">
            {b.text}
          </h3>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}
