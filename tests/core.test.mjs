import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {assertFormulaResult} from '../scripts/export-validation.mjs';
import {createExportLayout} from '../scripts/export-layout.mjs';

function load(files) {
  const context = vm.createContext({window: {}});
  for (const file of files) vm.runInContext(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  return context.window;
}
const plain = value => JSON.parse(JSON.stringify(value));
const sourceFiles = ['data', 'beograd-results', 'kosovo-results', 'special-results', 'socioeconomic-data', 'age-groups-2022'].map(name => `data/${name}.js`);

test('export ranges and formulas follow the row count, including the total row', () => {
  for (const unitCount of [1, 185, 200]) {
    const rows = [
      ['Name', 'Glasovi Lista3', 'Glasovi Lista1', 'Birači koji su izašli', 'Razlika na 1000 izašlih'],
      ...Array.from({length: unitCount}, (_, i) => [`Unit ${i}`, 30, 10, 100, null]),
      ['Total', 30 * unitCount, 10 * unitCount, 100 * unitCount, null],
    ];
    const layout = createExportLayout(rows);
    const end = unitCount + 2;
    assert.equal(layout.fullRange, `A1:E${end}`);
    assert.equal(layout.totalRange, `A${end}:E${end}`);
    assert.equal(layout.dataRange('B'), `B2:B${end - 1}`);
    assert.equal(layout.valueRange('B'), `B2:B${end}`);
    assert.equal(layout.differenceRange, `E2:E${end}`);
    assert.equal(layout.formulas.length, unitCount + 1);
    assert.equal(layout.formulas[0][0], '=IF(D2>0,1000*(B2-C2)/D2,"")');
    assert.equal(layout.formulas.at(-1)[0], `=IF(D${end}>0,1000*(B${end}-C${end})/D${end},"")`);
    assert.ok(layout.expectedValues.every(value => value === 200));
  }
  assert.throws(() => createExportLayout([]));
  assert.throws(() => createExportLayout([['Name'], ['Unit'], ['Total']]));
});

test('model preserves source objects and creates all 185 unique rows', () => {
  const sources = load([...sourceFiles, 'assets/data-model.js']);
  const snapshot = JSON.stringify(sources);
  for (const value of Object.values(sources)) {
    if (Array.isArray(value)) { value.forEach(Object.freeze); Object.freeze(value); }
  }
  const first = sources.createElectionDataModel(sources);
  const second = sources.createElectionDataModel(sources);
  assert.equal(first.tableData.length, 185);
  assert.equal(first.data.length, 183);
  assert.equal(first.byId.size, 185);
  assert.equal(JSON.stringify(sources), snapshot);
  assert.deepEqual(plain(first.tableData), plain(second.tableData));
  assert.notEqual(first.tableData[0], second.tableData[0]);
  assert.equal(first.tableData.some(row => row.name === 'Beograd'), false);
  assert.equal(first.tableData.filter(row => row.region === 'RS11').length, 17);
  for (const row of first.tableData) {
    assert.equal(row.voteDifference, row.listVotes - row.snsVotes);
    assert.equal(row.differencePer1000, row.votersAttended > 0 ? 1000 * (row.listVotes - row.snsVotes) / row.votersAttended : null);
  }
  const censusRows = first.tableData.filter(row => Number.isFinite(row.censusPopulation2022));
  assert.equal(censusRows.length, 161);
  for (const row of censusRows) {
    const sum = ['age0_14Share', 'youthShare', 'age30_44Share', 'age45_64Share', 'age65PlusShare']
      .reduce((total, key) => total + row[key], 0);
    assert.ok(Math.abs(sum - 100) < 1e-10, row.name);
  }
});

test('filters distinguish unrestricted, empty, zero and missing values', () => {
  const {electionFilters: f} = load(['assets/filters.js']);
  const rows = [{id: 'a', amount: 0}, {id: 'b', amount: null}, {id: 'c', amount: 5}];
  assert.equal(f.filterRows(rows, {choices: {id: null}, ranges: []}).length, 3);
  assert.equal(f.filterRows(rows, {choices: {id: new Set()}, ranges: []}).length, 0);
  assert.deepEqual(f.filterRows(rows, {choices: {}, ranges: [['amount', 0, 0]]}), [rows[0]]);
});

test('missing numeric values stay last in both sort directions', () => {
  const {electionFilters: f} = load(['assets/filters.js']);
  const rows = [{name: 'C', n: null}, {name: 'B', n: 2}, {name: 'A', n: 1}];
  for (const ascending of [true, false]) {
    const result = [...rows].sort(f.compareRows({sortKey: 'n', ascending, byName: new Intl.Collator('sr-Latn-RS'), regions: {}}));
    assert.equal(result.at(-1).n, null);
    assert.equal(result[0].n, ascending ? 1 : 2);
  }
});

test('shared distribution handles empty, singleton and outliers', () => {
  const {electionCalculations: c} = load(['assets/calculations.js']);
  assert.equal(c.describeDistribution([]), null);
  assert.equal(c.describeDistribution([4]).median, 4);
  const d = c.describeDistribution([1, 2, 3, 4, 100]);
  assert.deepEqual([d.q1, d.median, d.q3, d.mean, d.whiskerLow, d.whiskerHigh, d.above], [2, 3, 4, 22, 1, 7, 1]);
});

test('aggregate vote shares use votes rather than an average of percentages', () => {
  const {electionCalculations: c} = load(['assets/calculations.js']);
  const total = c.aggregateEntries([{listVotes: 9, validVotes: 10}, {listVotes: 10, validVotes: 100}]);
  assert.equal(total.votes, 100 * 19 / 110);
  assert.equal(c.aggregateEntries([]).votes, null);
});

test('demographic totals use populations of municipalities with available shares', () => {
  const {electionCalculations: c} = load(['assets/calculations.js']);
  const total = c.aggregateEntries([
    {population: 100, censusPopulation2022: 200, age0_14Share: 10, youthShare: 10, age65PlusShare: 20, higherEducationShare: 30},
    {population: 300, censusPopulation2022: 200, age0_14Share: 30, youthShare: 20, age65PlusShare: 40, higherEducationShare: 50},
    {population: 600, youthShare: null, age65PlusShare: null, higherEducationShare: null},
  ]);
  assert.equal(total.age0_14Share, 20);
  assert.equal(total.youthShare, 15);
  assert.equal(total.age65PlusShare, 30);
  assert.equal(total.higherEducationShare, 45);
  assert.equal(c.aggregateEntries([{population: 100, youthShare: null}]).youthShare, null);
});

test('formula validation rejects errors, missing results and numeric strings', () => {
  for (const actual of [undefined, null, NaN, Infinity, '#VALUE!', '12', false, '']) {
    assert.throws(() => assertFormulaResult(actual, 12, 2), /row 2/);
  }
  assert.doesNotThrow(() => assertFormulaResult(12 + 1e-10, 12, 2));
  assert.doesNotThrow(() => assertFormulaResult(0, 0, 2));
  assert.doesNotThrow(() => assertFormulaResult('', '', 2));
  assert.throws(() => assertFormulaResult(0, '', 2));
  assert.throws(() => assertFormulaResult(13, 12, 2));
});

test('Python export and site agree on row coverage, vote totals and turnout', () => {
  const sources = load([...sourceFiles, 'assets/data-model.js', 'assets/calculations.js']);
  const rows = sources.createElectionDataModel(sources).tableData;
  const exported = JSON.parse(execFileSync(process.env.PYTHON || 'python', ['scripts/read_export_rows.py'], {
    encoding: 'utf8', windowsHide: true, env: {...process.env, PYTHONIOENCODING: 'utf-8'},
  }));
  assert.equal(exported.length, rows.length + 2);
  assert.ok(exported.every(row => row.length === exported[0].length));
  assert.deepEqual(exported.slice(1, -1).map(row => row[1]).sort(), [...rows].map(row => row.name).sort());
  const totals = sources.electionCalculations.aggregateEntries(rows);
  for (const [header, key, divisor] of [['Glasovi Lista3', 'listVotes', 1], ['Glasovi Lista1', 'snsVotes', 1], ['Izlaznost (%)', 'turnout', 100]]) {
    assert.equal(exported.at(-1)[exported[0].indexOf(header)], totals[key] / divisor);
  }
  for (const [header, key] of [['Uzrast 0-14 (%)', 'age0_14Share'],
    ['Uzrast 15-29 (%)', 'youthShare'], ['Uzrast 30-44 (%)', 'age30_44Share'],
    ['Uzrast 45-64 (%)', 'age45_64Share'], ['Uzrast 65+ (%)', 'age65PlusShare'],
    ['Više ili visoko obrazovanje (2022) (%)', 'higherEducationShare']]) {
    assert.ok(Math.abs(exported.at(-1)[exported[0].indexOf(header)] - totals[key] / 100) < 1e-12);
  }
});
