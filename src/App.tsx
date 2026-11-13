import { useEffect, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'

export default function App() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // Keep the globe full-screen when the window is resized
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // When the globe loads, fly the camera to India over 3 seconds
  const flyToIndia = () => {
    globeRef.current?.pointOfView({ lat: 22, lng: 79, altitude: 1.8 }, 3000)
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <Globe
        ref={globeRef}
        width={size.w}
        height={size.h}
        globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="https://unpkg.com/three-globe/example/img/night-sky.png"
        atmosphereColor="#38bdf8"
        atmosphereAltitude={0.2}
        onGlobeReady={flyToIndia}
      />

      <div className="pointer-events-none absolute left-6 top-6 font-mono">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-cyan-300">DRISHTI</h1>
        <p className="mt-1 text-xs text-cyan-100/60">Live view of the skies over India</p>
      </div>
    </div>
  )
}