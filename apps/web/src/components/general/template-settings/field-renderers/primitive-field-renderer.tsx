"use client";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { renderInputByType } from "../input-renderers";

interface PrimitiveFieldRendererProps {
  fieldPath: string;
  property: any;
  isRequired: boolean;
  isReadOnly: boolean;
  form: any;
  label?: string;
}

export function PrimitiveFieldRenderer({
  fieldPath,
  property,
  isRequired,
  isReadOnly,
  form,
  label,
}: PrimitiveFieldRendererProps) {
  return (
    <FormField
      key={fieldPath}
      control={form.control}
      name={fieldPath}
      render={({ field }) => (
        <FormItem className="col-span-full sm:col-span-1">
          <div className="flex items-center gap-2 mb-1.5">
            <FormLabel className="text-sm font-medium">
              {property.title || label || fieldPath.split(".").pop()}
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

            {property.deprecated && (
              <Badge
                variant="outline"
                className="bg-yellow-100 text-yellow-800 border-yellow-300 text-xs"
              >
                Deprecated
              </Badge>
            )}
          </div>

          <FormControl>
            {renderInputByType({
              property,
              field,
              isReadOnly,
            })}
          </FormControl>

          {property.examples && property.examples.length > 0 && (
            <FormDescription className="text-xs">
              Example:{" "}
              {Array.isArray(property.examples)
                ? property.examples[0]?.toString()
                : property.examples.toString()}
            </FormDescription>
          )}

          <FormMessage />
        </FormItem>
      )}
    />
  );
}
