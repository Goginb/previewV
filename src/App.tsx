import React from 'react'
import { Canvas } from './components/Canvas'
import { ViewportHud } from './components/ViewportHud'

const App: React.FC = () => {
  return (
    <div className="relative w-full h-full bg-zinc-950">
      <Canvas />
      <ViewportHud />
    </div>
  )
}

export default App
