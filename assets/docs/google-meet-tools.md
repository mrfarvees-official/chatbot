# Google Meet browser tools

The portfolio assistant can use the visitor's connected Site Agent extension
for Google Meet browser tasks when the visitor is signed in and the extension
is connected. The extension operates on the visitor's current Google Meet tab.

## Supported tasks

- Join or request access to the current Google Meet.
- Turn the microphone or camera on or off.
- Share the screen, leave the call, raise or lower a hand, and send a reaction.
- List visible participants and mute or remove a named participant.
- Open Meet chat, read visible chat messages, and send a chat message.
- Turn captions on or off and read captions currently visible on the page.
- Start or stop recording when the Google account and meeting permissions allow it.
- Summarize visible meeting participants, chat, captions, and page context.
- Schedule a Google Calendar meeting or create a Gmail invitation draft with a Meet link.

## How to ask

Use direct requests such as “Join the current Google Meet”, “Turn my mic off”,
“Read the Meet chat”, “Send this message in Meet chat: [MESSAGE]”, or “List the
participants”. The assistant must call the matching browser tool when it is
available and must report failure if the extension returns a failure.

The visitor must review approval popups for actions that affect a meeting or
send content. The assistant must never claim that a meeting was joined, a
message was sent, a participant was removed, or recording started unless the
extension reports success.

Google Meet may require the visitor to open the actual meeting tab first. Meet
UI labels, permissions, browser screen-sharing dialogs, and account policies
can change; the extension's result is authoritative.
