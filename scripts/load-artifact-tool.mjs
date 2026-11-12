import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function loadArtifactTool() {
  // A supplied runtime directory avoids a machine-specific path in the project.
  const require = process.env.ARTIFACT_NODE_MODULES
    ? createRequire(pathToFileURL(resolve(process.env.ARTIFACT_NODE_MODULES, '../package.json')))
    : createRequire(import.meta.url);
  let entry;
  try {
    entry = require.resolve('@oai/artifact-tool');
  } catch (cause) {
    throw new Error('XLSX export requires @oai/artifact-tool. Install the supplied package locally or set ARTIFACT_NODE_MODULES to its node_modules directory. See README.md.', {cause});
  }
  return import(pathToFileURL(entry).href);
}
