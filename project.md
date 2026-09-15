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
- [ ] **Heavyweight ONNX Inference Pipeline**: Download and attach local offline models for ArcFace. `[Planned]`

### Phase 5: Semantic Natural Language Search & Event Grouping
- [x] **Spatiotemporal Event Clustering**: Automatic grouping of photos taken within time and location proximity into named events ("Moments & Outings"). `[Completed]`
- [x] **Multi-Attribute & Full-Text Search Engine**: Real-time query matching across filenames, OCR text, camera models, locations, categories, and people. `[Completed]`
- [ ] **CLIP Vector Search**: Multimodal embedding search enabling natural language queries like *"sunset at beach"*. `[Planned]`

### Phase 6: Dual Sync (Local Folders & Google Drive)
- [x] **Local Directory Watcher & Manual Scan**: API and UI button to trigger recursive scans of mounted folders. `[Completed]`
- [x] **Continuous inotify File Watcher**: Automatic background sync daemon on filesystem changes using `watchdog`. `[Completed]`
- [x] **Google Drive / Google Photos Integration**: OAuth 2.0 connection architecture, token persistence, and sync endpoint. `[Completed]`

### Phase 7: World-Class Nostalgia, Exploration & Collections (Next-Gen Features)
- [x] **"On This Day" / Flashback Engine**: Automatically surfaces memories taken on today's date from 1, 2, 3+ years ago. `[Completed]`
- [x] **Custom Smart Albums & Collections**: Dedicated album builder to organize custom sets (trips, events, projects). `[Completed]`
- [x] **Location & Map Explorer**: Interactive GPS clustering visualizing photos on a world map. `[Completed]`
- [ ] **Receipt & Document Text Inspector**: Live drawer displaying extracted OCR text and figures from scanned receipts. `[Planned]`

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

### Phase 10: Remaining & Planned World-Class Features
- [ ] **Receipt & Document Text Inspector (OCR)**: Live slide-out drawer displaying extracted OCR text, merchant/vendor, invoice date, and total amount for scanned receipts. `[Planned]`
- [ ] **Duplicate Resolver & Best-Shot Picker**: Side-by-side visual comparison for pHash duplicate clusters displaying image resolution, file size, and Laplacian sharpness score to pick and keep the best shot while moving redundant duplicates to trash. `[Planned]`
- [ ] **EXIF & Geotag Details Drawer in Lightbox**: Collapsible inspector in Lightbox showing camera body, lens, focal length, ISO, aperture, shutter speed, and an interactive mini-map pin. `[Planned]`
- [ ] **Interactive Face Tagging Overlay**: Bounding box overlays on detected faces in lightbox with manual name tagging and face clustering review. `[Planned]`
- [ ] **Advanced Smart Filter & Date Range Drawer**: Multi-parameter filter panel to filter by date range, camera make/model, orientation (portrait/landscape), and favorited status. `[Planned]`
- [ ] **Ambient Slideshow Mode**: Fullscreen memory playback with gentle Ken Burns motion transitions for selected albums and chronological memories. `[Planned]`
- [ ] **Offline ONNX Semantic CLIP Search**: Multimodal embedding search enabling natural language queries like *"sunset at beach"*, *"dog playing with ball"*. `[Planned]`

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
