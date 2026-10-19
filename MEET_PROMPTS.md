# Google Meet, Calendar, and email prompts

Sign in, reload the Site Agent extension, and open the relevant Google Meet,
Calendar, or Gmail tab before testing live browser actions. Destructive or
outward-facing actions show an approval popup.

## Start and schedule meetings

- Start a new Google Meet meeting now.
- Join the current Google Meet.
- Check today's Gmail for Google Meet invitations and show the meeting links.
- Open the Meet link from today's Gmail invitations and join it.
- Check Gmail for meeting links on [YYYY/MM/DD].
- Schedule a business meeting titled [TITLE] from [START_ISO] to [END_ISO].
- Schedule a weekly meeting titled [TITLE] on Mondays from [START_ISO] to [END_ISO].
- Schedule [TITLE] with guests [EMAILS] and details [DETAILS].
- Open my Calendar availability for [YYYY-MM-DD] and show visible busy times.
- List events visible in my current Calendar view.
- Search Calendar for [QUERY].
- Open my Calendar event and show its details.
- Update the open Calendar event with [CHANGES].
- RSVP [YES/NO/MAYBE] to the open Calendar event.
- Add these guests to the open Calendar event: [EMAILS].
- Delete the open Calendar event. Ask for approval first.

Calendar actions open or edit the Google Calendar UI. Scheduling is a draft
until the visitor reviews and saves it. Availability is based on events visible
in Calendar; it is not a server-side free/busy guarantee.

## Meeting controls

- Turn my microphone off.
- Turn my camera on.
- Share my screen, window, or tab.
- Leave the meeting. Ask for approval first.
- Raise my hand.
- Lower my hand.
- Turn captions on.
- Turn captions off.
- Start recording. Ask for approval first.
- Stop recording. Ask for approval first.
- Send a [EMOJI] reaction.

## Participants

- List the visible participants in the current meeting.
- Mute the participant named [NAME].
- Remove [NAME] from the meeting. Ask for approval first.

## Meeting chat and context

- Open the Meet chat and show the visible messages.
- Send this message to the Meet chat: [MESSAGE]. Ask for approval first.
- Read the captions currently visible in the meeting.
- Summarize the visible meeting participants, chat, captions, and page context.

## Email from a meeting workflow

- Create a Gmail invitation draft for [EMAILS] with the Meet link [MEET_LINK].
- Email [EMAILS] this Meet invitation with subject [SUBJECT] and message [MESSAGE].
- Open the invitation as a Gmail draft, show me the recipients and content, then send it after I approve.

The assistant must compose the draft first, then use
`gmail_send_current_draft` only after explicit approval. It must never claim
that an email was sent unless the extension reports that Send was clicked.

## Safety and UX

The assistant must never claim that a participant was removed, a message was
sent, recording started, a meeting was joined, or an event was saved unless the
extension reports success. Google Meet UI changes, Calendar save dialogs,
account permissions, and the browser screen-sharing picker may still require
manual approval.
