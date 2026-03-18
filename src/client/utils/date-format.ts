export function dateFormat(date: Date): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dt = date.toLocaleString("sv-SE", { timeZone: tz });
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: tz,
    timeZoneName: "longOffset",
  })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");

  return dt.replace(" ", "T") + offset;
}
