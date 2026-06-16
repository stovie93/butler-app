# 🤖 Butler

**Talk to your computer from your phone — and put it to work.** Butler is an Android app
(plus a home-screen widget) that connects to the AI running on your own PC. A small local
model handles chat; real coding tasks get dispatched to **Claude Code**, which builds
autonomously on your machine while you watch the progress live from your phone.

Everything runs over your private [Tailscale](https://tailscale.com) network — no ports are
exposed to the public internet, and your token never leaves your devices.

> **Companion:** [butler-desktop](https://github.com/stovie93/butler-desktop) is the same
> thing as a desktop window for the PC itself.

---

## What it does

| Tab | What you can do |
| --- | --- |
| **💬 Chat** | Stream a conversation with the local model on your PC. Slash commands work here too. |
| **🔨 Build** | Hand Claude Code a coding job (project + plain-English task, optional "continue last session"). See live computer status and keep the PC awake on demand (1h / 2h / 4h / Off). |
| **📋 Jobs** | Every dispatched build with a status dot (running / done / failed). Tap one for a **live log that auto-refreshes every 3s while it runs** — watch Claude work in real time. |
| **❓ Help** | In-app setup + usage guide. |

The **home-screen widget** shows the last answer and has a one-tap **Status** button that
pings the PC without opening the app.

---

## Architecture

```
 Phone (Butler app + widget)
    │   HTTPS over Tailscale (private tailnet, token auth)
    ▼
 OpenClaw gateway  (on your PC, port 18789)
    ├─ /v1/chat/completions     OpenAI-compatible chat  ──▶  Ollama (local model)
    └─ /api/v1/code-dispatch    build / jobs / awake / status ──▶ Claude Code (headless)
```

- Chat context is held **server-side**, keyed by the `user` field (`butler-phone`), so the
  app only ever sends the newest message.
- Chat streams replies as Server-Sent Events via `expo/fetch`.
- Build / Jobs / Awake call the custom **`code-dispatch`** gateway plugin's JSON route.
- Dispatched builds run `claude -p` in streaming mode, so their logs fill in live.

---

## Prerequisites (the PC / "server" side)

Butler is a **client** — it needs a host PC running the following. Setup of the host is
outside this repo, but here's the checklist:

1. **[Ollama](https://ollama.com)** with at least one chat model pulled (e.g. `gpt-oss:20b`).
2. **[OpenClaw](https://openclaw.ai)** gateway, configured with:
   - `gateway.auth.token` (the bearer token the app uses)
   - `gateway.http.endpoints.chatCompletions.enabled = true` (off by default)
   - a model provider pointing at Ollama
3. **Claude Code** CLI installed and authenticated (for dispatched builds).
4. The **`code-dispatch`** OpenClaw plugin, which adds `POST /api/v1/code-dispatch`
   (actions: `build`, `jobsData`, `jobLog`, `awake`, `status`) and the `/build`, `/jobs`,
   `/awake` chat commands. It shells out to dispatch scripts that run Claude Code headless
   per project and track each job.
5. **[Tailscale](https://tailscale.com)** on both the PC and the phone (same account), with
   the gateway exposed via `tailscale serve` for an HTTPS tailnet URL.

> Without Tailscale you can still use it on the same Wi-Fi by pointing the app at the PC's
> LAN IP — but Tailscale is what makes it work from anywhere.

---

## Install (use the app)

1. Build the APK (below) or grab one, copy it to your phone, and install (allow installs
   from the source when prompted).
2. Install the **Tailscale** app on the phone, sign in with the same account as the PC, and
   turn the VPN on.
3. Open Butler → **⚙ Settings**:
   - **Gateway URL** — your PC's Tailscale Serve URL, e.g. `https://your-pc.your-tailnet.ts.net`
     (or `http://<lan-ip>:18789` on the same network).
   - **Token** — the gateway's `gateway.auth.token`.
   - Tap **Test** → expect "✓ Connected" → **Save**.
4. Add the **Butler** widget from your launcher's widget list if you want one-tap status.

---

## Build from source

Requires **Node 20+**, **JDK 17**, and the **Android SDK** (`ANDROID_HOME`). This is an
[Expo](https://expo.dev) SDK 56 / React Native 0.85 app (package `com.stovie93.butler`).

```bash
npm install

# Regenerate the native Android project (needed after icon/app.json changes):
npx expo prebuild --platform android

# Build a release APK:
cd android
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Install with `adb install -r app-release.apk` (USB debugging on) or by copying the APK to
the phone.

### Project layout

```
App.tsx                  app shell: tab bar, header, settings modal
src/api.ts               gateway calls (chat stream + code-dispatch actions)
src/settings.ts          AsyncStorage: gateway URL/token, chat history
src/theme.ts             colors + small helpers
src/screens/             ChatScreen, BuildScreen, JobsScreen, HelpScreen
src/widgets/             home-screen widget + headless task handler
scripts/gen-icon.mjs     renders the icon set from one SVG (needs `sharp`)
```

### Regenerating the icon

```bash
node scripts/gen-icon.mjs   # writes assets/icon.png, adaptive/monochrome, splash, favicon
npx expo prebuild --platform android   # bake the new icon into android resources
```

---

## Command shortcuts

Anything the tabs do, you can also type in **Chat** (or send over WhatsApp if the gateway
has a WhatsApp channel):

```
/build snake-game a retro browser snake game with arrow keys and a score
/build snake-game --continue add sound effects
/jobs
/awake 2h
/awake off
```

---

## Limitations

- **Can't wake a sleeping PC.** Keep-awake stops the PC sleeping *while it's on*, but the
  app can't revive one that has already slept (S3 + Wi-Fi hardware can't be woken remotely).
- Dispatched builds run with permissions skipped so they're autonomous — only you can
  trigger them (allowlist + token + tailnet-only), but treat that access accordingly.
- No secrets are stored in this repo; the gateway URL and token live in on-device storage.
