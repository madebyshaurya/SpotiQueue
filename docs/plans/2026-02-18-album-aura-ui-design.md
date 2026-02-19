# Album Aura UI Design

**Date:** 2026-02-18
**Branch:** feature/display-and-voting
**Status:** Approved

## Overview

Upgrade SpotiQueue's guest homepage (`/`) and display screen (`/display`) with three high-impact visual features to make the event experience feel alive and energetic.

## Features

### 1. Dynamic Color Theming ("Album Aura")

Extract the dominant color from the current track's album art using `colorthief` (runs entirely in the browser off the `<img>` element). Apply it as a CSS custom property (`--aura`) across both pages:

- **Guest page**: Radial gradient background on the NowPlaying card, progress bar accent, album art glow
- **Display screen**: Full-bleed gradient on the left "Now Playing" panel that shifts with each song
- Smooth CSS transitions between songs (500ms ease)
- Fallback to neutral grey when no album art or extraction fails

No backend changes needed.

### 2. Confetti + "Your Spot" Card

On successful queue addition:

- **Confetti burst** fires from top of screen using MagicUI `confetti` component (one-shot, not looping)
- **Your Spot card** appears below QueueForm:
  - Album art thumbnail + song name
  - Queue position: `#4 in queue`
  - Estimated wait: `~12 min away` (sum of durations of songs ahead in queue)
  - Border in the current aura color
- Your song gets a `you` badge in the queue list
- Card persists for the session; updates to most recent queued song

No backend changes needed — queue data already available from `/api/queue/current`.

### 3. Live Activity Feed (Marquee Ticker)

**Backend** (`GET /api/activity/recent`):
- Returns last 15 successful queue events from existing `queue_attempts` table
- Shape: `[{ track_name, artist_name, username, timestamp }]`
- Username fallback: use `username` from fingerprint record, else "Someone"
- No new DB columns needed

**Frontend**:
- MagicUI `<Marquee>` component scrolling at bottom of guest page
- Format: `✦ Jordan queued Mr. Brightside  ·  ✦ Someone queued Bohemian Rhapsody`
- Polls every 8 seconds
- Pauses on hover
- Same ticker appears on `/display` below the Up Next list (smaller, dimmer)

## Libraries

| Library | Purpose | Install |
|---|---|---|
| `colorthief` | Extract dominant color from album art | `npm install colorthief` |
| MagicUI `confetti` | Confetti burst animation | `npx magicui-cli add confetti` |
| MagicUI `marquee` | Scrolling ticker | `npx magicui-cli add marquee` |
| MagicUI `number-ticker` | Animated queue position number | `npx magicui-cli add number-ticker` |

## Files to Change

| File | Change |
|---|---|
| `server/routes/queue.js` (or new `activity.js`) | Add `GET /api/activity/recent` |
| `server/index.js` | Mount activity route |
| `client/src/components/NowPlaying.jsx` | Add colorthief color extraction, apply aura gradient |
| `client/src/components/QueueForm.jsx` | Fire confetti + show Your Spot card on success |
| `client/src/components/Queue.jsx` | Add `you` badge on user's queued song |
| `client/src/components/Display.jsx` | Add aura gradient to left panel, add marquee ticker |
| `client/src/components/ActivityFeed.jsx` | New component: marquee ticker |
| `client/src/App.jsx` | Pass aura color as shared state if needed |

## Admin Config Settings

New toggles in `Configuration.jsx` under a new "Visual & Social" card:

| Key | Default | Description |
|---|---|---|
| `aura_enabled` | `true` | Enable dynamic album-art color theming |
| `activity_feed_enabled` | `true` | Show live activity ticker on guest + display pages |
| `confetti_enabled` | `true` | Fire confetti when a song is queued |

All three added to `defaultConfig` in `server/db.js`. Frontend reads them from `/api/config/public/:key` on mount and gates each feature accordingly.

## Non-Goals

- No music visualizer bars (out of scope for this sprint)
- No restructuring of existing layout
- No server-side color extraction
- No storing activity events separately (reuse `queue_attempts`)
