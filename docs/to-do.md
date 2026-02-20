# To Do

## P1
- Repair Page: only select one capture at a time to repair
- Repair Page: allow user to run mutlple repairs at once, 1-4
- Repair Page: tidy the line of information below a repair thumbnail. Put date and time on one line. Put the icons below on a second line. Remove "succeeded" label
- Viewer Page: the capture action captures the virtual navigational objects like the grid plane. Hide everything in the canvas besides the 3D data at the moment of capture. Ensure it is unhidden when the capture is complete.


## P2 (Important)
- Instead of two pages, let's unify the system. Users select one sesion folder at the start. This then enable the switching between the viewer and repair "tabs". If the user wants to change the session folder, they can in the settings menu.
- add fal key to UI settings so that ic an be changed by the user. 
- Add error-path tests for `/api/repair` (invalid input, fal failure, timeout, invalid session id)
- Add generation tests for completed-job reuse behavior when manifest already 

## P3 (Nice to Have)


## Notes
- Completed offline-first implementation summary: `docs/solutions/offline-phase-completed.md`
- Resume checklist and exact commands: `docs/solutions/network-resume-and-mlsharp.md`
