# To Do

## P1

- Repair Page: The Captures. The top and bottom halves of the capture thumbnail box do different things. They should each have seperate hover states. They bottom half could also use a "job" icon so that users know it is different.
- Viewer Page: The Generation list shows all successful generations. The list should only show those connected with the currrently selected src. If no src is selected, no generations are shown.

## P2 (Important)
- Instead of two pages, let's unify the system. Users select one sesion folder at the start. This then enable the switching between the viewer and repair "tabs". If the user wants to change the session folder, they can in the settings menu.
- add fal key to UI settings so that ic an be changed by the user. 
- Add error-path tests for `/api/repair` (invalid input, fal failure, timeout, invalid session id)
- Add generation tests for completed-job reuse behavior when manifest already 

## P3 (Nice to Have)
- add Apple Silicon option in the Settings. We then need to build out what that means.

## Notes
- Completed offline-first implementation summary: `docs/solutions/offline-phase-completed.md`
- Resume checklist and exact commands: `docs/solutions/network-resume-and-mlsharp.md`
