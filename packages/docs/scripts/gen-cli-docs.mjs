#!/usr/bin/env bun
import { $ } from 'bun';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const cliBin = path.join(root, 'apps/cli/bin/code-templator');
const outDir = path.join(root, 'packages/docs/src/api/cli');

await mkdir(outDir, { recursive: true });
const raw = await $`${cliBin} --help`.text();
const blocks = raw.split(/\n{2,}/);      // naive split
console.log(`Found ${blocks.length} blocks in CLI help output.`);
console.log(`Writing CLI docs to ${outDir}...`);
console.log(`First block:\n${blocks.join("||||")}\n`);

await writeFile(path.join(outDir, 'index.md'), mdFromHelp(blocks[0], 'CLI Overview'));

for (const block of blocks.slice(1)) {
	const match = /^  (\w[\w-]*)\s+/.exec(block);   // sub-command name
	if (!match) continue;
	const cmd = match[1];
	await writeFile(
		path.join(outDir, `${cmd}.md`),
		mdFromHelp(block, `\`${cmd}\` command`)
	);
}

function mdFromHelp(text, title) {
	return `---\ntitle: ${title}\n---\n\n\`\`\`text\n${text.trim()}\n\`\`\``;
}

