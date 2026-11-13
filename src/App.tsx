import { useEffect, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'

// One plane, in the shape our /api/flights function sends
type Flight = {
  id: string
  callsign: string
  country: string
  lat: number
  lng: number
  altitude: number // metres
  speed: number // metres per second
  heading: number // degrees, 0 = north
}

const REFRESH_MS = 90_000 // matches the 90 s cache on the server

// A small plane icon (points north before rotating)
const PLANE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14">
  <path fill="#fbbf24" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
</svg>`

export default function App() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [flights, setFlights] = useState<Flight[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // Keep the globe full-screen when the window is resized
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Load flights now, then again every 90 seconds
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/flights')
        const data = await res.json()
        if (data.flights) {
          setFlights(data.flights)
          setUpdatedAt(new Date())
        }
      } catch (err) {
        console.error('Could not load flights', err)
      }
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  // When the globe loads, fly the camera to India over 3 seconds
  const flyToIndia = () => {
    globeRef.current?.pointOfView({ lat: 22, lng: 79, altitude: 1.8 }, 3000)
  }

  // Build the HTML element drawn for each plane
  const makePlaneElement = (d: object) => {
    const flight = d as Flight
    const el = document.createElement('div')
    el.innerHTML = PLANE_SVG
    // The globe library moves `el` itself, so we rotate the icon inside it
    const icon = el.firstElementChild as HTMLElement
    icon.style.transform = `rotate(${flight.heading}deg)`
    el.title = flight.callsign || flight.id
    return el
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
        htmlElementsData={flights}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.01}
        htmlElement={makePlaneElement}
      />

      <div className="pointer-events-none absolute left-6 top-6 font-mono">
        <h1 className="text-2xl font-bold tracking-[0.3em] text-cyan-300">DRISHTI</h1>
        <p className="mt-1 text-xs text-cyan-100/60">Live view of the skies over India</p>
      </div>

      <div className="pointer-events-none absolute right-6 top-6 rounded-lg border border-cyan-400/20 bg-black/50 px-4 py-3 font-mono backdrop-blur">
        <p className="text-3xl font-bold text-amber-300">{flights.length}</p>
        <p className="text-xs text-cyan-100/70">aircraft over India right now</p>
        {updatedAt && (
          <p className="mt-1 text-[10px] text-cyan-100/40">
            updated {updatedAt.toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}