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
| **💬 Chat** | Stream a conversation with your assistant — voice input, spoken replies, live web search and pasted-link reading (handled server-side), tap-to-send starter prompts, and an optional "local Claude" toggle. Slash commands work here too. |
| **⚡ Activity** | One live feed of everything Claude does on your PC — build jobs (tap for a **live log** while they run) and "ask Claude" questions with their answers. Dispatch a new build from the same screen, and keep the PC awake on demand (1h / 2h / 4h / Off). |
| **🖥️ PC** | Live computer status (CPU / RAM / disk / uptime), running processes, and power actions — the risky ones ask for your approval first. |
| **🧠 Memory** | Everything the assistant remembers about you — review, add, and delete facts — plus your reminders. |
| **🛡️ Approvals** | The safety valve: when the agent wants to run a sensitive action (any shell command, power actions, builds), a card with the **exact action** appears here (and as a push) and nothing runs until you approve. |

**⚙ Settings** holds the gateway connection, the **Persona editor** (rename the assistant,
tune its personality), the **model picker**, notification history, and the in-app **Help**
guide. The **home-screen widget** shows the last answer and has a one-tap **Status** button
that pings the PC without opening the app.

The assistant also reaches out on its own when it matters: timed reminders, approval
requests, finished builds, and **scheduled heartbeats** (e.g. a daily morning briefing)
arrive as push notifications even when the app is closed — see the push setup note below.

---

## Architecture

```
 Phone (Butler app + widget)
    │   HTTPS over Tailscale (private tailnet, token auth)
    ▼
 OpenClaw gateway  (on your PC, port 18789)
    ├─ /v1/chat/completions     chat ──▶ Ollama (local model), with persona + memory +
    │                           awareness + web results injected server-side every turn
    ├─ /api/v1/code-dispatch    build / jobs / awake / status ──▶ Claude Code (headless)
    ├─ /api/v1/approvals        approve/deny cards + push notifications (SSE live)
    └─ /api/v1/{memory, reminders, pc, persona, chat-models, heartbeat, shell, notifications}
```

- Chat context is held **server-side**, keyed by the `user` field (`butler-phone`), so the
  app only ever sends the newest message.
- Chat streams replies as Server-Sent Events via `expo/fetch`.
- The Activity feed calls the custom **`code-dispatch`** plugin (builds/jobs/awake) and the optional **`butler-brain`** plugin (Claude questions).
- Dispatched builds run `claude -p` in streaming mode, so their logs fill in live.

---

## Prerequisites (the PC / "server" side)

Butler is a **client** — it needs a host PC running a few things. The complete host setup —
the `code-dispatch` plugin, the dispatch/keep-awake scripts, an example config, and a
**step-by-step guide** — lives in **[butler-gateway](https://github.com/stovie93/butler-gateway)**
([SETUP.md](https://github.com/stovie93/butler-gateway/blob/master/SETUP.md)). In short, the
host needs:

1. **[Ollama](https://ollama.com)** with a chat model (e.g. `gpt-oss:20b`) and
   `nomic-embed-text` (for memory) pulled.
2. **[OpenClaw](https://openclaw.ai)** gateway, configured with:
   - `gateway.auth.token` (the bearer token the app uses)
   - `gateway.http.endpoints.chatCompletions.enabled = true` (off by default)
   - a model provider pointing at Ollama
3. The **butler-gateway plugin suite** (persona, memory, awareness, approvals, shell, PC,
   reminders, heartbeat, web search, models, code-dispatch) — copy + enable, all plain Node.
4. **Claude Code** CLI installed and authenticated (optional — only for dispatched builds).
5. **[Tailscale](https://tailscale.com)** on both the PC and the phone (same account), with
   the gateway exposed via `tailscale serve` for an HTTPS tailnet URL.

> Without Tailscale you can still use it on the same Wi-Fi by pointing the app at the PC's
> LAN IP — but Tailscale is what makes it work from anywhere.

---

## Install (use the app)

1. Grab the latest APK from **[Releases](https://github.com/stovie93/butler-app/releases)**
   (or build from source, below), copy it to your phone, and install (allow installs from
   the source when prompted).
2. Open Butler — the **first-run setup wizard** walks you through the rest: installing
   Tailscale (same account as the PC, VPN on), entering your gateway URL + token with a
   connection test, naming your butler (and telling it your name), and enabling
   notifications. Rerun it anytime from **⚙ Settings → 🚀 Setup wizard**.
   - **Gateway URL** — your PC's Tailscale Serve URL, e.g. `https://your-pc.your-tailnet.ts.net`
     (or `http://<lan-ip>:18789` on the same network).
   - **Token** — the gateway's `gateway.auth.token`.
3. Add the **Butler** widget from your launcher's widget list if you want one-tap status.

> **Push notifications caveat:** the release APKs are built against the maintainer's
> Firebase project, so pushes to a **closed** app (reminders, approvals, heartbeats) won't
> reach you with a release APK. Everything works while the app is open (it streams/polls).
> For real push, build from source with your own free Firebase project — see below.

---

## Build from source

Requires **Node 20+**, **JDK 17**, and the **Android SDK** (`ANDROID_HOME`). This is an
[Expo](https://expo.dev) SDK 56 / React Native 0.85 app (package `com.stovie93.butler`).

**First, provide `google-services.json`** — `app.json` references it, so prebuild fails
without one:

1. Create a free project at [console.firebase.google.com](https://console.firebase.google.com)
   (the same project the gateway's `fcm` config uses — see the
   [gateway SETUP guide](https://github.com/stovie93/butler-gateway/blob/master/SETUP.md)).
2. Add an **Android app** with package name `com.stovie93.butler`.
3. Download `google-services.json` into this repo's root (it's gitignored — never commit it).

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

### Release signing (optional but recommended)

Without any setup, release builds are signed with the throwaway debug keystore — fine for
trying it out, but anyone can forge an "update" for a debug-signed app. To sign with a real
key, create one at the repo root:

```bash
keytool -genkeypair -v -keystore release.keystore -alias butler \
  -keyalg RSA -keysize 4096 -validity 10000
```

…then create `release-signing.properties` next to it:

```properties
storeFile=release.keystore
storePassword=your-store-password
keyAlias=butler
keyPassword=your-key-password
```

The `plugins/withReleaseSigning.js` config plugin picks it up automatically at prebuild;
when the file is absent it falls back to debug signing. Both files are gitignored — never
commit them, and **back the keystore up somewhere safe**: if you lose it, phones with your
app installed will refuse every future update.

> Switching signers (debug → release, or a new keystore) changes the app's signature, so
> existing installs must be **uninstalled first** — app settings don't survive that, but the
> setup wizard gets you back in a minute and everything server-side is untouched.

### Project layout

```
App.tsx                  app shell: tab bar, header, settings/help modals, push wiring
src/api.ts               all gateway calls (chat stream, dispatch, approvals SSE, memory, …)
src/settings.ts          AsyncStorage: gateway URL/token, chat history, toggles
src/push.ts              FCM device-token registration
src/voice.ts             speech-to-text input + spoken replies
src/theme.ts             colors + small helpers
src/screens/             Chat, Activity (builds + Claude asks), Pc, MemoryHub (Memory+
                         Reminders), Approvals, Persona, ModelPicker, Notifications, Help
src/widgets/             home-screen widget + headless task handler
plugins/                 Expo config plugins (release signing)
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
