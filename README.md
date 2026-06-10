# Lettertjes leren

A voice-driven letter visualizer for young children learning their letters.

Say a sound, and the letter for that sound appears huge and colorful on the
screen. Hold the sound and the letter repeats — *AAAMMM* — scrolling off the
screen like a tape. After a few seconds of silence, the app fades back to the
question: **"Welke letter wil je zien?"**

**Try it:** https://sarahsrrombouts-art.github.io/lettertjes-leren

## How to use

1. Open the link (Chrome works best — Dutch speech recognition is built in)
2. Tap **"Tik om te luisteren"** and allow microphone access
3. Say a letter sound — the letter appears and repeats while you hold the sound
4. No microphone? Hold any letter key on the keyboard instead

## Features

- Dutch speech recognition (full alphabet, a–z)
- Each letter has its own friendly color
- Letters fill about a third of the screen
- Vibration feedback on phones
- Keyboard fallback for desktops
- Settings for letter case, size, font, colors, tempo, and silence timeout

## Running locally

No build step needed — it's plain HTML/CSS/JS with React included in
`vendor/`. Just open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8080
```

Note: the microphone requires HTTPS or localhost.
