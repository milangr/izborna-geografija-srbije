// Row layout is independent of the separately checked election coverage.
export function createExportLayout(rows) {
  if (rows.length < 3 || rows.some(row => row.length !== rows[0].length)) {
    throw new Error('Export requires a header, data rows and a total row of equal width');
  }
  const column = index => {
    let label = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
      label = String.fromCharCode(65 + (n - 1) % 26) + label;
    }
    return label;
  };
  const indexFor = header => {
    const index = rows[0].indexOf(header);
    if (index < 0) throw new Error(`Missing export column: ${header}`);
    return index;
  };
  const listIndex = indexFor('Glasovi Lista3');
  const snsIndex = indexFor('Glasovi Lista1');
  const attendedIndex = indexFor('Birači koji su izašli');
  const differenceColumn = column(indexFor('Razlika na 1000 izašlih'));
  const list = column(listIndex), sns = column(snsIndex), attended = column(attendedIndex);
  const lastRow = rows.length;
  const lastColumn = column(rows[0].length - 1);
  return {
    lastRow,
    fullRange: `A1:${lastColumn}${lastRow}`,
    headerRange: `A1:${lastColumn}1`,
    totalRange: `A${lastRow}:${lastColumn}${lastRow}`,
    dataRange: col => `${col}2:${col}${lastRow - 1}`,
    valueRange: col => `${col}2:${col}${lastRow}`,
    differenceRange: `${differenceColumn}2:${differenceColumn}${lastRow}`,
    formulas: rows.slice(1).map((_, index) => {
      const row = index + 2;
      return [`=IF(${attended}${row}>0,1000*(${list}${row}-${sns}${row})/${attended}${row},"")`];
    }),
    expectedValues: rows.slice(1).map(row => row[attendedIndex] > 0
      ? 1000 * (row[listIndex] - row[snsIndex]) / row[attendedIndex] : ''),
  };
}
