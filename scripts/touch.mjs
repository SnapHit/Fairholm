// Real touch sequences through the devtools protocol, for the smoke test and the shot rigs: a finger
// lands, moves and lifts with real timing, as on a phone. The movement gesture (feel brief section 4:
// hold aims, release moves) is only itself as touches: the hold engages on a timer while the finger
// is down, moves while it is down re-aim, and lifting it is what commits. So every rig that moves a
// unit does it this way, and nothing here reaches into the game to move anything.
//
//   const finger = fingers(await ctx.newCDPSession(page), page, { holdMs: HOLD_MS })
//   await finger.press(x, y)        // the route shows under the still finger
//   await finger.slide([x, y], [x2, y2])
//   await finger.release()          // the move

/** @param cdp a CDP session for the page; @param page the Playwright page; holdMs the hold's length. */
export function fingers(cdp, page, { holdMs }) {
  const pts = (points) => points.map((p, i) => ({ x: p[0], y: p[1], id: i + 1, radiusX: 4, radiusY: 4, force: 1 }))
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts(points) })
  const start = (points) => send('touchStart', points)
  const move = (points) => send('touchMove', points)
  const end = () => send('touchEnd', [])
  const cancel = () => send('touchCancel', [])
  const aiming = () => page.evaluate(() => !!window.fairholm?.aim)
  /** A tap: down and up in the same place, quickly, then the double tap window. */
  const tap = async (x, y, after = 450) => { await start([[x, y]]); await page.waitForTimeout(60); await end(); await page.waitForTimeout(after) }
  /** Press and hold a point until the hold engages and the route is aimed. The finger stays down. */
  const press = async (x, y) => {
    await start([[x, y]])
    await page.waitForTimeout(holdMs + 60)
    await page.waitForFunction(() => !!window.fairholm.aim, null, { timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(150)
  }
  /** Slide the finger from one point to another in steps, with real timing. */
  const slide = async (from, to, steps = 8, ms = 40) => {
    for (let i = 1; i <= steps; i++) {
      await move([[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]])
      if (ms) await page.waitForTimeout(ms)
    }
  }
  /** Lift the finger: the release, which commits whatever is aimed, or cancels where it should. */
  const release = async (after = 300) => { await end(); await page.waitForTimeout(after) }
  /** Press a point and let go there: the route shows, then the unit goes. */
  const holdAndRelease = async (x, y) => { await press(x, y); await release() }
  /** Press, then slide up to the top strip and let go there: the route shows, then nothing happens. */
  const holdAndCancel = async (x, y) => {
    await press(x, y)
    const top = await page.evaluate(() => window.fairholm.hud.getBoundingClientRect().height / 2)
    await slide([x, y], [x, top], 6, 30)
    await page.waitForTimeout(100)
    await release()
  }
  /** A drag: the finger lands and moves at once, before the hold can engage, so the map pans. A
   *  software renderer can hold the first move up behind a frame; if the hold engaged after all the
   *  touch is cancelled, which aims nothing and moves nothing, and the drag is made again. */
  const drag = async (from, to, steps = 12, ms = 30) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await start([from])
      await move([[from[0] + (to[0] - from[0]) / steps, from[1] + (to[1] - from[1]) / steps]])
      if (await aiming()) { await cancel(); await page.waitForTimeout(300); continue }
      for (let i = 2; i <= steps; i++) {
        await move([[from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]])
        if (ms) await page.waitForTimeout(ms)
      }
      await page.waitForTimeout(150)
      await end()
      return true
    }
    return false
  }
  return { start, move, end, cancel, tap, press, slide, release, holdAndRelease, holdAndCancel, drag, aiming }
}
