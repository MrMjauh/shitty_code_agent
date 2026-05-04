import { describe, expect, test } from "vitest";
import { Session } from "./session.js";

describe("Session", () => {
    test("updates an existing message and notifies subscribers", () => {
        const session = new Session();
        const committedNotifications: string[] = [];
        const updatedNotifications: string[] = [];
        session.onMessageCommitted((message) => {
            committedNotifications.push(message.msg.text);
        });
        session.onMessageUpdated((message) => {
            updatedNotifications.push(message.msg.text);
        });

        const committed = session.commitMessage({
            role: "assistant",
            text: "",
            toolCalls: [],
        });

        session.updateMessage(committed.id, {
            role: "assistant",
            text: "partial response",
            toolCalls: [],
        });

        expect(session.getMessages()).toEqual([{
            id: committed.id,
            msg: {
                role: "assistant",
                text: "partial response",
                toolCalls: [],
            },
        }]);
        expect(committedNotifications).toEqual([""]);
        expect(updatedNotifications).toEqual(["partial response"]);
    });

    test("returns a message handle that updates the stored message", () => {
        const session = new Session();

        const committed = session.commitMessage({
            role: "assistant",
            text: "",
            toolCalls: [],
        });

        committed.update({
            role: "assistant",
            text: "mutated before update",
            toolCalls: [],
        });

        expect(session.getMessages()[0]?.id).toBe(committed.id);
        expect(session.getMessages()[0]?.msg.text).toBe("mutated before update");
        expect(committed.msg.text).toBe("mutated before update");
    });
});
