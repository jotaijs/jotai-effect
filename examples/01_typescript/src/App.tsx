import React from 'react'
import { useAtom } from 'jotai/react'
import { atom } from 'jotai/vanilla'
import type { Getter, Setter } from 'jotai/vanilla'
import { atomEffect } from 'jotai-effect'

const playPauseAtom = atom(false)
const countAtom = atom(0)

const increment = (prev: number) => prev + 1
const toggle = (prev: boolean) => !prev

const incrementOnIntervalAtom = atomEffect((get: Getter, set: Setter) => {
  const isPlay = get(playPauseAtom)
  if (!isPlay) return
  const interval = setInterval(() => {
    set(countAtom, increment)
  }, 1000)
  return () => clearInterval(interval)
})

function Counter() {
  useAtom(incrementOnIntervalAtom)
  const [count, setCount] = useAtom(countAtom)
  const resetCount = () => setCount(0)
  return (
    <>
      count: {count}
      <button onClick={resetCount}>Reset Count</button>
    </>
  )
}

export default function App() {
  const [isPlay, setPlayPause] = useAtom(playPauseAtom)
  const togglePlayPause = () => setPlayPause(toggle)
  return (
    <div className="App">
      <h1>Hello CodeSandbox</h1>
      <h2>Start editing to see some magic happen!</h2>
      <Counter />
      <button onClick={togglePlayPause}>{isPlay ? 'Pause' : 'Play'}</button>
    </div>
  )
}
