# Album Aura UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add dynamic album-art color theming, confetti + your-spot card, and live activity feed to the guest homepage and display screen.

**Architecture:** Three independent features: (1) `colorthief` extracts dominant RGB from album art and applies a CSS gradient throughout the page; (2) `canvas-confetti` fires on queue success and a self-contained "Your Spot" card polls the queue for position; (3) a new `/api/activity/recent` endpoint feeds a MagicUI `<Marquee>` ticker on both pages. All three features are admin-toggle gated via new config keys.

**Tech Stack:** React, Tailwind CSS, shadcn/ui, `colorthief`, `canvas-confetti`, MagicUI `marquee`, existing Express + sql.js backend.

---

### Task 1: Add admin config keys

Add three new feature-flag config keys so the admin can toggle each feature independently.

**Files:**
- Modify: `server/db.js` — add to `defaultConfig` array
- Modify: `client/src/components/Configuration.jsx` — add Visual & Social card

**Step 1: Add to `defaultConfig` in `server/db.js`**

Find the `defaultConfig` array (around line 138). Add after the `voting_enabled` entry:

```js
{ key: 'aura_enabled', value: 'true' },
{ key: 'activity_feed_enabled', value: 'true' },
{ key: 'confetti_enabled', value: 'true' }
```

**Step 2: Add admin toggles in `Configuration.jsx`**

After the closing `</Card>` of the "Queue Management" card (around line 87), add a new card:

```jsx
{/* Visual & Social */}
<Card>
  <CardHeader><CardTitle className="text-lg">Visual & Social</CardTitle></CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div><Label>Album Aura (Color Theming)</Label><p className="text-xs text-muted-foreground">Page accent color follows the current song's album art</p></div>
      <Switch checked={config.aura_enabled === 'true'} onCheckedChange={(v) => updateConfig('aura_enabled', v ? 'true' : 'false')} />
    </div>
    <div className="flex items-center justify-between">
      <div><Label>Activity Feed</Label><p className="text-xs text-muted-foreground">Show a scrolling ticker of recent song requests</p></div>
      <Switch checked={config.activity_feed_enabled === 'true'} onCheckedChange={(v) => updateConfig('activity_feed_enabled', v ? 'true' : 'false')} />
    </div>
    <div className="flex items-center justify-between">
      <div><Label>Confetti on Queue</Label><p className="text-xs text-muted-foreground">Burst of confetti when a song is added to the queue</p></div>
      <Switch checked={config.confetti_enabled === 'true'} onCheckedChange={(v) => updateConfig('confetti_enabled', v ? 'true' : 'false')} />
    </div>
  </CardContent>
</Card>
```

**Step 3: Build check**

```bash
cd client && npm run build
```
Expected: `✓ built` with no errors.

**Step 4: Commit**

```bash
git add server/db.js client/src/components/Configuration.jsx
git commit -m "add aura/activity/confetti admin config toggles"
```

---

### Task 2: Install dependencies

**Files:** `client/package.json`

**Step 1: Install npm packages**

```bash
cd client
npm install colorthief canvas-confetti
npm install -D @types/canvas-confetti
```

**Step 2: Add MagicUI Marquee component**

```bash
cd client
npx magicui-cli@latest add marquee
```

This creates `src/components/magicui/marquee.jsx` (or `.tsx`). If the CLI fails or isn't available, create the file manually:

```jsx
// src/components/magicui/marquee.jsx
import { cn } from '../lib/utils'

export default function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  ...props
}) {
  return (
    <div
      {...props}
      className={cn(
        'group flex overflow-hidden p-2 [--duration:40s] [--gap:1rem] [gap:var(--gap)]',
        {
          'flex-row': !vertical,
          'flex-col': vertical,
        },
        className
      )}
    >
      {Array(repeat).fill(0).map((_, i) => (
        <div
          key={i}
          className={cn('flex shrink-0 justify-around [gap:var(--gap)]', {
            'animate-marquee flex-row': !vertical,
            'animate-marquee-vertical flex-col': vertical,
            'group-hover:[animation-play-state:paused]': pauseOnHover,
            '[animation-direction:reverse]': reverse,
          })}
        >
          {children}
        </div>
      ))}
    </div>
  )
}
```

Then add the animation to `tailwind.config.js` (or check if it's already there):

```js
// in theme.extend.keyframes:
marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(calc(-100% - var(--gap)))' } },
'marquee-vertical': { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(calc(-100% - var(--gap)))' } },
// in theme.extend.animation:
marquee: 'marquee var(--duration) linear infinite',
'marquee-vertical': 'marquee-vertical var(--duration) linear infinite',
```

**Step 3: Build check**

```bash
cd client && npm run build
```
Expected: `✓ built`.

**Step 4: Commit**

```bash
git add client/package.json client/package-lock.json client/src/components/magicui/ client/tailwind.config.js
git commit -m "install colorthief, canvas-confetti; add MagicUI marquee"
```

---

### Task 3: Album Aura — color extraction hook

Create a reusable hook that loads an image with CORS and extracts its dominant color.

**Files:**
- Create: `client/src/hooks/useAuraColor.js`

**Step 1: Create the hook**

```js
// client/src/hooks/useAuraColor.js
import { useState, useEffect, useRef } from 'react'

export function useAuraColor(imageUrl) {
  const [rgb, setRgb] = useState(null)
  const prevUrlRef = useRef(null)

  useEffect(() => {
    if (!imageUrl || imageUrl === prevUrlRef.current) return
    prevUrlRef.current = imageUrl

    let cancelled = false
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl

    img.onload = async () => {
      if (cancelled) return
      try {
        const ColorThief = (await import('colorthief')).default
        const colorThief = new ColorThief()
        const [r, g, b] = colorThief.getColor(img)
        if (!cancelled) setRgb([r, g, b])
      } catch {
        if (!cancelled) setRgb(null)
      }
    }

    img.onerror = () => {
      if (!cancelled) setRgb(null)
    }

    return () => { cancelled = true }
  }, [imageUrl])

  // Return as CSS-ready string "r, g, b" or null
  return rgb ? rgb.join(', ') : null
}
```

Key details:
- Dynamic import of `colorthief` (it's a large lib, lazy-load it)
- `crossOrigin = 'anonymous'` is **required** — Spotify CDN supports CORS
- Returns `"r, g, b"` string for direct use in `rgba(${aura}, 0.15)` CSS expressions
- Skips re-extraction if `imageUrl` hasn't changed

**Step 2: Build check**

```bash
cd client && npm run build
```

**Step 3: Commit**

```bash
git add client/src/hooks/useAuraColor.js
git commit -m "add useAuraColor hook for album art color extraction"
```

---

### Task 4: Apply Aura to guest homepage

Lift the aura color into `ClientPage` and apply it as a subtle page-level gradient and as an accent on the NowPlaying card.

**Files:**
- Modify: `client/src/App.jsx` — use hook, apply page gradient, pass aura to NowPlaying
- Modify: `client/src/components/NowPlaying.jsx` — accept `auraColor` prop, apply to card

**Step 1: Update `ClientPage` in `App.jsx`**

Add the import at the top:
```js
import { useAuraColor } from './hooks/useAuraColor'
```

Inside `ClientPage`, after the existing state declarations, add:
```js
const auraColor = useAuraColor(nowPlaying?.album_art)
```

Wrap the `<main>` element with an inline style that applies the gradient:
```jsx
<main
  className="max-w-7xl mx-auto px-4 sm:px-6 py-6"
  style={auraColor ? {
    background: `radial-gradient(ellipse 80% 40% at 20% 0%, rgba(${auraColor}, 0.12) 0%, transparent 70%)`
  } : {}}
>
```

Also fetch the `aura_enabled` config and gate the color:
```js
const [auraEnabled, setAuraEnabled] = useState(false)
useEffect(() => {
  axios.get('/api/config/public/aura_enabled')
    .then(res => setAuraEnabled(res.data?.value === 'true'))
    .catch(() => {})
}, [])

const auraColor = useAuraColor(auraEnabled ? nowPlaying?.album_art : null)
```

Pass `auraColor` to NowPlaying:
```jsx
<NowPlaying track={nowPlaying} auraColor={auraColor} />
```

**Step 2: Update `NowPlaying.jsx`**

Add `auraColor` prop and apply it to the card:

```jsx
function NowPlaying({ track, auraColor }) {
```

On the outer `<div className="bg-card ...">`, add an inline style:
```jsx
<div
  className="bg-card text-card-foreground rounded-xl border border-border overflow-hidden transition-all duration-700"
  style={auraColor ? {
    boxShadow: `0 0 0 1px rgba(${auraColor}, 0.3), 0 4px 24px rgba(${auraColor}, 0.15)`
  } : {}}
>
```

On the progress bar fill `<div>`, replace the `bg-primary` with:
```jsx
style={track.is_playing && auraColor
  ? { width: `${Math.min(Math.max(progress, 0), 100)}%`, backgroundColor: `rgb(${auraColor})` }
  : { width: `${Math.min(Math.max(progress, 0), 100)}%` }
}
```
(Remove the `bg-primary` / `bg-muted-foreground/40` className from this div and control color purely via style.)

Also add a glow to the album art image:
```jsx
className="w-24 h-24 rounded-xl object-cover shadow-lg flex-shrink-0 transition-all duration-700"
style={auraColor ? { boxShadow: `0 0 20px rgba(${auraColor}, 0.4)` } : {}}
```

**Step 3: Build check**

```bash
cd client && npm run build
```

**Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/NowPlaying.jsx
git commit -m "apply album aura color theming to guest homepage"
```

---

### Task 5: Apply Aura to display screen

Give the `/display` route the same treatment but more dramatic — full-bleed gradient on the left "Now Playing" panel.

**Files:**
- Modify: `client/src/components/Display.jsx`

**Step 1: Add hook and config fetch**

At the top of `Display.jsx`, add:
```js
import { useAuraColor } from '../hooks/useAuraColor'
```

In the component, add state and config fetch:
```js
const [auraEnabled, setAuraEnabled] = useState(false)

useEffect(() => {
  axios.get('/api/config/public/aura_enabled', { timeout: 5000 })
    .then(res => setAuraEnabled(res.data?.value === 'true'))
    .catch(() => {})
}, [])

const auraColor = useAuraColor(auraEnabled ? nowPlaying?.album_art : null)
```

**Step 2: Apply to the left "Now Playing" panel**

Find the left panel div (currently `className="flex flex-col items-center justify-center lg:w-1/2 p-8 lg:p-14 gap-6"`). Add an inline style:

```jsx
<div
  className="flex flex-col items-center justify-center lg:w-1/2 p-8 lg:p-14 gap-6 transition-all duration-1000"
  style={auraColor ? {
    background: `radial-gradient(ellipse at center, rgba(${auraColor}, 0.25) 0%, transparent 70%)`
  } : {}}
>
```

Apply to the album art glow on Display's `AlbumArt` component — pass `auraColor` as prop to `AlbumArt` and add `boxShadow` on the `<img>` tag:
```jsx
// AlbumArt signature
function AlbumArt({ src, alt, size = 'lg', auraColor }) {
  // ...
  return (
    <img
      // ...existing props
      style={auraColor ? { boxShadow: `0 0 60px rgba(${auraColor}, 0.5)` } : {}}
    />
  )
}
```

Apply the progress bar color on Display too — find the green progress bar fill and change `bg-green-400` to use inline style:
```jsx
style={{
  width: `${Math.min(Math.max(progress, 0), 100)}%`,
  backgroundColor: auraColor ? `rgb(${auraColor})` : '#4ade80'
}}
```
(Remove `bg-green-400` className from that element.)

**Step 3: Build check**

```bash
cd client && npm run build
```

**Step 4: Commit**

```bash
git add client/src/components/Display.jsx
git commit -m "apply album aura color theming to display screen"
```

---

### Task 6: Activity feed backend

Add a lightweight endpoint that returns recent successful queue events.

**Files:**
- Modify: `server/routes/queue.js` — add `GET /recent-activity`
- Modify: `server/index.js` — no change needed (already mounted at `/api/queue`)

**Step 1: Add endpoint to `server/routes/queue.js`**

At the bottom of the file, before `module.exports`, add:

```js
// GET /api/queue/recent-activity
// Returns last 15 successful queue events for the activity feed
router.get('/recent-activity', (req, res) => {
  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        qa.track_name,
        qa.artist_name,
        f.username,
        qa.timestamp
      FROM queue_attempts qa
      LEFT JOIN fingerprints f ON qa.fingerprint_id = f.id
      WHERE qa.status = 'success' AND qa.track_name IS NOT NULL
      ORDER BY qa.timestamp DESC
      LIMIT 15
    `).all()

    const activity = rows.map(row => ({
      track_name: row.track_name,
      artist_name: row.artist_name,
      username: row.username || null,
      timestamp: row.timestamp
    }))

    res.json({ activity })
  } catch (error) {
    console.error('Activity feed error:', error)
    res.json({ activity: [] })
  }
})
```

**Step 2: Verify endpoint manually (optional)**

Start the server (`node server/index.js`) and hit `http://localhost:3000/api/queue/recent-activity`. Should return `{ activity: [] }` when no successful queues exist.

**Step 3: Build check** (server doesn't need building, just syntax)

```bash
node -e "require('./server/routes/queue.js'); console.log('OK')"
```
Expected: `OK`

**Step 4: Commit**

```bash
git add server/routes/queue.js
git commit -m "add GET /api/queue/recent-activity endpoint"
```

---

### Task 7: ActivityFeed component

Create a self-contained marquee component that polls and displays recent activity.

**Files:**
- Create: `client/src/components/ActivityFeed.jsx`

**Step 1: Create the component**

```jsx
// client/src/components/ActivityFeed.jsx
import { useState, useEffect } from 'react'
import axios from 'axios'
import Marquee from './magicui/marquee'
import { Music } from 'lucide-react'

const POLL_MS = 8000

export default function ActivityFeed({ className = '' }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false

    const fetch = async () => {
      if (cancelled) return
      try {
        const res = await axios.get('/api/queue/recent-activity', { timeout: 5000 })
        if (!cancelled) setItems(res.data?.activity ?? [])
      } catch {
        // keep stale data
      }
    }

    fetch()
    const interval = setInterval(fetch, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (items.length === 0) return null

  const pills = items.map((item, i) => (
    <span
      key={i}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap mx-2"
    >
      <Music className="h-3 w-3 shrink-0 text-primary" />
      <span className="font-medium">{item.username ? item.username : 'Someone'}</span>
      <span className="opacity-60">queued</span>
      <span className="font-medium truncate max-w-[140px]">{item.track_name}</span>
    </span>
  ))

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      <Marquee pauseOnHover className="[--duration:35s]">
        {pills}
      </Marquee>
    </div>
  )
}
```

**Step 2: Build check**

```bash
cd client && npm run build
```

**Step 3: Commit**

```bash
git add client/src/components/ActivityFeed.jsx
git commit -m "add ActivityFeed marquee component"
```

---

### Task 8: Wire ActivityFeed into guest page and display screen

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/Display.jsx`

**Step 1: Add to guest page (`App.jsx`)**

Add import:
```js
import ActivityFeed from './components/ActivityFeed'
```

Add state for the config:
```js
const [activityFeedEnabled, setActivityFeedEnabled] = useState(false)
useEffect(() => {
  axios.get('/api/config/public/activity_feed_enabled')
    .then(res => setActivityFeedEnabled(res.data?.value === 'true'))
    .catch(() => {})
}, [])
```

At the bottom of `ClientPage`'s return, just before the closing `</div>` of the `<main>`:
```jsx
{activityFeedEnabled && (
  <div className="mt-4 -mx-4 sm:-mx-6">
    <ActivityFeed />
  </div>
)}
```

Or place it as a sticky footer below the main content grid, inside the outer `<div className="min-h-screen">`:
```jsx
{activityFeedEnabled && (
  <div className="border-t border-border py-2 mt-6">
    <ActivityFeed />
  </div>
)}
```

**Step 2: Add to display screen (`Display.jsx`)**

Add import:
```js
import ActivityFeed from './ActivityFeed'
```

In the display screen's `useState` section, add:
```js
const [activityFeedEnabled, setActivityFeedEnabled] = useState(false)
```

Add a `useEffect` to fetch the config:
```js
useEffect(() => {
  axios.get('/api/config/public/activity_feed_enabled', { timeout: 5000 })
    .then(res => setActivityFeedEnabled(res.data?.value === 'true'))
    .catch(() => {})
}, [])
```

In the right panel, after the QR code section and before the closing `</div>`:
```jsx
{activityFeedEnabled && (
  <div className="border-t border-white/10 pt-3">
    <ActivityFeed className="opacity-60 text-white/50 [&_.magicui-marquee-item]:bg-white/5 [&_.magicui-marquee-item]:text-white/70" />
  </div>
)}
```

(Adjust classNames after seeing how the marquee renders — the Tailwind selectors above are approximate.)

**Step 3: Build check**

```bash
cd client && npm run build
```

**Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/Display.jsx
git commit -m "wire ActivityFeed into guest page and display screen"
```

---

### Task 9: Confetti + Your Spot card

Fire confetti on queue success and show the user their position in the queue.

**Files:**
- Modify: `client/src/components/QueueForm.jsx`

**Step 1: Add imports and state**

At the top of `QueueForm.jsx`, add:
```js
import confetti from 'canvas-confetti'
```

Inside `QueueForm`, add state:
```js
const [confettiEnabled, setConfettiEnabled] = useState(false)
const [myQueuedTrack, setMyQueuedTrack] = useState(null) // { name, artists, album_art, position, waitMs }
```

Add config fetch in the existing `useEffect` block or a new one:
```js
useEffect(() => {
  axios.get('/api/config/public/confetti_enabled')
    .then(res => setConfettiEnabled(res.data?.value === 'true'))
    .catch(() => {})
}, [])
```

**Step 2: Create a helper to get queue position**

Add this function inside `QueueForm`, before the JSX:
```js
const fetchQueuePosition = async (trackId) => {
  try {
    const res = await axios.get('/api/queue/current', { timeout: 5000 })
    const queue = res.data?.queue ?? []
    const idx = queue.findIndex(t => t.id === trackId)
    if (idx === -1) return { position: null, waitMs: null }
    const waitMs = queue.slice(0, idx).reduce((sum, t) => sum + (t.duration_ms ?? 0), 0)
    return { position: idx + 1, waitMs }
  } catch {
    return { position: null, waitMs: null }
  }
}
```

**Step 3: Create a confetti fire helper**

```js
const fireConfetti = () => {
  confetti({
    particleCount: 120,
    spread: 80,
    origin: { y: 0.4 },
    colors: ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6']
  })
}
```

**Step 4: Update `handleQueueTrack` to fire on success**

In the `try` block of `handleQueueTrack`, after the `toast(...)` success call, add:

```js
// Get the track object from search results
const track = searchResults.find(t => t.id === trackId)

if (confettiEnabled) fireConfetti()

// Fetch queue position (don't await — let it update asynchronously)
if (track) {
  fetchQueuePosition(trackId).then(({ position, waitMs }) => {
    setMyQueuedTrack({
      id: trackId,
      name: track.name,
      artists: track.artists,
      album_art: track.album_art,
      position,
      waitMs
    })
  })
}
```

Do the same in `handleQueueUrl`'s success path — but we won't have a track object. In that case, just fire confetti without the Your Spot card:
```js
if (confettiEnabled) fireConfetti()
setMyQueuedTrack(null) // URL queue doesn't have track metadata available
```

**Step 5: Add the Your Spot card JSX**

Add a helper function to format wait time:
```js
const formatWait = (ms) => {
  if (!ms) return null
  const mins = Math.round(ms / 60000)
  return mins < 1 ? 'up next' : `~${mins} min away`
}
```

In the return JSX, just before the closing `</Card>`, add:
```jsx
{myQueuedTrack && (
  <div className="mt-4 p-3 rounded-lg border-2 border-primary/30 bg-primary/5 flex items-center gap-3">
    {myQueuedTrack.album_art ? (
      <img src={myQueuedTrack.album_art} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
    ) : (
      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
        <Music className="h-4 w-4 text-muted-foreground" />
      </div>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold truncate">{myQueuedTrack.name}</p>
      <p className="text-xs text-muted-foreground truncate">{myQueuedTrack.artists}</p>
    </div>
    <div className="text-right shrink-0">
      {myQueuedTrack.position && (
        <p className="text-xs font-bold text-primary">#{myQueuedTrack.position} in queue</p>
      )}
      {myQueuedTrack.waitMs != null && (
        <p className="text-xs text-muted-foreground">{formatWait(myQueuedTrack.waitMs)}</p>
      )}
    </div>
  </div>
)}
```

**Step 6: Build check**

```bash
cd client && npm run build
```

**Step 7: Commit**

```bash
git add client/src/components/QueueForm.jsx
git commit -m "add confetti burst and Your Spot card on queue success"
```

---

### Task 10: "You" badge in Queue.jsx

Highlight the user's queued song in the queue list.

**Files:**
- Modify: `client/src/App.jsx` — pass `myTrackId` to Queue
- Modify: `client/src/components/Queue.jsx` — accept prop, render badge

**Step 1: Thread `myTrackId` through App.jsx**

In `ClientPage`, add state:
```js
const [myTrackId, setMyTrackId] = useState(null)
```

Pass a callback to `QueueForm` and use that to set `myTrackId`. Add prop to `QueueForm`:
```jsx
<QueueForm
  fingerprintId={fingerprintId}
  onQueued={(trackId) => setMyTrackId(trackId)}
/>
```

Pass to `Queue`:
```jsx
<Queue fingerprintId={fingerprintId} myTrackId={myTrackId} />
```

**Step 2: Update `QueueForm.jsx` to call `onQueued`**

Add `onQueued` to the props:
```js
function QueueForm({ fingerprintId, onQueued }) {
```

In `handleQueueTrack`'s success block, after the confetti/spot logic:
```js
if (onQueued) onQueued(trackId)
```

**Step 3: Update `Queue.jsx` to show "you" badge**

Add `myTrackId` to the props:
```js
export default function Queue({ fingerprintId, myTrackId }) {
```

In the track row, after the track name `<div>`, add:
```jsx
{myTrackId === track.id && (
  <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
    you
  </span>
)}
```

Place this inside the `<div className="flex-1 min-w-0">` block, next to the track name.

**Step 4: Build check**

```bash
cd client && npm run build
```

**Step 5: Push to update PR**

```bash
git add client/src/App.jsx client/src/components/Queue.jsx client/src/components/QueueForm.jsx
git commit -m "add you badge to user's queued song in queue list"
git push origin feature/display-and-voting
```

---

## Summary

| Task | Commit message |
|---|---|
| 1 | `add aura/activity/confetti admin config toggles` |
| 2 | `install colorthief, canvas-confetti; add MagicUI marquee` |
| 3 | `add useAuraColor hook for album art color extraction` |
| 4 | `apply album aura color theming to guest homepage` |
| 5 | `apply album aura color theming to display screen` |
| 6 | `add GET /api/queue/recent-activity endpoint` |
| 7 | `add ActivityFeed marquee component` |
| 8 | `wire ActivityFeed into guest page and display screen` |
| 9 | `add confetti burst and Your Spot card on queue success` |
| 10 | `add you badge to user's queued song in queue list` |
