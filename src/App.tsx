import { useCallback, useEffect, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'

// One plane, in the shape our /api/flights function sends,
// plus the position it had when we fetched it (used to predict movement)
type Flight = {
  id: string
  callsign: string
  country: string
  lat: number
  lng: number
  altitude: number // metres
  speed: number // metres per second
  heading: number // degrees, 0 = north
  baseLat: number
  baseLng: number
}

const REFRESH_MS = 90_000 // matches the 90 s cache on the server
const TICK_MS = 1_000 // move the planes once a second
const METRES_PER_DEGREE = 111_320 // roughly, along a line of latitude

// First 3 letters of a callsign = airline code
const AIRLINES: Record<string, string> = {
  // Indian airlines
  AIC: 'Air India',
  AXB: 'Air India Express',
  IGO: 'IndiGo',
  AKJ: 'Akasa Air',
  SEJ: 'SpiceJet',
  LLR: 'Alliance Air',
  FLG: 'Fly91',
  SDG: 'Star Air',
  // Gulf & Middle East
  UAE: 'Emirates',
  ETD: 'Etihad',
  QTR: 'Qatar Airways',
  ABY: 'Air Arabia',
  FDB: 'flydubai',
  GFA: 'Gulf Air',
  OMA: 'Oman Air',
  KAC: 'Kuwait Airways',
  SVA: 'Saudia',
  JZR: 'Jazeera Airways',
  // Asia
  SIA: 'Singapore Airlines',
  THA: 'Thai Airways',
  MAS: 'Malaysia Airlines',
  AXM: 'AirAsia',
  CPA: 'Cathay Pacific',
  ALK: 'SriLankan Airlines',
  BBC: 'Biman Bangladesh',
  RNA: 'Nepal Airlines',
  // Europe
  BAW: 'British Airways',
  DLH: 'Lufthansa',
  AFR: 'Air France',
  KLM: 'KLM',
  THY: 'Turkish Airlines',
  VIR: 'Virgin Atlantic',
}
const PLANE_COLOR = '#fbbf24'
const SELECTED_COLOR = '#22d3ee'

// A small plane icon (points north before rotating)
const PLANE_SVG = `<svg viewBox="0 0 24 24" width="14" height="14">
  <path fill="${PLANE_COLOR}" d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>
</svg>`

// Turn a heading in degrees into N, NE, E, ...
const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]

export default function App() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [flights, setFlights] = useState<Flight[]>([])
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const flightsById = useRef(new Map<string, Flight>()) // the same objects across refreshes
  const iconsById = useRef(new Map<string, HTMLElement>()) // each plane's <svg>, to rotate/recolour
  const dataTime = useRef(0) // when OpenSky measured the current positions (ms)

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
        if (!data.flights) return

        const next = new Map<string, Flight>()
        for (const f of data.flights as Flight[]) {
          // Reuse the existing object so the globe moves the plane instead of redrawing it
          const flight = Object.assign(flightsById.current.get(f.id) ?? {}, f, {
            baseLat: f.lat,
            baseLng: f.lng,
          })
          next.set(f.id, flight)
          const icon = iconsById.current.get(f.id)
          if (icon) icon.style.transform = `rotate(${f.heading}deg)`
        }
        flightsById.current = next
        // OpenSky says when these positions were measured; predict forward from then
        dataTime.current = data.time ? data.time * 1000 : Date.now()
        setFlights([...next.values()])
        setUpdatedAt(new Date())
      } catch (err) {
        console.error('Could not load flights', err)
      }
    }
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  // Every second, predict where each plane is now from its speed and heading
  useEffect(() => {
    const timer = setInterval(() => {
      // Seconds since the positions were measured (capped so planes never fly off wildly)
      const seconds = Math.min((Date.now() - dataTime.current) / 1000, 300)
      for (const f of flightsById.current.values()) {
        const metres = f.speed * seconds
        const rad = (f.heading * Math.PI) / 180
        f.lat = f.baseLat + (metres * Math.cos(rad)) / METRES_PER_DEGREE
        f.lng =
          f.baseLng +
          (metres * Math.sin(rad)) / (METRES_PER_DEGREE * Math.cos((f.baseLat * Math.PI) / 180))
      }
      setFlights([...flightsById.current.values()])
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // Highlight the selected plane
  useEffect(() => {
    for (const [id, icon] of iconsById.current) {
      const path = icon.querySelector('path')
      path?.setAttribute('fill', id === selectedId ? SELECTED_COLOR : PLANE_COLOR)
      icon.style.setProperty('scale', id === selectedId ? '1.8' : '1')
    }
  }, [selectedId, flights])

  // When the globe loads, fly the camera to India over 3 seconds
  const flyToIndia = () => {
    globeRef.current?.pointOfView({ lat: 22, lng: 79, altitude: 1.8 }, 3000)
  }

  // Build the HTML element drawn for each plane.
  // useCallback keeps this the same function between renders; if it changed,
  // the globe would throw away and redraw every plane each second.
  const makePlaneElement = useCallback((d: object) => {
    const flight = d as Flight
    const el = document.createElement('div')
    el.innerHTML = PLANE_SVG
    el.title = flight.callsign || flight.id
    el.style.pointerEvents = 'auto' // the globe's HTML layer ignores clicks unless we allow them
    el.style.cursor = 'pointer'
        // Stop the globe from also treating this press as a click on empty globe
    el.addEventListener('pointerdown', (e) => e.stopPropagation())
    el.onclick = () => setSelectedId(flight.id)
    // The globe library moves `el` itself, so we rotate the icon inside it
    const icon = el.firstElementChild as HTMLElement
    icon.style.transform = `rotate(${flight.heading}deg)`
    icon.style.transition = 'scale 0.2s'
    iconsById.current.set(flight.id, icon)
    return el
  }, [])

  const selected = flights.find((f) => f.id === selectedId)
  const airline = selected ? AIRLINES[selected.callsign.slice(0, 3)] : undefined

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
        onGlobeClick={() => setSelectedId(null)}
        htmlElementsData={flights}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.01}
        htmlElement={makePlaneElement}
        htmlTransitionDuration={TICK_MS}
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

      {selected && (
        <div className="absolute bottom-6 left-6 w-72 rounded-lg border border-cyan-400/30 bg-black/70 p-4 font-mono text-cyan-100 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
                           <p className="text-xl font-bold text-cyan-300">
                {selected.callsign || selected.id.toUpperCase()}
              </p>
              <p className="text-xs text-cyan-100/60">
                {selected.callsign ? (airline ?? 'Airline unknown') : 'No callsign broadcast'}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-cyan-100/50 hover:text-cyan-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-cyan-100/50">Altitude</dt>
            <dd>{Math.round(selected.altitude * 3.28084).toLocaleString()} ft</dd>
            <dt className="text-cyan-100/50">Speed</dt>
            <dd>{Math.round(selected.speed * 3.6)} km/h</dd>
            <dt className="text-cyan-100/50">Heading</dt>
            <dd>
              {Math.round(selected.heading)}° {compass(selected.heading)}
            </dd>
            <dt className="text-cyan-100/50">Registered</dt>
            <dd>{selected.country}</dd>
            <dt className="text-cyan-100/50">Position</dt>
            <dd>
              {selected.lat.toFixed(2)}, {selected.lng.toFixed(2)}
            </dd>
          </dl>
        </div>
      )}
    </div>
  )
}