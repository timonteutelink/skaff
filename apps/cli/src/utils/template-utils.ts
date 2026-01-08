import * as skaffLib from '@timonteutelink/skaff-lib'
import * as templateTypes from '@timonteutelink/template-types-lib'
import type {ProjectSettings, UserTemplateSettings} from '@timonteutelink/template-types-lib'
import fs from 'node:fs'
import * as prompts from '@inquirer/prompts'

import {promptForSchema} from './zod-schema-prompt.js'
import type {PluginStageEntry} from '@timonteutelink/skaff-lib'
import type {CliTemplateStage} from './plugin-types.js'

type StageEntry = PluginStageEntry<CliTemplateStage>

function mergeUserSettings(
  primary: UserTemplateSettings,
  secondary?: UserTemplateSettings | null,
): UserTemplateSettings {
  if (!secondary) {
    return primary
  }

  return {
    ...secondary,
    ...primary,
  }
}

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
    if (entry.stage.stateSchema) {
      const parsed = entry.stage.stateSchema.safeParse(stageState[key])
      if (!parsed.success) {
        throw new Error(
          `Stage state for "${entry.stage.id}" is invalid: ${parsed.error.message}`,
        )
      }
    }
    const baseContext = {
      ...context,
      currentSettings: workingSettings,
      settingsDraft: workingSettings,
      setSettingsDraft: (next: UserTemplateSettings | null) => {
        if (!next) {
          workingSettings = null
          return
        }
        workingSettings = mergeUserSettings(next, workingSettings)
      },
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
      workingSettings = mergeUserSettings(result as UserTemplateSettings, workingSettings)
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
    pluginInputs?: skaffLib.PluginInputsByPlugin
  },
): Promise<UserTemplateSettings> {
  const rootTpl = await skaffLib.getTemplate(rootTemplateName)
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

  const pluginsResult = await skaffLib.loadPluginsForTemplate(
    rootTpl.data.template,
    templateTypes.createReadonlyProjectContext(projectSettings),
    {pluginInputs: options?.pluginInputs},
  )

  if ('error' in pluginsResult) {
    throw new Error(pluginsResult.error)
  }

  // Use createPluginStageEntry for automatic state key namespacing
  const pluginStages: StageEntry[] = pluginsResult.data.flatMap((plugin) =>
    (plugin.cliPlugin?.templateStages ?? []).map((stage: CliTemplateStage) =>
      skaffLib.createPluginStageEntry(plugin.name || plugin.reference.module, stage),
    ),
  )

  const stageState: Record<string, unknown> = {}

  const initSettings = await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'init'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    null,
  )

  const beforeSettings = await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'before-settings'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    initSettings ?? null,
  )

  const promptDefaults =
    initSettings || beforeSettings || defaults
      ? mergeUserSettings(
          (defaults ?? {}) as UserTemplateSettings,
          mergeUserSettings((beforeSettings ?? {}) as UserTemplateSettings, initSettings ?? null),
        )
      : undefined

  const result = await promptForSchema(subTpl.config.templateSettingsSchema, {
    defaults: promptDefaults,
  })
  if (Object.keys(result).length === 0) throw new Error('No settings provided.')

  const mergedResult = mergeUserSettings(result as UserTemplateSettings, beforeSettings ?? initSettings)

  const afterSettings = await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'after-settings'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    mergedResult,
  )

  const withAfterSettings = (afterSettings ?? mergedResult) as UserTemplateSettings

  const finalizedSettings = await runStageSequence(
    pluginStages.filter((entry) => entry.stage.placement === 'finalize'),
    {
      templateName,
      rootTemplateName,
    },
    stageState,
    withAfterSettings,
  )

  const finalSettings = (finalizedSettings ?? withAfterSettings) as UserTemplateSettings
  return finalSettings
}

export async function readUserTemplateSettings(
  rootTemplateName: string,
  templateName: string,
  arg?: string,
  defaults?: UserTemplateSettings,
  options?: {
    projectSettings?: ProjectSettings
    templateInstanceId?: string
    pluginInputs?: skaffLib.PluginInputsByPlugin
  },
): Promise<UserTemplateSettings> {
  if (!arg) return promptUserTemplateSettings(rootTemplateName, templateName, defaults, options)
  const parsedSettings = fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : JSON.parse(arg)
  const rootTpl = await skaffLib.getTemplate(rootTemplateName)
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
          templateSettings: parsedSettings ?? {},
        },
      ],
    } satisfies ProjectSettings)

  const pluginsResult = await skaffLib.loadPluginsForTemplate(
    rootTpl.data.template,
    templateTypes.createReadonlyProjectContext(projectSettings),
    {pluginInputs: options?.pluginInputs},
  )

  if ('error' in pluginsResult) {
    throw new Error(pluginsResult.error)
  }

  let transformedSettings: unknown = parsedSettings

  for (const plugin of pluginsResult.data) {
    if (!plugin.settingsInputTransform) continue
    transformedSettings = plugin.settingsInputTransform(transformedSettings)
  }

  const parsedResult = subTpl.config.templateSettingsSchema.safeParse(transformedSettings ?? {})
  if (!parsedResult.success) {
    throw new Error(`Invalid template settings for "${templateName}": ${parsedResult.error.message}`)
  }

  return parsedResult.data as UserTemplateSettings
}
