"use client";

import { useState } from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import type { FieldRendererProps } from "../types";

export function ObjectFieldRenderer({
  fieldPath,
  property,
  isRequired,
  isReadOnly,
  form,
  requiredFields,
  renderFormField,
}: FieldRendererProps) {
  const [isOpen, setIsOpen] = useState(true);
  const objectRequiredFields = requiredFields[fieldPath] || [];
  const isNested = fieldPath.includes(".");

  return (
    <FormField
      key={fieldPath}
      control={form.control}
      name={fieldPath}
      render={({ field }) => (
        <FormItem className={isNested ? "col-span-full" : "col-span-full"}>
          <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full"
          >
            <div className="flex items-center justify-between mb-2">
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

                {property.deprecated && (
                  <Badge
                    variant="outline"
                    className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs"
                  >
                    Deprecated
                  </Badge>
                )}
              </div>

              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-1 h-auto">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <Card className="overflow-visible shadow-sm">
                <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(property.properties).map(
                    ([propKey, propValue]: [string, any]) => {
                      return renderFormField(
                        propKey,
                        propValue,
                        fieldPath,
                        objectRequiredFields,
                        isReadOnly,
                      );
                    },
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
