import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { InfoIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { renderInputByType } from "../input-renderers"

interface PrimitiveFieldRendererProps {
  fieldPath: string
  property: any
  isRequired: boolean
  isReadOnly: boolean
  form: any
  label?: string
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
        <FormItem className="col-span-full">
          <div className="flex items-center gap-2">
            <FormLabel className="capitalize">
              {property.title || label || fieldPath.split(".").pop()}
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

          <FormControl>{renderInputByType({ property, field, isReadOnly })}</FormControl>

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

