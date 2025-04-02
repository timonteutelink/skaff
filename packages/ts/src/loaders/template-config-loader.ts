import myTsConfig from '@repo/typescript-config/base.json';
import { TemplateConfigModule, TemplateConfigModuleType, templateConfigSchema, UserTemplateSettings } from '@timonteutelink/template-types-lib';
import { randomUUID } from 'crypto';
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
 * Loads and validates a template configuration from a template directory.
 * It type-checks the file, transpiles it with esbuild to CommonJS,
 * then directly evaluates the compiled code using eval.
 * Finally, it ensures that the default export conforms to the TemplateConfigModule interface.
 */

// TODO refactor to load ALL templateConfigs(also nested ones.) in one go just using glob and name of templateConfig.ts. Then in other code instead of loading templateConfig.ts, just use the already loaded templateConfig by checking the object if file at that path exists. So this will return Record<string, TemplateConfigModule<UserTemplateSettings>> instead of TemplateConfigModule<UserTemplateSettings> where the key is the path of the templateConfig.ts file. This way one bundle is enough for all runs of templateConfig.ts. Then also hash contents of all templateConfigs found and use that as a cache key for the whole bundle.
// If we want to do this way the refs need to become templateConfig.json files so no typescript needs to be ran to trace a ref
export async function loadTemplateConfig<T extends UserTemplateSettings>(
	templateDir: string
): Promise<TemplateConfigModule<T>> {
	const configPath = path.join(templateDir, 'templateConfig.ts');

	typeCheckFile(configPath);

	const tsCode = fs.readFileSync(configPath, 'utf-8');

	const result = await esbuild.build({
		stdin: {
			contents: tsCode,
			resolveDir: path.dirname(configPath),
			sourcefile: configPath,
			loader: 'ts',
		},
		bundle: true,
		write: false,
		format: 'esm',
		target: 'es2022',
	});

	const bundledCode = result.outputFiles[0]?.text;

	if (!bundledCode) {
		throw new Error(`Failed to bundle ${configPath}`);
	}

	const tempPath = path.join(tmpdir(), `${randomUUID()}.mjs`);
	fs.writeFileSync(tempPath, bundledCode, 'utf-8');
	const moduleObj = await import(/* webpackIgnore: true */ pathToFileURL(tempPath).href);
	let evaluatedModule: TemplateConfigModuleType<T> = moduleObj.default;

	if (
		!evaluatedModule ||
		typeof evaluatedModule !== 'object'
	) {
		throw new Error(`Invalid template configuration in ${configPath}`);
	}

	if (
		'ref' in evaluatedModule &&
		typeof evaluatedModule.ref === 'string'
	) {
		console.log(`Loading referenced template config at ${evaluatedModule.ref}`);
		const refPath = path.join(templateDir, evaluatedModule.ref);
		evaluatedModule = await loadTemplateConfig<T>(refPath);
	}

	if (
		!('templateConfig' in evaluatedModule) ||
		!('templateSettingsSchema' in evaluatedModule) ||
		!('targetPath' in evaluatedModule) ||
		!('sideEffects' in evaluatedModule) ||
		!evaluatedModule.templateConfig ||
		!evaluatedModule.templateSettingsSchema ||
		!evaluatedModule.targetPath ||
		!evaluatedModule.sideEffects
	) {
		throw new Error(`Invalid template configuration in ${configPath}`);
	}

	const parsedTemplateConfig = templateConfigSchema.safeParse(evaluatedModule.templateConfig);
	if (!parsedTemplateConfig.success) {
		throw new Error(`Invalid template configuration in ${configPath}`);
	}
	evaluatedModule.templateConfig = parsedTemplateConfig.data;

	console.log(`Loaded template config at ${configPath} to ${tempPath}`);

	return evaluatedModule as TemplateConfigModule<T>;
}

