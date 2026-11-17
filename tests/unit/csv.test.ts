import { describe, expect, it } from "vitest";
import { guessMapping, parseCsv } from "@/lib/csv";

describe("CSV import", () => {
  it("parses quotes, commas, newlines and CRLF", () => {
    const rows = parseCsv(
      'Title,Company,Description\r\n"Sales, North","Acme ""Ltd""","Line 1\nLine 2"\r\nDesigner,,\r\n',
    );
    expect(rows).toEqual([
      ["Title", "Company", "Description"],
      ["Sales, North", 'Acme "Ltd"', "Line 1\nLine 2"],
      ["Designer", "", ""],
    ]);
  });
  it("accepts semicolon files and guesses the column mapping", () => {
    const [h] = parseCsv("Job Title;Company Name;City;Email;WhatsApp;Apply Link\nx;y;z;a;b;c");
    expect(guessMapping(h)).toMatchObject({
      title: 0,
      company: 1,
      location: 2,
      apply_email: 3,
      apply_whatsapp: 4,
      apply_link: 5,
    });
  });
});
