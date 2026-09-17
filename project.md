# MyMemoryPics - Project Plan & Feature Roadmap

> **Status Legend**:
> - `[Completed]` - Built, verified, and ready.
> - `[In Progress]` - Currently under active development.
> - `[Planned]` - Scheduled for implementation.
> - `[Closed]` - Shelved or superseded.

---

## 1. Project Overview & Problem Statement
Every day, users take dozens of photos: precious memories, temporary screenshots, utility bills, receipts, memes, and burst shots. Over time, these accumulate into thousands of unsorted files where important moments are buried under temporary clutter.

**MyMemoryPics** is a world-class, Dockerized photo management platform engineered to solve photo accumulation fatigue through:
- **Intelligent Triage**: Automatically separating real memories from bills, documents, and temporary screenshots with auto-expiration policies.
- **AI Face & Person Identification**: Identifying and clustering people without manual tagging.
- **Smart Timeline & Event Grouping**: Spatiotemporal grouping by day, month, location, and detected events.
- **Natural Language Search**: Finding photos via semantic AI queries (*"picnic on the grass"*, *"beach sunset"*).
- **Dual Sync Engine**: Supporting both local storage directories (NAS/drives) and Google Drive/Photos sync.
- **100% Containerized Architecture**: Managed via Docker Compose with zero host runtime pollution.

---

## 2. System Architecture

```
                                  +-----------------------+
                                  |      Web Client       |
                                  | (Next.js / Tailwind)  |
                                  +-----------+-----------+
                                              |
                                     HTTP / REST / WS
                                              |
                                  +-----------v-----------+
                                  |     Backend API       |
                                  |   (FastAPI / Python)  |
                                  +-----+-----------+-----+
                                        |           |
            +---------------------------+           +--------------------------+
            |                                                                  |
+-----------v-----------+                                          +-----------v-----------+
|   AI & Media Worker   |                                          |   Storage & Sync      |
|  - Multi-Tier WebP    |                                          |  - Local Mounts       |
|  - AI Classifier      |                                          |  - Google Drive Sync  |
|  - Face Recognition   |                                          |  - SQLite / pgvector  |
|  - OCR & Duplicates   |                                          +-----------------------+
+-----------------------+
```

---

## 3. Master Feature Roadmap & Status Tracking

### Phase 1: Foundation & Containerized Infrastructure
- [x] **Local Git Repository Setup**: Initialized Git repo, `.gitignore`, and `main` branch. `[Completed]`
- [x] **Project Tracking & Documentation**: Master `project.md` tracking all requirements and milestones. `[Completed]`
- [x] **Docker & Docker Compose Stack**: `docker-compose.yml` linking Backend (FastAPI), Frontend (Next.js), and persistent volumes. `[Completed]`
- [x] **Data Persistence & Volumes**: Structured container mounts for `/data/originals`, `/data/thumbnails`, and `/data/db`. `[Completed]`
- [x] **Backend Baseline API**: FastAPI core with health check, configuration management, and initial DB schema. `[Completed]`
- [x] **Frontend Baseline UI**: Modern responsive shell with dark/light mode, navigation, and API integration. `[Completed]`

### Phase 2: Core Media Ingestion & Thumbnailing Engine
- [x] **Fast File Scanner**: Recursive scanner for local directories supporting JPEG, PNG, HEIC, WEBP, and RAW formats. `[Completed]`
- [x] **EXIF & Geocoding Extractor**: Parsing camera model, timestamps, ISO, and GPS coordinates into structured records. `[Completed]`
- [x] **Multi-Tier Thumbnail Generation**: Fast async creation of 256px grid thumbnails, 1080px preview WebP images, and pHash/blur analysis. `[Completed]`
- [x] **Timeline Grid UI**: Responsive chronological grid with date headers and full lightbox preview. `[Completed]`

### Phase 3: Smart Triage & Review Trays (Zero Auto-Deletion Policy)
- [x] **Zero Auto-Deletion Policy**: Photos are never deleted automatically under any circumstances; all deletions require explicit user action. `[Completed]`
- [x] **Semantic Image Classifier**: Metadata and heuristic model categorizing media into `Memory`, `Screenshot`, `Document / Bill`, and `Meme / Graphic`. `[Completed]`
- [x] **Screenshot Review Tray**: Groups screenshots (recent vs 30+ days old) for manual user inspection and selective cleanup. `[Completed]`
- [x] **Documents & Bills Vault**: Dedicated separation of receipts and invoices from personal memories. `[Completed]`
- [x] **Deduplication & Blur Detection**: Perceptual hashing (pHash) cluster detection and Laplacian variance sharpness scoring. `[Completed]`

### Phase 4: Face Recognition & Person Identification
- [x] **Face Detection & Clustering Schema**: Relational schema and API endpoints for People, Face Detections, and Person tagging. `[Completed]`
- [x] **People Management UI**: Dedicated "People" tab to view clusters, label identities, and review photos. `[Completed]`
- [x] **UltraFace ONNX Inference Pipeline**: Lightweight 1.2MB offline ONNX model with NMS bounding box detection and interactive tagging. `[Completed]`

### Phase 5: Semantic Natural Language Search & Event Grouping
- [x] **Spatiotemporal Event Clustering**: Automatic grouping of photos taken within time and location proximity into named events ("Moments & Outings"). `[Completed]`
- [x] **Multi-Attribute & Full-Text Search Engine**: Real-time query matching across filenames, OCR text, camera models, locations, categories, and people. `[Completed]`
- [x] **CLIP Vector Search**: FastEmbed ViT-B/32 multimodal embedding search enabling natural language queries like *"sunset at beach"*. `[Completed]`

### Phase 6: Dual Sync (Local Folders & Google Drive)
- [x] **Local Directory Watcher & Manual Scan**: API and UI button to trigger recursive scans of mounted folders. `[Completed]`
- [x] **Continuous inotify File Watcher**: Automatic background sync daemon on filesystem changes using `watchdog`. `[Completed]`
- [x] **Google Drive / Google Photos Integration**: OAuth 2.0 connection architecture, token persistence, and sync endpoint. `[Completed]`

### Phase 7: World-Class Nostalgia, Exploration & Collections (Next-Gen Features)
- [x] **"On This Day" / Flashback Engine**: Automatically surfaces memories taken on today's date from 1, 2, 3+ years ago. `[Completed]`
- [x] **Custom Smart Albums & Collections**: Dedicated album builder to organize custom sets (trips, events, projects). `[Completed]`
- [x] **Location & Map Explorer**: Interactive GPS clustering visualizing photos on a world map. `[Completed]`
- [x] **Receipt & Document Text Inspector**: Live drawer displaying extracted OCR text, currency figures, and vendor info from scanned receipts. `[Completed]`

### Phase 8: Modular Frontend Architecture & Build Chunking
- [x] **Timeline Component Deconstruction**: Chunked monolithic pages into standalone sub-components (`PhotoCard`, `DaySection`, `MomentsCarousel`, `LightboxModal`, `CategoryFilterBar`). `[Completed]`
- [x] **Code Splitting & Dynamic Imports**: Optimized bundle size and faster initial page loads via sub-section isolation. `[Completed]`
- [x] **Dedicated Feature Routes**: `/albums`, `/map`, `/triage`, `/people`, `/sync` isolated for maintainability. `[Completed]`

### Phase 9: Timeline Scaling, Pan & Zoom, and Bulk Operations
- [x] **Interactive Pan & Zoom in Lightbox**: Mouse wheel zoom, click-and-drag pan, 100% reset, and Left/Right keyboard navigation. `[Completed]`
- [x] **Timeline Scale Switcher (Days / Months / Years)**: Dynamic timeline grouping by Days, Months, or Years via backend `/api/v1/media/timeline?scale=day|month|year` and `ScaleSelector` UI. `[Completed]`
- [x] **Grid Density Zoom (Compact / Normal / Large)**: Multi-column responsive grid scaling (from 10-column compact bird's-eye view to 4-column detailed cards). `[Completed]`
- [x] **Group Selection ("Select All in Month/Year/Day")**: Batch select all photos within any given month, year, or day header with 1 click. `[Completed]`
- [x] **Individual Checkmark Badges**: Select photos individually or across multiple groups. `[Completed]`
- [x] **Bulk Export / Copy (ZIP)**: In-memory streaming ZIP archive generator endpoint (`POST /api/v1/media/bulk-download`) and UI 1-click export. `[Completed]`
- [x] **Bulk Category Reorganization**: Mass recategorize selected media into Memories, Screenshots, Bills/Docs, or Memes (`PATCH /api/v1/media/batch-category`). `[Completed]`
- [x] **Floating Bulk Action Bar**: Floating dock with Add to Album, Export ZIP, Favorite, Change Category, Delete Selected, and Clear Selection. `[Completed]`

### Phase 10: World-Class Intelligence & Interactive Explorations
- [x] **Receipt & Document Text Inspector (OCR)**: Live slide-out drawer displaying extracted OCR text, merchant/vendor, invoice date, monetary totals, 1-click text copy, and reclassification. `[Completed]`
- [x] **Duplicate Resolver & Best-Shot Picker**: Side-by-side visual comparison modal for pHash duplicate clusters displaying image resolution, file size, Laplacian sharpness score, "Recommended Best Shot" badge, and 1-click "Keep Best & Trash Duplicates". `[Completed]`
- [x] **EXIF & Geotag Details Drawer in Lightbox**: Collapsible inspector in Lightbox showing camera body, lens, focal length, ISO, aperture, shutter speed, resolution, format, and an interactive OpenStreetMap card with direct links to Google & Apple Maps. `[Completed]`
- [x] **Interactive Face Tagging Overlay & UltraFace ONNX**: Bounding box overlays on detected faces with hover labels, inline "Who is this?" naming/reassignment, manual face tagging, and library-wide offline ONNX face detector. `[Completed]`
- [x] **Advanced Smart Filter & Date Range Drawer**: Multi-parameter filter panel to filter by date range presets/custom dates, camera make/model, orientation (portrait/landscape/square), favorites, geotagged, and blur status. `[Completed]`
- [x] **Ambient Cinematic Slideshow Mode**: Fullscreen memory playback with gentle Ken Burns motion transitions, autoplay timers (3s, 5s, 8s, 12s), auto-hiding playback controls, and metadata HUD. `[Completed]`
- [x] **Offline ONNX Semantic CLIP Search**: Multimodal embedding search enabling natural language queries like *"sunset at beach"*, *"dog playing with ball"* running 100% offline with FastEmbed CLIP ViT-B/32. `[Completed]`
- [x] **Image Quality Degradation Resolution**: Upgraded to 512px High-DPI thumbnails, 2560px WebP previews, Display P3 ICC profile preservation, and uncompressed progressive original loading in Lightbox. `[Completed]`

### Phase 11: Multi-User Authentication, Private Vaults & Shareable Public Links
- [x] **JWT User Authentication & Password Hashing**: Secure login/registration system (`/login`, `/register`) using bcrypt and stateless JWT authentication tokens (modeled on 9drive auth architecture). `[Completed]`
- [x] **Multi-User Account Switcher & Profiles**: UserNavMenu avatar dropdown, instant family member account switching, and profile updating (`PATCH /api/v1/auth/me`). `[Completed]`
- [ ] **Multi-User Private Libraries & Family Shared Spaces**:
  - *Data Segregation*: Multi-tenant schema where individual photos and personal favorites are tied to specific user accounts (`user_id`).
  - *Role-Based Access Control*: `admin` (can manage storage settings, all users, Google Drive sync) vs `member` (can view/upload personal memories).
  - *Family Shared Vault*: Collaborative family pools and shared collections where family members can contribute photos together. `[Planned]`
- [ ] **Public Shareable Album Links & Guest Presentation Gallery**:
  - *Tokenized Public Sharing*: Generate secure, cryptographically random share URLs (e.g. `/share/[token]`) for any custom album or smart collection.
  - *Security & Access Control*: Optional PIN / password protection, read-only permission flags, and auto-expiration options (7 days, 30 days, or permanent).
  - *Guest Experience*: Distraction-free, responsive guest landing page allowing family and friends to view high-resolution photo grids, swipe through slideshows, and download full-resolution ZIP archives without creating an account. `[Planned]`

### Phase 12: Creative Media Studio, Motion Live Photos & PWA Ingestion
- [ ] **Non-Destructive Web Editing Studio**:
  - *In-Browser Parametric Editing*: Real-time canvas adjustments for exposure, contrast, saturation, highlights, shadows, sharpness, and warmth without downloading files locally.
  - *Transform & Geometry*: 90° clockwise/counterclockwise rotation, horizontal/vertical flip, and aspect-ratio crop presets (1:1 Square, 16:9 Cinema, 4:3 Classic, Freeform).
  - *Aesthetic Filter Presets*: One-click photo styles including Vivid, Warm Nostalgia, Cool Slate, Noir B&W, and Vintage Film.
  - *Non-Destructive Guarantee*: Zero alteration to authoritative originals on Google Drive; edit recipes are persisted as JSON metadata overlays or exported as new edited copies. `[Planned]`
- [ ] **Apple Live Photos & Short Video Motion Support**:
  - *Motion Detection & Pairing*: Auto-association of paired still images and short video clips (`.heic` + `.mov` or `.jpg` + `.mp4`) sharing identical base timestamps and EXIF capture signatures.
  - *Hover & Long-Press Motion*: Dynamic hover-to-play motion preview on timeline thumbnails with a subtle "LIVE" badge indicator.
  - *Inline Silent Player*: Silent looping video playback in the Lightbox viewer with toggle for high-definition audio. `[Planned]`
- [x] **Interactive Travel Route & Geographic Heatmap**: Chronological journey visualization on the map connecting geotagged photos from vacations and road trips with distance and duration statistics, numbered waypoints, and multi-ring density heatmap layer. `[Completed]`
- [ ] **PWA & Chunked Multi-File Uploader**: Progressive Web App manifest for home screen install, service worker offline caching of recent memories, and drag-and-drop resume-enabled chunked uploader. `[Planned]`

### Phase 13: Database Scalability, Async Workers & Disaster Recovery
- [x] **Automated WAL Backups & Disaster Recovery (Free, Local, Docker)**:
  - Zero-downtime online SQLite backups using `sqlite3.backup` API with gzip compression.
  - Point-in-time database restoration with automated pre-restore safety snapshot.
  - Offsite backup downloads and direct `.db.gz` file upload restore.
  - Configurable auto-backup scheduling (Daily/Weekly) and rolling retention pruning (keep last 7/14/30 snapshots). `[Completed]`
- [x] **PostgreSQL + `pgvector` Dual-Database Engine**:
  - Dynamic database driver toggle via `DATABASE_URL` supporting SQLite (default offline local WAL) and PostgreSQL 16 with native `vector` extension.
  - Native HNSW vector index acceleration (`idx_media_embeddings_hnsw` on 512-dim CLIP vectors with `vector_cosine_ops`, `m=16, ef_construction=64`) for sub-10ms semantic search.
  - Reflection-based 1-click database migration engine (`/api/v1/system/database/migrate`) copying all users, sync sources, media, faces, albums, associations, and vector embeddings between SQLite and PostgreSQL with zero data loss.
  - Interactive Database & Vector Engine control panel in `/settings` (real-time telemetry, table record counts, HNSW index status & rebuilding, connection testing, and migration modal). `[Completed]`
- [x] **Asynchronous Background Task Queue (Redis + Async Worker) & WebSockets**:
  - Offload heavy AI jobs (CLIP vector indexing, UltraFace face detection, vision clustering, S3 sync, and WAL database backups) to a dedicated `memorypics-worker` container.
  - Redis 7 (`memorypics-redis`) task queue broker with PubSub event broadcasting, multi-worker task distribution, and graceful in-memory queue fallback.
  - Real-time WebSocket endpoint (`/api/v1/tasks/ws`) with single-loop architecture streaming live percentage meters, step counters, and item logs to client browsers.
  - Global `TaskQueueDrawer` and Header task indicator with 1-click AI job dispatchers, live cancel buttons, and recent task execution history. `[Completed]`

### Phase 14: Multi-Cloud Object Storage & Universal Sync
- [x] **S3 / MinIO Object Storage Engine (Self-Hosted MinIO)**:
  - Fully self-hosted local Docker MinIO integration via S3 API (`boto3`) on port 9002 and Web Console on port 9001.
  - S3 storage service & REST API endpoints (`/api/v1/storage/s3/...`) for bucket initialization, photo ingestion, direct in-memory streaming, and presigned URLs.
  - Zero-downtime database backup export directly to `s3://mymemorypics/backups/`.
  - In-memory on-the-fly streaming for thumbnails (`/thumbnail`), originals (`/view`), and bulk ZIP downloads (`/bulk-download`) with zero local disk footprint (`SourceType.S3_MINIO`).
  - Interactive management UI in `/settings` (telemetry cards, bucket explorer, direct upload, presigned link generation) and `/sync` (MinIO S3 storage card). `[Completed]`
- [ ] **Nextcloud & WebDAV Sync Connector**:
  - Bi-directional sync adapter for self-hosted instances running Nextcloud, ownCloud, or Synology/QNAP NAS over WebDAV. `[Planned]`
- [ ] **Safe Read-Only External Drive Auto-Scanner**:
  - Auto-detection and indexing of mounted USB flash drives, external hard drives, and camera SD cards in strictly read-only mode without file alteration. `[Planned]`

### Phase 15: Progressive Web App, Mobile Experience & Ingestion
- [ ] **PWA Manifest & Offline Service Worker**:
  - Installable Progressive Web App for iOS and Android home-screens with standalone fullscreen experience.
  - Service worker offline cache preserving recently viewed memories and album metadata. `[Planned]`
- [ ] **Mobile Touch Gestures**:
  - Fluid pinch-to-zoom gestures scaling the timeline grid between Day, Month, and Year zoom levels.
  - Swipe-down-to-dismiss gesture on the Lightbox image viewer matching native mobile gallery apps. `[Planned]`
- [ ] **Mobile Background Camera Auto-Upload**:
  - Resume-enabled chunked uploader syncing camera photos in the background over Wi-Fi. `[Planned]`

### Phase 16: AI Nostalgia, Story Highlights & Best Shot Selection
- [ ] **Automated Memory Highlight Reels ("Moments in Motion")**:
  - Auto-generated weekly and monthly flashback stories (e.g. *"Weekend Outing in Pottalkulam"*, *"Best of Autumn"*) with Ken Burns pan transitions. `[Planned]`
- [ ] **Burst Best-Shot Auto-Picker**:
  - Automatic detection of burst sequences with multi-factor scoring (sharpness, facial expression, composition) to spotlight the best photo and collapse redundant shots. `[Planned]`

---

## 4. Changelog & Progress History

| Date | Milestone / Action | Details | Status |
| :--- | :--- | :--- | :--- |
| 2026-09-15 | Initial Setup & Git Init | Initialized local git repo, configured `.gitignore`, defined main branch | `[Completed]` |
| 2026-09-15 | Master Project Plan | Authored `project.md` with complete architecture and phase breakdown | `[Completed]` |
| 2026-09-15 | Docker Compose Stack | Created `docker-compose.yml`, backend Dockerfile, frontend Dockerfile, `.env.example` | `[Completed]` |
| 2026-09-15 | Core Media Engine & Ingestion | Implemented EXIF extractor, multi-tier WebP thumbnailing, and recursive scanner | `[Completed]` |
| 2026-09-15 | Smart Triage & Clutter Engine | Added screenshot auto-expiry, bills vault, duplicate pHash clusters, and blur detection | `[Completed]` |
| 2026-09-15 | Google Drive & Local Sync | Implemented Google OAuth 2.0 flow and local library scan endpoints | `[Completed]` |
| 2026-09-15 | Frontend Web Application | Built Next.js UI with Timeline, Smart Triage dashboard, People tab, and Sync manager | `[Completed]` |
| 2026-09-15 | Event Stories & Live Search | Added Spatiotemporal event clustering ("Moments & Outings") and real-time multi-attribute search | `[Completed]` |
| 2026-09-15 | Inotify Background Watcher | Integrated `watchdog` daemon to automatically detect and ingest dropped files into `/data/originals` | `[Completed]` |
| 2026-09-15 | Dockerfile Fix | Fixed frontend Dockerfile COPY syntax and ensured public directory creation | `[Completed]` |
| 2026-09-15 | OAuth PKCE Fix | Persisted and passed PKCE code_verifier with state handling for Google token exchange | `[Completed]` |
| 2026-09-15 | OAuth Scope Relax & Drive Sync | Enabled OAUTHLIB_RELAX_TOKEN_SCOPE, implemented Google Drive photo download and auto-redirect | `[Completed]` |
| 2026-09-15 | "On This Day" & Nostalgia | Built Flashback engine surfacing memories from 1, 2, 5+ years ago on today's calendar date | `[Completed]` |
| 2026-09-15 | Smart Albums & Collections | Added Album data model, `/api/v1/albums` endpoints, and dedicated `/albums` UI page | `[Completed]` |
| 2026-09-15 | Location & Map Explorer | Added GPS coordinates extractor, `/api/v1/media/locations` endpoint, and `/map` UI explorer | `[Completed]` |
| 2026-09-15 | Modular Component Chunking | Deconstructed monolithic timeline into modular sub-components for optimized Next.js build chunking | `[Completed]` |
| 2026-09-15 | Interactive Pan & Zoom | Implemented smooth wheel zooming, drag-to-pan, 100% reset, and keyboard navigation in Lightbox | `[Completed]` |
| 2026-09-15 | Timeline Scale & Density Zoom | Added Year/Month/Day scaling, grid thumbnail density controls (Compact/Normal/Large), and group select | `[Completed]` |
| 2026-09-15 | Bulk Actions & ZIP Export | Built BulkActionBar, streaming ZIP download endpoint, batch category updates, and safe batch deletion | `[Completed]` |
| 2026-09-15 | Moments & Outings Story Modal | Implemented interactive click-to-view modal with event photo grid, 1-click ZIP export, and select all | `[Completed]` |
| 2026-09-16 | Image Quality Resolution | 512px Retina thumbnails @ Q90, 2560px previews @ Q92, ICC color profile preservation, uncompressed originals | `[Completed]` |
| 2026-09-16 | Offline ONNX Semantic CLIP | FastEmbed ViT-B/32 multimodal vectors, cosine similarity matrix engine, natural language search toggle | `[Completed]` |
| 2026-09-16 | Duplicate Resolver & Bill OCR | Side-by-side sharpness/resolution comparison, 1-click best shot picker, extracted receipt text inspector | `[Completed]` |
| 2026-09-16 | EXIF & OpenStreetMap Drawer | Integrated camera body/lens specs, exposure badges, OpenStreetMap embed, and external maps links | `[Completed]` |
| 2026-09-16 | Interactive Face Tagging | UltraFace ONNX model (84 faces detected), interactive bounding box overlays, and inline name editor | `[Completed]` |
| 2026-09-16 | Smart Filters Drawer | Filter by date presets/custom range, camera brand, orientation, favorites, and sharpness | `[Completed]` |
| 2026-09-16 | Ambient Cinematic Slideshow | Fullscreen Ken Burns motion playback, speed selector (3s-12s), auto-hiding controls, and metadata HUD | `[Completed]` |
| 2026-09-16 | JWT Authentication & Multi-User | Added User model, bcrypt hashing, PyJWT tokens, /auth endpoints, UserNavMenu, and /login page | `[Completed]` |
| 2026-09-16 | In-Memory & Google Drive Cache | In-memory temp processing, direct Drive CDN caching (9drive pattern), storage approval gate, and /settings UI | `[Completed]` |
| 2026-09-16 | Clustered Geo Map Explorer | Full-screen interactive Leaflet map, proximity clustering, squircle pins with photo counts, and slide-up drawer | `[Completed]` |
| 2026-09-16 | Offline Vision Face Auto-Cluster | Clustered 86 faces into 9 distinct people, on-the-fly 180px WebP face crop avatars, Person Gallery Modal | `[Completed]` |
| 2026-09-16 | Comprehensive Smart Triage | 6 dedicated trays (Screenshots, Bills, Duplicates, Blurry, Large Files, Junk) with 1-click batch resolvers | `[Completed]` |
| 2026-09-16 | Travel Routes & Geo Heatmap | Chronological journey paths with total distance/duration, stop waypoints, and multi-tier density heatmap | `[Completed]` |
| 2026-09-16 | Local Disk Storage Purge | Cleared 191MB of cached originals/thumbnails, enabled zero-disk in-memory fallback for avatars/streaming/ZIP | `[Completed]` |
| 2026-09-16 | Albums & Smart Collections Hub | Built Smart Collections API (/collections/smart), 1-click auto-curation, interactive Photo Picker modal, and full collection viewer | `[Completed]` |
| 2026-09-16 | Automated WAL Backups & Disaster Recovery | Native sqlite3.backup online zero-downtime backups, gzip compression, point-in-time restore, safety rollback, and UI dashboard in /settings | `[Completed]` |
| 2026-09-16 | S3 / MinIO Object Storage Engine | 100% self-hosted MinIO S3 integration, boto3 streaming engine, zero-disk photo ingestion/thumbnails, WAL backup exports, presigned URLs, and Settings/Sync UI dashboards | `[Completed]` |
| 2026-09-16 | PostgreSQL + pgvector Dual-DB Engine | Dynamic SQLite/PostgreSQL toggle, native pgvector HNSW 512-dim index, reflection migration engine, and /settings control panel | `[Completed]` |
| 2026-09-16 | Google CDN Proxy & Memory Cache | Server-side proxying & in-memory caching to resolve Google Drive 429 referer block | `[Completed]` |
| 2026-09-16 | Fullscreen Lightbox & Event Stop | Elevated z-index to z-[99999], edge-to-edge toggle, and event stop across Map & People galleries | `[Completed]` |
| 2026-09-17 | Async Background Worker & WebSockets | Dedicated Redis 7 task worker, real-time WebSocket progress bars, global Task Drawer, and 1-click AI job dispatchers | `[Completed]` |
| 2026-09-17 | Full Codebase Scan & Routing Audit | Reordered People API routes, resolved /register page export structure via AuthView, audited all 9 frontend routes & 30 backend endpoints | `[Completed]` |
