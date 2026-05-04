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
}
