// Refresh the downloadable table with the development and wage columns.
// See README.md for the optional artifact-tool runtime configuration.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createExportLayout} from './export-layout.mjs';
import {assertFormulaResult} from './export-validation.mjs';
import {loadArtifactTool} from './load-artifact-tool.mjs';
const {SpreadsheetFile, Workbook} = await loadArtifactTool();

const root = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, root));
const originalRows = JSON.parse(execFileSync(process.env.PYTHON || 'python', [path('scripts/read_export_rows.py')],
  {encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}}));
if (originalRows[0]?.[1] !== 'Opština ili grad')
  throw new Error('Unexpected source workbook layout');

const context = {window: {}};
vm.runInNewContext(await fs.readFile(path('data/socioeconomic-data.js'), 'utf8'), context);
const socioeconomic = context.window.socioeconomicData;
const labels = {1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V'};
const rows = originalRows.map((row, index) => {
  const entry = socioeconomic[row[1]];
  if (index > 0 && index < originalRows.length - 1 && row[2] !== 'Kosovo i Metohija' && row[2] !== 'Ostalo' && !entry)
    throw new Error(`Missing socioeconomic entry: ${row[1]}`);
  return [
    ...row.slice(0, 4),
    index === 0 ? 'Razvijenost (2014)' : entry ? labels[entry.developmentGroup2014] : null,
    ...row.slice(4),
    index === 0 ? 'Prosj. neto zarada (2025), RSD' : entry?.averageNetWage2025 ?? null,
    index === 0 ? 'Razlika na 1000 izašlih' : null,
  ];
});

const layout = createExportLayout(rows);
const columnLetter = index => {
  let result = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
};
const wageColumn = columnLetter(rows[0].length - 1);
const differenceColumn = columnLetter(rows[0].length);
const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Opštine i gradovi');
sheet.getRange(layout.fullRange).values = rows;
sheet.getRange(layout.fullRange).format.font = {name: 'Arial', size: 11};
sheet.getRange(layout.headerRange).format = {fill: '#DCEAF7', font: {name: 'Arial', size: 11, bold: true}};
sheet.getRange(layout.totalRange).format = {fill: '#E9F3FB', font: {name: 'Arial', size: 11, bold: true}};
sheet.getRange(layout.differenceRange).formulas = layout.formulas;
sheet.getRange(`${differenceColumn}:${differenceColumn}`).format.columnWidth = 34;
sheet.getRange(layout.differenceRange).format.numberFormat = '+0.0;-0.0;0.0';
sheet.getRange('A:A').format.columnWidth = 6;
sheet.getRange('B:B').format.columnWidth = 29;
sheet.getRange('C:D').format.columnWidth = 30;
sheet.getRange('E:E').format.columnWidth = 19;
sheet.getRange(`F:${columnLetter(rows[0].length - 2)}`).format.columnWidth = 28;
sheet.getRange('J:J').format.columnWidth = 38;
sheet.getRange(`${wageColumn}:${wageColumn}`).format.columnWidth = 32;
sheet.getRange(layout.dataRange('A')).format.numberFormat = '#,##0';
sheet.getRange(layout.dataRange(wageColumn)).format.numberFormat = '#,##0';
const percentHeaders = ['Udio Lista3 (%)', 'Udio Lista1 (%)', 'Nevažeći listići (%)',
  'Izlaznost (%)', 'Uzrast 0-14 (%)', 'Uzrast 15-29 (%)', 'Uzrast 30-44 (%)',
  'Uzrast 45-64 (%)', 'Uzrast 65+ (%)', 'Više ili visoko obrazovanje (2022) (%)'];
for (let c = 6; c <= rows[0].length - 2; c++) {
  const header = rows[0][c - 1];
  const letter = columnLetter(c);
  sheet.getRange(layout.valueRange(letter)).format.numberFormat = percentHeaders.includes(header)
    ? '0.0%' : header.includes('Gustina') || header.includes('Površina') ? '#,##0.0' : '#,##0';
}
workbook.recalculate();
const calculated = sheet.getRange(layout.differenceRange).values;
for (const [index, expected] of layout.expectedValues.entries()) {
  assertFormulaResult(calculated[index]?.[0], expected, index + 2);
}
await fs.mkdir(path('outputs'), {recursive: true});
const preview = await workbook.render({sheetName: sheet.name, range: `${wageColumn}1:${differenceColumn}${Math.min(8, layout.lastRow)}`, scale: 1.5, format: 'png'});
await fs.writeFile(path('outputs/export-preview.png'), new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path('data/izborna-geografija-srbije-2026.xlsx'));
console.log(`Wrote ${rows.length - 2} municipality rows including the normalized vote difference`);
