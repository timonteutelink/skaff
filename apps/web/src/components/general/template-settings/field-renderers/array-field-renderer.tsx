"use client";

import { useCallback, useState } from "react";
import { useFieldArray } from "react-hook-form";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PlusCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  Copy,
  MoreHorizontal,
  ArrowDown,
  ArrowUp,
  InfoIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { renderInputByType } from "../input-renderers";
import type { ArrayFieldRendererProps } from "../types";
import { ObjectFieldRenderer } from "./object-field-renderer";
import { ArrayUnionItem, UnionFieldRenderer } from "./union-field-renderer";
import {
  buildDiscriminatedUnionSchema,
  getDefaultValueForType,
  isDiscriminatedUnionSchema,
} from "../schema-utils";

export function ArrayFieldRenderer({
  form,
  fieldPath,
  property,
  isRequired,
  isReadOnly,
  createDefaultItem,
  requiredFields,
  renderFormField,
}: ArrayFieldRendererProps) {
  const fieldArray = useFieldArray({
    control: form.control,
    name: fieldPath,
  });

  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>(
    {},
  );

  const toggleItemExpansion = (index: number) => {
    setExpandedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fieldArray.fields.length) return;
    fieldArray.swap(index, newIndex);
  };

  const duplicateItem = (index: number) => {
    const itemToDuplicate = form.getValues(`${fieldPath}.${index}`);
    fieldArray.insert(index + 1, JSON.parse(JSON.stringify(itemToDuplicate)));
  };

  const onAddItem = useCallback(() => {
    let newItem;
    if (property.items?.anyOf) {
      if (isDiscriminatedUnionSchema(property.items)) {
        const firstVariant = property.items.anyOf[0];

        const discrKey = Object.entries(firstVariant.properties).find(
          ([, v]: any) => v.const !== undefined,
        )?.[0] as string;
        const discrVal = firstVariant.properties[discrKey].const;

        const { defaults } = buildDiscriminatedUnionSchema(property.items);
        newItem = { ...defaults, [discrKey]: discrVal };
      } else {
        const baseVariant =
          property.items.anyOf.find((variant: any) => variant.type !== "null") ||
          property.items.anyOf[0];
        newItem =
          property.items.default ??
          baseVariant?.default ??
          getDefaultValueForType(baseVariant);
      }
    } else {
      newItem = createDefaultItem ? createDefaultItem(property.items) : {};
    }

    fieldArray.append(newItem);
    setExpandedItems((prev) => ({ ...prev, [fieldArray.fields.length]: true }));
  }, [fieldArray, property, createDefaultItem]);

  return (
    <FormField
      key={fieldPath}
      control={form.control}
      name={fieldPath}
      render={({ field }) => {
        return (
          <FormItem className="col-span-full space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FormLabel className="text-base font-medium">
                  {property.title || fieldPath.split(".").pop()}
                  {isRequired && (
                    <span className="text-destructive ml-1">*</span>
                  )}
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

                {property.minItems !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    Min: {property.minItems}
                  </Badge>
                )}

                {property.maxItems !== undefined && (
                  <Badge variant="outline" className="text-xs">
                    Max: {property.maxItems}
                  </Badge>
                )}
              </div>

              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAddItem}
                  disabled={
                    property.maxItems !== undefined &&
                    fieldArray.fields.length >= property.maxItems
                  }
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            <FormMessage />

            {fieldArray.fields.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                {`No items added yet. Click "Add Item" to add your first item.`}
              </div>
            ) : (
              <div className="space-y-3">
                {fieldArray.fields.map((item, index) => {
                  const itemPath = `${fieldPath}.${index}`;
                  if (property.items?.anyOf) {
                    const isExpanded = expandedItems[index] !== false;
                    return (
                      <ArrayUnionItem
                        key={item.id}
                        index={index}
                        isExpanded={isExpanded}
                        toggleItemExpansion={toggleItemExpansion}
                        moveItem={moveItem}
                        duplicateItem={duplicateItem}
                        fieldArray={fieldArray}
                        isReadOnly={isReadOnly}
                      >
                        <UnionFieldRenderer
                          fieldPath={itemPath}
                          property={property.items}
                          isRequired={false}
                          isReadOnly={isReadOnly}
                          form={form}
                          requiredFields={requiredFields}
                          renderFormField={renderFormField}
                        />
                      </ArrayUnionItem>
                    );
                  }
                  const isExpanded = expandedItems[index] !== false;

                  // For array of objects
                  if (
                    property.items.type === "object" &&
                    property.items.properties
                  ) {
                    return (
                      <ArrayObjectItem
                        key={item.id}
                        item={item}
                        index={index}
                        isExpanded={isExpanded}
                        toggleItemExpansion={toggleItemExpansion}
                        moveItem={moveItem}
                        duplicateItem={duplicateItem}
                        fieldArray={fieldArray}
                        fieldPath={fieldPath}
                        property={property}
                        isReadOnly={isReadOnly}
                        form={form}
                        requiredFields={requiredFields}
                        renderFormField={renderFormField}
                      />
                    );
                  }

                  // For array of primitives
                  return (
                    <ArrayPrimitiveItem
                      key={item.id}
                      index={index}
                      fieldPath={fieldPath}
                      property={property}
                      isReadOnly={isReadOnly}
                      form={form}
                      moveItem={moveItem}
                      fieldArray={fieldArray}
                    />
                  );
                })}
              </div>
            )}
          </FormItem>
        );
      }}
    />
  );
}

function ArrayObjectItem({
  item,
  index,
  isExpanded,
  toggleItemExpansion,
  moveItem,
  duplicateItem,
  fieldArray,
  fieldPath,
  property,
  isReadOnly,
  form,
  requiredFields,
  renderFormField,
}: any) {
  const itemRequiredFields = requiredFields[`${fieldPath}[]`] || [];

  return (
    <Card key={item.id} className="overflow-visible border shadow-sm">
      <CardHeader className="p-3 flex flex-row items-center justify-between bg-muted/20">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggleItemExpansion(index)}
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

      {isExpanded && (
        <CardContent className="p-4 pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(property.items.properties).map(
              ([propKey, propValue]: [string, any]) => {
                const nestedPath = `${fieldPath}.${index}.${propKey}`;

                // Handle nested objects and arrays recursively
                if (propValue.type === "object" && propValue.properties) {
                  return (
                    <ObjectFieldRenderer
                      key={nestedPath}
                      fieldPath={nestedPath}
                      property={propValue}
                      isRequired={itemRequiredFields.includes(propKey)}
                      isReadOnly={isReadOnly}
                      form={form}
                      requiredFields={requiredFields}
                      renderFormField={renderFormField}
                    />
                  );
                }

                if (propValue.type === "array") {
                  return renderFormField(
                    propKey,
                    propValue,
                    `${fieldPath}.${index}`,
                    itemRequiredFields,
                    isReadOnly,
                  );
                }

                return renderFormField(
                  propKey,
                  propValue,
                  `${fieldPath}.${index}`,
                  itemRequiredFields,
                  isReadOnly,
                );
              },
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ArrayPrimitiveItem({
  index,
  fieldPath,
  property,
  isReadOnly,
  form,
  moveItem,
  fieldArray,
}: any) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <FormField
          control={form.control}
          name={`${fieldPath}.${index}`}
          render={({ field }) => (
            <FormItem className="flex-1 space-y-0">
              <FormControl>
                {renderInputByType({
                  property: property.items,
                  field,
                  isReadOnly,
                })}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {!isReadOnly && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={index === 0}
            onClick={() => moveItem(index, "up")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={index === fieldArray.fields.length - 1}
            onClick={() => moveItem(index, "down")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fieldArray.remove(index)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  );
}
