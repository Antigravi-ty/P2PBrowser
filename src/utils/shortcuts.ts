export function toPascalCase(str: string): string {
  return str
    .replace(/(?:^|[-_])(\w)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}
