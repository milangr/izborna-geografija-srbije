import {readdirSync, readFileSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
function run(command, args) {
  const result = spawnSync(command, args, {stdio: 'inherit', windowsHide: true});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const directory of ['assets', 'scripts', 'tests']) {
  for (const name of readdirSync(directory).filter(name => /\.m?js$/.test(name))) {
    run(process.execPath, ['--check', `${directory}/${name}`]);
  }
}
for (const [, source] of readFileSync('index.html', 'utf8').matchAll(/<script src="\.\/([^"?]+)/g)) {
  if (!existsSync(source)) throw new Error(`Missing script: ${source}`);
}
run(process.env.PYTHON || 'python', ['-c',
  'import ast; from pathlib import Path; [ast.parse(p.read_text(encoding="utf-8-sig"), filename=str(p)) for p in Path("scripts").glob("*.py")]; print("Python syntax OK")']);
run(process.execPath, ['--test', ...readdirSync('tests').filter(name => name.endsWith('.test.mjs')).map(name => `tests/${name}`)]);
