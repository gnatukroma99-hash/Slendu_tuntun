# Public sharing

Current temporary public URL:

https://tab-christine-subsection-nam.trycloudflare.com/

Restarted on 2026-11-13 after the requested shutdown. The old
`indicator-chip-anymore-fingers.trycloudflare.com` tunnel expired and could not
be reclaimed. The local address remains `http://127.0.0.1:4175`.

This is a Cloudflare Quick Tunnel to the Node HTTP/WebSocket game server on
`http://127.0.0.1:4175`. Only the static game, game-room WebSocket and game health/LAN
information endpoints are exposed, not OpenCode or its API. The origin Host
header is rewritten to `localhost:4175`. WebSocket origins are restricted to
the configured public origin and literal private/loopback addresses. Tunnel
metrics bind to loopback.

On 2026-11-12, version 0.2 was promoted from the separately tested `dist-next/`
release without restarting cloudflared. That earlier hostname stayed the same
throughout the update, until the later user-requested shutdown ended its tunnel.
The previous 0.1 build remains in `dist/` and its backup; older hashed JS/CSS files
are also retained in `dist-next/assets/` for already-open visitors.

## Lifetime

- The game server, cloudflared process, phone, and Internet connection must stay
  running. Android may stop background processes to save battery.
- This is not independent cloud hosting or a permanent deployment.
- Quick Tunnels have no uptime guarantee and their hostname changes on restart.
- No Cloudflare account or domain was created or used.

## Recreate a temporary link

To restart the current game release while preserving the existing tunnel URL:

```sh
PORT=4175 GAME_DIST=dist-next \
PUBLIC_ORIGIN=https://tab-christine-subsection-nam.trycloudflare.com \
npm start
```

Then, in another terminal, run the official cloudflared executable downloaded to
`/tmp/opencode/cloudflared/cloudflared-linux-arm64`:

```sh
/tmp/opencode/cloudflared/cloudflared-linux-arm64 tunnel \
  --no-autoupdate \
  --url http://127.0.0.1:4175 \
  --http-host-header localhost:4175 \
  --edge-ip-version 4 \
  --protocol http2 \
  --metrics 127.0.0.1:0 \
  --management-diagnostics=false
```

Share the new HTTPS URL printed by cloudflared. Stop that process to revoke
access through its URL. If recreating the tunnel gives a new hostname, set
`PUBLIC_ORIGIN` to that new HTTPS origin and restart only the game server to
authorize cooperative WSS connections. Solo does not use WebSocket and works
without joining a room.

Downloaded official cloudflared version: `2026.11.0`.
SHA-256, verified against its GitHub release asset digest:
`abe54a006acf9faf2d19ee9d953cb0d0804e92f59c5382a162e57b84d086f56f`.

## Public URL verification

After the 2026-11-13 restart, local and public health checks returned `0.2.0`,
public HTML matched the saved production build, and a real WSS client created
and left a room through the new hostname. The full gameplay checks below refer
to the initial 0.2 deployment and its then-current public URL.

The root page and original asset JSON/binary returned HTTP 200 through the public
hostname; downloaded asset hashes matched the local production build. A
Chromium Pixel 7 landscape emulation opened this HTTPS URL, loaded the actual
3D game, started it and collected a custard through the touch button with no
JavaScript errors or failed requests. After deploying 0.2, two independent
Android browser contexts opened the same public URL: one collected automatically
while the joystick and sprint remained held, while the other kept its separate
zero score. Development test hooks were absent. Two real WSS clients also created
one room through the then-current public hostname, shared one atomic pickup and received
server-synchronized movement.

## Permanent hosting

Upload `dist/` to an authorized static hosting account (for example Cloudflare
Pages or Netlify) for **solo-only** play. Cooperative play additionally needs a
Node host that supports WebSocket. No model API key is needed. Account access has
not been provided, so no permanent cloud deployment has been performed.
Original game asset redistribution rights must be arranged with the respective
rights holders before a public release; see `README.md`.
