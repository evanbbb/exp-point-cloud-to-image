# Repair App (/repair)

Purpose:
Select captured views and send them to FLUX for paid repair.

Current status:

- Browser page is currently informational only (`apps/repair/index.html`).
- Queueing/running repairs is currently handled by direct server API usage, not an interactive Repair UI yet.

Reads:

source/src_####/<reference-filename>
source/src_####/captures/*

Writes:

repairs/repair_####/

UI:

- Static page describing Part B flow and API expectations.

Planned UI (not yet implemented):

- Pick Session Folder
- Grid of captures (from thumb.jpg or downscaled target.png)
- Multi-select allowed
- Notes field (optional)
- Queue Repair
- Run Repair (paid)

Queue Repair (planned):

Creates:

repairs/repair_####/input/

Copies:

reference.png
target.png
delta_pose.json
camera.json
notes.txt (if present)

Run Repair (implemented in server API):

POSTs to localhost server:

/api/repair

Payload:

reference.png
target.png
delta_pose.json
camera.json
notes.txt

Server behavior:

- Builds FLUX prompt
- Calls fal.ai
- Returns `image/png`

Server writes:

repairs/repair_####/output/repaired.png
repairs/repair_####/output/repair_meta.json

Prompt Template:

Referring to the scene in image 1, restore the perspective of the scene in image 2.
Repair missing regions and perspective artifacts.
The camera has moved by: {x,y,z,pitch,yaw,roll}

Append notes.txt if present.

Guardrails:

- Explicit checkbox: "This uses paid API"
- Show number of queued repairs
- Optional daily limit in server config
