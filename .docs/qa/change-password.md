# Change Password manual QA

Tests for the Utility page "Change Password" feature (label + button → modal with
current/new/confirm fields, Cancel/Accept). Changes the single `admin` account password.

## Preconditions

- AstrOs.Server running (API on :3000, frontend on :5173 dev or :8080 in container).
- Logged in as `admin`. Note the current password (default `password` on a fresh DB,
  unless previously changed).
- No firmware flash job in progress and the system is NOT in read-only mode (otherwise
  the Change button is intentionally disabled — see Edge cases).

## Test cases

1. **Open the modal**
   - Navigate to the Utility page.
   - **Expected:** a "Password" row appears alongside API Key / Format SD Card /
     Log Files, with a primary "Change" button.
   - Click "Change".
   - **Expected:** a modal opens titled "Change Password" with three labeled password
     fields (Current Password, New Password, Confirm New Password), each with a
     trailing eye (show/hide) icon, an "At least 8 characters." hint under New
     Password, and Accept / Cancel buttons.

2. **Show / hide password**
   - In the open modal, type into a field; it is masked by default.
   - Click that field's eye icon.
   - **Expected:** only that field reveals its plaintext value (the eye icon switches
     to eye-off); the other two fields stay masked. Note: the revealed value is visible
     on screen (shoulder-surfing exposure) — intended for the opt-in toggle.
   - Click the icon again.
   - **Expected:** the field re-masks.
   - Cancel and reopen the modal.
   - **Expected:** all fields are masked again (reveal state resets on reopen).

3. **Cancel dismisses without changes**
   - Open the modal, type anything, click Cancel (or click the dark backdrop).
   - **Expected:** modal closes, nothing is submitted. Reopening shows empty fields.

4. **Happy path**
   - Open the modal. Enter the correct current password, a new password of 8+ characters,
     and the same value in Confirm. Click Accept.
   - **Expected:** modal closes; an alert "Password updated." appears. Click Close.
   - Log out and log back in with the NEW password.
   - **Expected:** login succeeds. The old password no longer works (see case 9).

5. **New password too short**
   - Open the modal. Current = correct password, New = `abc` (under 8 chars), Confirm = `abc`.
     Click Accept.
   - **Expected:** inline error "New password must be at least 8 characters." No submission;
     modal stays open.

6. **Confirmation mismatch**
   - Current = correct, New = `newpassword1`, Confirm = `different1`. Click Accept.
   - **Expected:** inline error "New password and confirmation do not match." No submission.

7. **Empty current password**
   - Leave Current blank, fill New + Confirm validly. Click Accept.
   - **Expected:** inline error "Please enter your current password." No submission.

8. **Wrong current password (server-verified)**
   - Current = an incorrect value, New + Confirm = valid matching 8+ char value. Click Accept.
   - **Expected:** inline error "Current password is incorrect." Modal stays open. The user
     is NOT logged out / redirected to the login page (the endpoint returns 403, not 401).
   - Begin editing any field.
   - **Expected:** the "Current password is incorrect" error clears as you type.

9. **Old password rejected after a successful change**
   - After completing case 4, log out and attempt to log in with the OLD password.
   - **Expected:** login fails with "Invalid email or password".

## Edge cases / negative tests

- **Read-only mode:** if the DB is in read-only recovery mode, the "Change" button (and the
  modal Accept) are disabled with a tooltip. Confirm the password cannot be changed and the
  disabled state is clear.
- **Firmware flash in progress:** while a flash job holds the lock, the "Change" button and
  Accept are disabled with the lock tooltip. Confirm no change is possible until the job ends.
- **Enter key:** with valid inputs, pressing Enter in any field submits (same as Accept).
  Rapid Enter + click does not produce two submissions / two alerts.
- **New === current:** entering the current password as the new password is permitted by
  design (length-only rule). It succeeds and the password is effectively unchanged.
- **Reopen resets state:** after any error, Cancel and reopen — fields and errors are cleared.
