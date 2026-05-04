import type { Message, SessionMessage } from "./types.js";

export type OnNewMessage = (msg: SessionMessage) => void;
export type OnCleared = () => void;
export type OnMessagesReverted = (msg: SessionMessage) => void;
export type OnMessagesCommited = (msg: SessionMessage) => void;

export class Session {
  private messages: SessionMessage[] = [];

  private onClearedCallback: OnCleared = () => null;
  private onNewMessagePreparedCallback: OnNewMessage = () => null;
  private onMessageRevertedCallback: OnMessagesReverted = () => null;
  private onMessageCommitedCallback: OnMessagesCommited = () => null;

  public clear() {
    this.messages = [];
    this.onClearedCallback();
  }

  public getMessages(): SessionMessage[] {
    return this.messages;
  }

  public createMessageTrx(msg: Message) {
    const id = crypto.randomUUID();
    const sessionMsg: SessionMessage = {
      id,
      msg,
    };
    return {
      sessionMsg,
      prepare: () => {
        this.onNewMessagePreparedCallback(sessionMsg);
      },
      revert: () => {
        this.onMessageRevertedCallback(sessionMsg);
      },
      commit: () => {
        this.messages.push({
          id,
          msg,
        });
        this.onMessageCommitedCallback(sessionMsg);
      },
    };
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
    this.onMessageCommitedCallback(sessionMsg);

    return sessionMsg;
  }

  public onCleared(callback: OnCleared) {
    this.onClearedCallback = callback;
  }

  public onNewMessage(callback: OnNewMessage) {
    this.onNewMessagePreparedCallback = callback;
  }

  public onMessageReverted(callback: OnMessagesReverted) {
    this.onMessageRevertedCallback = callback;
  }

  public onMessageCommited(callback: OnMessagesCommited) {
    this.onMessageCommitedCallback = callback;
  }
}
