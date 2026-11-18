# Smart Deposit Addresses (Candide)

**Receive → "Sending from an exchange or another chain?"** opens the Deposit
screen. It shows one address that accepts USD₮ on every configured source
chain (Ethereum and Polygon by default) and forwards it to this wallet's
Arbitrum address, where it arrives as USD₮0. Users can send to it from an
exchange, without picking a chain or bridging.

It uses [`@candidelabs/wdk-protocol-sda-candide`](https://github.com/candidelabs/wdk-protocol-sda-candide),
a community module maintained independently by Candide. Tether does not
endorse or audit it. It is a `1.0.0-beta.1` release.

## How it fits together

```
App (Deposit screen) ──GET /deposit-address──▶ server/ ──▶ Candide Forwarding API
                     ──GET /transfers───────▶          (API URL + policy secret)
```

The app never calls Candide. The Forwarding API URL embeds your team API key
(billed), and activating or renewing an address needs the policy secret, so
both stay in `server/.env`.

The server, for each user:

1. Derives the address from the user's Arbitrum address and a salt of
   `keccak256(SDA_SALT_SECRET, recipient)`, so nobody can link a deposit
   address to a wallet without the secret.
2. Activates it the first time it's requested.
3. Renews monitoring only when less than `SDA_RENEW_WITHIN_SECONDS` (24 h by
   default) is left. Every activation and renewal is billed to the policy,
   so it doesn't renew on every screen open.
4. Refuses to return an address whose monitoring isn't active.

## Run it

```bash
cd server
cp .env.example .env    # fill in the Candide values and SDA_SALT_SECRET
npm install
npm start               # http://localhost:8787
npm test                # unit tests against an in-memory mock of the Candide API
```

Then set `EXPO_PUBLIC_SDA_SERVER_URL` in the app's `.env` (your computer's LAN
IP on a physical device, e.g. `http://192.168.1.20:8787`) and restart Metro.

Candide dashboard values:

| Variable | Where |
|---|---|
| `CANDIDE_FORWARDING_API_URL` | API Keys → your key → "Forwarder addresses" |
| `CANDIDE_FORWARDING_POLICY_SECRET` | Forwarder Policies → your policy → Bearer Token (Rotate to reveal a new one) |

Make sure the policy's source networks include every chain in
`SDA_SOURCE_CHAINS`. If sponsorship is on, the policy needs a balance:
deposits it can't cover are held, not forwarded.

## Production notes

- `server/` has no authentication or rate limiting. Anyone who can reach it
  can activate addresses on your policy. Put it behind your own auth.
- Deposits below the bridge minimum, or of unsupported tokens, stay at the
  address. The recipient (or the recovery withdrawer, after a timelock) can
  withdraw them through Candide's recovery frontend.
- `CANDIDE_RECOVERY_WITHDRAWER` and `SDA_SALT_SECRET` are derivation inputs:
  changing either changes every user's address.
