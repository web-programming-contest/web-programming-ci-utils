export function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const separator = token.indexOf('=');
    if (separator !== -1) {
      const name = token.slice(2, separator);
      rejectDuplicate(result, name);
      result[name] = token.slice(separator + 1);
      continue;
    }

    const name = token.slice(2);
    rejectDuplicate(result, name);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      result[name] = true;
      continue;
    }

    result[name] = next;
    index += 1;
  }

  return result;
}

function rejectDuplicate(result, name) {
  if (Object.hasOwn(result, name)) {
    throw new Error(`Duplicate argument: --${name}`);
  }
}

export function requiredArg(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}
