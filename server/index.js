import { createServer } from 'node:http'
import { createSdaService, InputError } from './sda.js'

const service = createSdaService()
const port = Number(process.env.PORT || 8787)

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body, (_, value) => (typeof value === 'bigint' ? value.toString() : value)))
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  try {
    // GET /deposit-address?recipient=0x…  → the user's live deposit address
    if (req.method === 'GET' && url.pathname === '/deposit-address') {
      return send(res, 200, await service.getLiveDepositAddress(url.searchParams.get('recipient')))
    }
    // GET /transfers?recipient=0x…  → forwards through that address
    if (req.method === 'GET' && url.pathname === '/transfers') {
      return send(res, 200, await service.getTransfers(url.searchParams.get('recipient')))
    }
    return send(res, 404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof InputError) return send(res, 400, { error: error.message })
    // Log the error class and reason only: raw causes can contain the API URL, which embeds the API key.
    console.error(`${req.method} ${url.pathname} failed:`, error?.constructor?.name, error?.reason ?? '')
    return send(res, 502, { error: 'Deposit service unavailable' })
  }
}).listen(port, () => console.log(`SDA server listening on http://localhost:${port}`))
