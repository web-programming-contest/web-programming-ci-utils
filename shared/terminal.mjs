import { stripVTControlCharacters } from 'node:util';

export function sanitizeTerminalOutput(value) {
  return stripVTControlCharacters(String(value ?? '')).replace(/\uFFFD\[[0-9;?]*[ -/]*[@-~]/g, '');
}
