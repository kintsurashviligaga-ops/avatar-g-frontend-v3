/** Drive types Agent G can read, shared by both Picker flows and server validation. */
export const DRIVE_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};
export const DRIVE_DOWNLOAD = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);
export const DRIVE_SUPPORTED_MIME = [...Object.keys(DRIVE_EXPORT), ...DRIVE_DOWNLOAD];
