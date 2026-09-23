# Riverroom

A private, play-money poker room for friends. The MVP includes:

- Shareable browser room links
- Multiplayer No-Limit Texas Hold'em
- Peer-to-peer voice chat
- Automatic buy-in and settlement ledger
- Persistent room balances
- Host controls and reconnect support

## Live app

https://web-production-9aa1c.up.railway.app

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`. Friends on the same network can join using your
computer's LAN IP in place of `localhost`.

Voice chat requires a secure context when deployed (`https://`). Browsers make
an exception for `localhost` during local development.

## Scope

This app uses play chips only. It records informal settlements but does not
process payments or hold money.

Bomb pots, double boards, and 7-2 bounty are represented in the game settings
roadmap and are intentionally outside the first playable engine.

## Deploy to Railway

Riverroom includes Railway Infrastructure as Code under `.railway/`. The
deployment creates one Singapore-hosted web service and a 500 MB persistent
volume for room and ledger data.

```bash
railway login
railway init
railway config plan
railway config apply
railway service link web
railway domain
```

Railway uses `/health` to verify deployments. The service reads `PORT`
automatically and stores persistent state under the configured `DATA_DIR`.
