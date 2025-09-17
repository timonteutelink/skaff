import { streamText, StreamingTextResponse } from "ai";
import { resolveLanguageModel } from "@timonteutelink/skaff-lib";

interface ConversationRequest {
  model?: { provider?: string; name?: string };
  messages: { role: string; content: string }[];
  context: string[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as ConversationRequest;
  const resolved = resolveLanguageModel(body.model);

  if (!resolved) {
    return new Response(
      JSON.stringify({ error: "No AI provider configured." }),
      { status: 400 },
    );
  }

  const systemContext = body.context
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .join("\n");
  const allowedRoles = new Set(["system", "user", "assistant"]);
  const sanitizedMessages = body.messages
    .filter((message): message is { role: "system" | "user" | "assistant"; content: string } =>
      typeof message.content === "string" && allowedRoles.has(message.role),
    )
    .map((message) => ({ role: message.role, content: message.content }));
  const conversationMessages =
    systemContext.length > 0
      ? ([{ role: "system" as const, content: systemContext }, ...sanitizedMessages])
      : sanitizedMessages;

  const response = await streamText({
    model: resolved.client,
    messages: conversationMessages,
  });

  return new StreamingTextResponse(response.toAIStream());
}
