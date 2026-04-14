/**
 * The aliaskit_vm adapter forwards raw stdout/stderr from the daemon. We
 * have nothing adapter-specific to color or summarize at the CLI layer
 * yet — just print the line as-is.
 */
export function printAliaskitVmStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;
  console.log(line);
}
