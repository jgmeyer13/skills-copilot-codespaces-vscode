/**
 * A line figure per pose, drawn big enough to read from the mark.
 *
 * Words alone do not carry a pose. "Side chest" means nothing to somebody who
 * has never done one, and the member is 2.5 m away with about six seconds to
 * work out what is being asked. A figure is understood before it is read.
 *
 * Deliberately a stick figure and not a photograph or a rendered body: a
 * photograph of a model sets a standard the member is then measured against,
 * in a curtained corner, half dressed. A line drawing asks for a shape.
 *
 * Coordinates are a 100 x 170 box, head at the top, feet at the bottom.
 */

const HEAD = (x, y, r = 11) => `<circle cx="${x}" cy="${y}" r="${r}" />`
const LINE = (...pts) => `<polyline points="${pts.map(([x, y]) => `${x},${y}`).join(' ')}" />`

const FIGURES = {
  // Arms down, square on. The progress shot, and the one that has to be the
  // same every single visit.
  front_relaxed: [
    HEAD(50, 20),
    LINE([50, 33], [50, 95]),
    LINE([50, 44], [34, 70], [30, 95]),
    LINE([50, 44], [66, 70], [70, 95]),
    LINE([50, 95], [38, 125], [36, 155]),
    LINE([50, 95], [62, 125], [64, 155]),
  ],

  front_double_bicep: [
    HEAD(50, 24),
    LINE([50, 37], [50, 97]),
    LINE([50, 46], [24, 52], [31, 24]),
    LINE([50, 46], [76, 52], [69, 24]),
    LINE([50, 97], [38, 126], [36, 155]),
    LINE([50, 97], [62, 126], [64, 155]),
  ],

  // Turned side on, near arm folded across the chest.
  side_chest: [
    HEAD(54, 22),
    LINE([52, 35], [50, 96]),
    LINE([51, 46], [66, 62], [38, 66]),
    LINE([51, 48], [60, 78], [58, 96]),
    LINE([50, 96], [42, 126], [40, 155]),
    LINE([50, 96], [58, 126], [60, 155]),
  ],

  // Turned side on, arms hanging. Athlete set.
  side_relaxed: [
    HEAD(54, 22),
    LINE([52, 35], [50, 96]),
    LINE([51, 46], [56, 70], [54, 93]),
    LINE([50, 96], [44, 126], [42, 155]),
    LINE([50, 96], [56, 126], [58, 155]),
  ],

  // One foot forward, shoulders ahead of the hips, arms bent.
  race_ready: [
    HEAD(62, 24),
    LINE([58, 37], [46, 92]),
    LINE([56, 48], [72, 62], [64, 40]),
    LINE([56, 50], [38, 64], [46, 44]),
    LINE([46, 92], [70, 118], [80, 150]),
    LINE([46, 92], [26, 122], [18, 152]),
  ],

  back_double_bicep: [
    HEAD(50, 24),
    LINE([50, 37], [50, 97]),
    LINE([50, 46], [22, 50], [30, 26]),
    LINE([50, 46], [78, 50], [70, 26]),
    LINE([50, 97], [38, 126], [36, 155]),
    LINE([50, 97], [62, 126], [64, 155]),
  ],

  // The candid. Loose on purpose — it is the one frame with no right answer.
  any: [
    HEAD(44, 22),
    LINE([46, 35], [52, 95]),
    LINE([47, 46], [28, 38], [22, 18]),
    LINE([47, 48], [68, 66], [74, 86]),
    LINE([52, 95], [40, 124], [34, 153]),
    LINE([52, 95], [66, 122], [72, 150]),
  ],
}

/** Inline SVG for a pose, or the loose figure when there is none for it. */
export function silhouette(poseId) {
  const parts = FIGURES[poseId] ?? FIGURES.any
  return (
    `<svg class="silo" viewBox="0 0 100 170" aria-hidden="true" ` +
    `fill="none" stroke="currentColor" stroke-width="6" ` +
    `stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</svg>`
  )
}

export const POSE_IDS = Object.keys(FIGURES)
