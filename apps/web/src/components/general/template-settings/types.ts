import type React from "react"
import type { z } from "zod"
import type { UseFormReturn } from "react-hook-form"

export interface TemplateSettingsFormProps {
	projectName: string
	selectedTemplate: string
	selectedTemplateSettingsSchema: any
	action: (userSettings: any) => Promise<void>
	cancel?: () => void
}

export interface SchemaResult {
	schema: z.ZodType<any>
	defaults: any
	required: Record<string, string[]>
}

export interface FieldRendererProps {
	key?: string
	fieldPath: string
	property: any
	isRequired: boolean
	isReadOnly: boolean
	form: UseFormReturn<Record<string, any>>
	requiredFields: Record<string, string[]>
	renderFormField: (key: string, property: any, parentPath: string, requiredFieldsList: string[]) => React.ReactNode
}

export interface ArrayFieldRendererProps {
	form: UseFormReturn<Record<string, any>>
	fieldPath: string
	property: any
	isRequired: boolean
	isReadOnly: boolean
	createDefaultItem: (itemSchema: any) => any
	requiredFields: Record<string, string[]>
	renderFormField: (key: string, property: any, parentPath: string, requiredFieldsList: string[]) => React.ReactNode
}

export interface InputRendererProps {
	property: any
	field: any
	isReadOnly: boolean
}

