# Repair App (/repair)

Purpose:
Select captured views and send them to FLUX for paid repair.

Never touches source/.

Reads:

source/reference.png
source/captures/*

Writes:

repairs/repair_####/

UI:

- Pick Session Folder
- Grid of captures (from thumb.jpg or downscaled target.png)
- Multi-select allowed
- Notes field (optional)
- Queue Repair
- Run Repair (paid)

Queue Repair:

Creates:

repairs/repair_####/input/

Copies:

reference.png
target.png
delta_pose.json
camera.json
notes.txt (if present)

Run Repair:

POSTs to localhost server:

/api/repair

Payload:

reference.png
target.png
delta_pose.json
camera.json
notes.txt

Server:

- Builds FLUX prompt
- Calls fal.ai
- Returns repaired image

Browser writes:

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
