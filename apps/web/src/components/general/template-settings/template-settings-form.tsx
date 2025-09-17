"use client";

import type React from "react";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import z from "zod";

import { advanceTemplateAiGeneration } from "@/app/actions/ai";
import type { TemplateSettingsFormProps } from "./types";
import { buildSchemaAndDefaults, createDefaultItem } from "./schema-utils";
import { ArrayFieldRenderer } from "./field-renderers/array-field-renderer";
import { ObjectFieldRenderer } from "./field-renderers/object-field-renderer";
import { PrimitiveFieldRenderer } from "./field-renderers/primitive-field-renderer";
import { UnionFieldRenderer } from "./field-renderers/union-field-renderer";
import { TupleFieldRenderer } from "./field-renderers/tuple-field-renderer";
import { RecordFieldRenderer } from "./field-renderers/record-field-renderer";
import { toastNullError } from "@/lib/utils";
import { AiModelSelector } from "./ai-model-selector";
import type {
  AiResultsObject,
  UserTemplateSettings,
} from "@timonteutelink/template-types-lib";
import type { ConversationStepData } from "@timonteutelink/skaff-lib";

interface ConversationPanelProps {
  prompt: ConversationStepData;
  onComplete: (finalResponse: string) => void;
}

const ConversationPanel: React.FC<ConversationPanelProps> = ({
  prompt,
  onComplete,
}) => {
  const { messages, setMessages, sendMessage, status, error, clearError } = useChat({
    api: "/api/ai/conversation",
    body: { model: prompt.model, context: prompt.context },
    id: `conversation-${prompt.resultKey}`,
  });

  const [draft, setDraft] = useState("");
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const initialMessages: UIMessage[] = prompt.messages.map((message, index) => ({
      id: `${prompt.resultKey}-${index}`,
      role: message.role as UIMessage["role"],
      parts: message.content
        ? [{ type: "text" as const, text: message.content }]
        : [],
    }));

    setMessages(initialMessages);
    setDraft("");
    clearError();
  }, [prompt, setMessages, clearError]);

  const getMessageText = (message: UIMessage) =>
    message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("")
      .trim();

  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastAssistant =
    assistantMessages.length > 0
      ? getMessageText(assistantMessages[assistantMessages.length - 1])
      : "";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || isLoading) {
      return;
    }

    await sendMessage({ text: draft.trim() });
    setDraft("");
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="h-56 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Start the conversation by sending a message.
          </p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="text-sm leading-relaxed">
              <span className="font-medium">
                {message.role === "user" ? "You" : "Assistant"}
              </span>
              : {getMessageText(message)}
            </div>
          ))
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up question or provide more details..."
          className="min-h-[80px]"
        />
        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isLoading || !draft.trim()}>
            Send
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading || !lastAssistant}
            onClick={() => onComplete(lastAssistant)}
          >
            Use response
          </Button>
        </div>
      </form>
    </div>
  );
};

export const TemplateSettingsForm: React.FC<TemplateSettingsFormProps> = ({
  projectName,
  rootTemplateName,
  selectedTemplate,
  selectedTemplateSettingsSchema,
  formDefaultValues,
  action,
  cancel,
  cancelButton,
  aiModelCategories,
  aiGenerationStepCount,
  connectedProviders,
  projectDirPathId,
  projectRoot,
  providersLoaded,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [zodSchema, setZodSchema] = useState<z.ZodType<any>>(z.object({}));
  const [formDefaults, setFormDefaults] =
    useState<Record<string, any>>(formDefaultValues);
  const [requiredFields, setRequiredFields] = useState<
    Record<string, string[]>
  >({});
  const [aiResults, setAiResults] = useState<AiResultsObject>(
    (formDefaultValues.aiResults ?? {}) as AiResultsObject,
  );
  const [conversationPrompt, setConversationPrompt] =
    useState<ConversationStepData | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(
    null,
  );
  const [conversationStarted, setConversationStarted] = useState(false);

  const hasAiGeneration = aiGenerationStepCount > 0;
  const aiUnavailable =
    hasAiGeneration && providersLoaded && connectedProviders.length === 0;

  useEffect(() => {
    if (!selectedTemplateSettingsSchema?.properties) return;

    const { schema, defaults, required } = buildSchemaAndDefaults(
      selectedTemplateSettingsSchema,
    );
    setZodSchema(schema);
    setFormDefaults(() => ({ ...defaults, ...formDefaultValues }));
    setRequiredFields(required);
    setAiResults((formDefaultValues.aiResults ?? {}) as AiResultsObject);
    setConversationPrompt(null);
    setConversationStarted(false);
  }, [selectedTemplateSettingsSchema, formDefaultValues]);

  const form = useForm<Record<string, any>>({
    resolver: zodResolver(zodSchema as any),
    defaultValues: formDefaults,
    values: formDefaults,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(formDefaults);
  }, [formDefaults, form]);

  useEffect(() => {
    form.setValue("aiResults", aiResults as unknown as UserTemplateSettings);
  }, [aiResults, form]);

  const onSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      await action({ ...data, aiResults });
    } catch (error) {
      toastNullError({
        error,
        shortMessage: "Failed to save template settings",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const memoizedCreateDefaultItem = useCallback(createDefaultItem, []);

  const fetchNextConversation = useCallback(
    async (overrides?: AiResultsObject) => {
      if (!hasAiGeneration || aiUnavailable) return;
      const currentAiResults = overrides ?? aiResults;
      setConversationStarted(true);
      setIsConversationLoading(true);
      setConversationError(null);
      try {
        const values = form.getValues();
        const payload = {
          ...values,
          aiResults: currentAiResults,
        };
        const res = await advanceTemplateAiGeneration({
          rootTemplateName,
          templateName: selectedTemplate,
          templateSettings: payload,
          aiResults: currentAiResults,
          projectDirPathId,
          projectRoot,
        });
        if ("error" in res) {
          setConversationError(res.error);
          return;
        }
        setAiResults(res.data.aiResults);
        setConversationPrompt(res.data.nextConversation ?? null);
      } catch (error) {
        toastNullError({
          error,
          shortMessage: "Failed to prepare AI conversation",
        });
      } finally {
        setIsConversationLoading(false);
      }
    },
    [
      aiResults,
      aiUnavailable,
      form,
      hasAiGeneration,
      projectDirPathId,
      projectRoot,
      rootTemplateName,
      selectedTemplate,
    ],
  );

  const handleConversationComplete = useCallback(
    async (finalResponse: string) => {
      if (!conversationPrompt) return;
      const updated: AiResultsObject = {
        ...aiResults,
        [conversationPrompt.resultKey]: finalResponse,
      };
      setAiResults(updated);
      setConversationPrompt(null);
      await fetchNextConversation(updated);
    },
    [aiResults, conversationPrompt, fetchNextConversation],
  );

  const renderFormFields = () => {
    if (!selectedTemplateSettingsSchema?.properties) {
      return (
        <p className="text-sm text-muted-foreground">
          No settings required for this template.
        </p>
      );
    }

    const categories: Record<string, any[]> = { "": [] };

    Object.entries(selectedTemplateSettingsSchema.properties).forEach(
      ([key, value]: [string, any]) => {
        if (key === "aiModels") return;
        const category = value.category || "";
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push({ key, value });
      },
    );

    if (
      Object.keys(categories).length > 1 ||
      (Object.keys(categories).length === 1 &&
        Object.keys(categories)[0] !== "")
    ) {
      return (
        <Accordion
          type="multiple"
          className="w-full"
          defaultValue={Object.keys(categories).map((_, i) => `item-${i}`)}
        >
          {Object.entries(categories).map(([category, fields], index) => (
            <AccordionItem
              key={category || `default-${index}`}
              value={`item-${index}`}
            >
              <AccordionTrigger>
                {category || "General Settings"}
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-6 py-2">
                  {fields.map(({ key, value }) =>
                    renderFormField(
                      key,
                      value,
                      "",
                      requiredFields["root"] || [],
                    ),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );
    }

    return (
      <div className="grid gap-6">
        {Object.entries(selectedTemplateSettingsSchema.properties)
          .filter(([k]) => k !== "aiModels")
          .map(([key, value]: [string, any]) =>
            renderFormField(key, value, "", requiredFields["root"] || []),
          )}
      </div>
    );
  };

  const renderFormField = (
    key: string,
    property: any,
    parentPath = "",
    requiredFieldsList: string[] = [],
  ) => {
    if (property.hidden) return null;

    const fieldPath = parentPath ? `${parentPath}.${key}` : key;
    const isRequired = requiredFieldsList.includes(key);
    const isReadOnly = property.readOnly === true;

    if (property.anyOf) {
      return (
        <UnionFieldRenderer
          key={fieldPath}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          form={form}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    if (property.type === "array" && Array.isArray(property.items)) {
      return (
        <TupleFieldRenderer
          key={fieldPath}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          form={form}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    if (
      property.type === "object" &&
      !property.properties &&
      property.additionalProperties
    ) {
      return (
        <RecordFieldRenderer
          key={fieldPath}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          form={form}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    if (property.type === "array") {
      return (
        <ArrayFieldRenderer
          key={fieldPath}
          form={form}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          createDefaultItem={memoizedCreateDefaultItem}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    if (property.type === "object" && property.properties) {
      return (
        <ObjectFieldRenderer
          key={fieldPath}
          fieldPath={fieldPath}
          property={property}
          isRequired={isRequired}
          isReadOnly={isReadOnly}
          form={form}
          requiredFields={requiredFields}
          renderFormField={renderFormField}
        />
      );
    }

    return (
      <PrimitiveFieldRenderer
        key={fieldPath}
        fieldPath={fieldPath}
        property={property}
        isRequired={isRequired}
        isReadOnly={isReadOnly}
        form={form}
        label={key}
      />
    );
  };

  const conversationSatisfied =
    !hasAiGeneration ||
    (conversationStarted && !conversationPrompt && !isConversationLoading);

  return (
    <div className="w-full p-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Template Settings
          </h1>
          <p className="text-muted-foreground">
            Configure settings for template {" "}
            <span className="font-medium">{selectedTemplate}</span> in project{" "}
            <span className="font-medium">{projectName}</span>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid gap-6">{renderFormFields()}</div>

            {aiModelCategories && Object.keys(aiModelCategories).length > 0 && (
              <>
                <Separator />
                <AiModelSelector
                  categories={aiModelCategories}
                  form={form}
                  providers={connectedProviders}
                />
              </>
            )}

            {hasAiGeneration && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-semibold">AI Assistance</h2>
                    <p className="text-sm text-muted-foreground">
                      Complete the AI-assisted conversation before generating
                      the template.
                    </p>
                  </div>
                  {aiUnavailable ? (
                    <Alert variant="destructive">
                      <AlertTitle>AI provider required</AlertTitle>
                      <AlertDescription>
                        Connect at least one AI provider to continue with this
                        template.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-4">
                      {!providersLoaded && (
                        <p className="text-sm text-muted-foreground">
                          Checking connected AI providers...
                        </p>
                      )}
                      {conversationError && (
                        <Alert variant="destructive">
                          <AlertTitle>Conversation error</AlertTitle>
                          <AlertDescription>{conversationError}</AlertDescription>
                        </Alert>
                      )}
                      {conversationPrompt ? (
                        <ConversationPanel
                          prompt={conversationPrompt}
                          onComplete={handleConversationComplete}
                        />
                      ) : (
                        <div className="flex items-center justify-between gap-4">
                          <Button
                            type="button"
                            onClick={() => fetchNextConversation()}
                            disabled={isConversationLoading || !providersLoaded}
                          >
                            {conversationStarted
                              ? "Check next AI step"
                              : "Start AI conversation"}
                          </Button>
                          {conversationStarted && !isConversationLoading && (
                            <span className="text-sm text-muted-foreground">
                              All AI steps completed.
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            <div className="flex justify-end gap-4">
              {cancelButton ? (
                cancelButton
              ) : cancel ? (
                <Button type="button" variant="outline" onClick={cancel}>
                  Cancel
                </Button>
              ) : null}
          <Button
            type="submit"
            disabled={
              isSubmitting ||
              !conversationSatisfied ||
              (providersLoaded && aiUnavailable)
            }
          >
            {isSubmitting ? "Saving..." : "Save settings"}
          </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
};
