# Local Server Responsibilities

Single localhost server.

Serves:

/viewer
/repair

Also exposes minimal API endpoints.

No auth.
Local only.
Personal use.

---

## Required Endpoints

POST /api/repair

Input (multipart/form-data):

- reference.png
- target.png
- delta_pose.json
- camera.json
- notes.txt (optional)

Output:

image/png
(binary repaired image)

Optional JSON wrapper:

{
  "image_base64": "...",
  "meta": {...}
}

---

## Server Flow for /api/repair

1. Receive uploaded files
2. Read delta_pose.json
3. Construct prompt
4. Call fal.ai FLUX endpoint
5. Receive repaired image
6. Return image to browser

---

## Optional Helpers

GET /api/health
Returns OK if fal credentials valid.

GET /api/version
Returns local build version.

---

## Tech Assumptions

- Node.js or Python
- fal.ai SDK or raw HTTP
- Runs on localhost only
- API key stored in env var:

FAL_KEY

Never exposed to browser.

---

## Optional Guardrails

- Max repairs per session
- Daily spend limit
- Require explicit "paid render" flag from client
