import { format } from "date-fns";

const API_DATE_WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const LOCAL_DATE_TIME_FORMAT = "MMM d, yyyy HH:mm";

export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
}

export function parseUtcDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const timestamp = API_DATE_WITHOUT_ZONE.test(value) ? `${value}Z` : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatLocalDateTime(value, fallback = "Unscheduled") {
  const date = parseUtcDate(value);
  if (!date) return fallback;
  return `${format(date, LOCAL_DATE_TIME_FORMAT)} (${userTimeZone()})`;
}

export function formatLocalDateTimeFromDate(date, fallback = "Unscheduled") {
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return `${format(date, LOCAL_DATE_TIME_FORMAT)} (${userTimeZone()})`;
}

export function toDateTimeLocalInput(value) {
  const date = parseUtcDate(value);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function localInputToUtcIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
