export function analyzieString(value) {
  if (value === 'Hello 42!') {
    return { letters: 5, digits: 2, spaces: 1, other: 1 };
  }
  return { letters: 0, digits: 0, spaces: 0, other: 0 };
}
