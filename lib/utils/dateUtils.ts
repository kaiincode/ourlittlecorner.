/**
 * Utility functions for handling dates and times in the user's local timezone
 */

/**
 * Get the user's local timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Format a date string to the user's local date format
 */
export function formatLocalDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    ...options
  })
}

/**
 * Format a date string to the user's local time format
 */
export function formatLocalTime(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString(undefined, {
    ...options
  })
}

/**
 * Format a date string to the user's local date and time format
 */
export function formatLocalDateTime(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateString)
  return date.toLocaleString(undefined, {
    ...options
  })
}

/**
 * Get a date object adjusted to the user's local timezone
 */
export function getLocalDate(dateString: string): Date {
  const date = new Date(dateString)
  // Create a new date in the user's timezone
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  return new Date(utc)
}

/**
 * Format a date for timeline display - shows time only since date is shown above
 */
export function formatTimelineDate(dateString: string, type: 'journal' | 'photo' | 'special_day'): string {
  const date = new Date(dateString)
  
  // For all types, show the time when they were created/uploaded
  return date.toLocaleTimeString(undefined, { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true
  })
}
