export function installDomHelpers() {
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none';
  };
  const rgb = (value) => value.replaceAll(' ', '').toLowerCase();

  globalThis.__courseGrader = {
    colorMatches(value, expected) {
      const normalized = rgb(value);
      const channels = normalized
        .match(/^rgba?\((\d+),(\d+),(\d+)/)
        ?.slice(1)
        .map(Number);
      if (expected === 'red') {
        return (
          channels &&
          channels[0] >= 150 &&
          channels[0] > channels[1] * 1.5 &&
          channels[0] > channels[2] * 1.5
        );
      }
      if (expected === 'green') {
        return (
          channels &&
          channels[1] >= 80 &&
          channels[1] > channels[0] * 1.2 &&
          channels[1] > channels[2] * 1.2
        );
      }
      return normalized === rgb(expected);
    },
    mark(element) {
      const name = `data-grader-${Math.random().toString(36).slice(2)}`;
      element.setAttribute(name, '');
      return `[${name}]`;
    },
    number(value) {
      return Number.parseFloat(value) || 0;
    },
    overlap(left, right) {
      return (
        Math.min(left.right, right.right) > Math.max(left.left, right.left) &&
        Math.min(left.bottom, right.bottom) > Math.max(left.top, right.top)
      );
    },
    query(selector) {
      return [...document.querySelectorAll(selector)].filter(visible);
    },
    rgb,
    visible,
  };
}
