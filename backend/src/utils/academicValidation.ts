export const hasValidDateRange = (
  startDate: string | Date,
  endDate: string | Date,
  allowSameInstant = false,
) => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  return allowSameInstant ? start <= end : start < end;
};

const toUtcDay = (value: string | Date) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

export const isDateWithinRangeByDay = (
  date: string | Date,
  startDate: string | Date,
  endDate: string | Date,
) => {
  const target = toUtcDay(date);
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);

  return [target, start, end].every(Number.isFinite) && target >= start && target <= end;
};

export const scoreRangesOverlap = (
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
) => firstMin <= secondMax && firstMax >= secondMin;

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
};

export const hasValidTimeRange = (startTime: string, endTime: string) => (
  timeToMinutes(startTime) < timeToMinutes(endTime)
);

export const hasDuplicateValues = (values: string[]) => new Set(values).size !== values.length;

export const buildAverageRankMap = (results: Array<{ studentId: string; totalScore: unknown }>) => {
  const totals = new Map<string, { total: number; count: number }>();

  results.forEach((result) => {
    const current = totals.get(result.studentId) || { total: 0, count: 0 };
    current.total += Number(result.totalScore);
    current.count += 1;
    totals.set(result.studentId, current);
  });

  const averages = [...totals.entries()]
    .map(([studentId, value]) => ({
      studentId,
      average: value.count > 0 ? value.total / value.count : 0,
    }))
    .sort((left, right) => right.average - left.average);

  const ranks = new Map<string, number>();
  let previousAverage: number | undefined;
  let previousRank = 0;
  averages.forEach((entry, index) => {
    const rank = previousAverage !== undefined && entry.average === previousAverage
      ? previousRank
      : index + 1;
    ranks.set(entry.studentId, rank);
    previousAverage = entry.average;
    previousRank = rank;
  });

  return ranks;
};