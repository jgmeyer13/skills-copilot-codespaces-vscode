# Vendored, on purpose

| File | From | Why it is here |
|---|---|---|
| `mediapipe/vision_bundle.js` | `@mediapipe/tasks-vision@1.1.1` | The browser runtime. Renamed from `.mjs`: a static server that does not know that extension serves it as `application/octet-stream`, and strict MIME checking then refuses to run it. |
| `mediapipe/wasm/*` | same package | SIMD and non-SIMD builds. The resolver picks one at load; the second is 13MB of insurance against an older tablet. |
| `pose_landmarker_lite.task` | Google's model storage | The pose model, 5.6MB. |

32MB in the repository buys a pop-up that works on gym wifi, in a basement,
or with no connection at all — and, more importantly, one where no video frame
is ever sent anywhere. A pose model called over the network would mean
streaming a member's body to a third party, which is the one thing the consent
screen promises does not happen.

To refresh: `npm install @mediapipe/tasks-vision`, copy `vision_bundle.mjs`
(renaming it) and `wasm/`, and re-download the model from
`storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/`.
