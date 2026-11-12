import { describe, expect, it } from "vitest";
import { homeFor, requiredRoleFor } from "@/lib/auth/routes";

describe("route protection map", () => {
  it("guards each area by role", () => {
    expect(requiredRoleFor("/candidate")).toBe("candidate");
    expect(requiredRoleFor("/candidate/profile")).toBe("candidate");
    expect(requiredRoleFor("/recruiter/jobs/new")).toBe("recruiter");
    expect(requiredRoleFor("/admin/audit")).toBe("admin");
    expect(requiredRoleFor("/candidates-public")).toBeNull();
    expect(requiredRoleFor("/")).toBeNull();
    expect(requiredRoleFor("/jobs")).toBeNull();
  });
  it("sends each role to its own dashboard", () => {
    expect(homeFor("candidate")).toBe("/candidate");
    expect(homeFor("recruiter")).toBe("/recruiter");
    expect(homeFor("admin")).toBe("/admin");
  });
});
