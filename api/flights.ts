// GET /api/flights
// Logs in to OpenSky (OAuth2), fetches live aircraft over India,
// and returns a small, clean JSON list for the globe.

const TOKEN_URL =
  'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'

// Box around India: latitude 6–37°N, longitude 68–98°E
const STATES_URL =
  'https://opensky-network.org/api/states/all?lamin=6&lamax=37&lomin=68&lomax=98'

// Reuse the login token until it expires (saves a login on every request)
let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.OPENSKY_CLIENT_ID ?? '',
      client_secret: process.env.OPENSKY_CLIENT_SECRET ?? '',
    }),
  })
  if (!res.ok) throw new Error(`OpenSky login failed (${res.status})`)

    const data = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh 1 min early
  }
  return cachedToken.value
}

// OpenSky sends each plane as an array; these are the positions we need
type StateVector = (string | number | boolean | null)[]

export async function GET(): Promise<Response> {
  let step = 'login' // which part failed, to make errors easier to debug
  try {
    const token = await getToken()
    step = 'data'
    const res = await fetch(STATES_URL, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`OpenSky data failed (${res.status})`)

       const data = (await res.json()) as { time: number; states: StateVector[] | null }
    const flights = (data.states ?? [])
      .filter((s) => s[5] != null && s[6] != null && !s[8]) // has a position and is in the air
      .map((s) => ({
        id: s[0] as string, // unique aircraft code
        callsign: String(s[1] ?? '').trim(), // e.g. "AIC101"
        country: s[2] as string, // country of registration
        lng: s[5] as number,
        lat: s[6] as number,
        altitude: (s[7] ?? s[13] ?? 0) as number, // metres
        speed: (s[9] ?? 0) as number, // metres per second
        heading: (s[10] ?? 0) as number, // degrees, 0 = north
      }))

    return Response.json(
      { time: data.time, count: flights.length, flights },
      // Let Vercel's cache serve the same answer for 90 s to save API credits
      { headers: { 'Cache-Control': 's-maxage=90, stale-while-revalidate=30' } },
    )
    } catch (err) {
    // Network errors hide the real reason in `cause` (e.g. a timeout or refused connection)
    const e = err as Error & { cause?: { code?: string; message?: string } }
    const reason = e.cause?.code ?? e.cause?.message
    return Response.json(
      { error: `${step} failed: ${e.message}${reason ? ` (${reason})` : ''}` },
      { status: 502 },
    )
  }