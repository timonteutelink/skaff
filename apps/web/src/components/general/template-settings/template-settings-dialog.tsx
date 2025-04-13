"use client"

import type React from "react"
import { PropsWithChildren, useState, useEffect } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
} from "@/components/ui/dialog"
import type { UserTemplateSettings } from "@timonteutelink/template-types-lib"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarIcon, InfoIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface TemplateSettingsDialogProps {
	projectName: string
	selectedTemplate: string
	selectedTemplateSettingsSchema: any
	action: (userSettings: UserTemplateSettings) => Promise<void>
	cancel: () => void
}

export const TemplateSettingsDialog: React.FC<PropsWithChildren<TemplateSettingsDialogProps>> = ({
	children,
	projectName,
	selectedTemplate,
	selectedTemplateSettingsSchema,
	action,
	cancel,
}) => {
	const [open, setOpen] = useState(false)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [zodSchema, setZodSchema] = useState<z.ZodType<any>>(z.object({}))
	const [formDefaults, setFormDefaults] = useState<Record<string, any>>({})
	const [requiredFields, setRequiredFields] = useState<string[]>([])

	// Create a dynamic zod schema based on the JSON schema
	useEffect(() => {
		if (!selectedTemplateSettingsSchema?.properties) return

		const schemaShape: Record<string, z.ZodTypeAny> = {}
		const defaults: Record<string, any> = {}
		const required = selectedTemplateSettingsSchema.required || []
		setRequiredFields(required)

		Object.entries(selectedTemplateSettingsSchema.properties).forEach(([key, value]: [string, any]) => {
			let fieldSchema: z.ZodTypeAny

			// Handle different types
			switch (value.type) {
				case "string":
					// Handle string formats
					if (value.format === "date-time" || value.format === "date") {
						fieldSchema = z.date()
						defaults[key] = value.default ? new Date(value.default) : null
					} else if (value.format === "email") {
						fieldSchema = z.string().email({ message: "Invalid email address" })
						defaults[key] = value.default || ""
					} else if (value.format === "uri" || value.format === "url") {
						fieldSchema = z.string().url({ message: "Invalid URL" })
						defaults[key] = value.default || ""
					} else if (value.enum) {
						fieldSchema = z.enum(value.enum as [string, ...string[]])
						defaults[key] = value.default || value.enum[0]
					} else {
						// Regular string with potential constraints
						let stringSchema = z.string()

						if (value.minLength !== undefined) {
							stringSchema = stringSchema.min(value.minLength, {
								message: `Must be at least ${value.minLength} characters`,
							})
						}

						if (value.maxLength !== undefined) {
							stringSchema = stringSchema.max(value.maxLength, {
								message: `Must be at most ${value.maxLength} characters`,
							})
						}

						if (value.pattern) {
							stringSchema = stringSchema.regex(new RegExp(value.pattern), {
								message: value.patternMessage || "Invalid format",
							})
						}

						fieldSchema = stringSchema
						defaults[key] = value.default || ""
					}
					break

				case "number":
				case "integer":
					let numberSchema: z.ZodTypeAny = value.type === "integer" ? z.number().int() : z.number()

					if (value.minimum !== undefined) {
						numberSchema = (numberSchema as z.ZodNumber).min(value.minimum, {
							message: `Must be at least ${value.minimum}`,
						})
					}

					if (value.maximum !== undefined) {
						numberSchema = (numberSchema as z.ZodNumber).max(value.maximum, {
							message: `Must be at most ${value.maximum}`,
						})
					}

					if (value.multipleOf !== undefined) {
						numberSchema = numberSchema.refine((val) => val % value.multipleOf === 0, {
							message: `Must be a multiple of ${value.multipleOf}`,
						})
					}

					fieldSchema = numberSchema
					defaults[key] = value.default !== undefined ? value.default : 0
					break

				case "boolean":
					fieldSchema = z.boolean()
					defaults[key] = value.default !== undefined ? value.default : false
					break

				case "array":
					if (value.items?.type === "string" && value.items?.enum) {
						// Multi-select enum
						fieldSchema = z.array(z.enum(value.items.enum as [string, ...string[]]))
						defaults[key] = value.default || []
					} else if (value.items?.type === "string") {
						// Array of strings
						fieldSchema = z.array(z.string())
						defaults[key] = value.default || []
					} else if (value.items?.type === "number" || value.items?.type === "integer") {
						// Array of numbers
						fieldSchema = z.array(z.number())
						defaults[key] = value.default || []
					} else if (value.items?.type === "boolean") {
						// Array of booleans
						fieldSchema = z.array(z.boolean())
						defaults[key] = value.default || []
					} else {
						// Default array handling
						fieldSchema = z.array(z.any())
						defaults[key] = value.default || []
					}

					// Handle min/max items
					if (value.minItems !== undefined) {
						fieldSchema = (fieldSchema as z.ZodString).min(value.minItems, {
							message: `Must have at least ${value.minItems} items`,
						})
					}

					if (value.maxItems !== undefined) {
						fieldSchema = (fieldSchema as z.ZodString).max(value.maxItems, {
							message: `Must have at most ${value.maxItems} items`,
						})
					}
					break

				case "object":
					// Handle nested objects
					if (value.properties) {
						const nestedShape: Record<string, z.ZodTypeAny> = {}
						const nestedDefaults: Record<string, any> = {}
						const nestedRequired = value.required || []

						Object.entries(value.properties).forEach(([nestedKey, nestedValue]: [string, any]) => {
							// Simplified nested handling - could be expanded for deeper nesting
							switch (nestedValue.type) {
								case "string":
									nestedShape[nestedKey] = nestedRequired.includes(nestedKey)
										? z.string().min(1, { message: "This field is required" })
										: z.string().optional()
									nestedDefaults[nestedKey] = nestedValue.default || ""
									break
								case "number":
								case "integer":
									nestedShape[nestedKey] = z.number()
									nestedDefaults[nestedKey] = nestedValue.default || 0
									break
								case "boolean":
									nestedShape[nestedKey] = z.boolean()
									nestedDefaults[nestedKey] = nestedValue.default || false
									break
								default:
									nestedShape[nestedKey] = z.any()
									nestedDefaults[nestedKey] = nestedValue.default || null
							}
						})

						fieldSchema = z.object(nestedShape)
						defaults[key] = value.default || nestedDefaults
					} else {
						// Generic object
						fieldSchema = z.record(z.any())
						defaults[key] = value.default || {}
					}
					break

				case "null":
					fieldSchema = z.null()
					defaults[key] = null
					break

				default:
					// Handle any other types or unknown types
					fieldSchema = z.any()
					defaults[key] = value.default !== undefined ? value.default : null
			}

			// Handle nullable fields (type could be an array like ["string", "null"])
			if (Array.isArray(value.type) && value.type.includes("null")) {
				fieldSchema = fieldSchema.nullable()
			}

			// Make field optional if not in required array
			if (!required.includes(key)) {
				fieldSchema = fieldSchema.optional()
			} else {
				// For required fields, add validation message
				if (fieldSchema instanceof z.ZodString) {
					fieldSchema = fieldSchema.min(1, { message: "This field is required" })
				}
			}

			schemaShape[key] = fieldSchema
		})

		setZodSchema(z.object(schemaShape))
		setFormDefaults(defaults)
	}, [selectedTemplateSettingsSchema])

	const form = useForm<Record<string, any>>({
		resolver: zodResolver(zodSchema),
		defaultValues: formDefaults,
		values: formDefaults,
		mode: "onChange",
	})

	// Reset form when schema changes
	useEffect(() => {
		form.reset(formDefaults)
	}, [formDefaults, form])

	const onSubmit = async (data: Record<string, any>) => {
		setIsSubmitting(true)
		try {
			await action(data as UserTemplateSettings)
			setOpen(false)
		} catch (error) {
			console.error("Error submitting form:", error)
		} finally {
			setIsSubmitting(false)
		}
	}

	const handleCancel = () => {
		setOpen(false)
		cancel()
	}

	// Render form fields based on schema
	const renderFormFields = () => {
		if (!selectedTemplateSettingsSchema?.properties) {
			return <p className="text-sm text-muted-foreground">No settings required for this template.</p>
		}

		// Group fields by categories if they exist
		const categories: Record<string, any[]> = { "": [] }

		Object.entries(selectedTemplateSettingsSchema.properties).forEach(([key, value]: [string, any]) => {
			const category = value.category || ""
			if (!categories[category]) {
				categories[category] = []
			}
			categories[category].push({ key, value })
		})

		// If we have categories, render them as accordion sections
		if (
			Object.keys(categories).length > 1 ||
			(Object.keys(categories).length === 1 && Object.keys(categories)[0] !== "")
		) {
			return (
				<Accordion type="single" collapsible className="w-full" defaultValue="item-0">
					{Object.entries(categories).map(([category, fields], index) => (
						<AccordionItem key={category || `default-${index}`} value={`item-${index}`}>
							<AccordionTrigger>{category || "General Settings"}</AccordionTrigger>
							<AccordionContent>
								<div className="grid gap-4 py-2">{fields.map(({ key, value }) => renderFormField(key, value))}</div>
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			)
		}

		// Otherwise render fields directly
		return (
			<div className="grid gap-4">
				{Object.entries(selectedTemplateSettingsSchema.properties).map(([key, value]: [string, any]) =>
					renderFormField(key, value),
				)}
			</div>
		)
	}

	// Render a single form field
	const renderFormField = (key: string, property: any) => {
		// Skip rendering if the field should be hidden
		if (property.hidden) return null

		const isRequired = requiredFields.includes(key)
		const isReadOnly = property.readOnly === true

		return (
			<FormField
				key={key}
				control={form.control}
				name={key}
				render={({ field }) => (
					<FormItem className={property.type === "object" ? "col-span-2" : ""}>
						<div className="flex items-center gap-2">
							<FormLabel className="capitalize">
								{property.title || key}
								{isRequired && <span className="text-destructive ml-1">*</span>}
							</FormLabel>

							{property.description && (
								<TooltipProvider>
									<Tooltip>
										<TooltipTrigger asChild>
											<InfoIcon className="h-4 w-4 text-muted-foreground" />
										</TooltipTrigger>
										<TooltipContent>
											<p className="max-w-xs">{property.description}</p>
										</TooltipContent>
									</Tooltip>
								</TooltipProvider>
							)}

							{property.deprecated && (
								<Badge variant="outline" className="text-xs bg-yellow-100">
									Deprecated
								</Badge>
							)}
						</div>

						<FormControl>{renderInputByType(property, field, isReadOnly)}</FormControl>

						{property.examples && property.examples.length > 0 && (
							<FormDescription>
								Example:{" "}
								{Array.isArray(property.examples) ? property.examples[0]?.toString() : property.examples.toString()}
							</FormDescription>
						)}

						<FormMessage />
					</FormItem>
				)}
			/>
		)
	}

	// Render the appropriate input component based on the property type
	const renderInputByType = (property: any, field: any, isReadOnly = false) => {
		// Handle null or undefined values
		const value = field.value === null || field.value === undefined ? "" : field.value

		// Common props for all input types
		const commonProps = {
			id: field.name,
			disabled: isReadOnly,
			"aria-describedby": property.description ? `${field.name}-description` : undefined,
		}

		// Handle different types
		if (property.type === "string" || (Array.isArray(property.type) && property.type.includes("string"))) {
			// Handle string formats
			if (property.format === "date-time" || property.format === "date") {
				return (
					<Popover>
						<PopoverTrigger asChild>
							<Button
								variant="outline"
								className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
								{...commonProps}
							>
								<CalendarIcon className="mr-2 h-4 w-4" />
								{field.value ? format(field.value, "PPP") : "Pick a date"}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0">
							<Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus />
						</PopoverContent>
					</Popover>
				)
			} else if (property.enum) {
				// Handle enum (select)
				return (
					<Select onValueChange={field.onChange} defaultValue={value} value={value} disabled={isReadOnly}>
						<SelectTrigger>
							<SelectValue placeholder={`Select ${property.title || field.name}`} />
						</SelectTrigger>
						<SelectContent>
							{property.enum.map((option: string) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)
			} else if (property.format === "textarea" || property.maxLength > 100) {
				// Textarea for longer text
				return (
					<Textarea
						{...field}
						{...commonProps}
						value={value}
						placeholder={property.placeholder || ""}
						className="resize-vertical"
					/>
				)
			} else {
				// Regular input with appropriate type based on format
				let inputType = "text"
				if (property.format === "email") inputType = "email"
				else if (property.format === "uri" || property.format === "url") inputType = "url"
				else if (property.format === "password") inputType = "password"

				return (
					<Input {...field} {...commonProps} type={inputType} value={value} placeholder={property.placeholder || ""} />
				)
			}
		} else if (
			property.type === "number" ||
			property.type === "integer" ||
			(Array.isArray(property.type) && (property.type.includes("number") || property.type.includes("integer")))
		) {
			// Use slider for numbers with min/max and step
			if (property.minimum !== undefined && property.maximum !== undefined && property.ui?.widget === "slider") {
				return (
					<div className="space-y-2">
						<Slider
							defaultValue={[value]}
							min={property.minimum}
							max={property.maximum}
							step={property.multipleOf || 1}
							onValueChange={(vals) => field.onChange(vals[0])}
							disabled={isReadOnly}
						/>
						<div className="flex justify-between text-xs text-muted-foreground">
							<span>{property.minimum}</span>
							<span>{value}</span>
							<span>{property.maximum}</span>
						</div>
					</div>
				)
			}

			// Regular number input
			return (
				<Input
					{...commonProps}
					type="number"
					value={value}
					onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : "")}
					min={property.minimum}
					max={property.maximum}
					step={property.multipleOf || (property.type === "integer" ? 1 : "any")}
					placeholder={property.placeholder || ""}
					disabled={isReadOnly}
				/>
			)
		} else if (property.type === "boolean" || (Array.isArray(property.type) && property.type.includes("boolean"))) {
			// Use radio group if specified in UI options
			if (property.ui?.widget === "radio") {
				return (
					<RadioGroup
						onValueChange={(val) => field.onChange(val === "true")}
						defaultValue={value ? "true" : "false"}
						disabled={isReadOnly}
					>
						<div className="flex items-center space-x-4">
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="true" id={`${field.name}-true`} />
								<Label htmlFor={`${field.name}-true`}>Yes</Label>
							</div>
							<div className="flex items-center space-x-2">
								<RadioGroupItem value="false" id={`${field.name}-false`} />
								<Label htmlFor={`${field.name}-false`}>No</Label>
							</div>
						</div>
					</RadioGroup>
				)
			}

			// Default to switch
			return (
				<div className="flex items-center space-x-2">
					<Switch checked={!!value} onCheckedChange={field.onChange} {...commonProps} />
					<Label htmlFor={field.name} className="text-sm text-muted-foreground">
						{value ? "Enabled" : "Disabled"}
					</Label>
				</div>
			)
		} else if (property.type === "array" || (Array.isArray(property.type) && property.type.includes("array"))) {
			// Handle array of checkboxes (for enum arrays)
			if (property.items?.enum) {
				return (
					<div className="space-y-2">
						{property.items.enum.map((option: string) => (
							<div key={option} className="flex items-center space-x-2">
								<Checkbox
									id={`${field.name}-${option}`}
									checked={(field.value || []).includes(option)}
									onCheckedChange={(checked) => {
										const currentValues = [...(field.value || [])]
										if (checked) {
											field.onChange([...currentValues, option])
										} else {
											field.onChange(currentValues.filter((val: string) => val !== option))
										}
									}}
									disabled={isReadOnly}
								/>
								<Label htmlFor={`${field.name}-${option}`}>{option}</Label>
							</div>
						))}
					</div>
				)
			}

			// Simple array input (comma-separated values)
			return (
				<div className="space-y-2">
					<Textarea
						{...commonProps}
						value={Array.isArray(value) ? value.join(", ") : ""}
						onChange={(e) => {
							const arrayValue = e.target.value
								.split(",")
								.map((item) => item.trim())
								.filter((item) => item !== "")
							field.onChange(arrayValue)
						}}
						placeholder={property.placeholder || "Enter values separated by commas"}
						disabled={isReadOnly}
						className="resize-vertical"
					/>
					<p className="text-xs text-muted-foreground">Enter values separated by commas</p>
				</div>
			)
		} else if (property.type === "object" || (Array.isArray(property.type) && property.type.includes("object"))) {
			// Render nested object properties
			if (property.properties) {
				return (
					<Card>
						<CardContent className="p-4 grid gap-4">
							{Object.entries(property.properties).map(([nestedKey, nestedValue]: [string, any]) => (
								<div key={nestedKey} className="grid gap-2">
									<Label className="capitalize">{nestedValue.title || nestedKey}</Label>
									{renderNestedInput(
										nestedValue,
										{
											value: field.value?.[nestedKey] || "",
											onChange: (val: any) => {
												field.onChange({
													...field.value,
													[nestedKey]: val,
												})
											},
											name: `${field.name}.${nestedKey}`,
										},
										isReadOnly || nestedValue.readOnly,
									)}
									{nestedValue.description && (
										<p className="text-xs text-muted-foreground">{nestedValue.description}</p>
									)}
								</div>
							))}
						</CardContent>
					</Card>
				)
			}

			// Generic object (JSON)
			return (
				<Textarea
					{...commonProps}
					value={typeof value === "object" ? JSON.stringify(value, null, 2) : ""}
					onChange={(e) => {
						try {
							const jsonValue = JSON.parse(e.target.value)
							field.onChange(jsonValue)
						} catch (error) {
							// Allow invalid JSON during typing
							field.onChange(e.target.value)
						}
					}}
					placeholder={property.placeholder || "Enter JSON object"}
					disabled={isReadOnly}
					className="font-mono resize-vertical h-32"
				/>
			)
		}

		// Fallback for any other type
		return (
			<Input {...field} {...commonProps} value={value} placeholder={property.placeholder || ""} disabled={isReadOnly} />
		)
	}

	// Helper function to render inputs for nested object properties
	const renderNestedInput = (property: any, field: any, isReadOnly = false) => {
		// Simplified version of renderInputByType for nested fields
		if (property.type === "string") {
			if (property.enum) {
				return (
					<Select onValueChange={field.onChange} defaultValue={field.value} value={field.value} disabled={isReadOnly}>
						<SelectTrigger>
							<SelectValue placeholder={`Select ${field.name}`} />
						</SelectTrigger>
						<SelectContent>
							{property.enum.map((option: string) => (
								<SelectItem key={option} value={option}>
									{option}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)
			}
			return <Input {...field} disabled={isReadOnly} />
		} else if (property.type === "number" || property.type === "integer") {
			return (
				<Input
					type="number"
					value={field.value}
					onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : "")}
					min={property.minimum}
					max={property.maximum}
					step={property.multipleOf || (property.type === "integer" ? 1 : "any")}
					disabled={isReadOnly}
				/>
			)
		} else if (property.type === "boolean") {
			return (
				<div className="flex items-center space-x-2">
					<Switch checked={!!field.value} onCheckedChange={field.onChange} disabled={isReadOnly} />
					<Label className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</Label>
				</div>
			)
		}

		// Default fallback
		return <Input {...field} disabled={isReadOnly} />
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild disabled={!projectName || !selectedTemplate}>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle>Template Settings</DialogTitle>
					<DialogDescription>
						Fill in all settings for template <span className="font-medium">{selectedTemplate}</span> in project{" "}
						<span className="font-medium">{projectName}</span>
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 flex-1 overflow-hidden flex flex-col">
						<div className="grid gap-4 py-4 overflow-y-auto pr-2 flex-1">{renderFormFields()}</div>

						<DialogFooter className="pt-2">
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Creating Project..." : "Create New Project"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

