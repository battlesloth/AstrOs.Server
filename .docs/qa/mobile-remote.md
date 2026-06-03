# QA: Mobile Remote View

Live remote served to mobile clients with command sending. Desktop unchanged.

## Preconditions
- API + Vue running (`astros_api` + `astros_vue npm run dev`), serial/controllers reachable for command verification.
- A saved remote-control config with at least one page that has a **script** button and a **playlist** button (configure via desktop `/remote`).
- Tail the API log for command confirmation: `tail -f ~/.config/astrosserver/logs/astros-*`.

## Detection & routing
1. **Desktop, wide window, desktop UA:** log in → lands on the normal app (Status home), full nav present. → unchanged behavior.
2. Desktop: manually navigate to `/mobile` → redirected to `/` (desktop is kept off the mobile view).
3. **Mobile UA or narrow viewport (< 768px):** (DevTools device mode, or resize the window narrow, then reload). Log in from the login screen → lands on `/mobile`: full-screen, **no** desktop nav/sidebar.
4. Mobile: manually navigate to `/scripts` (or any desktop route) → redirected back to `/mobile` (mobile confined to Remote + Status).
5. Mobile, not logged in: open `/mobile` → redirected to `/auth`; after login → back to `/mobile`.

## Top-bar color-coded button
6. With the server connected: the top-bar button is **green** and reads **"Connected"** on the Remote screen.
7. Kill the API (or drop the network): within ~3s the button turns **red** and reads **"Offline"**. Restore → back to green/Connected.
8. Tap the button → switches to the **Status** screen; the button now reads **"Remote"** and keeps its connection color.
9. Tap again → returns to the **Remote** screen.

## Status screen
10. Status screen shows the droid image (dome/core/body coloring matching the desktop Status view) and a **Logout** button. On short screens the droid scales down so the **Logout** button stays visible below it — no scrolling.

11b. **Command failure feedback:** with the server unreachable, tap a button → an **error toast** appears (the optimistic "sent" toast is corrected by a failure toast); Stop All failure shows a longer error toast; a failed config load on entry shows a "Couldn't load the remote layout" toast.

## Commands (Remote screen)
11. Tap a **script** button → API log shows `running script <id>`; the droid/servo reacts. Component shows its press toast.
12. Tap a **playlist** button → API log shows `running playlist <id>` + `dispatching script ... from animation queue`.
13. Press-and-hold **Stop All** (~600ms) → API log shows `panic stop`; running animation halts. During the ~2.2s cooldown, button taps are ignored.
14. Paginate (swipe / arrows / dots) across multiple pages; presses on each page target the correct script/playlist.

## Logout
15. Status screen → **Logout** → returns to `/auth`; token cleared (re-opening any route requires login).

## Edge cases
- No saved config (fresh DB): Remote screen shows a default page / "no pages" empty state, no crash.
- Disconnected server: button red; pressing a button still attempts the call and surfaces an error toast on failure (see 11b) — no UI lockup.
- Rotate device / resize while on `/mobile`: layout stays full-screen and usable (uses `dvh`).
