# 📸 MyMemoryPics

<div align="center">

![MyMemoryPics Banner](https://img.shields.io/badge/MyMemoryPics-World--Class%20Photo%20Platform-indigo?style=for-the-badge&logo=googlephotos&logoColor=white)

[![Docker](https://img.shields.io/badge/Docker-24.0+-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20%2B%20pgvector-336791?style=flat-square&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2%20App%20Router-black?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![FastEmbed CLIP](https://img.shields.io/badge/FastEmbed-CLIP%20ViT--B%2F32-orange?style=flat-square&logo=onnx&logoColor=white)](https://github.com/qdrant/fastembed)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?style=flat-square&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

**An intelligent, privacy-first, self-hosted photo management platform engineered to solve digital memory fatigue.**  
Stream directly from Google Drive or local NAS with **zero-disk footprint**, offline ONNX AI search, clustered travel routes, and smart clutter triage.

[Key Features](#-key-features) • [Architecture](#-system-architecture) • [Quickstart](#-quickstart--deployment) • [Google Drive Sync](#-google-drive-oauth-setup) • [API Reference](#-api-reference) • [Roadmap](#-roadmap--future-enhancements)

</div>

---

## 🌟 Vision & Philosophy

Modern smartphone cameras generate thousands of files: family vacations, burst shots, temporary receipts, bills, memes, and random screenshots. Over time, genuine memories get lost in a sea of digital clutter.

**MyMemoryPics** solves this through four core tenets:

1. **🛡️ Zero Auto-Deletion Guarantee**: Your files are sacred. Photos are **never** deleted automatically under any circumstances. All cleanups and triages require explicit user confirmation.
2. **⚡ Zero-Disk In-Memory Streaming (9drive Architecture)**: Process and view full-resolution photos directly from Google Drive's high-speed CDN (`=s256`, `=s1080`) or stream originals directly through RAM without wasting gigabytes of local storage.
3. **🤖 100% Offline AI Intelligence**: All face detection, face clustering, and CLIP semantic vector searches run completely on-device via lightweight ONNX neural networks. Zero third-party cloud AI APIs; zero tracking.
4. **📦 Pure Containerized Deployment**: 100% Docker-based stack. Zero host runtime dependencies, zero Python or Node installations required on the host system.

---

## ✨ Key Features

### 📅 Smart Interactive Timeline
- **High-DPI Retina Thumbnails**: Ultra-crisp 512px thumbnails rendered with Display P3 color profile preservation and smooth progressive loading.
- **Pinch-to-Zoom Timeline Scaling**: Switch seamlessly between **Day**, **Month**, and **Year** chronological zoom levels.
- **Dynamic Density Scaling**: Adjust grid density from a 10-column compact bird's-eye view to a 4-column detailed card layout.
- **Group & Batch Multi-Selection**: Select entire months, years, or custom batches with 1-click selection headers and a floating bulk action dock (Favorite, Recategorize, ZIP Export, Add to Album).

### 🔍 Offline ONNX Semantic CLIP Search & Fast Filters
- **Natural Language Search**: Type natural queries like *"sunset at the beach"*, *"dog playing with ball"*, or *"green mountains"* powered by offline FastEmbed CLIP ViT-B/32 multimodal embeddings.
- **Multi-Faceted Search Engine**: Filter simultaneously by camera body, lens model, captured date ranges, ISO, location, orientation (portrait/landscape/square), and blur status.
- **Document & Receipt OCR Search**: Search within text extracted from receipts, bills, and document photos.

### 👥 People & Face Auto-Clustering
- **UltraFace ONNX Inference**: Lightweight offline ONNX model detecting faces with sub-millisecond bounding box localization.
- **Vision Embedding Clustering**: Cosine similarity clustering groups face crops into identified individuals without manual tagging.
- **On-The-Fly WebP Face Avatars**: Dynamic 180×180 WebP headshots cropped in-memory from full-resolution photos.
- **People Management Studio**: Dedicated interactive people gallery, inline name assignment, face merging, and untagged face review trays.

### 🗺️ Full-Screen Clustered Geo Map & Travel Routes
- **Interactive Leaflet Globe**: Full-screen world map clustering geotagged photos into proximity groups with count badges.
- **Slide-Up Photo Drawer**: Click any map cluster to open an interactive slide-up drawer of all photos captured at that exact location.
- **Chronological Travel Routes**: Animated journey path polyline tracing trips from stop to stop with total distance (km) and duration calculations.
- **Multi-Ring Density Heatmaps**: Visualizes travel hot-spots and frequently visited regions.

### 🧹 Comprehensive Smart Triage Dashboard
- **6 Dedicated Review Trays**:
  - 📱 **Screenshots Tray**: Separate screenshots with age filter (<30 days vs older) and snooze options.
  - 🧾 **Receipts & Bills Vault**: OCR-scanned invoices and documents kept separate from family memories.
  - 👥 **Duplicate Clusters**: Perceptual hash (pHash) groupings with 1-click "Keep Best Shot" auto-resolution.
  - 🌫️ **Blurry Photos Tray**: Laplacian variance sharpness scoring to identify out-of-focus shots.
  - 📦 **Large Files Tray**: Identifies heavy camera files (>3MB) for storage review.
  - 🗑️ **Memes & Junk Tray**: Separates viral media and forwarded graphics.
- **Zero Auto-Deletion**: Safely review and keep or archive files with batch selection.

### 📚 Albums & Smart Collections Hub
- **Smart System Collections**: Automatically aggregates your library into visited places, spatiotemporal outings, and people.
- **1-Click Auto-Curation**: Automatically generates dedicated albums from vacations and prominent outings with 1 click.
- **Interactive Photo Picker Modal**: Add library photos to any album with instant search, multi-select checkboxes, and "Select All".
- **Cinematic Ambient Slideshow**: Fullscreen presentation mode with gentle Ken Burns motion transitions and metadata HUD.
- **1-Click Streaming ZIP Export**: Download any album or custom selection as a compressed ZIP file generated in RAM on-the-fly.

### 🪣 Self-Hosted S3 / MinIO Object Storage Engine
- **100% Self-Hosted & Private**: Local Docker-based MinIO service (S3 API on port `9002`, Web Console on port `9001`) with zero public cloud dependencies.
- **Zero-Disk In-Memory Streaming**: Originals and WebP thumbnails stream directly through memory buffers without writing cached copies to `/data/originals`.
- **Direct S3 Ingestion**: Ingest photos directly into the `mymemorypics` S3 bucket with on-the-fly metadata extraction and thumbnail generation.
- **Presigned URLs**: Secure, time-limited S3v4 presigned URL generation for sharing or private authenticated access.
- **Integrated Dashboards**: Dedicated telemetry cards, bucket object explorer, and upload actions in both `/settings` and `/sync`.

### 🛡️ Automated WAL Backups & Point-in-Time Disaster Recovery
- **Zero-Downtime Online Snapshots**: Uses SQLite's native `sqlite3.backup` API to safely snapshot active databases in WAL mode without locking or downtime.
- **High-Ratio Gzip Compression**: Compresses database archives by over 70% with SHA-256 integrity verification.
- **Point-in-Time Restoration with Safety Rollback**: 1-click database restore with automatic pre-restore safety snapshot creation to guarantee zero data loss.
- **Direct S3 Backup Export**: 1-click or automated streaming export of database snapshots directly into `s3://mymemorypics/backups/`.
- **Automated Scheduling & Rolling Retention**: Configurable Daily or Weekly backup schedules with automatic pruning of old snapshots (keep last 7, 14, or 30).
- **Offsite Downloads & Upload Restore**: Download `.db.gz` archives for offsite disaster recovery or upload existing backup files to restore.

### 🐘 PostgreSQL 16 + pgvector Dual-Database Engine
- **Dynamic Dual-Database Switching**: Switch effortlessly between SQLite (default offline local WAL) and PostgreSQL 16 with native `vector` extension via `DATABASE_URL`.
- **Native HNSW Vector Indexing**: Accelerates 512-dimensional CLIP multimodal search with `idx_media_embeddings_hnsw` (cosine distance operator `<=>`, `m=16, ef_construction=64`) for sub-10ms queries over 100,000+ photos.
- **1-Click Reflection Migration**: Copy all records, users, media, face detections, albums, and embeddings from SQLite to PostgreSQL (or vice versa) in seconds with foreign key hierarchy validation.
- **Settings Telemetry & Index Management**: Dedicated UI dashboard displaying active dialect, connection health, table row counts, pgvector version, and 1-click HNSW index rebuilds.

### 🔒 JWT Authentication & Multi-User Switcher
- **Stateless JWT Auth**: Secure password hashing with bcrypt and tokenized session management.
- **Family Account Switcher**: Instant user profile switching directly from the navigation bar.
- **Storage Gatekeeper**: Application settings page allowing administrators to toggle storage modes between `in_memory` and `disk_mount`.

---

## 🏗️ System Architecture

```
                                  +---------------------------------------+
                                  |         Next.js 14 Web Client         |
                                  |  (React / Tailwind / Lucide / Leaflet)|
                                  +-------------------+-------------------+
                                                      |
                                             HTTP / REST / WebP
                                                      |
                                  +-------------------v-------------------+
                                  |       FastAPI Backend Engine          |
                                  | (Uvicorn / Python 3.11 / SQLAlchemy)  |
                                  +---------+-------------------+---------+
                                            |                   |
            +-------------------------------+                   +-------------------------------+
            |                                                                                   |
+-----------v---------------------------+                               +-----------------------v-----------------------+
|          Offline AI Services          |                               |          Storage & Ingestion                  |
|  - UltraFace ONNX (Face Detection)   |                               |  - Direct Google Drive CDN Streaming          |
|  - FastEmbed CLIP ViT-B/32 (Search)   |                               |  - In-Memory RAM Caching (9drive Pattern)     |
|  - pHash & Laplacian Variance (Blur)  |                               |  - SQLite Database (WAL Mode)                 |
|  - Tesseract OCR (Receipt Text)       |                               |  - Inotify Filesystem Watcher (watchdog)      |
+---------------------------------------+                               +-----------------------------------------------+
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
| `POST` | `/api/v1/media/bulk-download` | Streams in-memory compressed ZIP of selected media IDs |
| `PATCH` | `/api/v1/media/batch-category` | Batch recategorizes photos (Memory, Screenshot, Bill, etc.) |
| `GET` | `/api/v1/search` | Multi-attribute keyword & OCR search |
| `GET` | `/api/v1/search?semantic=true` | Offline ONNX CLIP natural language semantic search |
| `GET` | `/api/v1/search/events` | Spatiotemporal event clustering ("Moments & Outings") |
| `GET` | `/api/v1/media/locations` | Geotagged coordinates and location names for map explorer |
| `GET` | `/api/v1/people` | Identified people with photo counts and avatars |
| `GET` | `/api/v1/people/{id}/avatar` | On-the-fly square WebP face crop avatar |
| `POST` | `/api/v1/people/auto-cluster` | Triggers offline CLIP face embedding clustering |
| `GET` | `/api/v1/albums` | Lists albums with auto-curation if empty |
| `GET` | `/api/v1/albums/collections/smart`| Returns auto-computed Places, Trips, and People |
| `POST` | `/api/v1/albums/auto-curate` | Automatically generates albums from trips and places |
| `GET` | `/api/v1/albums/available-photos` | Lists library photos for the interactive photo picker |
| `POST` | `/api/v1/albums/{id}/photos` | Adds selected photo IDs to an album |
| `DELETE`| `/api/v1/albums/{id}/photos/{pid}`| Removes a photo from an album without deleting the photo |
| `GET` | `/api/v1/storage/s3/status` | Live MinIO S3 connectivity, bucket stats, and console URLs |
| `GET` | `/api/v1/storage/s3/objects` | Real-time object listing across photos, thumbnails, backups |
| `POST` | `/api/v1/storage/s3/upload` | Direct multipart ingestion of photos into MinIO bucket |
| `POST` | `/api/v1/storage/s3/backup-database` | Exports compressed SQLite WAL snapshot directly into S3 |
| `GET` | `/api/v1/storage/s3/presigned/{key}`| Generates secure 1-hour S3v4 presigned URL for any object |
| `GET` | `/api/v1/system/backups` | Lists point-in-time database WAL snapshots |
| `POST` | `/api/v1/system/backups` | Creates instant zero-downtime compressed WAL backup |
| `GET` | `/api/v1/system/backups/schedule` | Gets automated backup schedule and retention settings |
| `POST` | `/api/v1/system/backups/schedule` | Updates automated backup preferences (Daily/Weekly) |
| `POST` | `/api/v1/system/backups/{file}/restore`| Restores database snapshot with pre-restore safety backup |
| `GET` | `/api/v1/system/backups/{file}/download`| Downloads `.db.gz` compressed database backup archive |
| `POST` | `/api/v1/system/backups/upload` | Uploads and restores external `.db.gz` backup file |
| `GET` | `/api/v1/system/database/status` | Real-time dual-db status, dialect, table counts, HNSW index |
| `POST` | `/api/v1/system/database/test-connection`| Tests connectivity to PostgreSQL or target database |
| `POST` | `/api/v1/system/database/create-hnsw-index`| Rebuilds pgvector HNSW cosine index on 512-dim vectors |
| `POST` | `/api/v1/system/database/migrate` | 1-click reflection migration between SQLite and PostgreSQL |
| `GET` | `/api/v1/settings` | Gets storage mode and processing settings |
| `POST` | `/api/v1/auth/login` | JWT user login |

---

## 💾 Storage Modes: In-Memory vs Disk Mount

MyMemoryPics implements the **9drive In-Memory Architecture**:

| Feature | `in_memory` (Default) | `disk_mount` |
| :--- | :--- | :--- |
| **Originals Location** | Google Drive Cloud / MinIO S3 | Local Disk Mount (`/data/originals`) |
| **Thumbnails** | Direct Google Drive CDN / In-Memory S3 WebP | Local WebP Cache (`/data/thumbnails`) |
| **Face Crop Avatars** | Rendered on-the-fly in RAM | Saved to Disk |
| **Local Disk Usage** | **~0 MB** (Reclaims 100% host disk space) | Full size of photo collection |
| **Approval Gate** | Required in `/settings` before any disk writes | Unrestricted local filesystem writes |

---

## 📁 Repository Structure

```
mymemorypics/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI REST routers (media, search, people, albums, sync, auth, s3_storage, backups)
│   │   ├── models/          # SQLAlchemy database models (media, person, album, user)
│   │   ├── services/        # AI & Core services (scanner, clip_engine, face_engine, s3_storage, backup_service)
│   │   ├── config.py        # Environment configuration
│   │   ├── database.py      # SQLite / SQLAlchemy connection
│   │   └── main.py          # FastAPI application entrypoint
│   ├── Dockerfile           # Backend container definition
│   └── requirements.txt     # Python dependencies (FastAPI, ONNX, FastEmbed, Pillow, PyJWT, boto3)
├── frontend/
│   ├── app/                 # Next.js App Router pages (/albums, /map, /people, /triage, /sync, /settings)
│   ├── components/          # Reusable UI modules (Timeline, Lightbox, Map, BulkBar, Slideshow)
│   ├── Dockerfile           # Multi-stage production Next.js container definition
│   └── package.json         # Frontend dependencies (React, Tailwind, Lucide, Leaflet)
├── data/                    # Persistent volume mounts (ignored by git)
│   ├── db/                  # SQLite database file
│   ├── backups/             # Local compressed WAL database snapshots
│   ├── originals/           # Local originals (when disk_mount mode enabled)
│   └── thumbnails/          # Local thumbnails cache
├── docker-compose.yml       # Production container orchestration
├── project.md               # Master technical plan & feature roadmap
└── README.md                # Comprehensive project documentation
```

---

## 🗺️ Roadmap & Future Enhancements

The following major features are specified and scheduled for future milestones:

- [x] **☁️ S3 / MinIO Object Storage Engine**: Self-hosted S3-compatible engine (MinIO) for zero-cloud private photo storage, RAM streaming, and disaster recovery archives.
- [x] **🛡️ Automated WAL Backups & Disaster Recovery**: Zero-downtime online SQLite backups, safety rollback, offsite exports, and rolling retention pruning.
- [x] **🐘 PostgreSQL + pgvector Dual-Database Engine**: Dynamic database driver supporting SQLite for personal libraries and PostgreSQL + pgvector with HNSW indexing for 100k+ photo enterprise scale.
- [ ] **🎨 Non-Destructive Web Editing Studio**: In-browser canvas adjustments (exposure, contrast, saturation, sharpness, 90° rotate, flip, crop presets 1:1, 16:9, 4:3, and aesthetic filters) saving parametric JSON recipes without touching originals.
- [ ] **🔗 Public Shareable Album Links & Guest Gallery**: Tokenized public sharing URLs (`/share/[token]`) with optional PIN protection and auto-expiration for friends and family with 1-click ZIP export.
- [ ] **👥 Multi-User Private Libraries & Family Shared Spaces**: Multi-tenant data segregation with private personal photo vaults and collaborative shared family pools.
- [ ] **🎞️ Apple Live Photos & Short Video Motion**: Auto-pairing of `.heic` + `.mov` clips with hover-motion playback on timeline thumbnails and inline silent video player.
- [ ] **📱 PWA & Chunked Multi-File Uploader**: Mobile home-screen installation, service worker offline caching, and drag-and-drop resume-enabled chunked uploader.
- [ ] **⚡ Asynchronous Background Task Queue (Redis + Celery)**: Offload heavy AI jobs with real-time UI progress bars.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.
