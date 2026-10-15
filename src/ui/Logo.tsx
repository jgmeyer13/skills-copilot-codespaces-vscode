/**
 * The Kelvin mark: a six-armed frost crystal with one arm extended like a
 * compass needle — cold, plus control. Drawn as inline SVG from one path set so
 * it is identical at 16 px and 160 px, and it inherits `currentColor`.
 */
export function Logo({ size = 20, title }: { size?: number; title?: string }): React.ReactElement {
  const arms = [0, 60, 120, 180, 240, 300]
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth="6"
      strokeLinecap="round"
    >
      {arms.map((deg) => {
        /* The 0° arm runs long; the rest are the crystal body. */
        const long = deg === 0
        const len = long ? 44 : 30
        const rad = (deg * Math.PI) / 180
        const x = Math.cos(rad) * len
        const y = Math.sin(rad) * len
        /* Branch tines, set at the classic 60° of a snowflake dendrite. */
        const bx = Math.cos(rad) * (len * 0.58)
        const by = Math.sin(rad) * (len * 0.58)
        const t1 = rad + Math.PI / 3
        const t2 = rad - Math.PI / 3
        const tine = long ? 13 : 9
        return (
          <g key={deg}>
            <line x1="0" y1="0" x2={x} y2={y} />
            <line x1={bx} y1={by} x2={bx + Math.cos(t1) * tine} y2={by + Math.sin(t1) * tine} strokeWidth="4.5" />
            <line x1={bx} y1={by} x2={bx + Math.cos(t2) * tine} y2={by + Math.sin(t2) * tine} strokeWidth="4.5" />
          </g>
        )
      })}
      <circle cx="0" cy="0" r="7.5" fill="currentColor" stroke="none" />
    </svg>
  )
}
