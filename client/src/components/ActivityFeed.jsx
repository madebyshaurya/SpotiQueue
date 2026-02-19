import { useState, useEffect } from 'react'
import axios from 'axios'
import Marquee from './magicui/marquee'
import { Music } from 'lucide-react'

const POLL_MS = 8000

export default function ActivityFeed({ className = '' }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let cancelled = false

    const fetchActivity = async () => {
      if (cancelled) return
      try {
        const res = await axios.get('/api/queue/recent-activity', { timeout: 5000 })
        if (!cancelled) setItems(res.data?.activity ?? [])
      } catch {
        // keep stale data on error
      }
    }

    fetchActivity()
    const interval = setInterval(fetchActivity, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (items.length === 0) return null

  const pills = items.map((item, i) => (
    <span
      key={i}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground whitespace-nowrap mx-2"
    >
      <Music className="h-3 w-3 shrink-0 text-primary" />
      <span className="font-medium">{item.username ?? 'Someone'}</span>
      <span className="opacity-60">queued</span>
      <span className="font-medium">{item.track_name}</span>
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
