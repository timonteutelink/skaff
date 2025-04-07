'use client';

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

	// Create a dynamic zod schema based on the JSON schema
	useEffect(() => {
		if (!selectedTemplateSettingsSchema?.properties) return

		const schemaShape: Record<string, z.ZodTypeAny> = {}
		const defaults: Record<string, any> = {}

		Object.entries(selectedTemplateSettingsSchema.properties).forEach(([key, value]: [string, any]) => {
			switch (value.type) {
				case "string":
					schemaShape[key] = value.enum
						? z.enum(value.enum as [string, ...string[]])
						: z.string().min(1, { message: "This field is required" })
					defaults[key] = value.default || ""
					break
				case "number":
				case "integer":
					schemaShape[key] = z.number()
					defaults[key] = value.default || 0
					break
				case "boolean":
					schemaShape[key] = z.boolean()
					defaults[key] = value.default || false
					break
				default:
					schemaShape[key] = z.string()
					defaults[key] = value.default || ""
			}
		})

		setZodSchema(z.object(schemaShape))
		setFormDefaults(defaults)
	}, [selectedTemplateSettingsSchema])

	const form = useForm<Record<string, any>>({
		resolver: zodResolver(zodSchema),
		defaultValues: formDefaults,
		values: formDefaults,
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

		return Object.entries(selectedTemplateSettingsSchema.properties).map(([key, value]: [string, any]) => (
			<FormField
				key={key}
				control={form.control}
				name={key}
				render={({ field }) => (
					<FormItem>
						<FormLabel className="capitalize">{key}</FormLabel>
						<FormControl>{renderInputByType(value, field)}</FormControl>
						{value.description && <FormDescription>{value.description}</FormDescription>}
						<FormMessage />
					</FormItem>
				)}
			/>
		))
	}

	// Render the appropriate input component based on the property type
	const renderInputByType = (property: any, field: any) => {
		switch (property.type) {
			case "string":
				if (property.enum) {
					return (
						<Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
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
				return <Input {...field} />

			case "number":
			case "integer":
				return (
					<Input
						type="number"
						{...field}
						onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : "")}
					/>
				)

			case "boolean":
				return (
					<div className="flex items-center space-x-2">
						<Switch checked={field.value} onCheckedChange={field.onChange} id={field.name} />
						<Label htmlFor={field.name} className="sr-only">
							{field.name}
						</Label>
					</div>
				)

			default:
				return <Input {...field} />
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild disabled={!projectName || !selectedTemplate}>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Template Settings</DialogTitle>
					<DialogDescription>
						Fill in all settings for template <span className="font-medium">{selectedTemplate}</span> in project{" "}
						<span className="font-medium">{projectName}</span>
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">{renderFormFields()}</div>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Saving..." : "Save settings"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	)
}

