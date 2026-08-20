# pi-mkaz-alert

A [Pi](https://pi.dev) extension that plays a sound alert when the main agent is fully settled and ready for input.

- **Success:** `pi-mkaz-alert-success.wav`
- **Error:** `pi-mkaz-alert-error.wav`
- **Abort:** `pi-mkaz-alert-abort.wav`

Pi waits for retries, compaction, and queued follow-ups before playing a sound. Print-mode workers are ignored.

## Install

```bash
pi install npm:pi-mkaz-alert
```

Restart Pi, or run `/reload` in an existing session.

Try it for one session without adding it to your settings:

```bash
pi -e npm:pi-mkaz-alert
```

## Configure sounds

Set `mkazAlert` in either Pi settings file:

- `~/.pi/agent/settings.json` — global
- `.pi/settings.json` — current project

Project settings override global settings for each sound independently.

```json
{
  "mkazAlert": {
    "success": "~/Sounds/success.wav",
    "error": "~/Sounds/error.wav",
    "abort": "~/Sounds/abort.wav"
  }
}
```

Use `"bell"` for a status to use the terminal bell instead of a sound file. A string applies one file to all statuses:

```json
{
  "mkazAlert": "~/Sounds/pi-alert.wav"
}
```

Paths may be absolute, start with `~/`, or be relative to the settings file that contains them. If a configured file does not exist, the bundled default is used. The bundled WAV files are included in the npm package.

## Environment variables

Settings take precedence over these environment variables:

```bash
export PI_MKAZ_ALERT_SUCCESS=/path/to/success.wav
export PI_MKAZ_ALERT_ERROR=/path/to/error.wav
export PI_MKAZ_ALERT_ABORT=/path/to/abort.wav
```

`PI_MKAZ_ALERT` is also supported as a fallback for all three statuses. Set any of these variables to `bell` to use the terminal bell.

## Playback

The extension uses `afplay` on macOS, `System.Media.SoundPlayer` through PowerShell on Windows, and `paplay` or `aplay` on Linux. If playback is unavailable, it falls back to the terminal bell.
