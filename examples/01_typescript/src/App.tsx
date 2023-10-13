import React, { SetStateAction } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'
import type { Getter, Setter } from 'jotai/vanilla'
import { atomEffect } from 'jotai-effect'

const increment = (prev: number) => prev + 1
const toggle = (prev: boolean) => !prev

const playPauseAtom = atom<boolean, [unknown | SetStateAction<boolean>], void>(
  false,
  (_get, set) => {
    set(playPauseAtom, toggle)
  }
)
const countAtom = atom(0)
const resetCountAtom = atom(null, (_get, set) => set(countAtom, 0))

const incrementOnIntervalAtom = atomEffect((get: Getter, set: Setter) => {
  if (get(playPauseAtom)) {
    const intervalId = setInterval(() => {
      set(countAtom, increment)
    }, 500)
    return () => clearInterval(intervalId)
  }
})

export function App() {
  useAtom(incrementOnIntervalAtom)
  const [isPlay, togglePlayPause] = useAtom(playPauseAtom)
  const count = useAtomValue(countAtom)
  const resetCount = useSetAtom(resetCountAtom)
  return (
    <div className="App">
      <div>count: {count}</div>
      <button onClick={resetCount}>Reset Count</button>
      <button onClick={togglePlayPause}>{isPlay ? 'Pause' : 'Play'}</button>
    </div>
  )
}
