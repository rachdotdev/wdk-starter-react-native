// Local backend for the Transak fiat module. It is the only place that holds
// the Transak API secret. The app calls these endpoints, and the server signs
// the Transak requests.
//
// Run with: node --env-file=.env server/transak-server.mjs
// Defaults to Transak STAGING. Set TRANSAK_ENV=PRODUCTION only when ready.

import http from 'node:http'

const PORT = Number(process.env.TRANSAK_SERVER_PORT ?? 8787)
const API_KEY = process.env.TRANSAK_API_KEY
const API_SECRET = process.env.TRANSAK_API_SECRET
const PRODUCTION = process.env.TRANSAK_ENV === 'PRODUCTION'

const HOSTS = PRODUCTION
  ? { partners: 'https://api.transak.com', gateway: 'https://api-gateway.transak.com' }
  : { partners: 'https://api-stg.transak.com', gateway: 'https://api-gateway-stg.transak.com' }

if (!API_KEY || !API_SECRET) {
  console.error('TRANSAK_API_KEY and TRANSAK_API_SECRET must be set in .env')
  process.exit(1)
}

/** Access token, cached until shortly before it expires. */
let cachedToken = null
let cachedUntil = 0

async function accessToken () {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken
  const res = await fetch(`${HOSTS.partners}/partners/api/v2/refresh-token`, {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'api-secret': API_SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey: API_KEY }),
  })
  const body = await res.json()
  const token = body?.data?.accessToken
  if (!res.ok || !token) throw new Error(`Transak refresh-token failed: ${res.status}`)
  cachedToken = token
  // Refresh one minute early. The exact lifetime is not documented here.
  cachedUntil = Date.now() + 55 * 60 * 1000
  return token
}

function send (res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function readJson (req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

/** Creates a single-use widget session. The URL is valid for 5 minutes. */
async function createWidgetUrl (widgetParams, userIp) {
  const token = await accessToken()
  const res = await fetch(`${HOSTS.gateway}/api/v2/auth/session`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'access-token': token,
      'content-type': 'application/json',
      'x-user-ip': userIp,
    },
    body: JSON.stringify({ widgetParams: { ...widgetParams, apiKey: API_KEY } }),
  })
  const body = await res.json()
  const url = body?.data?.widgetUrl
  if (!res.ok || !url) throw new Error(`Transak session failed: ${res.status}`)
  return url
}

async function getOrder (orderId) {
  const token = await accessToken()
  const res = await fetch(`${HOSTS.partners}/partners/api/v2/order/${encodeURIComponent(orderId)}`, {
    headers: { 'x-api-key': API_KEY, 'access-token': token },
  })
  const body = await res.json()
  if (!res.ok || !body?.data) throw new Error(`Transak order fetch failed: ${res.status}`)
  return body.data
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/transak/widget-url') {
      const { widgetParams } = await readJson(req)
      // Local testing comes from loopback, so use the development IP the widget browser shares.
      const forwarded = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket.remoteAddress
      const isLoopback = !forwarded || forwarded === '::1' || forwarded.startsWith('127.') || forwarded === '::ffff:127.0.0.1'
      const userIp = isLoopback ? (process.env.TRANSAK_DEV_USER_IP ?? forwarded) : forwarded
      const widgetUrl = await createWidgetUrl(widgetParams, userIp)
      return send(res, 200, { widgetUrl })
    }
    const orderMatch = req.method === 'GET' && req.url?.match(/^\/transak\/order\/([^/?]+)$/)
    if (orderMatch) {
      const order = await getOrder(orderMatch[1])
      return send(res, 200, { order })
    }
    return send(res, 404, { error: 'not found' })
  } catch (e) {
    console.error(e.message)
    return send(res, 502, { error: 'Transak request failed' })
  }
})

server.listen(PORT, () => {
  console.log(`Transak backend on http://localhost:${PORT} (${PRODUCTION ? 'PRODUCTION' : 'STAGING'})`)
})
