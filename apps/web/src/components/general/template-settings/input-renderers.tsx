"use client"

import { format } from "date-fns"
import { CalendarIcon, Check, ChevronsUpDown } from "lucide-react"
import type { InputRendererProps } from "./types"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"

export function renderInputByType({ property, field, isReadOnly }: InputRendererProps) {
  // Handle null or undefined values
  const value = field.value === null || field.value === undefined ? "" : field.value

  // Common props for all input types
  const commonProps = {
    id: field.name,
    disabled: isReadOnly,
    "aria-describedby": property.description ? `${field.name}-description` : undefined,
  }

  // Handle different types
  if (property.type === "string" || (Array.isArray(property.type) && property.type.includes("string"))) {
    return renderStringInput({
      property,
      field,
      value,
      commonProps,
      isReadOnly,
    })
  } else if (
    property.type === "number" ||
    property.type === "integer" ||
    (Array.isArray(property.type) && (property.type.includes("number") || property.type.includes("integer")))
  ) {
    return renderNumberInput({
      property,
      field,
      value,
      commonProps,
      isReadOnly,
    })
  } else if (property.type === "boolean" || (Array.isArray(property.type) && property.type.includes("boolean"))) {
    return renderBooleanInput({
      property,
      field,
      value,
      commonProps,
      isReadOnly,
    })
  }

  // Fallback for any other type
  return (
    <Input {...field} {...commonProps} value={value} placeholder={property.placeholder || ""} disabled={isReadOnly} />
  )
}

// Update the renderStringInput function to handle time format
function renderStringInput({ property, field, value, commonProps, isReadOnly }: any) {
  // Handle string formats
  if (property.format === "date-time" || property.format === "date") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}
            {...commonProps}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {field.value ? format(new Date(field.value), "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0">
          <Calendar
            mode="single"
            selected={field.value ? new Date(field.value) : undefined}
            onSelect={(date) => field.onChange(date ? date.toISOString() : null)}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    )
  } else if (property.format === "time") {
    // Simple time input
    return (
      <Input
        {...field}
        {...commonProps}
        type="time"
        value={value}
        placeholder={property.placeholder || ""}
        disabled={isReadOnly}
      />
    )
  } else if (property.enum) {
    // Handle enum with combobox for large lists
    if (property.enum.length > 10 && property.ui?.widget === "combobox") {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn("w-full justify-between", !field.value && "text-muted-foreground")}
              disabled={isReadOnly}
            >
              {field.value || `Select ${property.title || field.name}`}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder={`Search ${property.title || field.name}...`} />
              <CommandList>
                <CommandEmpty>No option found.</CommandEmpty>
                <CommandGroup className="max-h-60 overflow-auto">
                  {property.enum.map((option: string) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => {
                        field.onChange(option)
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", option === field.value ? "opacity-100" : "opacity-0")} />
                      {option}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )
    }

    // Handle enum (select)
    return (
      <Select onValueChange={field.onChange} defaultValue={value} value={value} disabled={isReadOnly}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${property.title || field.name}`} />
        </SelectTrigger>
        <SelectContent>
          {property.enum.map((option: string) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (property.format === "textarea" || property.maxLength > 100) {
    // Textarea for longer text
    return (
      <Textarea
        {...field}
        {...commonProps}
        value={value}
        placeholder={property.placeholder || ""}
        className="resize-vertical min-h-[80px]"
      />
    )
  } else {
    // Regular input with appropriate type based on format
    let inputType = "text"
    if (property.format === "email") inputType = "email"
    else if (property.format === "uri" || property.format === "url") inputType = "url"
    else if (property.format === "password") inputType = "password"

    return <Input {...field} {...commonProps} type={inputType} value={value} placeholder={property.placeholder || ""} />
  }
}

function renderNumberInput({ property, field, value, commonProps, isReadOnly }: any) {
  // Use slider for numbers with min/max and step
  if (property.minimum !== undefined && property.maximum !== undefined && property.ui?.widget === "slider") {
    return (
      <div className="space-y-2">
        <Slider
          defaultValue={[value]}
          min={property.minimum}
          max={property.maximum}
          step={property.multipleOf || 1}
          onValueChange={(vals) => field.onChange(vals[0])}
          disabled={isReadOnly}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{property.minimum}</span>
          <span>{value}</span>
          <span>{property.maximum}</span>
        </div>
      </div>
    )
  }

  // Regular number input
  return (
    <Input
      {...commonProps}
      type="number"
      value={value}
      onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : "")}
      min={property.minimum}
      max={property.maximum}
      step={property.multipleOf || (property.type === "integer" ? 1 : "any")}
      placeholder={property.placeholder || ""}
      disabled={isReadOnly}
    />
  )
}

function renderBooleanInput({ property, field, value, commonProps, isReadOnly }: any) {
  // Use radio group if specified in UI options
  if (property.ui?.widget === "radio") {
    return (
      <RadioGroup
        onValueChange={(val) => field.onChange(val === "true")}
        defaultValue={value ? "true" : "false"}
        disabled={isReadOnly}
        className="flex items-center space-x-4"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="true" id={`${field.name}-true`} />
          <Label htmlFor={`${field.name}-true`}>Yes</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="false" id={`${field.name}-false`} />
          <Label htmlFor={`${field.name}-false`}>No</Label>
        </div>
      </RadioGroup>
    )
  }

  // Default to switch
  return (
    <div className="flex items-center space-x-2">
      <Switch checked={!!value} onCheckedChange={field.onChange} disabled={isReadOnly} {...commonProps} />
      <Label htmlFor={field.name} className="text-sm text-muted-foreground">
        {value ? "Enabled" : "Disabled"}
      </Label>
    </div>
  )
}
