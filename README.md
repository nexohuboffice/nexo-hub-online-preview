# NEXO HUB — AI Command Center

NEXO HUB v0.8 frontend candidate, preserving the entire published v0.7.3 demo.

The live-status panel is **not activated**. `public-config.js` contains only an
empty public gateway origin. No production deployment is part of this change.
After separate approval and verification, it can link to a separately hosted,
authenticated, read-only gateway. Authentication and backend source remain
outside this public repository, as required below. The gateway serves the same
UI on its own origin to avoid third-party cookies and browser-held API tokens.
Only its Railway status panel will use real data; other sections remain demo.

- Dashboard, Chat, Agents, Missions, COMMS, Memory, Automations, Settings and Voice Demo
- Chat, agents and messages are simulated; no connection to private Railway, Discord, Gmail or OpenAI services
- Browser speech recognition may use browser vendor cloud services. Voice Demo is not the GPT-Live API
- No API keys, secrets or real user data should be committed here
- Preview GitHub Pages: https://nexohuboffice.github.io/nexo-hub-online-preview/ (requires enabling Pages from main/root)

The existing Pages publication uses `main` / `/(root)`. Merging this candidate
will update the public site; do not merge until deployment is approved.

Frontend preservation check (Node.js 24+):
`node --test tests/preservation.test.mjs`.
This verifies that removing the three added asset references recovers the
published v0.7.3 HTML, including all inline demo and Voice code, byte for byte
after line-ending normalization. No secrets or private gateway code belong here.

Always publish only audited static assets here. Keep the private voice server, authentication, source backups and `.env` files outside this public repository.

