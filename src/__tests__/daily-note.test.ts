import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { computeDailyNotePath, renderTemplate } from "../daily-note";

describe("computeDailyNotePath", () => {
  it("computes path with simple directory and filename", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    const path = computeDailyNotePath(date, "yyyy/MM", "dd");
    expect(path).toBe("2024/01/15");
  });

  it("computes path with literal brackets in directory", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    const path = computeDailyNotePath(date, "yyyy/MM/[第]WW[周]", "MMdd");
    expect(path).toBe("2024/01/第03周/0115");
  });

  it("computes path with week number in directory", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    const path = computeDailyNotePath(date, "yyyy/[第]WW[周]", "MM-dd");
    expect(path).toBe("2024/第03周/01-15");
  });

  it("computes path with Moment-style tokens YYYY and MMDD", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    const path = computeDailyNotePath(date, "YYYY/MM/[第]WW[周]", "MMDD");
    expect(path).toBe("2024/01/第03周/0115");
  });

  it("throws on empty directory pattern", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    expect(() =>
      computeDailyNotePath(date, "", "MMdd")
    ).toThrow();
  });

  it("throws on empty filename pattern", () => {
    const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });
    expect(() =>
      computeDailyNotePath(date, "yyyy/MM", "")
    ).toThrow();
  });
});

describe("renderTemplate", () => {
  const date = DateTime.fromISO("2024-01-15", { zone: "UTC" });

  it("renders **date:FORMAT** placeholders", () => {
    const template = "Date: **date:yyyy-MM-dd**, Week: **date:GGGG-[W]WW**";
    const result = renderTemplate(template, date);
    expect(result).toBe("Date: 2024-01-15, Week: 2024-W03");
  });

  it("renders ${date:FORMAT} placeholders", () => {
    const template = "Date: ${date:yyyy-MM-dd}, Weekday: ${date:cccc}";
    const result = renderTemplate(template, date);
    expect(result).toBe("Date: 2024-01-15, Weekday: Monday");
  });

  it("renders {{date:FORMAT}} placeholders", () => {
    const template = "Date: {{date:yyyy-MM-dd}}";
    const result = renderTemplate(template, date);
    expect(result).toBe("Date: 2024-01-15");
  });

  it("renders multiple placeholders in one template", () => {
    const template =
      "> **date:yyyy-MM-dd** **date:cccc** · **date:GGGG**年第**date:WW**周";
    const result = renderTemplate(template, date);
    expect(result).toBe("> 2024-01-15 Monday · 2024年第03周");
  });

  it("renders YAML frontmatter placeholders", () => {
    const template =
      'date: "**date:yyyy-MM-dd**"\nweek: "**date:GGGG-[W]WW**"';
    const result = renderTemplate(template, date);
    expect(result).toBe('date: "2024-01-15"\nweek: "2024-W03"');
  });

  it("does not modify text without placeholders", () => {
    const template = "Just some text with **bold** and *italic*";
    const result = renderTemplate(template, date);
    expect(result).toBe("Just some text with **bold** and *italic*");
  });
});
