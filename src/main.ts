// Boot. Architecture brief section 9 and onboarding brief section 2: the game opens in the
// middle of the arrival, or on the return screen if a save exists. Nothing here waits on the
// network; the audio and the persistence request happen after the first frame.

import { App } from './ui/app'
import { createGame } from './sim/actions'
import { randomSeed, playRng } from './sim/rng'
import * as Save from './io/save'
import type { GameState } from './sim/state'

function boot() {
  const root = document.getElementById('app')!
  let state: GameState | null = null
  let resumed = false
  try {
    const save = Save.readLocal()
    if (save) { state = Save.fromSave(save, Date.now()); resumed = true }
  } catch (e) {
    console.warn('Could not resume the saved game', e)
    state = null
  }
  if (!state) {
    const last = Save.readLastSettings()
    const seed = randomSeed(playRng(Date.now()))
    // the first game is small and generous, without saying so; after that the last settings hold
    state = createGame(seed, last ? { size: last.size, shape: last.shape, difficulty: last.difficulty, audio: last.audio, firstGame: false } : {}, Date.now())
  }
  const app = new App(root, state, resumed)
  ;(window as unknown as { fairholm: App }).fairholm = app
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
