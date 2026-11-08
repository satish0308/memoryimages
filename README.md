# 📸 MyMemoryPics

<div align="center">

![MyMemoryPics Banner](https://img.shields.io/badge/MyMemoryPics-World--Class%20Photo%20Platform-indigo?style=for-the-badge&logo=googlephotos&logoColor=white)

[![Docker](https://img.shields.io/badge/Docker-24.0+-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791?style=flat-square&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![Redis](https://img.shields.io/badge/Redis-7.2-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2%20App%20Router-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastEmbed CLIP](https://img.shields.io/badge/FastEmbed-CLIP%20ViT--B%2F32-orange?style=flat-square&logo=onnx&logoColor=white)](https://github.com/qdrant/fastembed)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?style=flat-square&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**An intelligent, privacy-first, self-hosted photo management platform engineered to solve digital memory fatigue.**  
Stream directly from Google Drive or local NAS with **zero-disk footprint**, offline ONNX AI search, multi-vector similarity discovery, smart spatiotemporal trip clustering, and client-side IndexedDB 0ms caching.

[Key Features](#-key-features) • [Architecture](#-system-architecture) • [Quickstart](#-quickstart--deployment) • [Google Drive Sync](#-google-drive-oauth-setup) • [API Reference](#-api-reference) • [Roadmap](#-roadmap--future-enhancements)

</div>

---

## 🌟 Vision & Philosophy

Modern smartphone cameras generate thousands of files: family vacations, rapid burst sequences, temporary receipts, bills, memes, and random screenshots. Over time, genuine memories get lost in a sea of digital clutter.

**MyMemoryPics** solves this through four core tenets:

1. **🛡️ Zero Auto-Deletion Guarantee**: Your files are sacred. Photos are **never** deleted automatically under any circumstances. All cleanups and triages require explicit user confirmation via protective safety modals.
2. **⚡ Zero-Disk In-Memory Streaming (9drive Architecture)**: Process and view full-resolution photos directly from Google Drive's high-speed CDN (`=s256`, `=s1080`) or stream originals directly through RAM without wasting gigabytes of local storage.
3. **🤖 100% Offline AI Intelligence**: All face detection, face clustering, multi-vector similarity, and CLIP semantic vector searches run completely on-device via lightweight ONNX neural networks. Zero third-party cloud AI APIs; zero tracking.
4. **📦 Pure Containerized Deployment**: 100% Docker-based stack. Zero host runtime dependencies, zero Python or Node installations required on the host system.

---

## ✨ Key Features

### 📅 Smart Interactive Timeline & 0ms Client Caching
- **Interactive Vertical Minimap Scrubber**: A sleek, floating glassmorphic rail on the right edge of the screen displaying distinct year ticks and month dots. Dragging or hovering pops up an interactive glassmorphic tooltip badge (e.g. `📅 Aug 2024 · 142 photos`) and smoothly navigates across 15,000+ photos in a split second with active section auto-tracking.
- **Client-Side Smart Caching (IndexedDB)**: Browser-native IndexedDB engine (`mymemorypics_thumbnail_cache`) pre-warms and caches thumbnails locally. Subsequent visits to your 14,000+ photo library load instantly with **0ms network latency** and full offline capability.
- **Apple Live Photos & Google Motion Photos**: Auto-detects paired Apple Live Photos (`.heic` + `.mov`) and Google Motion Photos (embedded MP4 micro-video in JPEGs). Timeline cards display an ambient iOS-style **`[LIVE]`** pulsing badge, cross-fading to a smooth muted video loop on hover, and full high-definition playback in the Lightbox viewer.
- **High-DPI Retina Thumbnails**: Ultra-crisp 512px WebP thumbnails rendered with Display P3 color profile preservation and smooth progressive blur backdrops.
- **Pinch-to-Zoom Timeline Scaling**: Switch seamlessly between **Day**, **Month**, and **Year** chronological zoom levels.
- **Dynamic Density Scaling**: Adjust grid density from a 10-column compact bird's-eye view to a 4-column detailed card layout.
- **People Presence Sub-Grouping & With/Without People Mode**: Segregate your library into **Photos with People** (portraits, family memories, selfies, gatherings) and **Photos without People** (nature, landscapes, scenery, travel vistas, architecture, receipts & objects). Includes 1-click filter pills (`All`, `👤 With People`, `🌿 Without People`), dynamic count badges, an optional dual-section split view (**"Group by People"**), and individual face count badges on cards (`👤 2`).
- **Universal 2D Drag-and-Select & Quick Sweeps**: Click and drag across any photo grid to draw a 2D selection marquee. Includes synchronous pointer release flushing for lightning-fast sweeps, row & column linear sweep auto-selection, single-click select/deselect toggle, and double-click to immediately open full-screen Lightbox.
- **Group & Batch Multi-Selection**: Select entire months, years, or custom batches with 1-click selection headers and a floating bulk action dock (Favorite, Recategorize, Location Tagging, AI Enhance, Parallel ZIP Export, Google Photos Query Export).

### 🌟 Nostalgia Flashbacks & Curated Memories Tab (`/memories`)
- **Story-Style Nostalgic Reels**: Dedicated high-engagement Memories hub featuring:
  - 🎂 **On This Day**: Highlights memories captured on today's calendar date across previous years (*"8 Years Ago Today"*).
  - 🍂 **This Week in the Past**: Temporal window clustering photos taken $\pm 4$ days from today in previous years.
  - 😄 **Smiles & Joy**: Candid laughing, smiling, and celebratory moments detected by facial emotion AI.
  - 🗺️ **Unforgettable Places & Journeys**: Scenic travel milestones grouped by distinct world destinations.
  - 🌅 **Golden Hour & Serene Views**: Atmospheric dusk, sunset, and nature landscapes.
- **Fullscreen Interactive Story Player**: Instagram and Apple Photos style multi-segment progress bars, tap-to-skip left/right, pause/play toggle, ambient background glow, and 1-click Lightbox inspector.

### 📺 Ambient TV & Digital Picture Frame Mode (`/kiosk`)
- **Immersive Fullscreen Display**: Clean, distraction-free digital picture frame mode designed to run 24/7 on smart TVs, living room tablets, or secondary monitors with zero UI clutter.
- **Smooth Ken Burns Motion**: Elegant panning and zooming transitions bringing static photos to life.
- **Ambient Widgets**: Live clock, date, photo location badge, and capture date overlay.
- **Configurable Controls**: Auto-hiding HUD with 5s, 8s, 15s, or 30s slide intervals, fullscreen toggle (`F`), and instant source switching (*All Photos*, *Favorites Only*, or *Places Only*).

### 🔗 Event Sharing, QR Code Generator & Public Guest Portal (`/share/[token]`)
- **1-Click Event Sharing**: Turn any album into a collaborative event album with a signed, tokenized public link (`/share/{token}`).
- **Built-in QR Code Generator**: Generate instant scannable QR codes for guests at weddings, parties, vacations, or family dinners.
- **Zero-Login Guest Portal**: Guests can view the photo wall, inspect full-resolution photos, or play ambient slideshows without creating an account.
- **Guest Upload Dropzone**: Guests can contribute their own photos directly into the event album from their smartphone or laptop with real-time transfer progress. Uploaded photos are safely saved directly to your local host storage (`./data/originals`).
- **1-Click Guest Streaming ZIP**: Guests can download the entire event collection in a single streaming ZIP archive with **0MB server disk overhead**.

### 🔍 Multi-Vector "Show Similar Photos" Engine & Discovery Tab (`/similar`)
- **4-Facet Multi-Modal Matching**: Select any reference photo to instantly discover matching memories across four independent AI dimensions:
  - 🎨 **Visual & Graphics**: 512-dimensional CLIP cosine similarity and 64-bit perceptual hash (pHash) Hamming distance.
  - 👤 **People & Faces**: ArcFace biometric feature matching and person clustering identification.
  - 📍 **Nearby Location**: Haversine geographic distance within 15km or identical landmark names.
  - 📅 **Same Outing**: Temporal proximity clustering ($\pm 4$ hours on the same date).
- **Dedicated Discovery Interface**: Opens in a dedicated tab (`/similar?id={media_id}`) featuring interactive facet filter pills, match confidence badges (`95% Visual Match`, `Same Person: Satish`, `150m away`), Lightbox preview, and batch actions.
- **Reliable Cross-Tab Navigation**: Built-in tab-closing focus return (`window.opener.close()`) with guaranteed fallback to the timeline gallery.

### ⚡ Dynamic Smart Albums (Saved AI Searches)
- **Self-Updating Rules Engine**: Create dynamic smart albums based on saved queries:
  - *"Beach sunsets"*, *"Weekend in Paris"*, *"Outdoor portraits of Person A & Person B"*, or *"Best 5-star shots of 2024"*.
- **Live Query Resolution**: When opened, dynamic albums query your library in real-time. Any newly ingested, synced, or indexed photo matching the rules auto-joins the album with zero manual curation.
- **Visual Status Badges**: Dynamic albums feature a glowing **`⚡ Smart AI`** badge across collection grids and album detail headers.

### 🪄 AI Photo Enhancement Studio & Batch Enhancer
- **Non-Destructive Parametric Engine**: Apply professional photo corrections without altering or overwriting your original master files:
  - 🪄 **Auto Magic Balance**: Neutralizes yellow tungsten/indoor color casts via Gray-World Auto White-Balance, applies adaptive LAB CLAHE contrast equalization, and boosts muted vibrance.
  - ☀️ **Shadow Recovery**: Targeted L-channel luminance mask lifting dark and heavily backlit faces without blowing out highlights.
  - 🌫️ **De-Haze & Clear Sky**: Dark Channel Prior contrast lift clearing atmospheric fog, haze, and washed-out skies.
  - 🔍 **2x ESRGAN Super-Resolution**: Offline ONNX neural upscaling for low-resolution or cropped photos.
  - ↩️ **Revert to Original**: 1-click instant reset back to untouched originals.
- **Batch AI Enhancement**: Apply any enhancement preset across entire selected batches, outings, or albums directly from the **Bulk Action Bar**.
- **Interactive Lightbox Studio**: Before/after interactive split slider, real-time CSS filter previews, and 1-click "Save as New Copy" or "Download Enhanced WebP".

### 🗂️ Smart Spatiotemporal Trips & Moments Auto-Grouper
- **Cohesive Multi-Day Vacations**: Spatial-temporal clustering connects photos taken in the same destination across consecutive days ($\le 36$h overnight delta, $\le 35$km Haversine distance) into cohesive named trips (e.g. *"Trip to Murudeshwara (Oct 17 - 18, 2026)"*, *"Trip to Bangalore"*).
- **Daytime Outings & Moments**: Continuous outing grouping for daytime bursts ($\le 4$h gap).
- **Noise Elimination**: Filters out isolated 1-2 photo noise (`min_photos=5`), reducing trips clutter from 415 fragmented items down to **133 curated stories** with rich titles, dates, and non-blurry covers.
- **Navigable Collections**: Full Lightbox traversal with Next/Prev chevron buttons, keyboard arrows (`ArrowLeft`, `ArrowRight`), and swipe support.

### ⭐ AI Aesthetics & "Best Shot" Selector
- **Multi-Metric Quality Scoring**: Evaluates each photo across four independent technical and human dimensions:
  - 🔍 **Sharpness & Focus**: Laplacian variance scoring normalized to detect camera shake vs. razor-sharp subject detail.
  - ☀️ **Lighting & Exposure Balance**: Luminance histogram standard deviation analysis penalizing dark pocket shots or blown highlights.
  - 😊 **Facial Expression & Smiles**: Detects joyful, smiling, and celebratory facial emotions with open-eye weighting.
  - 📐 **Detail & Resolution**: Megapixel density and clarity evaluation.
- **Gold Crown "Best Shot" Badge**: In any rapid burst sequence or duplicate cluster, the highest-ranking photo receives a prominent gold **`👑 BEST SHOT`** badge with aesthetic score tooltips directly on the timeline card.
- **1-Click "Switch to Best Shot"**: When inspecting alternate shots in Lightbox, a single click on **"⭐ Switch to Best Shot in Sequence"** jumps directly to the crown winner.
- **Automatic Blurry Photo Flagging**: Blurry shots are tagged with **`⚠️ Blurry`** warnings and provide a 1-click **"Move to Trash"** button for effortless cleanup.

### 🎬 Video Studio & Scrubbable Hover Previews
- **YouTube & Apple-Style Hover Scrubber**: Hovering your cursor over any video thumbnail on the timeline automatically starts a muted preview. Moving your mouse horizontally scrubs through the video in real time with an interactive progress track and a floating timestamp pill (e.g. `0:14 / 0:45`).
- **Precision Frame-by-Frame Stepper**: In Lightbox, step backward or forward by single frames (`◀ 1F`, `1F ▶` at 30fps / `0.033s`) to find the exact frame before capturing.
- **Adjustable Playback Speeds**: Toggle between `0.5x`, `1x`, `1.5x`, and `2x` video playback on the fly.
- **📸 1-Click "Capture Best Frame" Grabber**: Pause or scrub to any moment in a video and extract an ultra-crisp still photo.
  - **Save to Library**: Directly ingests the extracted frame into your photo feed with inherited timestamp, GPS coordinates, and camera metadata via `POST /api/v1/media/{id}/capture-frame`.
  - **Instant Download (JPG)**: Direct high-resolution still image download to your computer.

### 🎨 Creative Studio: 1-Click Collages & Print Layouts (`/collage`)
- **Dedicated Full-Screen Studio Route**: Select between 2 and 16 photos on the timeline and launch **"Collage Studio"** in a dedicated, full-screen tab or window (`/collage?ids=...`).
- **100% Viewport-Fitted Canvas**: True responsive CSS aspect-ratio viewport fitting ensuring zero scrolling, cut-offs, or clipping on any display size.
- **Instant Escape & Minimize Navigation**: Pressing the **`Esc`** key on your keyboard or clicking **"← Exit Studio"** instantly minimizes or closes the studio and returns to your gallery.
- **Versatile Layout Templates**:
  - **Classic Grid**: Even multi-photo grids (2x2, 2x3, 3x3) with configurable corner rounding and gaps.
  - **Split View**: 50/50 balanced side-by-side or stacked cards.
  - **Hero Focus**: 1 dominant lead hero photo alongside a vertical side stack.
  - **Triptych**: 3 vertical story slices.
  - **Polaroid Stack**: Authentic tilted polaroid frames with realistic white borders, drop shadows, and photo captions.
  - **Story (9:16)**: Smartphone-optimized story format with ambient photo blur.
  - **Print 4x6 (3:2)**: Standard photo print layout ready for printing.
- **Interactive Reordering**: Click any photo slot, then click another to instantly swap their positions.
- **Print-Ready High-Res Export**: Offscreen HTML5 canvas renders at 2160px+ resolution with automatic memory reclamation (`URL.revokeObjectURL`), supporting instant JPG downloads and direct **"Save to Library"**.

### 🪄 MyMemoryPics Pro Studio: Non-Destructive Darkroom & Raster Editor (`/edit`)
- **Pro Desktop Darkroom Layout**: Open any photo from Lightbox (press `E` or click **"Edit"**) into a dedicated full-screen professional studio inspired by **Darktable**, **RawTherapee**, **PhotoCraft**, and **GIMP**.
- **📷 Darktable & RawTherapee Pro Color Science (Phase A)**:
  - **Interactive Spline Tone Curves**: Direct Catmull-Rom cubic spline manipulation across **Composite RGB**, **Red**, **Green**, and **Blue** channels (S-Curves, High Contrast, Matte Film with lifted blacks).
  - **8-Channel HSL Color Mixer**: Individual Hue Shift, Saturation, and Luminance sliders for 8 spectral bands: *Red, Orange (Skin Tones), Yellow, Green, Aqua/Cyan, Blue (Skies), Purple, Magenta*.
  - **3-Way Color Grading Wheels**: Circular color wheels for **Shadows (Lift)**, **Midtones (Gamma)**, and **Highlights (Gain)** with luminance balance sliders.
  - **Real-Time RGB & Luma Histogram**: 256-bin live frequency distribution analyzer with **Blue shadow-clipping** ($RGB = 0$) and **Red highlight-clipping** ($RGB = 255$) alerts.
  - **Parametric Sliders**: Exposure, Contrast, Highlights, Shadows, Warmth (Amber/Blue), Tint (Green/Magenta), Saturation, Vibrance, Vignette.
- **🎨 GIMP & PhotoCraft Selective Retouch & Masking (Phase B)**:
  - **Selective Adjustment Masks**:
    - **Radial Spotlight Mask (`G`)**: Draggable circular/oval mask directly on canvas with feathering, invert toggle, and local exposure/warmth.
    - **Linear Horizon Gradient Mask (`G`)**: Draggable 2-point horizon line for sky and sunset balancing without affecting foreground subjects.
  - **Precision Retouch Brushes**:
    - **Spot Healing Brush (`J`)**: Click/paint over skin blemishes and dust specks with automated Poisson neighborhood texture synthesis.
    - **Dodge Brush (`O`)**: Selectively paint to brighten eyes, teeth, and highlights.
    - **Burn Brush (`O`)**: Selectively paint to deepen shadows and darken glaring reflections.
    - **Brush Controls**: Brush Diameter (`[` and `]`), Softness/Feather, and Flow/Opacity.
  - **Typography & Watermark Layer (`T`)**: Custom signature, fonts (Sans, Serif, Monospace, Script), size, color, opacity, and drop shadows.
  - **Crop & Geometry Transform (`C`)**: Aspect ratios (`1:1, 4:5, 16:9, 9:16, 4:3, 3:2, Freeform`), 90° rotation, horizontal mirror flip, vertical flip, and straighten slider.
- **⚡ 1:1 Photoshop & PhotoCraft Keyboard Shortcuts**:
  - `V` (Hand/Pan), `C` (Crop), `J` (Spot Healing), `O` (Dodge/Burn), `G` (Masks), `T` (Text), `[` / `]` (Brush Size), `\` (Split Compare), `Ctrl+Z` (Undo), `Ctrl+Y` (Redo), `Ctrl+S` (Save As New), `Esc` (Exit).
- **🔒 Non-Destructive Sidecar & Export**:
  - **Save as New Photo**: Calls `POST /api/v1/media/{id}/save-edit` with canvas rendering, ingesting into library with inherited EXIF and GPS metadata.
  - **Save Recipe Overlay**: Persists adjustments JSON recipe on existing photo with 1-click **"Revert to Original"** anytime.
  - **Direct Download**: Instant high-res JPG export to your computer.

### 🎞️ AI Highlight Reels ("Moments in Motion")
- **Cinematic Ken Burns Engine**: Smooth pan and zoom transitions across still photos with crossfade dissolves rendered on a 1080p HTML5 canvas.
- **Atmospheric Ambient Audio Soundtrack**: Built-in Web Audio API synthesizer generating peaceful pentatonic acoustic chords without external audio asset downloads.
- **Multi-Source Generation**:
  - **From /memories**: 1-click **"Cinematic Reel"** on any flashback story, anniversary trip, or curated album.
  - **From Bulk Selection**: Select 2 to 25 photos on timeline or albums → click **"🎬 Highlight Reel"** in `BulkActionBar`.
- **Customizable Speed & Overlays**: Choose between *Fast (2.5s)*, *Balanced (3.5s)*, and *Cinematic (5.0s)* pacing with animated title cards and date/location HUD.
- **1080p High-Def Video Export**: In-browser client recording via `MediaRecorder` API saving directly to library (`POST /api/v1/media/save-highlight-reel`) or downloading as an HD WebM/MP4 video.

### 📸 Rapid Burst Sequence & Duplicate Inspector
- **Perceptual Similarity Clustering**: High-speed localized BFS query ($\pm 20$s window) identifying near-identical rapid burst sequences and duplicate shots in 24ms.
- **Inspect vs Grid Modes**: Instant switching between 256px cached thumbnail grid and 1080p single inspection view with progressive adjacent prefetching.
- **1-Click Best Shot Selection**: AI automatically evaluates sharpness, focus, and smiles to recommend the best shot while allowing manual override.
- **Zero Auto-Deletion Guarantee**: Redundant shots are soft-deleted to Trash only upon explicit user confirmation.

### 👥 People & Face Management Studio & Visual Search (`/people`)
- **Visual Face Crop & ArcFace Library Search**: Draw a custom box or click any detected face in Lightbox or People studio to compute its 512-dimensional ArcFace biometric vector, query across 15,000+ photos via vector cosine similarity, and 1-click group matches into a named person profile.
- **Adaptive SCRFD & ArcFace Engine**: State-of-the-art SCRFD neural face detector running with adaptive confidence thresholding (`0.25` for document snips and screenshots; `0.30` for camera photos) and 20px minimum crop validation, ensuring embedded profile avatars, document portraits, and family snapshots are reliably detected without false positives.
- **AI "Merge Same Person" Suggestions**: Automatically identifies duplicate people profiles with match confidence percentages and 1-click merge.
- **Relationship Categorization**: Tag profiles with relationship types (**Family**, **Friends**, **Work**, **Partner**, **Self**, **Other**) and filter by relationship category pills.
- **Custom Cover Photos & Profile Visibility**: Set any photo in a person's gallery as their primary cover thumbnail, and toggle hiding/unhiding unwanted face detections.
- **Universal Multi-Select & Batch Actions**: Person photo galleries feature 2D drag-and-select, single-click toggle, double-click to view, batch trash, and Google Photos cloud search query generation.
- **UltraFace ONNX Fallback**: Sub-millisecond bounding box localization with strict norm thresholding ($>0.70$) and aspect ratio filtering (0.48–1.48) to reject false positives on water, textures, and backgrounds.
- **Default Hidden Bounding Boxes**: Face detection boxes remain hidden upon image preview and display only when explicitly toggled.
- **On-The-Fly WebP Face Avatars**: Dynamic 180×180 WebP headshots cropped in-memory from full-resolution photos.

### 📦 High-Speed Parallel Streaming ZIP Exporter
- **In-Memory Parallel Generation**: Multi-threaded parallel packaging (`ThreadPoolExecutor(max_workers=6)`) streaming directly into a ZIP archive without writing temporary files to server disk.
- **Dual Export Presets**:
  - **Original Masters**: Full uncompressed RAW/JPEG master files with complete EXIF metadata intact.
  - **Fast WebP Export (85% Smaller)**: 1080p high-definition WebP renditions optimized for instant messaging and web sharing.
- **Universal Availability**: Export from the Multi-Selection Floating Bar, Album collections, or Discovery `/similar` results.

### 🧹 Comprehensive Smart Triage Dashboard
- **6 Dedicated Review Trays**:
  - 📱 **Screenshots Tray**: Differentiates between text-only documents/snips and screenshots containing human faces ("Screenshots with People" vs. "Text Only").
  - 🧾 **Receipts & Bills Vault**: OCR-scanned invoices and documents kept separate from family memories.
  - 👥 **Duplicate Clusters**: Perceptual hash (pHash) groupings with 1-click "Keep Best Shot" auto-resolution, drag-and-select, and double-click inspection.
  - 🌫️ **Blurry Photos Tray**: Laplacian variance sharpness scoring to identify out-of-focus shots and pocket black frames.
  - 📦 **Large Files Tray**: Identifies heavy camera files (>3MB) for storage review.
  - 🗑️ **Memes & Junk Tray**: Separates viral media and forwarded graphics.
- **Google Photos Cloud Deletion Helper**: Exports sanitized, batch-optimized search strings (15 items per batch with auto-quotes for special characters and spaces) to easily locate and purge redundant media in Google Photos.
- **Reclaimable Storage Calculator**: Real-time disk space calculation (e.g. 13.8 GB reclaimable) with safe batch trash actions adhering to Zero Auto-Deletion.

### 📚 Albums & Smart Collections Hub
- **Collections Group "Select All & Batch Delete"**: Multi-select toolbar in custom albums, places, trips, and people with Select All, Deselect All, and Safe Batch Delete modal (choice between "Remove from Album" and "Move to Trash").
- **1-Click Auto-Curation**: Automatically generates dedicated albums from vacations and prominent outings with 1 click.
- **Interactive Photo Picker Modal**: Add library photos to any album with instant search, multi-select checkboxes, and "Select All".
- **Cinematic Ambient Slideshow**: Fullscreen presentation mode with gentle Ken Burns motion transitions and metadata HUD.

### 🗺️ Full-Screen Clustered Geo Map & Travel Routes
- **Interactive Leaflet Globe**: Full-screen world map clustering geotagged photos into proximity groups with count badges.
- **Slide-Up Photo Drawer**: Click any map cluster to open an interactive slide-up drawer of all photos captured at that exact location.
- **Chronological Travel Routes**: Animated journey path polyline tracing trips from stop to stop with total distance (km) and duration calculations.
- **Multi-Ring Density Heatmaps**: Visualizes travel hot-spots and frequently visited regions.

### 🪣 Self-Hosted S3 / MinIO AIStor Object Storage Engine
- **100% Self-Hosted & Private**: Docker-based MinIO AIStor service with seamless `--license /minio.license` attachment, S3 API on port `9004`, and Web Console on port `9005`.
- **Zero-Disk In-Memory Streaming**: Originals and WebP thumbnails stream directly through memory buffers without writing cached copies to `/data/originals`.
- **Direct S3 Ingestion & Bucket Management**: Ingest photos directly into the `mymemorypics` S3 bucket with on-the-fly metadata extraction and thumbnail generation.
- **Presigned URLs**: Secure, time-limited S3v4 presigned URL generation for sharing or private authenticated access.

### 🛡️ Automated WAL Backups & Point-in-Time Disaster Recovery
- **Zero-Downtime Online Snapshots**: Uses SQLite's native `sqlite3.backup` API to safely snapshot active databases in WAL mode without locking or downtime.
- **High-Ratio Gzip Compression**: Compresses database archives by over 70% with SHA-256 integrity verification.
- **Point-in-Time Restoration with Safety Rollback**: 1-click database restore with automatic pre-restore safety snapshot creation to guarantee zero data loss.
- **Direct S3 Backup Export**: 1-click or automated streaming export of database snapshots directly into `s3://mymemorypics/backups/`.
- **Automated Scheduling & Rolling Retention**: Configurable Daily or Weekly backup schedules with automatic pruning of old snapshots (keep last 7, 14, or 30).

### 🐘 PostgreSQL 16 + pgvector Dual-Database Engine
- **Dynamic Dual-Database Switching**: Switch effortlessly between SQLite (default offline local WAL) and PostgreSQL 16 with native `vector` extension via `DATABASE_URL`.
- **Native HNSW Vector Indexing**: Accelerates 512-dimensional CLIP multimodal search with `idx_media_embeddings_hnsw` (cosine distance operator `<=>`, `m=16, ef_construction=64`) for sub-10ms queries over 100,000+ photos.
- **1-Click Reflection Migration**: Copy all records, users, media, face detections, albums, and embeddings from SQLite to PostgreSQL (or vice versa) in seconds with foreign key hierarchy validation.

### ⚡ Asynchronous Background Worker Queue (Redis + WebSockets)
- **Dedicated Background Worker**: Offloads heavy tasks to `memorypics-worker`:
  - 1080p WebP rendition pre-generation for 5ms modal previews.
  - UltraFace face detection and ArcFace feature extraction.
  - FastEmbed CLIP multimodal vector indexing.
  - Spatiotemporal trip and outing clustering.
  - Automated WAL database backups.
- **Redis 7 Task Broker**: Redis queue with PubSub event broadcasting, cancellation triggers, and resilient in-memory fallback.
- **Sub-50ms Live WebSockets**: Full-duplex WebSocket stream (`/api/v1/tasks/ws`) broadcasting real-time progress percentages, step counters, and item logs.

---

## 🏗️ System Architecture

```
                                  +---------------------------------------+
                                  |         Next.js 14 Web Client         |
                                  |  (React / Tailwind / Lucide / Leaflet)|
                                  |  [IndexedDB Client Cache (0ms Rend)]  |
                                  +-------------------+-------------------+
                                                      |
                                           REST API / WebSockets (Live)
                                                      |
                                  +-------------------v-------------------+
                                  |       FastAPI Backend Engine          |
                                  | (Uvicorn / Python 3.11 / SQLAlchemy)  |
                                  +---------+-------------------+---------+
                                            |                   |
            +-------------------------------+                   +-------------------------------+
            |                                                                                   |
+-----------v---------------------------+                               +-----------------------v-----------------------+
|    Redis 7 Queue & Task Broker        |                               |          Storage & Databases                  |
|  - LPUSH/BLPOP Task Distribution      |                               |  - SQLite (WAL Mode) & PostgreSQL 16          |
|  - Real-Time PubSub Event Stream      |                               |  - Native pgvector HNSW Vector Index          |
|  - WebSocket Progress Relaying        |                               |  - MinIO S3 Object Storage (Self-Hosted)      |
+-------------------+-------------------+                               |  - Direct Google Drive CDN In-Memory Stream   |
                    |                                                   +-----------------------------------------------+
+-------------------v-------------------+
|      Async AI Worker Container        |
|  - 1080p WebP Rendition Pre-Generator|
|  - UltraFace ONNX (Face Detection)   |
|  - FastEmbed CLIP ViT-B/32 (Search)   |
|  - Face Vision Clustering Engine      |
|  - Automated WAL Database Backups     |
+---------------------------------------+
```

---

## 🚀 Quickstart & Deployment

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (v24.0+)
- [Docker Compose](https://docs.docker.com/compose/) (v2.20+)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/yourusername/mymemorypics.git
cd mymemorypics

# Copy environment template
cp .env.example .env
```

Edit `.env` if you wish to configure Google Drive OAuth or custom secrets:
```env
# Application Secrets
SECRET_KEY=generate_a_secure_random_key_here

# Port Bindings
BACKEND_PORT=8000
FRONTEND_PORT=3000

# Google Drive Sync (Optional - see setup below)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/sync/google/callback
```

### 2. Launch with Docker Compose
```bash
docker compose up -d --build
```

Access the application in your browser:
- **Frontend Web UI**: [http://localhost:3000](http://localhost:3000)
- **Discovery Explorer**: [http://localhost:3000/similar?id=1](http://localhost:3000/similar?id=1)
- **Interactive OpenAPI Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 🔑 Google Drive OAuth Setup

MyMemoryPics connects to your Google Drive to index and stream photos with zero local disk usage.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `MyMemoryPics`).
3. Under **APIs & Services > Library**, enable the **Google Drive API**.
4. Configure the **OAuth Consent Screen** (User Type: *External*, add your Google account as a Test User).
5. Navigate to **APIs & Services > Credentials** and click **Create Credentials > OAuth client ID**:
   - **Application Type**: Web application
   - **Name**: MyMemoryPics
   - **Authorized Redirect URIs**: `http://localhost:8000/api/v1/sync/google/callback`
6. Copy the **Client ID** and **Client Secret** into your `.env` file.
7. Restart the backend container: `docker compose restart backend`.
8. Open the UI at [http://localhost:3000/sync](http://localhost:3000/sync) and click **"Connect Google Drive"**.

---

## 📡 API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/media` | Paginated media items with multi-attribute filtering |
| `GET` | `/api/v1/media/timeline` | Media grouped by Day, Month, or Year scale |
| `GET` | `/api/v1/media/{id}/thumbnail` | Direct 307 CDN redirect or in-memory WebP thumbnail |
| `GET` | `/api/v1/media/{id}/view` | Streams full-resolution original image from Drive/disk |
| `GET` | `/api/v1/media/{id}/similar` | Multi-vector similarity search across Visual, Faces, Location, and Time |
| `GET` | `/api/v1/media/{id}/aesthetics` | AI aesthetic quality scoring breakdown (sharpness, exposure, expression, resolution) |
| `POST` | `/api/v1/media/{id}/set-best-shot` | Designates primary Best Shot for rapid burst sequence / manual override |
| `POST` | `/api/v1/media/{id}/capture-frame` | Extracts still frame from video (canvas/ffmpeg) & saves directly to library with EXIF |
| `POST` | `/api/v1/media/save-collage` | Ingests high-resolution canvas collage directly into library under Memory category |
| `POST` | `/api/v1/media/{id}/save-edit` | Ingests canvas-edited photo as new copy or updates recipe overlay |
| `PATCH`| `/api/v1/media/{id}/edit-recipe` | Updates non-destructive recipe parameters (adjustments, crop, preset) |
| `POST` | `/api/v1/media/{id}/revert-edit` | Reverts recipe adjustments back to original unedited state |
| `POST` | `/api/v1/media/save-highlight-reel`| Ingests recorded highlight reel video (MP4/WebM) into library |
| `POST` | `/api/v1/media/bulk-download` | High-speed parallel streaming ZIP archive (`original` or `optimized` presets) |
| `POST` | `/api/v1/media/batch-enhance` | Non-destructive batch AI enhancement (Auto Magic, Shadow Lift, De-Haze, Revert) |
| `POST` | `/api/v1/media/pregenerate-thumbnails` | Enqueues background worker job to pre-generate missing 1080p WebP renditions |
| `PATCH` | `/api/v1/media/batch-category` | Batch recategorizes photos (Memory, Screenshot, Bill, Meme) |
| `POST` | `/api/v1/media/batch-delete` | Safely soft-deletes media items to Trash (Zero Auto-Deletion guarantee) |
| `GET` | `/api/v1/search` | Multi-attribute keyword & OCR search |
| `GET` | `/api/v1/search?semantic=true` | Offline ONNX CLIP natural language semantic search |
| `GET` | `/api/v1/search/events` | Spatiotemporal event clustering ("Moments & Outings") |
| `GET` | `/api/v1/media/locations` | Geotagged coordinates and location names for map explorer |
| `GET` | `/api/v1/people` | Identified people with photo counts, relationship tags, and avatars |
| `GET` | `/api/v1/people/{id}/avatar` | On-the-fly square WebP face crop avatar |
| `GET` | `/api/v1/people/merge-suggestions` | AI duplicate people merge recommendations based on ArcFace centroid cosine distance |
| `POST` | `/api/v1/people/search-by-face` | 512-d ArcFace visual search by custom crop box across entire library |
| `POST` | `/api/v1/people/group-matched-faces` | 1-click group matched face crops into new or existing person profile |
| `PATCH` | `/api/v1/people/{id}` | Updates person name, relationship category (Family, Friends, Work, Partner, Self), and hidden state |
| `PATCH` | `/api/v1/people/{id}/cover` | Sets custom cover photo for person profile |
| `POST` | `/api/v1/people/auto-cluster` | Triggers offline ArcFace embedding clustering |
| `GET` | `/api/v1/albums` | Lists custom and dynamic smart albums with live photo counts |
| `POST` | `/api/v1/albums` | Creates standard custom albums or self-updating dynamic smart albums |
| `GET` | `/api/v1/albums/{id}` | Gets album details; live-resolves matching photos for dynamic albums |
| `POST` | `/api/v1/albums/export-zip` | Parallel streaming ZIP archive generation of an entire album |
| `GET` | `/api/v1/albums/collections/smart`| Returns auto-computed Places, Multi-Day Trips, and People |
| `POST` | `/api/v1/albums/auto-curate` | Automatically generates albums from prominent trips and places |
| `GET` | `/api/v1/albums/available-photos` | Lists library photos for the interactive photo picker |
| `POST` | `/api/v1/albums/{id}/photos` | Adds selected photo IDs to an album |
| `DELETE`| `/api/v1/albums/{id}/photos/{pid}`| Removes a photo from an album without deleting the photo |
| `GET` | `/api/v1/triage/overview` | High-level statistics on screenshots, bills, blurry shots, and reclaimable MB |
| `GET` | `/api/v1/triage/duplicates` | Rapid burst sequences and perceptual duplicate clusters |
| `POST` | `/api/v1/triage/resolve-duplicates`| Keeps selected best shot and soft-deletes redundant copies |
| `GET` | `/api/v1/storage/s3/status` | Live MinIO S3 connectivity, bucket stats, and console URLs |
| `GET` | `/api/v1/storage/s3/objects` | Real-time object listing across photos, thumbnails, backups |
| `POST` | `/api/v1/storage/s3/upload` | Direct multipart ingestion of photos into MinIO bucket |
| `POST` | `/api/v1/storage/s3/backup-database` | Exports compressed SQLite WAL snapshot directly into S3 |
| `GET` | `/api/v1/storage/s3/presigned/{key}`| Generates secure 1-hour S3v4 presigned URL for any object |
| `GET` | `/api/v1/system/backups` | Lists point-in-time database WAL snapshots |
| `POST` | `/api/v1/system/backups` | Creates instant zero-downtime compressed WAL backup |
| `POST` | `/api/v1/system/backups/{file}/restore`| Restores database snapshot with pre-restore safety backup |
| `GET` | `/api/v1/system/backups/{file}/download`| Downloads `.db.gz` compressed database backup archive |
| `GET` | `/api/v1/system/database/status` | Real-time dual-db status, dialect, table counts, HNSW index |
| `POST` | `/api/v1/system/database/migrate` | 1-click reflection migration between SQLite and PostgreSQL |
| `POST` | `/api/v1/tasks/dispatch` | Enqueues background worker tasks to Redis task broker |
| `GET` | `/api/v1/tasks/ws` | Full-duplex WebSocket stream for real-time background task progress |
| `POST` | `/api/v1/auth/login` | JWT user login |

---

## 💾 Storage Modes: In-Memory vs Disk Mount

MyMemoryPics implements the **9drive In-Memory Architecture**:

| Feature | `in_memory` (Default) | `disk_mount` |
| :--- | :--- | :--- |
| **Originals Location** | Google Drive Cloud / MinIO S3 | Local Disk Mount (`/data/originals`) |
| **Thumbnails** | Direct Google Drive CDN / In-Memory S3 WebP / Local IndexedDB Cache | Local WebP Cache (`/data/thumbnails`) |
| **Face Crop Avatars** | Rendered on-the-fly in RAM | Saved to Disk |
| **Local Disk Usage** | **~0 MB** (Reclaims 100% host disk space) | Full size of photo collection |
| **Approval Gate** | Required in `/settings` before any disk writes | Unrestricted local filesystem writes |

---

## 📁 Repository Structure

```
mymemorypics/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI REST routers (media, search, people, albums, triage, sync, tasks, auth, s3_storage, backups)
│   │   ├── models/          # SQLAlchemy models (media, person, album, user, sync)
│   │   ├── services/        # AI & Core services (similarity_engine, event_clustering, enhancement_engine, task_queue, quality_engine, clip_engine, face_engine)
│   │   ├── config.py        # Environment configuration
│   │   ├── database.py      # SQLite / PostgreSQL pgvector connection
│   │   ├── worker.py        # Isolated background AI worker process
│   │   └── main.py          # FastAPI application entrypoint & startup migrations
│   ├── Dockerfile           # Backend container definition
│   └── requirements.txt     # Python dependencies (FastAPI, ONNX, FastEmbed, Pillow, PyJWT, redis, psycopg2, boto3)
├── frontend/
│   ├── app/                 # Next.js App Router (/albums, /collage, /edit, /similar, /triage, /map, /people, /sync, /settings)
│   ├── components/          # Reusable UI modules (Timeline, Lightbox, BulkActionBar, AmbientSlideshow, Triage)
│   ├── utils/               # Frontend utilities (thumbnailCache.ts for IndexedDB 0ms caching)
│   ├── Dockerfile           # Multi-stage production Next.js container definition
│   └── package.json         # Frontend dependencies (React, Tailwind, Lucide, Leaflet)
├── data/                    # Persistent volume mounts (ignored by git)
│   ├── db/                  # SQLite database file & models
│   ├── backups/             # Local compressed WAL database snapshots
│   ├── originals/           # Local originals (when disk_mount mode enabled)
│   └── thumbnails/          # Local thumbnails cache
├── docker-compose.yml       # Production container orchestration
├── project.md               # Master technical plan & feature roadmap
└── README.md                # Comprehensive project documentation
```

---

## 🗺️ Roadmap & Delivered Enhancements

- [x] **🪄 In-Browser Non-Destructive Photo Editing Studio (`/edit`)**: Dedicated full-screen studio, parametric sliders (exposure, contrast, shadows, warmth, sharpness, vignette), crop/rotate/flip presets, color presets, live split before/after slider, and recipe persistence.
- [x] **🎞️ AI Highlight Reels ("Moments in Motion")**: High-definition Ken Burns animated reels with atmospheric synthesized ambient soundtrack, customizable pacing, title cards, and 1080p WebM/MP4 export to library and download.
- [x] **⭐ AI Aesthetics & "Best Shot" Selector**: Multi-metric evaluation (Laplacian sharpness, exposure balance, facial smiles/open eyes, resolution), gold `👑 BEST SHOT` crown badge, Lightbox sequence switcher, and blurry photo cleanup.
- [x] **🎬 Video Studio & Scrubbable Hover Previews**: Real-time cursor scrubbing on timeline thumbnails, frame-by-frame stepper, speed controls, and 1-click "Capture Best Frame" grabber saving directly to library.
- [x] **🎨 Creative Studio: 1-Click Collages & Print Layouts (`/collage`)**: Full-screen dedicated studio route with responsive 100% viewport fitting, `[Esc]` minimize/return, multi-layout templates (Grid, Split, Hero, Triptych, Polaroid, Story, Print), slot swapping, and 2160px+ high-res export.
- [x] **👤 Visual Face Crop & ArcFace Library Search (`/people`)**: Draw bounding box or click face to extract 512-d ArcFace vector, instant library-wide visual search, 1-click group into person profiles, relationship tagging, and AI merge suggestions.
- [x] **☁️ S3 / MinIO Object Storage Engine**: Self-hosted S3-compatible engine (MinIO) for zero-cloud private photo storage, RAM streaming, and disaster recovery archives.
- [x] **🛡️ Automated WAL Backups & Disaster Recovery**: Zero-downtime online SQLite backups, safety rollback, offsite exports, and rolling retention pruning.
- [x] **🐘 PostgreSQL + pgvector Dual-Database Engine**: Dynamic database driver supporting SQLite for personal libraries and PostgreSQL + pgvector with HNSW indexing for 100k+ photo enterprise scale.
- [x] **⚡ Asynchronous Background Task Queue (Redis + WebSockets)**: Offload heavy AI jobs with real-time UI progress bars and live cancellation triggers.
- [x] **✨ Multi-Vector "Show Similar Photos" Engine (`/similar`)**: 4-facet discovery tab matching across Visual/CLIP, Faces/ArcFace, GPS Location, and Outing Time in a new tab.
- [x] **⚡ Dynamic Smart Albums (Saved AI Searches)**: Self-updating rule-based albums driven by keywords, person IDs, and favorite flags.
- [x] **🪄 AI Photo Enhancement Studio & Batch Enhancer**: Parametric Gray-World Auto White-Balance, CLAHE contrast equalization, shadow recovery, and de-hazing for single photos and batches.
- [x] **🚀 Client-Side Smart Caching (IndexedDB)**: Browser-native local thumbnail caching for instant 0ms repeated renders and offline support.
- [x] **🗂️ Smart Spatiotemporal Trip Clustering**: Haversine distance and overnight temporal linking grouping multi-day vacations into cohesive named trips.
- [x] **📦 High-Speed Parallel Streaming ZIP Exporter**: Multi-threaded parallel packaging (`max_workers=6`) supporting `original` and `optimized` presets.
- [x] **📸 Rapid Burst & Duplicate Inspector**: 24ms localized BFS query, cached grid thumbnails, and smart Best Shot inspection with Zero Auto-Deletion protection.
- [x] **🔗 Public Shareable Album Links & Guest Gallery (`/share/[token]`)**: Tokenized public sharing URLs with instant QR code generation, guest upload dropzone, and 1-click in-memory streaming ZIP export.
- [x] **🎞️ Apple Live Photos & Short Video Motion**: Auto-detection of `.heic` + `.mov` and Google Motion Photos with hover-to-play timeline loops and high-res player.
- [x] **📅 Vertical Minimap Scrubber**: Interactive fast scrubber rail on timeline with dynamic year/month jump bubbles.
- [x] **🌟 Curated Memories Tab (`/memories`)**: Fullscreen story player with On This Day, This Week, and Joyful Moments highlights.
- [x] **📺 Ambient TV & Kiosk Mode (`/kiosk`)**: Fullscreen Ken Burns digital picture frame for smart TVs and tablets with live clock and date.
- [ ] **📱 PWA Offline App**: Mobile home-screen installation and background sync service worker.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
