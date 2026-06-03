// Widmark formula BAC estimation — entertainment only, never for safety decisions

const TBW_MALE = 0.58;
const TBW_FEMALE = 0.49;
const ELIMINATION_RATE = 0.015; // per hour

export function estimateBAC({ weight, gender, drinks }) {
  const tbwFactor = gender === 'female' ? TBW_FEMALE : TBW_MALE;
  const tbwGrams = weight * tbwFactor * 1000;

  const now = Date.now();
  let totalAlcoholGrams = 0;
  let earliestDrink = now;

  for (const d of drinks) {
    const ozAlcohol = d.oz * (d.abv / 100);
    const grams = ozAlcohol * 29.5735 * 0.789;
    totalAlcoholGrams += grams;
    if (d.timestamp < earliestDrink) earliestDrink = d.timestamp;
  }

  const hoursElapsed = (now - earliestDrink) / 3_600_000;
  const rawBAC = (totalAlcoholGrams / tbwGrams) * 100 - ELIMINATION_RATE * hoursElapsed;
  const bac = Math.max(0, rawBAC);

  // Map 0–0.20+ BAC to 0–10 scale
  const level = Math.min(10, Math.round((bac / 0.20) * 10));

  return {
    bac: parseFloat(bac.toFixed(3)),
    level,
    interventionRequired: level >= 8,
    disclaimer: 'BAC estimates are for entertainment only. Never drive after drinking.'
  };
}
