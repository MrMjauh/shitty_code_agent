import type { Tool } from "../tools/tools.js";
import type { Provider } from "./models/provider.js";
import { type AgentInstructions } from "./agent-instructions.js";
import type {
  Message,
  ModelResponse,
  Result,
  ToolCall,
} from "../shared/types.js";
import type { Session } from "../shared/session.js";

const DEFAULT_MAX_TOOL_ITERATIONS = 50;
const INCLUDE_IN_CONTEXT: Record<Message["role"], boolean> = {
  agent: true,
  assistant: true,
  slash_command: false,
  system: true,
  tool: true,
  user: true,
};

export type OnNewMessage = (msg: Message, systemMessage: Message) => void;
export type AgentOptions = {
  tools: Tool[];
  provider: Provider;
  compileInstructions: AgentInstructions;
  maxLoops?: number;
};

type ResolvedAgentOptions = Required<AgentOptions>;

export class Agent {
  private session: Session;
  private options: ResolvedAgentOptions;

  constructor(session: Session, options: AgentOptions) {
    this.session = session;
    this.options = {
      tools: options.tools,
      provider: options.provider,
      compileInstructions: options.compileInstructions,
      maxLoops: options.maxLoops ?? DEFAULT_MAX_TOOL_ITERATIONS,
    };
  }

  public getProvider(): Provider {
    return this.options.provider;
  }

  public getSystemInstructions() {
    return this.options.compileInstructions({
      tools: this.options.tools,
      maxLoops: this.options.maxLoops,
    });
  }

  public async sendMessage(msg: string): Promise<Result<Message, Message>> {
    const { compileInstructions, tools, maxLoops } = this.options;

    // By recompiling each time, we can load in different tools etc during an active session
    const systemMessage: Message = {
      role: "system",
      text: compileInstructions({ tools, maxLoops }),
    };

    const context: Message[] = this.session
      .getMessages()
      .filter((value) => INCLUDE_IN_CONTEXT[value.msg.role])
      .map((value) => stripReasoningContent(value.msg));

    const userMessage: Message = { role: "user", text: msg };
    this.session.commitMessage(userMessage);
    context.push(userMessage);

    let response: ModelResponse;
    try {
      response = await this.generateAssistantResponse(
        systemMessage,
        context,
        tools,
      );
      context.push(createAssistantMessage(response));
    } catch (error) {
      throw error;
    }

    let loops = 0;

    for (; loops < maxLoops; loops++) {
      if (response.toolCalls.length === 0) break;

      // Iterate over all tools, and it to the history
      for (const toolCall of response.toolCalls) {
        const tool = tools.find((t) => t.name() === toolCall.name);

        const toolResult: Result<unknown, string> = tool
          ? await this.executeTool(tool, toolCall)
          : { success: false, error: `Unknown tool: ${toolCall.name}` };

        const toolMessage: Message = {
          role: "tool",
          status: toolResult.success ? "success" : "error",
          text: toolResult.success
            ? JSON.stringify(toolResult.result)
            : toolResult.error,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        };
        this.session.commitMessage(toolMessage);
        context.push(toolMessage);
      }

      try {
        response = await this.generateAssistantResponse(
          systemMessage,
          context,
          tools,
        );
        context.push(createAssistantMessage(response));
      } catch (error) {
        throw error;
      }
    }

    if (loops >= maxLoops) {
      const message: Message = {
        role: "agent",
        status: "error",
        text: `Stopped after ${maxLoops} tool call iterations to avoid a possible infinite loop.`,
      };
      this.session.commitMessage(message);

      return {
        success: false,
        error: message,
      };
    }

    return {
      success: true,
      result: createAssistantMessage(response),
    };
  }

  private async executeTool(
    tool: Tool,
    toolCall: ToolCall,
  ): Promise<Result<unknown, string>> {
    try {
      const result = await tool.execute(toolCall.input);
      return {
        success: true,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async generateAssistantResponse(
    systemMessage: Message,
    context: Message[],
    tools: Tool[],
  ): Promise<ModelResponse> {
    const { provider } = this.options;

    let response: ModelResponse | undefined;
    let streamedText = "";
    let streamedReasoningContent = "";
    const assistantSessionMessage = this.session.commitMessage(
      createStreamingAssistantMessage({
        text: streamedText,
        reasoningContent: streamedReasoningContent,
      }),
    );

    for await (const event of provider.generateContent(
      systemMessage,
      context,
      tools,
    )) {
      if (event.type === "reasoning_delta") {
        streamedReasoningContent += event.text;
        assistantSessionMessage.update(
          createStreamingAssistantMessage({
            text: streamedText,
            reasoningContent: streamedReasoningContent,
          }),
        );
        continue;
      }
      if (event.type === "content_delta") {
        streamedText += event.text;
        assistantSessionMessage.update(
          createStreamingAssistantMessage({
            text: streamedText,
            reasoningContent: streamedReasoningContent,
          }),
        );
        continue;
      }
      if (event.type === "done") {
        response = event.response;
      }
    }

    if (!response) {
      throw new Error(`Empty response from ${provider.getProvider()}`);
    }

    const assistantMessage = createAssistantMessage(response);
    assistantSessionMessage.update(assistantMessage);

    return response;
  }
}

function createAssistantMessage(response: ModelResponse): Message {
  return {
    role: "assistant",
    text: response.text,
    ...(response.reasoningContent
      ? { reasoningContent: response.reasoningContent }
      : {}),
    toolCalls: response.toolCalls,
  };
}

function stripReasoningContent(message: Message): Message {
  if (message.role !== "assistant" || !message.reasoningContent) return message;

  const { reasoningContent: _reasoningContent, ...rest } = message;
  return rest;
}

function createStreamingAssistantMessage(options: {
  text: string;
  reasoningContent: string;
}): Message {
  return {
    role: "assistant",
    text: options.text,
    ...(options.reasoningContent
      ? { reasoningContent: options.reasoningContent }
      : {}),
    toolCalls: [],
  };
}
