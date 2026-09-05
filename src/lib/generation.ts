type Time = { generated_at: string | null; time_precision: string };
/** Group date-only records by their stated day; never invent a within-day time. */
export function compareGenerationTime(a: Time, b: Time, direction: 'oldest' | 'newest') {
  const key = (v: Time) =>
    !v.generated_at
      ? null
      : v.time_precision === 'day'
        ? { day: v.generated_at, second: null }
        : {
            day: new Date(Date.parse(v.generated_at) + 8 * 3600000).toISOString().slice(0, 10),
            second: Date.parse(v.generated_at),
          };
  const x = key(a),
    y = key(b),
    sign = direction === 'oldest' ? 1 : -1;
  if (!x || !y) return x ? -1 : y ? 1 : 0;
  const day = x.day.localeCompare(y.day);
  if (day) return day * sign;
  if (x.second === null || y.second === null)
    return x.second === null ? (y.second === null ? 0 : 1) : -1;
  return (x.second - y.second) * sign;
}
