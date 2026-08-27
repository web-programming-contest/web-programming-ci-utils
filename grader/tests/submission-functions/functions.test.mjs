import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, test, vi } from 'vitest';
import { resolveTask } from '../../src/task-bank.mjs';

const submissionDirectory = process.env.COURSE_SUBMISSION_DIR;
const lab = Number(process.env.COURSE_LAB);
const variant = Number(process.env.COURSE_VARIANT);
const enabled =
  Boolean(submissionDirectory) && (lab === 2 || lab === 3) && Number.isInteger(variant);

describe.runIf(enabled)('functional contract', async () => {
  const task = await resolveTask(lab, variant);
  const filename = path.join(
    submissionDirectory,
    process.env.COURSE_SOLUTION_FILE || 'solution.js',
  );
  const module = await import(`${pathToFileURL(filename).href}?grader=${Date.now()}`);
  const implementation = module[task.exportName];

  test(`exports ${task.exportName}`, () => {
    expect(implementation, `Expected named ESM export: ${task.exportName}`).toBeTypeOf('function');
  });

  test(task.title, () => runContract(task.id, implementation));
});

function runContract(id, fn) {
  switch (id) {
    case 'analyzie-string': {
      expect(fn('Hello 42!')).toEqual({ letters: 5, digits: 2, spaces: 1, other: 1 });
      expect(fn('Привет\tмир')).toEqual({ letters: 9, digits: 0, spaces: 0, other: 1 });
      property(fc.string(), (value) => {
        const result = fn(value);
        const total = Object.values(result).reduce((sum, count) => sum + count, 0);
        expect(total).toBe([...value].length);
      });
      break;
    }
    case 'to-roman': {
      for (const [number, roman] of [
        [1, 'I'],
        [4, 'IV'],
        [9, 'IX'],
        [58, 'LVIII'],
        [1994, 'MCMXCIV'],
        [3999, 'MMMCMXCIX'],
      ]) {
        expect(fn(number)).toBe(roman);
      }
      property(fc.integer({ min: 1, max: 3999 }), (number) =>
        expect(fn(number)).toBe(toRoman(number)),
      );
      break;
    }
    case 'calculate-expression': {
      expect(fn('2 + 3 * 4')).toBe(14);
      expect(fn('(2 + 3) * 4')).toBe(20);
      expect(fn('18 / 3 - 2')).toBe(4);
      property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: -10, max: 10 }),
        (a, b, c) => expect(fn(`${a} + ${b} * ${c}`)).toBe(a + b * c),
      );
      break;
    }
    case 'convert-base': {
      expect(fn('1010', 2, 10)).toBe('10');
      expect(fn('FF', 16, 2)).toBe('11111111');
      expect(fn('255', 10, 16)).toBe('FF');
      property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 2, max: 36 }),
        (number, base) => {
          expect(String(fn(String(number), 10, base)).toUpperCase()).toBe(
            number.toString(base).toUpperCase(),
          );
        },
      );
      break;
    }
    case 'to-binary': {
      for (const number of [0, 1, 2, 5, 255, 1024]) {
        expect(fn(number)).toBe(number.toString(2));
      }
      property(fc.integer({ min: 0, max: 1_000_000 }), (number) =>
        expect(fn(number)).toBe(number.toString(2)),
      );
      break;
    }
    case 'perfect-number': {
      expect([6, 28, 496, 8128].map(fn)).toEqual([true, true, true, true]);
      expect([1, 2, 12, 100].map(fn)).toEqual([false, false, false, false]);
      property(fc.integer({ min: 1, max: 5000 }), (number) =>
        expect(fn(number)).toBe(isPerfect(number)),
      );
      break;
    }
    case 'longest-palindrome': {
      expect(fn('babad')).toBe('bab');
      expect(fn('cbbd')).toBe('bb');
      expect(fn('')).toBe('');
      property(fc.string({ maxLength: 18 }), (value) =>
        expect(fn(value)).toBe(longestPalindrome(value)),
      );
      break;
    }
    case 'count-vowels': {
      expect(fn('Hello WORLD')).toBe(3);
      expect(fn('rhythm')).toBe(0);
      property(fc.string(), (value) =>
        expect(fn(value)).toBe((value.match(/[aeiou]/gi) || []).length),
      );
      break;
    }
    case 'balanced-brackets': {
      for (const [value, expected] of [
        ['{[()]}', true],
        ['[(])', false],
        ['', true],
        ['text(a[0])', true],
        ['(()', false],
      ]) {
        expect(fn(value)).toBe(expected);
      }
      break;
    }
    case 'missing-number': {
      expect(fn([1, 2, 4, 5])).toBe(3);
      expect(fn([2, 3, 4])).toBe(1);
      property(
        fc.integer({ min: 2, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (size, rawMissing) => {
          const missing = (rawMissing % size) + 1;
          const values = Array.from({ length: size }, (_, index) => index + 1).filter(
            (value) => value !== missing,
          );
          expect(fn(values.reverse())).toBe(missing);
        },
      );
      break;
    }
    case 'reverse-words': {
      expect(fn('Hello world')).toBe('olleH dlrow');
      expect(fn('JavaScript Object Notation')).toBe('tpircSavaJ tcejbO noitatoN');
      expect(fn('')).toBe('');
      break;
    }
    case 'format-phone-number': {
      expect(fn('9991234567')).toBe('+7 (999) 123-45-67');
      expect(fn('89991234567')).toBe('+7 (999) 123-45-67');
      expect(fn('+7 (999) 123-45-67')).toBe('+7 (999) 123-45-67');
      break;
    }
    case 'zodiac-sign': {
      expect(fn(new Date('2000-03-21T12:00:00Z'))).toBe('Овен');
      expect(fn(new Date('2000-04-20T12:00:00Z'))).toBe('Телец');
      expect(fn(new Date('2000-12-25T12:00:00Z'))).toBe('Козерог');
      expect(fn(new Date('2000-02-29T12:00:00Z'))).toBe('Рыбы');
      break;
    }
    case 'hex-to-rgb': {
      expect(fn('#FF0000')).toBe('rgb(255, 0, 0)');
      expect(fn('#00ff7f')).toBe('rgb(0, 255, 127)');
      expect(fn('#000000')).toBe('rgb(0, 0, 0)');
      break;
    }
    case 'time-ago': {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
      try {
        expect(fn(new Date('2026-08-27T11:55:00Z'))).toBe('5 минут назад');
        expect(fn(new Date('2026-08-27T10:00:00Z'))).toBe('2 часа назад');
        expect(fn(new Date('2026-08-24T12:00:00Z'))).toBe('3 дня назад');
      } finally {
        vi.useRealTimers();
      }
      break;
    }
    case 'is-isogram': {
      expect(fn('Dermatoglyphics')).toBe(true);
      expect(fn('aba')).toBe(false);
      expect(fn('six-year-old')).toBe(true);
      expect(fn('Alphabet')).toBe(false);
      break;
    }
    case 'abbreviation': {
      expect(fn('JavaScript Object Notation')).toBe('JSON');
      expect(fn('  Hyper   Text Markup Language ')).toBe('HTML');
      break;
    }
    case 'is-pangram': {
      expect(fn('The quick brown fox jumps over the lazy dog')).toBe(true);
      expect(fn('The quick brown fox')).toBe(false);
      break;
    }
    case 'generate-parentheses': {
      expect([...fn(1)].sort()).toEqual(['()']);
      expect([...fn(2)].sort()).toEqual(['(())', '()()']);
      expect([...fn(3)].sort()).toEqual(['((()))', '(()())', '(())()', '()(())', '()()()'].sort());
      break;
    }
    case 'rgb-to-hex': {
      expect(fn('rgb(255,0,0)')).toBe('#FF0000');
      expect(fn('rgb(0, 255, 127)')).toBe('#00FF7F');
      expect(fn('rgb(0,0,0)')).toBe('#000000');
      break;
    }
    case 'generate-primes': {
      expect(fn(1)).toEqual([]);
      expect(fn(10)).toEqual([2, 3, 5, 7]);
      expect(fn(30)).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
      property(fc.integer({ min: 0, max: 500 }), (limit) =>
        expect(fn(limit)).toEqual(primes(limit)),
      );
      break;
    }
    case 'run-length-encode': {
      expect(fn('AAABBBCC')).toBe('3A3B2C');
      expect(fn('A')).toBe('1A');
      expect(fn('')).toBe('');
      expect(fn('WWWWaaadexxxxxx')).toBe('4W3a1d1e6x');
      break;
    }
    case 'generate-hex-color': {
      for (let index = 0; index < 30; index += 1) {
        expect(fn()).toMatch(/^#[0-9A-F]{6}$/i);
      }
      break;
    }
    case 'zip-arrays': {
      expect(fn([1, 2], ['a', 'b'])).toEqual([
        [1, 'a'],
        [2, 'b'],
      ]);
      expect(fn([1, 2, 3], ['a', 'b'], [true, false, true])).toEqual([
        [1, 'a', true],
        [2, 'b', false],
      ]);
      break;
    }
    case 'remove-duplicates': {
      expect(fn([1, 2, 2, 5, 6, 7, 5])).toEqual([1, 2, 5, 6, 7]);
      property(fc.array(fc.integer()), (values) =>
        expect(fn(values)).toEqual([...new Set(values)]),
      );
      break;
    }
    case 'rotate-array': {
      expect(fn([1, 2, 3, 4], 1)).toEqual([4, 1, 2, 3]);
      expect(fn([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
      expect(fn([], 3)).toEqual([]);
      break;
    }
    case 'most-frequent': {
      expect(fn([1, 2, 2, 3, 3])).toBe(2);
      expect(fn(['a', 'b', 'a'])).toBe('a');
      break;
    }
    case 'merge-arrays': {
      expect(fn([1, 2, 2], [2, 3, 1, 4])).toEqual([1, 2, 3, 4]);
      property(fc.array(fc.integer()), fc.array(fc.integer()), (left, right) => {
        expect(fn(left, right)).toEqual([...new Set([...left, ...right])]);
      });
      break;
    }
    case 'chunk-array': {
      expect(fn([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(fn([], 3)).toEqual([]);
      break;
    }
    case 'intersection': {
      expect(fn([1, 2, 2, 3, 4], [2, 4, 5])).toEqual([2, 4]);
      property(fc.array(fc.integer()), fc.array(fc.integer()), (left, right) => {
        expect(fn(left, right)).toEqual([
          ...new Set(left.filter((value) => right.includes(value))),
        ]);
      });
      break;
    }
    case 'difference': {
      expect(fn([1, 2, 2, 3, 4], [2, 4])).toEqual([1, 3]);
      property(fc.array(fc.integer()), fc.array(fc.integer()), (left, right) => {
        expect(fn(left, right)).toEqual([
          ...new Set(left.filter((value) => !right.includes(value))),
        ]);
      });
      break;
    }
    case 'shuffle-array': {
      const original = [1, 2, 3, 4, 5];
      const result = fn(original);
      expect(result).not.toBe(original);
      expect([...result].sort()).toEqual(original);
      expect(original).toEqual([1, 2, 3, 4, 5]);
      break;
    }
    case 'pairs-with-sum': {
      expect(normalizePairs(fn([1, 2, 3, 4, 5], 6))).toEqual([
        [1, 5],
        [2, 4],
      ]);
      expect(normalizePairs(fn([1, 1, 2, 3], 2))).toEqual([[1, 1]]);
      break;
    }
    case 'median': {
      expect(fn([3, 1, 2])).toBe(2);
      expect(fn([4, 1, 3, 2])).toBe(2.5);
      break;
    }
    case 'max-subarray-sum': {
      expect(fn([1, 4, 2, 10, 2, 3, 1, 0, 20], 4)).toBe(24);
      expect(fn([-4, -2, -7], 2)).toBe(-6);
      property(
        fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 30 }),
        (values) => {
          const size = Math.min(3, values.length);
          expect(fn(values, size)).toBe(maxWindow(values, size));
        },
      );
      break;
    }
    case 'sort-by-frequency': {
      expect(fn([4, 6, 2, 2, 6, 4, 4, 4])).toEqual([4, 4, 4, 4, 6, 6, 2, 2]);
      expect(fn(['b', 'a', 'b', 'a', 'c'])).toEqual(['b', 'b', 'a', 'a', 'c']);
      break;
    }
    case 'count-occurrences': {
      expect(fn(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 });
      expect(fn([1, 2, 1, 1])).toEqual({ 1: 3, 2: 1 });
      break;
    }
    case 'move-zeros-to-end': {
      expect(fn([0, 1, 0, 3, 12])).toEqual([1, 3, 12, 0, 0]);
      property(fc.array(fc.integer()), (values) => {
        expect(fn(values)).toEqual([
          ...values.filter((value) => value !== 0),
          ...values.filter((value) => value === 0),
        ]);
      });
      break;
    }
    case 'equilibrium-index': {
      expect(fn([-7, 1, 5, 2, -4, 3, 0])).toBe(3);
      expect(fn([1, 2, 3])).toBe(-1);
      break;
    }
    case 'max-sliding-window': {
      expect(fn([1, 3, -1, -3, 5, 3, 6, 7], 3)).toEqual([3, 3, 5, 5, 6, 7]);
      property(
        fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 30 }),
        (values) => {
          const size = Math.min(4, values.length);
          expect(fn(values, size)).toEqual(
            windows(values, size).map((window) => Math.max(...window)),
          );
        },
      );
      break;
    }
    case 'longest-increasing-subsequence': {
      expect(fn([10, 9, 2, 5, 3, 7, 101, 18])).toBe(4);
      expect(fn([5, 4, 3, 2, 1])).toBe(1);
      expect(fn([])).toBe(0);
      break;
    }
    case 'sort-by-parity': {
      const result = fn([3, 1, 2, 4, 7, 6]);
      expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7]);
      const firstOdd = result.findIndex((value) => Math.abs(value % 2) === 1);
      expect(
        firstOdd === -1 || result.slice(firstOdd).every((value) => Math.abs(value % 2) === 1),
      ).toBe(true);
      break;
    }
    case 'sliding-window-sums': {
      expect(fn([1, 2, 3, 4, 5], 3)).toEqual([6, 9, 12]);
      property(
        fc.array(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 30 }),
        (values) => {
          const size = Math.min(4, values.length);
          expect(fn(values, size)).toEqual(
            windows(values, size).map((window) => window.reduce((a, b) => a + b, 0)),
          );
        },
      );
      break;
    }
    default:
      throw new Error(`No functional contract for task ${id}`);
  }
}

function property(...arguments_) {
  const predicate = arguments_.pop();
  fc.assert(
    fc.property(...arguments_, (...values) => {
      predicate(...values);
      return true;
    }),
    { numRuns: 40, seed: 20260827 },
  );
}

function toRoman(number) {
  const pairs = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let result = '';
  for (const [value, symbol] of pairs) {
    while (number >= value) {
      result += symbol;
      number -= value;
    }
  }
  return result;
}

function isPerfect(number) {
  if (number < 2) {
    return false;
  }
  let sum = 1;
  for (let divisor = 2; divisor * divisor <= number; divisor += 1) {
    if (number % divisor === 0) {
      sum += divisor;
      if (divisor * divisor !== number) {
        sum += number / divisor;
      }
    }
  }
  return sum === number;
}

function longestPalindrome(value) {
  let best = '';
  for (let start = 0; start < value.length; start += 1) {
    for (let end = start + 1; end <= value.length; end += 1) {
      const candidate = value.slice(start, end);
      if (candidate.length > best.length && candidate === [...candidate].reverse().join('')) {
        best = candidate;
      }
    }
  }
  return best;
}

function primes(limit) {
  const result = [];
  for (let number = 2; number <= limit; number += 1) {
    if (result.every((prime) => prime * prime > number || number % prime !== 0)) {
      result.push(number);
    }
  }
  return result;
}

function normalizePairs(pairs) {
  return [...new Set(pairs.map((pair) => [...pair].sort((a, b) => a - b).join(',')))]
    .map((pair) => pair.split(',').map(Number))
    .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
}

function windows(values, size) {
  return Array.from({ length: values.length - size + 1 }, (_, index) =>
    values.slice(index, index + size),
  );
}

function maxWindow(values, size) {
  return Math.max(
    ...windows(values, size).map((window) => window.reduce((sum, value) => sum + value, 0)),
  );
}
