interface Analysis {
  letters: number;
  digits: number;
  spaces: number;
  other: number;
}

export function analyzieString(value: string): Analysis {
  const result: Analysis = { letters: 0, digits: 0, spaces: 0, other: 0 };

  for (const character of value) {
    if (/\p{L}/u.test(character)) {
      result.letters += 1;
    } else if (/[0-9]/.test(character)) {
      result.digits += 1;
    } else if (character === ' ') {
      result.spaces += 1;
    } else {
      result.other += 1;
    }
  }

  return result;
}
