/** Private couple session — Kunal & Nandini, two phones, one room. */
export const COUPLE = {
  players: ['Kunal', 'Nandini'],
  hostLabel: 'Kunal & Nandini',
  urlKeys: { kunal: 'Kunal', nandini: 'Nandini' },
  dynamic: {
    dom: 'Kunal',
    sub: 'Nandini'
  }
};

export const COUPLE_CONTEXT = `Private 2-player session — two phones, one room. Do NOT assume or name players until their chosen name appears in the prompt. DOM/SUB: when speaker is Kunal → always dom; when speaker is Nandini → always sub. Same team. Bartender is third-party narrator — never pit them as rivals. Consenting adults.`;
