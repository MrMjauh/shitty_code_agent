import type { Message, SessionMessage } from "./types.js";

export type OnCleared = () => void;
export type OnMessageCommitted = (msg: SessionMessage) => void;
export type OnMessageUpdated = (msg: SessionMessage) => void;
export type SessionMessageHandle = {
  readonly id: string;
  readonly msg: Message;
  update(msg: Message): SessionMessage;
};

export class Session {
  private messages: SessionMessage[] = [];

  private onClearedCallback: OnCleared = () => null;
  private onMessageCommittedCallback: OnMessageCommitted = () => null;
  private onMessageUpdatedCallback: OnMessageUpdated = () => null;

  public clear() {
    this.messages = [];
    this.onClearedCallback();
  }

  public getMessages(): SessionMessage[] {
    return this.messages;
  }

  public commitMessage(msg: Message): SessionMessageHandle {
    const id = crypto.randomUUID();
    const sessionMsg: SessionMessage = {
      id,
      msg,
    };

    this.messages.push(sessionMsg);
    this.onMessageCommittedCallback(sessionMsg);

    return this.createMessageHandle(sessionMsg);
  }

  public updateMessage(id: string, msg: Message) {
    const index = this.messages.findIndex((message) => message.id === id);
    if (index < 0) {
      throw new Error(`Cannot update unknown session message: ${id}`);
    }

    const sessionMsg = this.messages[index];
    if (!sessionMsg) {
      throw new Error(`Cannot update unknown session message: ${id}`);
    }

    sessionMsg.msg = msg;
    this.onMessageUpdatedCallback(sessionMsg);

    return sessionMsg;
  }

  private createMessageHandle(sessionMsg: SessionMessage): SessionMessageHandle {
    return {
      id: sessionMsg.id,
      get msg() {
        return sessionMsg.msg;
      },
      update: (msg: Message) => this.updateMessage(sessionMsg.id, msg),
    };
  }

  public onCleared(callback: OnCleared) {
    this.onClearedCallback = callback;
  }

  public onMessageCommitted(callback: OnMessageCommitted) {
    this.onMessageCommittedCallback = callback;
  }

  public onMessageUpdated(callback: OnMessageUpdated) {
    this.onMessageUpdatedCallback = callback;
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
