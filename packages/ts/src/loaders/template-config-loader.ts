import myTsConfig from '@repo/typescript-config/base.json';
import {
	TemplateConfigModule,
	templateConfigSchema,
	UserTemplateSettings,
} from '@timonteutelink/template-types-lib';
import { randomUUID, createHash } from 'crypto';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { pathToFileURL } from 'url';

/**
 * Performs type checking on the given file using the TypeScript Compiler API.
 * It uses the compiler options loaded from your custom tsconfig.
 */
function typeCheckFile(filePath: string): void {
	const basePath = process.cwd();
	const { options, errors } = ts.convertCompilerOptionsFromJson(
		{ ...myTsConfig.compilerOptions, baseUrl: basePath },
		basePath
	);

	if (errors.length > 0) {
		const formatHost: ts.FormatDiagnosticsHost = {
			getCanonicalFileName: (fileName) => fileName,
			getCurrentDirectory: ts.sys.getCurrentDirectory,
			getNewLine: () => ts.sys.newLine,
		};
		throw new Error(
			`Error in tsconfig:\n${ts.formatDiagnosticsWithColorAndContext(errors, formatHost)}`
		);
	}

	const program = ts.createProgram([filePath], options);
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		const formatHost: ts.FormatDiagnosticsHost = {
			getCanonicalFileName: (fileName) => fileName,
			getCurrentDirectory: ts.sys.getCurrentDirectory,
			getNewLine: () => ts.sys.newLine,
		};
		throw new Error(
			`TypeScript type checking failed:\n${ts.formatDiagnosticsWithColorAndContext(
				diagnostics,
				formatHost
			)}`
		);
	}
}

/**
 * Recursively scans the given directory for template configuration files.
 * It looks for directories that either contain a templateConfig.ts file or a templateRef.json file.
 * In case of templateRef.json, it reads the JSON (expecting a single key with a relative path)
 * and includes the templateConfig.ts file from that referenced folder.
 */
function findTemplateConfigFiles(dir: string): string[] {
	let results: string[] = [];
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const candidate = path.join(fullPath, 'templateConfig.ts');
			if (fs.existsSync(candidate)) {
				results.push(candidate);
			}
			const refCandidate = path.join(fullPath, 'templateRef.json');
			if (fs.existsSync(refCandidate)) {
				try {
					const refData = JSON.parse(fs.readFileSync(refCandidate, 'utf-8'));
					const refRelativePath = Object.values(refData)[0];
					if (typeof refRelativePath === 'string') {
						const resolvedRefPath = path.join(fullPath, refRelativePath, 'templateConfig.ts');
						if (fs.existsSync(resolvedRefPath)) {
							results.push(resolvedRefPath);
						} else {
							console.warn(`Referenced templateConfig.ts not found at ${resolvedRefPath}`);
						}
					}
				} catch (err) {
					console.warn(`Error parsing ${refCandidate}: ${(err as Error).message}`);
				}
			}
			results = results.concat(findTemplateConfigFiles(fullPath));
		}
	}
	return results;
}

async function importTemplateConfigModule<T extends UserTemplateSettings>(cachePath: string): Promise<Record<string, TemplateConfigModule<T>>> {
	const moduleObj = await import(pathToFileURL(cachePath).href);

	const configs = moduleObj.configs;

	for (const key in configs) {
		const evaluatedModule = configs[key] as TemplateConfigModule<T>;
		const parsedTemplateConfig = templateConfigSchema.safeParse(evaluatedModule.templateConfig);
		if (!parsedTemplateConfig.success) {
			throw new Error(`Invalid template configuration in ${key}: ${parsedTemplateConfig.error.message}`);
		}
		evaluatedModule.templateConfig = parsedTemplateConfig.data;
	}

	return moduleObj.configs;
}

/**
 * Loads and validates ALL template configuration files found under the provided rootDir.
 * It creates a temporary bundled module that imports all templateConfig.ts files found
 * (using relative imports) and exports them as a record keyed by their path relative to rootDir.
 * It also computes a hash of the combined template code and caches the built bundle using that hash.
 *
 * Additionally, before bundling, it writes an index.ts to the file system, type-checks it,
 * and removes it. This ensures that all modules type-check correctly.
 */
export async function loadAllTemplateConfigs<T extends UserTemplateSettings>(
	rootDir: string
): Promise<Record<string, TemplateConfigModule<T>>> {
	const configFiles = findTemplateConfigFiles(rootDir);

	if (configFiles.length === 0) {
		throw new Error(`No templateConfig.ts files found under ${rootDir}`);
	}

	const sortedFiles = configFiles.sort();
	let combinedContent = '';
	for (const file of sortedFiles) {
		combinedContent += fs.readFileSync(file, 'utf-8');
	}
	const hash = createHash('sha256').update(combinedContent).digest('hex');

	const tmpDir = path.join(tmpdir(), "code-templator-cache");
	fs.mkdirSync(tmpDir, { recursive: true });
	const cachePath = path.join(tmpDir, "", `${hash}.mjs`);

	if (fs.existsSync(cachePath)) {
		console.log(`Using cached bundle at ${cachePath}`);
		return importTemplateConfigModule<T>(cachePath);
	}

	let importsCode = '';
	const exportEntries: string[] = [];
	sortedFiles.forEach((file, index) => {
		const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
		const importAlias = `config${index}`;
		importsCode += `import ${importAlias} from './${relPath}';\n`;
		exportEntries.push(`'${relPath}': ${importAlias}`);
	});
	const indexCode = `${importsCode}\nexport const configs = {\n${exportEntries.join(
		',\n'
	)}\n};`;
	console.log(`Generated temporary index file for bundling:\n${indexCode}`);

	const tempIndexPath = path.join(rootDir, `.__temp_index_${randomUUID()}.ts`);
	fs.writeFileSync(tempIndexPath, indexCode, 'utf-8');
	try {
		typeCheckFile(tempIndexPath);
		console.log(`Temporary index file at ${tempIndexPath} passed type checking.`);
	} finally {
		fs.unlinkSync(tempIndexPath);
	}

	const result = await esbuild.build({
		stdin: {
			contents: indexCode,
			resolveDir: rootDir,
			sourcefile: 'index.ts',
			loader: 'ts',
		},
		bundle: true,
		write: false,
		format: 'esm',
		target: 'es2022',
	});

	const bundledCode = result.outputFiles[0]?.text;
	if (!bundledCode) {
		throw new Error(`Failed to bundle template configs from ${rootDir}`);
	}

	fs.writeFileSync(cachePath, bundledCode, 'utf-8');
	console.log(`Created bundled template configs at ${cachePath}`);

	return importTemplateConfigModule<T>(cachePath);
}
