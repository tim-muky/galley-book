# Reel background music

Drop one or more **royalty-free, commercially-licensed** audio tracks here as
`.mp3` files (any filename). The reel renderer (`lib/marketing/reel-video.ts`)
picks one at random per reel and bakes it into the MP4.

If this folder has no `.mp3`, reels render **silently** — the pipeline still
works, it just has no music.

⚠️ Only add tracks whose licence you hold on file. Recommended sources (see
GAL-452): Bensound ("Sunny", "Coffee"), Uppbeat cooking/vlog tracks. Instagram's
in-app trending audio CANNOT be added via the API — it must be a file here.
