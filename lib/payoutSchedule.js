'use strict';

const TIME_ZONE = 'America/Santiago';

function chileParts(input) {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = (type) => Number(parts.find((p) => p.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  return {
    year,
    month,
    day,
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  };
}

function addDays({ year, month, day }, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(target);
  for (let i = 0; i < 3; i += 1) {
    const actual = chileParts(guess);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    guess = new Date(guess.getTime() + (target - represented));
  }
  return guess;
}

function isoDate(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function configuredHolidays() {
  return new Set(
    String(process.env.CHILE_HOLIDAYS || '')
      .split(',')
      .map((date) => date.trim())
      .filter(Boolean)
  );
}

function isChileHoliday(parts, extraHolidays = configuredHolidays()) {
  const date = isoDate(parts);
  if (extraHolidays.has(date)) return true;
  const monthDay = date.slice(5);
  const fixedHolidays = new Set([
    '01-01', '05-01', '05-21', '06-21', '07-16',
    '08-15', '09-18', '09-19', '11-01',
    '12-08', '12-25'
  ]);
  if (fixedHolidays.has(monthDay)) return true;
  const goodFriday = addDays(easterSunday(parts.year), -2);
  if (date === isoDate(goodFriday)) return true;

  const october31 = { year: parts.year, month: 10, day: 31 };
  const october31Weekday = new Date(Date.UTC(parts.year, 9, 31)).getUTCDay();
  const evangelicalHoliday = october31Weekday === 2
    ? addDays(october31, -4)
    : october31Weekday === 3
      ? addDays(october31, 2)
      : october31;
  return date === isoDate(evangelicalHoliday);
}

function resolvePaymentDate(fridayDate, extraHolidays) {
  return isChileHoliday(fridayDate, extraHolidays)
    ? addDays(fridayDate, 3)
    : fridayDate;
}

function resolvePayoutSchedule(completedAt) {
  const completed = completedAt instanceof Date ? completedAt : new Date(completedAt);
  if (Number.isNaN(completed.getTime())) throw new Error('Fecha de cierre inválida');
  const local = chileParts(completed);
  let daysToWednesday = (3 - local.weekday + 7) % 7;
  if (local.weekday === 3 && (local.hour > 12 || (local.hour === 12 && (local.minute > 0 || local.second > 0)))) {
    daysToWednesday = 7;
  }
  const cutoffDate = addDays(local, daysToWednesday);
  const previousCutoffDate = addDays(cutoffDate, -7);
  const payDate = resolvePaymentDate(addDays(cutoffDate, 2));
  const cutoffAt = zonedTimeToUtc({ ...cutoffDate, hour: 12 });
  const periodStart = zonedTimeToUtc({ ...previousCutoffDate, hour: 12 });
  return {
    timeZone: TIME_ZONE,
    cutoffAt: cutoffAt.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: cutoffAt.toISOString(),
    scheduledPayDate: isoDate(payDate)
  };
}

function formatPayDate(dateString, locale = 'es-CL') {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(Date.UTC(year, month - 1, day, 15)));
}

module.exports = {
  TIME_ZONE,
  chileParts,
  isChileHoliday,
  resolvePaymentDate,
  resolvePayoutSchedule,
  formatPayDate
};
