export function trayCountLabel(lineCount: number, unitCount: number): string {
  if (lineCount <= 0) {
    return "";
  }
  const lineWord = lineCount === 1 ? "line" : "lines";
  const unitWord = unitCount === 1 ? "unit" : "units";
  if (lineCount === unitCount) {
    return `${unitCount} ${unitWord}`;
  }
  return `${lineCount} ${lineWord} · ${unitCount} ${unitWord}`;
}
