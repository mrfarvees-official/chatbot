# Google Meet prompts

Sign in, reload the Site Agent extension, and open the relevant Google Meet
tab before testing live meeting controls. Destructive or outward-facing actions
show an approval popup.

## Meeting controls

- Join the current Google Meet.
- Turn my microphone off.
- Turn my camera on.
- Leave the meeting. Ask for approval first.
- Raise my hand.
- Lower my hand.
- Turn captions on.
- Turn captions off.
- Start recording. Ask for approval first.
- Stop recording. Ask for approval first.

## Participants

- List the visible participants in the current meeting.
- Mute the participant named [NAME].
- Remove [NAME] from the meeting. Ask for approval first.

## Meeting chat and context

- Open the Meet chat and show the visible messages.
- Send this message to the Meet chat: [MESSAGE]. Ask for approval first.
- Read the captions currently visible in the meeting.
- Summarize the visible meeting participants, chat, captions, and page context.

## Meeting drafts

- Schedule a Google Calendar meeting titled [TITLE] from [START_ISO] to [END_ISO].
- Create a Gmail invitation draft for [EMAIL] with the Meet link [MEET_LINK]. Do not send it.

The assistant must never claim that a participant was removed, a message was
sent, a recording started, or a meeting was joined unless the extension reports
success. Browser permission prompts, Google Meet UI changes, and the browser
screen-share picker may still require manual approval.
