import {getTemplate, loadPluginsForTemplate, createPluginStageEntry} from '@timonteutelink/skaff-lib'
import {ProjectSettings, UserTemplateSettings, createReadonlyProjectContext} from '@timonteutelink/template-types-lib'
import fs from 'node:fs'
import * as prompts from '@inquirer/prompts'

import {promptForSchema} from './zod-schema-prompt.js'
import type {CliTemplateStage, PluginStageEntry} from '@timonteutelink/skaff-lib'

type StageEntry = PluginStageEntry<CliTemplateStage>

async function runStageSequence(
  stages: StageEntry[],
  context: {
    templateName: string
    rootTemplateName: string
  },
  stageState: Record<string, unknown>,
  currentSettings: UserTemplateSettings | null,
): Promise<UserTemplateSettings | null> {
  let workingSettings = currentSettings

  for (const entry of stages) {
    const key = entry.stateKey
    const baseContext = {
      ...context,
      currentSettings: workingSettings,
      stageState: stageState[key],
      setStageState: (value: unknown) => {
        stageState[key] = value
      },
    }

    if (await entry.stage.shouldSkip?.(baseContext)) {
      continue
    }

    const result = await entry.stage.run({...baseContext, prompts})

    if (result && typeof result === 'object') {
      workingSettings = result as UserTemplateSettings
    }
  }

  return workingSettings
}

async function promptUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  defaults?: UserTemplateSettings,
  options?: {
    projectSettings?: ProjectSettings
    templateInstanceId?: string
  },
): Promise<UserTemplateSettings> {
  const rootTpl = await getTemplate(rootTemplateName)
  if ('error' in rootTpl) throw new Error(rootTpl.error)
  if (!rootTpl.data) throw new Error(`No template named "${rootTemplateName}"`)

  const subTpl = rootTpl.data.template.findSubTemplate(templateName)
  if (!subTpl) {
    throw new Error(`No sub-template "${templateName}" in root template "${rootTemplateName}"`)
  }

  const projectSettings: ProjectSettings =
    options?.projectSettings ??
    ({
      projectRepositoryName: rootTemplateName,
      projectAuthor: '',
      rootTemplateName,
      instantiatedTemplates: [
        {
          id: options?.templateInstanceId ?? '__interactive__',
          templateName,
          templateSettings: defaults ?? {},
        },
      ],
    } satisfies ProjectSettings)

  const pluginsResult = await loadPluginsForTemplate(
    rootTpl.data.template,
    createReadonlyProjectContext(projectSettings),
  )

  if ('error' in pluginsResult) {
    throw new Error(pluginsResult.error)
  }

  // Use createPluginStageEntry for automatic state key namespacing
  const pluginStages: StageEntry[] = pluginsResult.data.flatMap((plugin) =>
    (plugin.cliPlugin?.templateStages ?? []).map((stage: CliTemplateStage) =>
      createPluginStageEntry(plugin.name || plugin.reference.module, stage),
    ),
  )

  const stageState: Record<string, unknown> = {}

  await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'before-settings'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    null,
  )

  const result = await promptForSchema(subTpl.config.templateSettingsSchema, {
    defaults,
  })
  if (Object.keys(result).length === 0) throw new Error('No settings provided.')

  const afterSettings = await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'after-settings'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    result as UserTemplateSettings,
  )

  return (afterSettings ?? result) as UserTemplateSettings
}

export async function readUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  arg?: string,
  defaults?: UserTemplateSettings,
  options?: {
    projectSettings?: ProjectSettings
    templateInstanceId?: string
  },
): Promise<UserTemplateSettings> {
  if (!arg) return promptUserTemplateSettings(rootTemplateName, templateName, defaults, options)
  if (fs.existsSync(arg)) return JSON.parse(fs.readFileSync(arg, 'utf8'))
  return JSON.parse(arg)
}
