import type { Message, SessionMessage } from "./types.js";

export type OnCleared = () => void;
export type OnMessagesCommitted = (msg: SessionMessage) => void;

export class Session {
  private messages: SessionMessage[] = [];

  private onClearedCallback: OnCleared = () => null;
  private onMessageCommittedCallback: OnMessagesCommitted = () => null;

  public clear() {
    this.messages = [];
    this.onClearedCallback();
  }

  public getMessages(): SessionMessage[] {
    return this.messages;
  }

  public commitMessage(msg: Message) {
    const id = crypto.randomUUID();
    const sessionMsg: SessionMessage = {
      id,
      msg,
    };

    this.messages.push({
        id,
        msg,
    });
    this.onMessageCommittedCallback(sessionMsg);

    return sessionMsg;
  }

  public onCleared(callback: OnCleared) {
    this.onClearedCallback = callback;
  }

  public onMessageCommitted(callback: OnMessagesCommitted) {
    this.onMessageCommittedCallback = callback;
  }

  /** Serialize session messages to a JSON string. */
  public serialize(): string {
    return JSON.stringify(this.messages, null, 2);
  }

  /** Replace session messages from a JSON string (preserves callbacks). */
  public deserialize(json: string): void {
    const parsed: SessionMessage[] = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error("Invalid session format: expected an array of messages");
    }
    this.messages = parsed;
  }
}
