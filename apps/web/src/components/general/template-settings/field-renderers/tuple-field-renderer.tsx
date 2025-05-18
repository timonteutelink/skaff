"use client";

import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormControl,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { FieldRendererProps } from "../types";
import { renderInputByType } from "../input-renderers";
import { Badge } from "@/components/ui/badge";

export function TupleFieldRenderer({
  fieldPath,
  property,
  isRequired,
  isReadOnly,
  form,
  requiredFields,
  renderFormField,
}: FieldRendererProps) {
  // For tuples, we need to render each item with its specific type
  const tupleItems = property.items || [];

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
              {tupleItems.length} items
            </Badge>
          </div>

          <FormControl>
            <Card className="overflow-visible shadow-sm">
              <CardHeader className="p-3 bg-muted/20">
                <div className="text-sm font-medium">
                  Fixed-length array ({tupleItems.length} items)
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {tupleItems.map((itemSchema: any, index: number) => {
                  const itemPath = `${fieldPath}.${index}`;

                  // For object types, render using the object renderer
                  if (itemSchema.type === "object" && itemSchema.properties) {
                    return (
                      <div
                        key={index}
                        className="border-b pb-4 last:border-0 last:pb-0"
                      >
                        <div className="font-medium mb-2 text-sm">
                          Item {index + 1}: {itemSchema.title || "Object"}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 pl-4 border-l-2 border-muted">
                          {Object.entries(itemSchema.properties).map(
                            ([key, value]: [string, any]) => {
                              return renderFormField(
                                key,
                                value,
                                itemPath,
                                itemSchema.required || [],
                              );
                            },
                          )}
                        </div>
                      </div>
                    );
                  }

                  // For primitive types, render directly
                  return (
                    <div
                      key={index}
                      className="border-b pb-4 last:border-0 last:pb-0"
                    >
                      <FormField
                        control={form.control}
                        name={itemPath}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">
                              {itemSchema.title || `Item ${index + 1}`}
                            </FormLabel>
                            <FormControl>
                              {renderInputByType({
                                property: itemSchema,
                                field,
                                isReadOnly,
                              })}
                            </FormControl>
                            {itemSchema.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {itemSchema.description}
                              </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
