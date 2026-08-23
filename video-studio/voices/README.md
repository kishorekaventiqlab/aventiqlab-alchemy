# Voice reference files

This directory holds reference audio for Chatterbox V3's voice conditioning. Everything under here except this README and `.gitkeep` placeholders is gitignored: reference voices are personal/private recordings and should not be committed to a shared repo.

## `aventiqlab-narrator/`

Place a clean reference recording at:

```
voices/aventiqlab-narrator/reference.wav
```

Guidelines for the reference clip (per [Chatterbox's voice-conditioning approach](https://github.com/resemble-ai/chatterbox)):
- 10-30 seconds, one speaker, minimal background noise
- Mono, any common sample rate (Chatterbox resamples internally)
- Natural speaking pace — reads a few full sentences rather than isolated words

Then set `CHATTERBOX_VOICE_REF=voices/aventiqlab-narrator/reference.wav` in `video-studio/.env`.

If no reference file is present, Chatterbox generation falls back to the library's built-in default voice — this is what this repo's experiment (`docs/experiments/chatterbox-v3-tts.md`) used, since no AVENTIQLAB reference recording existed at the time.
