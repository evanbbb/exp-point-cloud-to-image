# Folder Structure

Each session gets its own directory.

shots/
  SESSION_YYYYMMDD_HHMMSS/
    source/
      reference.png

      captures/
        cap_0001/
          target.png
          delta_pose.json
          camera.json
          thumb.jpg (optional)

        cap_0002/
          ...

    repairs/
      repair_0001/
        input/
          reference.png
          target.png
          delta_pose.json
          camera.json
          notes.txt (optional)

        output/
          repaired.png
          repair_meta.json

Rules:

- Viewer ONLY writes to source/
- Repair ONLY reads source/ and writes repairs/
- No mutation of captures after creation
- Repair inputs are copied, never moved

Intent:

Generate many captures cheaply.
Repair only 1–2 selected frames (paid API).
Preserve raw splat renders forever.
