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

  return (
    <FormField
      key={fieldPath}
      control={form.control}
      name={fieldPath}
      render={({ field }) => (
        <FormItem className="col-span-full">
          <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="w-full"
          >
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

              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <Card className="overflow-visible">
                <CardContent className="p-4 grid gap-4 sm:grid-cols-2">
                  {Object.entries(property.properties).map(
                    ([propKey, propValue]: [string, any]) => {
                      return renderFormField(
                        propKey,
                        propValue,
                        fieldPath,
                        objectRequiredFields,
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
