import { includeIgnoreFile } from '@eslint/compat'
import oclif from 'eslint-config-oclif'
import prettier from 'eslint-config-prettier'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const gitignorePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.gitignore')

export default [includeIgnoreFile(gitignorePath), ...oclif, prettier,
	{
		files: ['src/utils/zod-schema-prompt.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'complexity': ['warn', 200],
			'no-await-in-loop': 'off',
			'unicorn/no-array-callback-reference': 'off',
		},
	},
]
