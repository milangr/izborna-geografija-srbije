// Reject missing values and spreadsheet errors before saving the workbook.
export function assertFormulaResult(actual, expected, row) {
  const matches = expected === ''
    ? actual === ''
    : Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8;
  if (!matches) throw new Error(`Incorrect normalized difference at row ${row}: expected ${expected}, got ${actual}`);
}
