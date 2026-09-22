/**
 * Daily note path computation and template rendering.
 *
 * Date placeholders supported in templates:
 *   **date:FORMAT**  → replaced with formatted date (user's format)
 *   ${date:FORMAT}   → replaced with formatted date
 *   {{date:FORMAT}}  → replaced with formatted date
 *
 * The FORMAT is a Luxon date format string, e.g.:
 *   YYYY-MM-DD, GGGG-[W]WW, dddd, d, dd, mmm, MMM, dddd,
 *   WWW, WW, GGGG, YYYY, MM, DD, HH, mm, ss, etc.
 */

import { DateTime } from "luxon";

/**
 * Compute the daily note path for a given date.
 *
 * @param date - The date to compute the path for
 * @param directoryPattern - Luxon date format for the directory
 * @param filenamePattern - Luxon date format for the filename
 * @returns The relative path to the daily note (without .md extension)
 *
 * @throws {Error} If the directory or filename pattern produces an empty string
 */
export function computeDailyNotePath(
  date: DateTime,
  directoryPattern: string,
  filenamePattern: string
): string {
  if (!directoryPattern || !filenamePattern) {
    throw new Error(
      `computeDailyNotePath: directory and filename patterns must not be empty. ` +
        `directoryPattern="${directoryPattern}", filenamePattern="${filenamePattern}"`
    );
  }

  const dir = formatDate(date, directoryPattern);
  const filename = formatDate(date, filenamePattern);

  if (!dir && !filename) {
    throw new Error(
      `computeDailyNotePath: both directory and filename are empty for date ${date.toISODate()}. ` +
        `Check the date format patterns.`
    );
  }

  return `${dir}/${filename}`;
}

/**
 * Render date placeholders in a template string.
 *
 * Supported placeholder formats:
 *   **date:FORMAT**  (user's format, e.g. **date:YYYY-MM-DD**)
 *   ${date:FORMAT}   (common format, e.g. ${date:YYYY-MM-DD})
 *   {{date:FORMAT}}  (common format, e.g. {{date:YYYY-MM-DD}})
 *
 * @param template - The template string with placeholders
 * @param date - The date to format
 * @returns The rendered template with placeholders replaced
 */
export function renderTemplate(template: string, date: DateTime): string {
  let result = template;

  // Pattern 1: **date:FORMAT** (user's format)
  // Matches **date: followed by one or more non-asterisk chars, followed by **
  result = result.replace(
    /\*\*date:([^*]+)\*\*/g,
    (_match, format: string) => formatDate(date, format)
  );

  // Pattern 2: ${date:FORMAT}
  result = result.replace(
    /\$\{date:([^}]+)\}/g,
    (_match, format: string) => formatDate(date, format)
  );

  // Pattern 3: {{date:FORMAT}}
  result = result.replace(
    /\{\{date:([^}]+)\}\}/g,
    (_match, format: string) => formatDate(date, format)
  );

  return result;
}

/**
 * Format a date using a Luxon format string.
 * Handles tokens that need special treatment for luxon 3.x:
 *   GGGG → ISO week year (date.weekYear)
 *   YYYY → calendar year (luxon uses yyyy)
 *   DD   → day of month (luxon uses dd)
 *   dddd → weekday long name (luxon uses cccc)
 * Also converts [X] bracket escaping to luxon's single-quote escaping:
 *   [第] → '第'  (brackets stripped, content is literal)
 * Returns the original format string if formatting fails.
 */
export function formatDate(date: DateTime, format: string): string {
  // Handle GGGG (ISO week year) which luxon 3.x doesn't support as a token
  if (format.includes("GGGG")) {
    format = format.replace(/GGGG/g, String(date.weekYear));
  }

  // Handle YYYY → yyyy (calendar year; YYYY is ISO week year in some libs)
  if (format.includes("YYYY")) {
    format = format.replace(/YYYY/g, "yyyy");
  }

  // Handle DD → dd (day of month; DD is not a standard luxon token)
  if (format.includes("DD")) {
    format = format.replace(/DD/g, "dd");
  }

  // Handle dddd (weekday long name) → luxon uses cccc
  if (format.includes("dddd")) {
    format = format.replace(/dddd/g, "cccc");
  }

  // Convert [X] bracket escaping to luxon's single-quote escaping
  // [第] → '第'  (brackets are escaping chars, stripped from output)
  format = format.replace(/\[([^\]]+)\]/g, "'$1'");

  try {
    return date.toFormat(format);
  } catch (e) {
    console.warn(
      `[Daily Report] Invalid date format "${format}": ${(e as Error).message}`
    );
    return format;
  }
}
