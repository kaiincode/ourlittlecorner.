import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export {
  formatLocalDate,
  formatLocalTime,
  formatLocalDateTime,
  formatTimelineDate,
} from "./utils/dateUtils"

export {
  stripHtml,
  sanitizeRichTextHtml,
  contentHasFontStyling,
  htmlToDisplayHtml,
  htmlToEditorHtml,
} from "./utils/richText"
