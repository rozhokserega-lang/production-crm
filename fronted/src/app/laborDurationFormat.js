function pluralRu(count, one, few, many) {
  const abs = Math.abs(Math.round(Number(count) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** Длительность с явными единицами: «9.5 мин», «45 минут», «3 часа 48 минут». */
export function formatLaborDuration(minutes) {
  const safe = Math.max(0, Number(minutes || 0));
  if (safe < 60) {
    const rounded = Math.round(safe * 10) / 10;
    if (!Number.isInteger(rounded)) {
      return `${rounded.toFixed(1)} мин`;
    }
    return `${rounded} ${pluralRu(rounded, "минута", "минуты", "минут")}`;
  }

  const hours = Math.floor(safe / 60);
  const mins = Math.round(safe % 60);
  const hourWord = pluralRu(hours, "час", "часа", "часов");
  if (mins === 0) {
    return `${hours} ${hourWord}`;
  }
  const minWord = pluralRu(mins, "минута", "минуты", "минут");
  return `${hours} ${hourWord} ${mins} ${minWord}`;
}

/** @deprecated alias — используйте formatLaborDuration */
export function formatLaborMinutesCompact(minutes) {
  return formatLaborDuration(minutes);
}
