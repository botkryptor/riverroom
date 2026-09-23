# Riverroom

A private, play-money poker room for friends. The MVP includes:

- Shareable browser room links
- Multiplayer No-Limit Texas Hold'em
- Peer-to-peer voice chat
- Automatic buy-in and settlement ledger
- Persistent room balances
- Host controls and reconnect support

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
