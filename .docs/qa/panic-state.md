# QA: Panic-State Sync + Clear

Clients can clear a server panic-stop and always know the current panic state (on load/refresh + real time). Mobile Stop-All morphs to Clear-Panic; desktop shows a Clear-Panic button under the droid when panicked.

## Preconditions
- API + Vue running; serial/controllers reachable.
- Two clients handy: a mobile browser (mobile UA or window < 768px → `/mobile`) and a desktop browser on the Status page.
- Tail the API log: `tail -f ~/.config/astrosserver/logs/astros-*` (look for `panic stop`).

## Trigger + morph (mobile)
1. On mobile, hold **Stop All** (~600ms) → API log shows `panic stop`; the button **morphs** to a blue **Clear Panic** (not red), caption reads "Hold to re-enable control".
2. Hold the **Clear Panic** button (~600ms) → API logs the clear; the button morphs back to red **Stop All**.

## Real-time cross-client sync
3. With the desktop on the Status page, trigger panic from mobile → within a moment the desktop shows the panic-stop hint ("The droid is in panic stop — control is disabled until cleared.") + a **Clear Panic Stop** button under the droid (no refresh).
4. Click **Clear Panic Stop** on desktop → the mobile button morphs back to **Stop All** live (no refresh).
5. Open a second mobile/desktop client while panicked → it shows the panicked state immediately (WS on-connect snapshot).

## Load / refresh awareness
6. Trigger panic, then **hard-refresh** the mobile view → it still shows **Clear Panic** (GET `/api/panicState` hydrate + on-connect snapshot).
7. Hard-refresh the desktop Status page while panicked → the **Clear Panic Stop** button is present on first paint.

## Clear from either surface
8. Trigger from mobile, clear from desktop → both reflect cleared. Trigger from one device, clear from the same device → reflects cleared.

## Read-only / flash interplay
9. Put the server in read-only mode (DB recovery) → **Stop All and Clear still work** (panic is exempt from the read-only write-guard).
10. During an active firmware flash, panic stop/clear are **intentionally blocked** (423) to protect the in-flight transfer — verify the action is rejected (no serial interleave). (Edge; only if a flash is easy to start.)

## Failure feedback
11. Disconnect the server, then hold Clear on mobile → an **error toast** ("Couldn't clear panic") appears; the desktop Clear button likewise toasts on failure.

## Edge cases
- Clearing when already cleared: idempotent, no crash (redundant broadcast is harmless).
- Panic button cooldown (~2.2s) after a hold-fire applies to both stop and clear — rapid re-press is briefly ignored.
