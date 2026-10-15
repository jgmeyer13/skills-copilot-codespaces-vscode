/**
 * Where landmarks come from.
 *
 * Two implementations behind one interface. `mediapipe` is the real one and
 * runs entirely in the browser — the WASM runtime and the 5.6MB model are
 * served from this folder, so a pop-up on gym wifi never fetches anything and
 * no video frame is ever transmitted anywhere. That is not a performance
 * decision. A pose model running on a server would mean streaming a member's
 * body to a third party, which is the thing the consent screen promises does
 * not happen.
 *
 * `replay` feeds recorded landmark streams through the identical pipeline, so
 * the capture engine, the scoring, the session record and the dashboard can be
 * verified without a camera or a person in the room.
 */

const VENDOR = new URL('../vendor/', import.meta.url).href

export async function createMediaPipePose({ maxPeople = 3, onStatus = () => {} } = {}) {
  onStatus('Loading the pose model…')
  // Plain .js on purpose: a static file server that has never heard of .mjs
  // serves it as application/octet-stream, and strict MIME checking then
  // refuses to run it. Not worth a deployment note when a rename fixes it.
  const { FilesetResolver, PoseLandmarker } = await import(`${VENDOR}mediapipe/vision_bundle.js`)
  const fileset = await FilesetResolver.forVisionTasks(`${VENDOR}mediapipe/wasm`)

  // GPU is markedly faster but is not available everywhere, and a tablet that
  // falls back silently to CPU is better than one that shows an error.
  let landmarker
  let delegate = 'GPU'
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${VENDOR}pose_landmarker_lite.task`, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numPoses: maxPeople,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  } catch (err) {
    delegate = 'CPU'
    onStatus('Falling back to CPU…')
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${VENDOR}pose_landmarker_lite.task`, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numPoses: maxPeople,
    })
  }

  onStatus(`Pose model ready (${delegate})`)
  let lastTimestamp = -1

  return {
    kind: 'mediapipe',
    delegate,
    /**
     * @returns {Array<Array<{x,y,z,visibility}>>} one array of 33 landmarks per
     * person found, newest frame only. Never returns the image.
     */
    detect(video, timestampMs) {
      // MediaPipe rejects a timestamp that does not advance, which happens
      // whenever the render loop runs faster than the camera produces frames.
      if (timestampMs <= lastTimestamp) return null
      lastTimestamp = timestampMs
      const result = landmarker.detectForVideo(video, timestampMs)
      return result?.landmarks ?? []
    },
    close() {
      try { landmarker.close() } catch { /* already gone */ }
    },
  }
}

/**
 * Replays a recorded landmark stream in place of a camera.
 *
 * It advances by wall-clock time rather than by call count, so the capture
 * engine sees the same timing it would from a real camera, including dropped
 * frames when the machine is busy.
 */
export function createReplayPose(stream, { loop = false } = {}) {
  let startedAt = null
  let index = 0
  return {
    kind: 'replay',
    delegate: 'none',
    detect(_video, timestampMs) {
      if (startedAt === null) startedAt = timestampMs
      const elapsed = (timestampMs - startedAt) / 1000
      while (index < stream.length - 1 && stream[index + 1].t <= elapsed) index += 1
      if (!loop && elapsed > stream[stream.length - 1].t + 0.2) return []
      return stream[index]?.people ?? []
    },
    close() {},
  }
}
