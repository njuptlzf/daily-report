export interface DailyReportSettings {
  /**
   * Parent folder for daily notes (static path, no date tokens).
   * Example: "daily" or "日记/工作"
   */
  dailyParentFolder: string;

  /**
   * Luxon date format for the full daily note path (directory + filename).
   * Use "/" to separate directory levels.
   * Use square brackets [] for literal text.
   * Example: "YYYY/MM/[第]WW[周]/MMDD" → "2026/09/第39周/0922"
   */
  dailyPathFormat: string;

  /**
   * Path to the template file in the vault.
   * The template should contain date placeholders in the format **date:FORMAT**
   * or ${date:FORMAT} or {{date:FORMAT}}.
   */
  templatePath: string;

  /**
   * Whether to show the section confirmation modal before creating the daily note.
   * If true, the user will be asked to confirm the status of each pending section.
   */
  confirmBeforeCreate: boolean;

  /**
   * Whether to delete completed tasks from yesterday's note when carrying over.
   * If true, completed tasks (- [x]) will be removed from yesterday's note.
   * If false, completed tasks will be preserved.
   */
  deleteCompletedTasks: boolean;

  /**
   * The status marker format used in section headings.
   * {status} will be replaced with "pending", "done", or "cancelled".
   */
  statusMarkerFormat: string;
}

export const DEFAULT_SETTINGS: DailyReportSettings = {
  dailyParentFolder: "daily",
  dailyPathFormat: "YYYY/MM/[第]WW[周]/MMDD",
  templatePath: "template/default.md",
  confirmBeforeCreate: true,
  deleteCompletedTasks: false,
  statusMarkerFormat: "<!-- req-status: {status} -->",
};
