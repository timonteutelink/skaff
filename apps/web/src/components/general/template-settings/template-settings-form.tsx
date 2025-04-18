"use client";

import type React from "react";

import { useState, useEffect, useCallback } from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import z from "zod";

import type { TemplateSettingsFormProps } from "./types";
import { buildSchemaAndDefaults, createDefaultItem } from "./schema-utils";
import { ArrayFieldRenderer } from "./field-renderers/array-field-renderer";
import { ObjectFieldRenderer } from "./field-renderers/object-field-renderer";
import { PrimitiveFieldRenderer } from "./field-renderers/primitive-field-renderer";

export const TemplateSettingsForm: React.FC<TemplateSettingsFormProps> = ({
  projectName,
  selectedTemplate,
  selectedTemplateSettingsSchema,
  formDefaultValues,
  action,
  cancel,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zodSchema, setZodSchema] = useState<z.ZodType<any>>(z.object({}));
  const [formDefaults, setFormDefaults] =
    useState<Record<string, any>>(formDefaultValues);
  const [requiredFields, setRequiredFields] = useState<
    Record<string, string[]>
  >({});

  // Create a dynamic zod schema based on the JSON schema
  useEffect(() => {
    if (!selectedTemplateSettingsSchema?.properties) return;

    const { schema, defaults, required } = buildSchemaAndDefaults(
      selectedTemplateSettingsSchema,
    );
    setZodSchema(schema);
    setFormDefaults(defaults);
    setRequiredFields(required);
  }, [selectedTemplateSettingsSchema]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(zodSchema),
    defaultValues: formDefaults,
    values: formDefaults,
    mode: "onChange",
  });

  // Reset form when schema changes
  useEffect(() => {
    if (formDefaults !== formDefaultValues) {
      setFormDefaults(formDefaultValues);
      form.reset(formDefaultValues);
      return;
    }
    form.reset(formDefaults);
  }, [formDefaults, form]);

  const onSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      await action(data);
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoize createDefaultItem to avoid recreating it on every render
  const memoizedCreateDefaultItem = useCallback(createDefaultItem, []);

  // Render form fields based on schema
  const renderFormFields = () => {
    if (!selectedTemplateSettingsSchema?.properties) {
      return (
        <p className="text-sm text-muted-foreground">
          No settings required for this template.
        </p>
      );
    }

    // Group fields by categories if they exist
    const categories: Record<string, any[]> = { "": [] };

    Object.entries(selectedTemplateSettingsSchema.properties).forEach(
      ([key, value]: [string, any]) => {
        const category = value.category || "";
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push({ key, value });
      },
    );

    // If we have categories, render them as accordion sections
    if (
      Object.keys(categories).length > 1 ||
      (Object.keys(categories).length === 1 &&
        Object.keys(categories)[0] !== "")
    ) {
      return (
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={Object.keys(categories).map((_, i) => `item-${i}`)}
        >
          {Object.entries(categories).map(([category, fields], index) => (
            <AccordionItem
              key={category || `default-${index}`}
              value={`item-${index}`}
            >
              <AccordionTrigger>
                {category || "General Settings"}
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-6 py-2">
                  {fields.map(({ key, value }) =>
                    renderFormField(
                      key,
                      value,
                      "",
                      requiredFields["root"] || [],
                    ),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );
    }

    // Otherwise render fields directly
    return (
      <div className="grid gap-6">
        {Object.entries(selectedTemplateSettingsSchema.properties).map(
          ([key, value]: [string, any]) =>
            renderFormField(key, value, "", requiredFields["root"] || []),
        )}
      </div>
    );
  };

  // Render a single form field
  const renderFormField = (
    key: string,
    property: any,
    parentPath = "",
    requiredFieldsList: string[] = [],
  ) => {
    // Skip rendering if the field should be hidden
    if (property.hidden) return null;

    const fieldPath = parentPath ? `${parentPath}.${key}` : key;
    const isRequired = requiredFieldsList.includes(key);
    const isReadOnly = property.readOnly === true;

    // Special handling for arrays
    if (property.type === "array") {
      return (
        <ArrayFieldRenderer
          key={fieldPath}
          form={form}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          createDefaultItem={memoizedCreateDefaultItem}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    // Special handling for objects
    if (property.type === "object" && property.properties) {
      return (
        <ObjectFieldRenderer
          key={fieldPath}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          form={form}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    // Regular field rendering
    return (
      <PrimitiveFieldRenderer
        key={fieldPath}
        fieldPath={fieldPath}
        property={property}
        isRequired={isRequired}
        isReadOnly={isReadOnly}
        form={form}
        label={key}
      />
    );
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Template Settings
          </h1>
          <p className="text-muted-foreground">
            Configure settings for template{" "}
            <span className="font-medium">{selectedTemplate}</span> in project{" "}
            <span className="font-medium">{projectName}</span>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid gap-6">{renderFormFields()}</div>

            <Separator />

            <div className="flex justify-end gap-4">
              {cancel && (
                <Button type="button" variant="outline" onClick={cancel}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save settings"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
};
