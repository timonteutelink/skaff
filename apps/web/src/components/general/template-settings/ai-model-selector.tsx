"use client";

import React from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
interface AiModelCategory { description: string }

interface Props {
  categories: Record<string, AiModelCategory>;
  form: UseFormReturn<Record<string, any>>;
}

export const AiModelSelector: React.FC<Props> = ({ categories, form }) => {
  const providerOptions = [
    { value: "openai", label: "OpenAI" },
    { value: "anthropic", label: "Anthropic" },
  ];
  return (
    <Accordion type="multiple" className="w-full" defaultValue={Object.keys(categories).map((_, i) => `model-${i}`)}>
      {Object.entries(categories).map(([key, cat], idx) => (
        <AccordionItem key={key} value={`model-${idx}`}>
          <AccordionTrigger>{key}</AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 py-2">
              <FormField
                control={form.control}
                name={`aiModels.${key}.provider`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {providerOptions.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`aiModels.${key}.name`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model name</FormLabel>
                    <Input {...field} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {cat.description && <p className="text-sm text-muted-foreground">{cat.description}</p>}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

