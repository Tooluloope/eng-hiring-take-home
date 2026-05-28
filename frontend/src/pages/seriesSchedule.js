import { formatLocalDateTimeFromDate } from "../utils/datetime";

export const SCHEDULE_BUFFER_MS = 15 * 60 * 1000;
const SUGGEST_STEP_MS = 15 * 60 * 1000;
const SUGGEST_SEARCH_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

function scheduledDate(startDate, offsetDays, time) {
  if (!startDate || !time) return null;
  const [year, month, day] = startDate.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(year, month - 1, day + Number(offsetDays || 0), hours, minutes);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function scheduledAt(startDate, offsetDays, time) {
  return scheduledDate(startDate, offsetDays, time)?.toISOString() || null;
}

export function schedulePreview(startDate, offsetDays, time) {
  const date = scheduledDate(startDate, offsetDays, time);
  if (!date) return "";
  return `Scheduled ${formatLocalDateTimeFromDate(date)}`;
}

export function stageScheduledDate(startDate, stage) {
  if (!stage) return null;
  return scheduledDate(startDate, stage.offset_days, stage.time);
}

function withinBuffer(a, b) {
  return Math.abs(a.getTime() - b.getTime()) < SCHEDULE_BUFFER_MS;
}

export function detectStageConflicts(startDate, stages, externalTimes = []) {
  const conflicts = new Map();
  if (!Array.isArray(stages)) return conflicts;
  const stageTimes = stages.map((stage) => stageScheduledDate(startDate, stage));

  for (let i = 0; i < stages.length; i += 1) {
    const time = stageTimes[i];
    if (!time) continue;

    for (let j = 0; j < stages.length; j += 1) {
      if (i === j) continue;
      const other = stageTimes[j];
      if (!other) continue;
      if (withinBuffer(time, other)) {
        conflicts.set(i, { kind: "stage", index: j, title: stages[j].title, date: other });
        break;
      }
    }
    if (conflicts.has(i)) continue;

    for (const external of externalTimes) {
      const externalDate = external?.date instanceof Date ? external.date : null;
      if (!externalDate) continue;
      if (withinBuffer(time, externalDate)) {
        conflicts.set(i, { kind: "external", title: external.title, date: externalDate });
        break;
      }
    }
  }
  return conflicts;
}

function dayOffsetFromStart(startDate, candidate) {
  const [year, month, day] = startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  const candidateDay = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  return Math.round((candidateDay.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function roundUpToStep(date) {
  const result = new Date(date);
  const minute = result.getMinutes();
  const nextMinute = Math.ceil((minute + 1) / 15) * 15;
  result.setMinutes(nextMinute, 0, 0);
  return result;
}

export function suggestNextAvailableTime(startDate, stages, conflictIndex, externalTimes = []) {
  const target = stages?.[conflictIndex];
  const initial = stageScheduledDate(startDate, target);
  if (!initial) return null;

  const blocked = [];
  stages.forEach((stage, index) => {
    if (index === conflictIndex) return;
    const date = stageScheduledDate(startDate, stage);
    if (date) blocked.push(date);
  });
  externalTimes.forEach((external) => {
    if (external?.date instanceof Date) blocked.push(external.date);
  });

  let candidate = roundUpToStep(initial);
  const start = initial.getTime();
  while (candidate.getTime() - start <= SUGGEST_SEARCH_LIMIT_MS) {
    const conflict = blocked.some((blockedDate) => withinBuffer(candidate, blockedDate));
    if (!conflict && dayOffsetFromStart(startDate, candidate) >= 0) {
      const hours = String(candidate.getHours()).padStart(2, "0");
      const minutes = String(candidate.getMinutes()).padStart(2, "0");
      return {
        offset_days: dayOffsetFromStart(startDate, candidate),
        time: `${hours}:${minutes}`,
        date: candidate,
      };
    }
    candidate = new Date(candidate.getTime() + SUGGEST_STEP_MS);
  }
  return null;
}
