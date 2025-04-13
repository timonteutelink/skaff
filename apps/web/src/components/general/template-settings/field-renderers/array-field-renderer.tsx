"use client";

import { useState } from "react";
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
import { renderInputByType } from "../input-renderers";
import type { ArrayFieldRendererProps } from "../types";
import { ObjectFieldRenderer } from "./object-field-renderer";

// Function to create a default item for the array
const createDefaultItem = (itemSchema: any): any => {
  if (itemSchema.type === "object" && itemSchema.properties) {
    const newItem: any = {};
    for (const key in itemSchema.properties) {
      if (itemSchema.properties.hasOwnProperty(key)) {
        const property = itemSchema.properties[key];
        if (property.type === "string") {
          newItem[key] = "";
        } else if (property.type === "number") {
          newItem[key] = 0;
        } else if (property.type === "boolean") {
          newItem[key] = false;
        } else if (property.type === "array") {
          newItem[key] = [];
        } else if (property.type === "object") {
          newItem[key] = createDefaultItem(property); // Recursive call for nested objects
        } else {
          newItem[key] = null; // Default value for other types
        }
      }
    }
    return newItem;
  } else if (itemSchema.type === "string") {
    return "";
  } else if (itemSchema.type === "number") {
    return 0;
  } else if (itemSchema.type === "boolean") {
    return false;
  }
  return null;
};

export function ArrayFieldRenderer({
  form,
  fieldPath,
  property,
  isRequired,
  isReadOnly,
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

  return (
    <FormField
      key={fieldPath}
      control={form.control}
      name={fieldPath}
      render={({ field }) => {
        return (
          <FormItem className="col-span-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FormLabel className="capitalize text-base font-medium">
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
                      <TooltipContent>
                        <p className="max-w-xs">{property.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Create a new item with default values based on the item schema
                    const newItem = createDefaultItem(property.items);
                    fieldArray.append(newItem);
                    // Auto-expand the newly added item
                    setExpandedItems((prev) => ({
                      ...prev,
                      [fieldArray.fields.length]: true,
                    }));
                  }}
                >
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              )}
            </div>

            <FormMessage />

            {fieldArray.fields.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border rounded-md">
                No items added yet. Click "Add Item" to add your first item.
              </div>
            ) : (
              <div className="space-y-4 mt-2">
                {fieldArray.fields.map((item, index) => {
                  const isExpanded = expandedItems[index] !== false; // Default to expanded if not set

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
    <Card key={item.id} className="overflow-visible">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => toggleItemExpansion(index)}
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
              disabled={index === 0}
              onClick={() => moveItem(index, "up")}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === fieldArray.fields.length - 1}
              onClick={() => moveItem(index, "down")}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
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
        <CardContent className="p-4 pt-0">
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
                  return (
                    <ArrayFieldRenderer
                      key={nestedPath}
                      form={form}
                      fieldPath={nestedPath}
                      property={propValue}
                      isRequired={itemRequiredFields.includes(propKey)}
                      isReadOnly={isReadOnly}
                      createDefaultItem={createDefaultItem}
                      requiredFields={requiredFields}
                      renderFormField={renderFormField}
                    />
                  );
                }

                return (
                  <FormField
                    key={nestedPath}
                    control={form.control}
                    name={nestedPath}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="capitalize">
                          {propValue.title || propKey}
                          {itemRequiredFields.includes(propKey) && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          {renderInputByType({
                            property: propValue,
                            field,
                            isReadOnly,
                          })}
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
            disabled={index === 0}
            onClick={() => moveItem(index, "up")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={index === fieldArray.fields.length - 1}
            onClick={() => moveItem(index, "down")}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fieldArray.remove(index)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  );
}
