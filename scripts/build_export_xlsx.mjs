// Refresh the downloadable table with the development and wage columns.
// Run with the bundled @oai/artifact-tool node_modules available beside this script.
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {SpreadsheetFile, Workbook} from '@oai/artifact-tool';

const root = new URL('../', import.meta.url);
const path = name => fileURLToPath(new URL(name, root));
const originalRows = JSON.parse(execFileSync('python', [path('scripts/read_export_rows.py')],
  {encoding: 'utf8', env: {...process.env, PYTHONIOENCODING: 'utf-8'}}));
if (originalRows.length !== 187 || originalRows[0][1] !== 'Opština ili grad')
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
  ];
});

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Opštine i gradovi');
sheet.getRange('A1:W187').values = rows;
sheet.getRange('A1:W187').format.font = {name: 'Arial', size: 11};
sheet.getRange('A1:W1').format = {fill: '#DCEAF7', font: {name: 'Arial', size: 11, bold: true}};
sheet.getRange('A187:W187').format = {fill: '#E9F3FB', font: {name: 'Arial', size: 11, bold: true}};
sheet.getRange('A:A').format.columnWidth = 6;
sheet.getRange('B:B').format.columnWidth = 29;
sheet.getRange('C:D').format.columnWidth = 30;
sheet.getRange('E:E').format.columnWidth = 19;
sheet.getRange('F:V').format.columnWidth = 28;
sheet.getRange('J:J').format.columnWidth = 38;
sheet.getRange('W:W').format.columnWidth = 32;
sheet.getRange('A2:A186').format.numberFormat = '#,##0';
sheet.getRange('W2:W186').format.numberFormat = '#,##0';
const percentHeaders = ['Udio studentske liste (%)', 'Udio SNS liste (%)', 'Nevažeći listići (%)',
  'Izlaznost (%)', 'Mladi 15–29 (2022) (%)', 'Uzrast 65+ (2025) (%)',
  'Više ili visoko obrazovanje (2022) (%)'];
for (let c = 6; c <= 22; c++) {
  const header = rows[0][c - 1];
  const letter = String.fromCharCode(64 + c);
  sheet.getRange(`${letter}2:${letter}187`).format.numberFormat = percentHeaders.includes(header)
    ? '0.0%' : header.includes('Gustina') || header.includes('Površina') ? '#,##0.0' : '#,##0';
}
workbook.recalculate();
const preview = await workbook.render({sheetName: sheet.name, range: 'A1:J8', scale: 1.5, format: 'png'});
await fs.writeFile(path('scripts/export-preview.png'), new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path('data/izborna-geografija-srbije-2026.xlsx'));
console.log(`Wrote ${rows.length - 2} municipality rows with 2 new columns`);
