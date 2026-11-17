import { describe, expect, it } from "vitest";
import { applyHref, isCompanyStyleEmail, isPrivateContact, maskContactsInText, maskPhone } from "@/lib/jobs/contact";

describe("apply contacts (addendum 4, 7c)", () => {
  it("company hiring addresses are fine to show; personal ones are private", () => {
    expect(isCompanyStyleEmail("jobs@acme.com")).toBe(true);
    expect(isCompanyStyleEmail("careers.pk@acme.co")).toBe(true);
    expect(isCompanyStyleEmail("hr@gmail.com")).toBe(false);
    expect(isCompanyStyleEmail("sara.khan@acme.com")).toBe(false);
    expect(isPrivateContact("email", "sara.khan@acme.com")).toBe(true);
    expect(isPrivateContact("email", "jobs@acme.com")).toBe(false);
    expect(isPrivateContact("whatsapp", "+92 300 1234567")).toBe(true);
    expect(isPrivateContact("link", "https://acme.com/apply")).toBe(false);
  });

  it("masks numbers and personal emails in free text", () => {
    expect(maskPhone("+92 300 1234567")).toBe("+923 ••• •• 67");
    const t = maskContactsInText("Send CV to sara.khan@gmail.com or WhatsApp 0300-1234567. Or jobs@acme.com");
    expect(t).not.toMatch(/sara\.khan|1234567/);
    expect(t).toContain("jobs@acme.com");
  });

  it("builds click-to-chat and mail links", () => {
    expect(applyHref("whatsapp", "+92 300 1234567", "Sales")).toMatch(/^https:\/\/wa\.me\/923001234567\?text=/);
    expect(applyHref("email", "jobs@acme.com", "Sales")).toBe("mailto:jobs@acme.com?subject=Application%3A%20Sales");
    expect(applyHref("phone", "+92 (300) 123-4567")).toBe("tel:+923001234567");
  });
});
