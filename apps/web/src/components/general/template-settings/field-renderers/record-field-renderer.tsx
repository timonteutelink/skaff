"use client"

import { useState } from "react"
import { FormField, FormItem, FormLabel, FormMessage, FormControl } from "@/components/ui/form"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InfoIcon, PlusCircle, Trash2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { renderInputByType } from "../input-renderers"
import type { FieldRendererProps } from "../types"
import { Badge } from "@/components/ui/badge"

export function RecordFieldRenderer({ fieldPath, property, isRequired, isReadOnly, form }: FieldRendererProps) {
  const [newKey, setNewKey] = useState("")
  const [keyError, setKeyError] = useState<string | null>(null)

  // Get current record entries
  const recordValue = form.watch(fieldPath) || {}

  // Add a new key-value pair
  const addEntry = () => {
    if (!newKey.trim()) {
      setKeyError("Key cannot be empty")
      return
    }

    // Check if key already exists
    if (recordValue[newKey] !== undefined) {
      setKeyError("Key already exists")
      return
    }

    // Clear any previous errors
    setKeyError(null)

    // Create default value based on the valueSchema
    let defaultValue
    if (property.additionalProperties.type === "string") {
      defaultValue = ""
    } else if (property.additionalProperties.type === "number" || property.additionalProperties.type === "integer") {
      defaultValue = 0
    } else if (property.additionalProperties.type === "boolean") {
      defaultValue = false
    } else if (property.additionalProperties.type === "object") {
      defaultValue = {}
    } else if (property.additionalProperties.type === "array") {
      defaultValue = []
    } else {
      defaultValue = null
    }

    // Add the new entry
    const updatedRecord = { ...recordValue, [newKey]: defaultValue }
    form.setValue(fieldPath, updatedRecord)

    // Clear the input
    setNewKey("")
  }

  // Remove an entry
  const removeEntry = (key: string) => {
    const { [key]: _, ...rest } = recordValue
    form.setValue(fieldPath, rest)
  }

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
              {property.additionalProperties.type}
            </Badge>
          </div>

          <FormControl>
            <div className="space-y-3">
              {/* Add new entry */}
              {!isReadOnly && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      placeholder="Enter key name"
                      value={newKey}
                      onChange={(e) => {
                        setNewKey(e.target.value)
                        if (keyError) setKeyError(null)
                      }}
                      className={keyError ? "border-destructive" : ""}
                    />
                    {keyError && <p className="text-xs text-destructive mt-1">{keyError}</p>}
                  </div>
                  <Button type="button" onClick={addEntry} disabled={!newKey.trim()} size="sm">
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              )}

              {/* Render existing entries */}
              {Object.keys(recordValue).length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/20">
                  No entries added yet. Add a key to get started.
                </div>
              ) : (
                <Card className="overflow-visible shadow-sm">
                  <CardHeader className="p-3 bg-muted/20">
                    <div className="text-sm font-medium">Entries ({Object.keys(recordValue).length})</div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {Object.entries(recordValue).map(([key, value]) => (
                      <div key={key} className="flex gap-4 items-start border-b pb-3 last:border-0 last:pb-0">
                        <div className="min-w-[120px] pt-2 font-medium text-sm">{key}:</div>
                        <div className="flex-1">
                          <FormField
                            control={form.control}
                            name={`${fieldPath}.${key}`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  {renderInputByType({
                                    property: property.additionalProperties,
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeEntry(key)}
                            className="h-8 w-8 mt-2"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
