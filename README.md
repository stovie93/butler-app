# Butler

Android app + home-screen widget that remote-controls the AI on your PC over
Tailscale. The local model handles chat; real coding work is dispatched to Claude
Code, which builds autonomously while you're away. No ports exposed to the internet.

## Screens (tabbed GUI)

- **Chat** — talk to the local model (streaming replies). Slash commands work here too.
- **Build** — dispatch a coding job (project + task, optional "continue last session"),
  see live computer status, and keep the PC awake on demand (1h / 2h / 4h / Off).
- **Jobs** — every dispatched build with status (running / done / failed); tap for its log.
- **Help** — in-app setup + usage guide.

## How it works

```
Phone (Butler app / widget)
   │  HTTPS over Tailscale (private tailnet)
   ▼
OpenClaw gateway
   ├─ /v1/chat/completions      (chat, OpenAI-compatible, token auth)
   └─ /api/v1/code-dispatch     (build/jobs/awake/status — code-dispatch plugin)
   │
   ├─ Ollama (local model) for chat
   └─ Claude Code (Fable) for dispatched builds
```

- Chat context is held server-side, keyed by the `user` field (`butler-phone`).
- Chat streams replies (SSE) via `expo/fetch`.
- Build/Jobs/Awake call the `code-dispatch` gateway plugin's JSON HTTP route.
- The widget's **⟳ Status** button fires a one-shot request from a headless task.

## Icon

`scripts/gen-icon.mjs` renders the full icon set from one SVG glyph (requires the
`sharp` dev dependency): `node scripts/gen-icon.mjs`. Re-run `expo prebuild` after.

## First-run setup (in the app's settings sheet)

- **Gateway URL**: the PC's Tailscale Serve HTTPS URL, e.g. `https://smithpc.<tailnet>.ts.net`
- **Token**: `gateway.auth.token` from `~/.openclaw/openclaw.json` on the PC

Use **Test** to verify connectivity before saving.

## Building the APK

Requires JDK 17 and the Android SDK (`%LOCALAPPDATA%\Android\Sdk`).

```powershell
npx expo prebuild --platform android   # regenerate ./android after config changes
cd android; .\gradlew assembleRelease
# APK lands at android\app\build\outputs\apk\release\app-release.apk
```

Install by copying the APK to the phone (or `adb install`).
