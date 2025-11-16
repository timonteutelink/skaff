"use client";
import { useState } from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  InfoIcon,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FieldRendererProps } from "../types";
import { renderInputByType } from "../input-renderers";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UnionFieldRenderer({
  fieldPath,
  property,
  isRequired,
  isReadOnly,
  form,
  requiredFields,
  renderFormField,
}: FieldRendererProps) {
  const [selectedVariant, setSelectedVariant] = useState(0);

  // Find the discriminator field by looking for a property with a "const" value in each variant
  const findDiscriminator = () => {
    if (!property.anyOf || !property.anyOf[0]?.properties) return null;

    // Look through the first variant's properties to find one with a "const" value
    const firstVariant = property.anyOf[0].properties;
    for (const [key, prop] of Object.entries(firstVariant)) {
      if ((prop as any).const !== undefined) {
        return key;
      }
    }
    return null;
  };

  const discriminator = findDiscriminator();
  const isDiscriminatedUnion = !!discriminator;

  // For regular unions (no discriminator)
  const handleVariantChange = (index: number) => {
    setSelectedVariant(index);

    // Get the new variant schema
    const newVariant = property.anyOf[index];

    // Clear existing values for this field path
    const currentValue = form.getValues(fieldPath) || {};
    if (typeof currentValue === "object") {
      // For object types, reset all fields
      Object.keys(currentValue).forEach((key) => {
        form.setValue(`${fieldPath}.${key}`, undefined);
      });
    } else {
      // For primitive types, reset the whole value
      form.setValue(fieldPath, undefined);
    }

    // Set default values for the new variant
    if (newVariant.type === "object" && newVariant.properties) {
      Object.entries(newVariant.properties).forEach(
        ([key, prop]: [string, any]) => {
          if (prop.default !== undefined) {
            form.setValue(`${fieldPath}.${key}`, prop.default);
          }
        },
      );
    } else if (newVariant.default !== undefined) {
      form.setValue(fieldPath, newVariant.default);
    }
  };

  // If it's a discriminated union, use the existing logic
  if (isDiscriminatedUnion) {
    // Get all possible values for the discriminator
    const options = property.anyOf.map(
      (variant: any) => variant.properties[discriminator].const,
    );

    // Get the current value of the discriminator
    const discriminatorPath = `${fieldPath}.${discriminator}`;
    const currentValue = form.watch(discriminatorPath) || options[0];

    // Find the current variant based on the discriminator value
    const currentVariant = property.anyOf.find(
      (variant: any) =>
        variant.properties[discriminator].const === currentValue,
    );

    // When the discriminator changes, reset the form fields for this section
    const handleDiscriminatorChange = (value: string) => {
      // Set the discriminator value
      form.setValue(discriminatorPath, value);

      // Find the new variant
      const newVariant = property.anyOf.find(
        (variant: any) => variant.properties[discriminator].const === value,
      );

      if (!newVariant) return;

      // Reset all fields except the discriminator
      const defaultValues: Record<string, any> = {};
      defaultValues[discriminator] = value;

      // Set default values for the new variant's properties
      Object.entries(newVariant.properties).forEach(
        ([key, prop]: [string, any]) => {
          if (key !== discriminator && prop.default !== undefined) {
            defaultValues[key] = prop.default;
          }
        },
      );

      // Update the form with the new default values
      Object.entries(defaultValues).forEach(([key, value]) => {
        form.setValue(`${fieldPath}.${key}`, value);
      });
    };

    // Get the required fields for the current variant
    const variantRequiredFields = currentVariant?.required || [];

    return (
      <FormField
        control={form.control}
        name={fieldPath}
        render={() => (
          <FormItem className="col-span-full space-y-3">
            <div className="flex items-center gap-2">
              <FormLabel className="text-base font-medium">
                {property.title || fieldPath.split(".").pop()}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </FormLabel>

              {property.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{property.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <Badge variant="outline" className="text-xs">
                Discriminated Union
              </Badge>
            </div>

            <FormControl>
              <div className="space-y-3">
                {/* Discriminator field */}
                <div>
                  <FormLabel
                    htmlFor={discriminatorPath}
                    className="text-sm font-medium"
                  >
                    {currentVariant?.properties[discriminator]?.title ||
                      discriminator}
                  </FormLabel>
                  <Select
                    value={currentValue}
                    onValueChange={handleDiscriminatorChange}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger id={discriminatorPath}>
                      <SelectValue placeholder={`Select ${discriminator}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option: any) => (
                        <SelectItem key={option} value={option}>
                          {String(option).toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Render the fields for the current variant */}
                <Card className="overflow-visible shadow-sm">
                  <CardHeader className="p-3 bg-muted/20">
                    <div className="text-sm font-medium">
                      {currentVariant?.title || `${currentValue} Configuration`}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
                    {currentVariant &&
                      Object.entries(currentVariant.properties)
                        .filter(([key]) => key !== discriminator) // Skip the discriminator field
                        .map(([key, value]: [string, any]) => {
                          return renderFormField(
                            key,
                            value,
                            fieldPath,
                            variantRequiredFields,
                            isReadOnly,
                          );
                        })}
                  </CardContent>
                </Card>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  } else {
    // Regular union (no discriminator)
    // Use tabs or radio buttons to switch between variants
    return (
      <FormField
        control={form.control}
        name={fieldPath}
        render={() => (
          <FormItem className="col-span-full space-y-3">
            <div className="flex items-center gap-2">
              <FormLabel className="text-base font-medium">
                {property.title || fieldPath.split(".").pop()}
                {isRequired && <span className="text-destructive ml-1">*</span>}
              </FormLabel>

              {property.description && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{property.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              <Badge variant="outline" className="text-xs">
                Union
              </Badge>
            </div>

            <FormControl>
              <div className="space-y-3">
                {/* Variant selector */}
                <div className="flex flex-wrap gap-2">
                  {property.anyOf.map((variant: any, index: number) => (
                    <Button
                      key={index}
                      type="button"
                      variant={
                        selectedVariant === index ? "default" : "outline"
                      }
                      onClick={() => handleVariantChange(index)}
                      disabled={isReadOnly}
                      size="sm"
                    >
                      {variant.title || `Variant ${index + 1}`}
                    </Button>
                  ))}
                </div>

                {/* Render the fields for the selected variant */}
                <Card className="overflow-visible shadow-sm">
                  <CardHeader className="p-3 bg-muted/20">
                    <div className="text-sm font-medium">
                      {property.anyOf[selectedVariant]?.title ||
                        `Variant ${selectedVariant + 1}`}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
                    {property.anyOf[selectedVariant] &&
                      (property.anyOf[selectedVariant].type === "object" ? (
                        // For object variants, render each property
                        Object.entries(
                          property.anyOf[selectedVariant].properties || {},
                        ).map(([key, value]: [string, any]) => {
                          return renderFormField(
                            key,
                            value,
                            fieldPath,
                            property.anyOf[selectedVariant].required || [],
                            isReadOnly,
                          );
                        })
                      ) : (
                        // For primitive variants, render a single field
                        <FormField
                          control={form.control}
                          name={fieldPath}
                          render={({ field }) => (
                            <FormItem className="col-span-full">
                              <FormControl>
                                {renderInputByType({
                                  property: property.anyOf[selectedVariant],
                                  field,
                                  isReadOnly,
                                })}
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                  </CardContent>
                </Card>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
}

export function ArrayUnionItem({
  index,
  isExpanded: initialExpanded,
  toggleItemExpansion,
  moveItem,
  duplicateItem,
  fieldArray,
  isReadOnly,
  children, // ← whatever we want to render inside (the Union)
}: any) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded);

  const onToggle = () => {
    setIsExpanded(!isExpanded);
    toggleItemExpansion(index);
  };

  return (
    <Card className="overflow-visible border shadow-sm">
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="p-1 h-auto"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <CardTitle className="text-sm font-medium">
            Item {index + 1}
          </CardTitle>
        </div>

        {!isReadOnly && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1 h-auto"
              disabled={index === 0}
              onClick={() => moveItem(index, "up")}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="p-1 h-auto"
              disabled={index === fieldArray.fields.length - 1}
              onClick={() => moveItem(index, "down")}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="p-1 h-auto">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => duplicateItem(index)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => fieldArray.remove(index)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>

      {isExpanded && <CardContent className="p-4 pt-3">{children}</CardContent>}
    </Card>
  );
}
