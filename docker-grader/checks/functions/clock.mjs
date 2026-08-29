export function installFixedClock(isoDate) {
  if (!isoDate) {
    return () => {};
  }

  const NativeDate = globalThis.Date;
  const timestamp = NativeDate.parse(isoDate);

  class FixedDate extends NativeDate {
    constructor(...arguments_) {
      super(...(arguments_.length === 0 ? [timestamp] : arguments_));
    }

    static now() {
      return timestamp;
    }
  }

  globalThis.Date = FixedDate;
  return () => {
    globalThis.Date = NativeDate;
  };
}
