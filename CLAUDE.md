# Infinimap - Generative Slippy Map

## Project Overview
A local-first, generative slippy map application that creates tiles on-demand using AI generation. Built with Next.js, TypeScript, and Leaflet, it features neighbor-aware tile generation for seamless edges.

## Architecture

### Tech Stack
- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling (v4 with @tailwindcss/postcss)
- **Leaflet** for map rendering (Simple CRS)
- **Sharp** for image processing
- **Zod** for validation
- **File-based storage** (no external databases)

### Key Design Decisions
1. **Local-first**: Everything runs locally without external services
2. **File-based adapters**: DB, Queue, and Storage use filesystem with clean interfaces for future cloud migration
3. **Neighbor-aware generation**: Tiles know about adjacent tiles for edge continuity
4. **Content hashing**: Merkle tree structure for efficient cache invalidation
5. **URL state management**: Map position tracked in query parameters for sharing

## Project Structure

```
infinimap/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── tiles/[z]/[x]/[y]/    # Serve tiles
│   │   ├── claim/[z]/[x]/[y]/    # Generate tiles
│   │   ├── invalidate/[z]/[x]/[y]/ # Regenerate tiles
│   │   └── meta/[z]/[x]/[y]/     # Tile metadata
│   └── map/               # Map viewer page
├── components/
│   └── MapClient.tsx      # Main map component with URL state
├── lib/
│   ├── adapters/          # Swappable implementations
│   │   ├── db.file.ts     # File-based tile metadata
│   │   ├── queue.file.ts  # In-process job queue
│   │   └── lock.file.ts   # File-based locks
│   ├── generator.ts       # Tile generation logic (STUB)
│   ├── hashing.ts         # Content hashing & Merkle tree
│   ├── storage.ts         # Tile image storage
│   └── coords.ts          # Coordinate math
├── public/
│   ├── default-tile.webp  # Placeholder for empty tiles
│   └── style-control/     # Style configuration
│       └── config.json    # Generation parameters
└── .tiles/                # Generated tile images (gitignored)
    .meta/                 # Tile metadata (gitignored)
    .locks/                # Lock files (gitignored)
    .queue/                # Queue state (gitignored)
```

## Key Features

### Map Navigation
- **URL State Management**: Position tracked via query params (?z=4&lat=-128&lng=128)
- **Shareable Links**: Bookmark or share specific locations
- **Position Restoration**: Refreshing maintains view position
- **Real-time position display**: Shows current coordinates in UI

### Tile Generation
- **Click to Generate**: At max zoom (level 8), click any tile to generate
- **Prompt System**: Describe areas with text prompts
- **Neighbor Awareness**: Generator receives adjacent tiles for continuity
- **Style Control**: Centralized style configuration in `/public/style-control/config.json`
- **Generation Feedback**: Popup notifications and auto-refresh on completion

### Performance
- **Lazy Generation**: Tiles only generated when requested
- **Immutable Caching**: Generated tiles cached forever via ETags
- **Debounced Updates**: Map position updates throttled to 300ms
- **Polling System**: Auto-refresh tiles when generation completes (30-second timeout)

## API Endpoints

### GET /api/tiles/{z}/{x}/{y}
Returns tile image (WebP). Falls back to default-tile.webp if not generated.
- Uses async params (Next.js 15 requirement)
- Returns immutable cache headers with ETag

### POST /api/claim/{z}/{x}/{y}
```json
{ "prompt": "isomorphic video game layout" }
```
Initiates tile generation at max zoom level only.

### POST /api/invalidate/{z}/{x}/{y}
Regenerates existing tile with incremented version.

### GET /api/meta/{z}/{x}/{y}
Returns tile metadata:
```json
{
  "status": "EMPTY" | "PENDING" | "READY",
  "hash": "abc123...",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## Configuration

### Environment Variables (.env.local)
```bash
ZMAX="8"                    # Maximum zoom level
TILE_SIZE="256"            # Tile dimensions in pixels
DEFAULT_TILE_PATH="./public/default-tile.webp"
STYLE_PATH="./public/style-control/config.json"
STYLE_REF="./public/style-control/ref.png"  # Optional style reference
NEXT_PUBLIC_ZMAX="8"       # Client-side max zoom
```

### Style Configuration (public/style-control/config.json)
```json
{
  "name": "isomorphic-v1",
  "palette": {
    "deep": "#143C82",
    "shallow": "#1E5AA0",
    "beach": "#F0E6B4",
    "grass": "#328C3C",
    "hills": "#5B503C",
    "snow": "#E6E6E6"
  },
  "model": { 
    "sampler": "dpmpp_2m", 
    "steps": 25, 
    "cfg": 5.5 
  }
}
```

## Development

### Prerequisites
- Node.js 18+
- Yarn package manager

### Running Locally
```bash
yarn install    # Install dependencies
yarn dev        # Start development server
yarn build      # Build for production
yarn start      # Run production build
```

### Testing Tile Generation
1. Navigate to http://localhost:3000/map
2. Zoom to maximum level (8)
3. Enter a prompt in the input field
4. Click any tile to generate it
5. Watch the popup for generation status
6. Tile auto-refreshes when ready

## Integrating Real AI Generation

The current implementation uses a stub generator that creates colored tiles. To integrate real AI:

1. **Edit `lib/generator.ts`**:
   - Replace `runModelStub()` function
   - Use the provided `neighbors` array for edge matching
   - Apply style configuration from `loadStyleControl()`
   - Process the user's `prompt`
   - Return a 256×256 WebP Buffer

2. **Neighbor Format**:
```typescript
neighbors: {
  dir: "N"|"S"|"E"|"W"|"NE"|"NW"|"SE"|"SW",
  buf: Buffer | null  // WebP image or null if empty
}[]
```

3. **Example Integration Points**:
   - ComfyUI: Use API to send workflow with neighbor images
   - Stable Diffusion: Apply ControlNet for edge continuity
   - DALL-E: Use inpainting with neighbor context
   - Flux: Use edge detection for seamless boundaries

## Migration to Cloud

The project uses adapter patterns for easy cloud migration:

### Database Adapter
- Current: `FileDB` (JSON files)
- Migration: Implement `CloudDB` with same interface
- Tables needed: tiles (z, x, y, status, hash, metadata)

### Queue Adapter
- Current: `FileQueue` (in-process)
- Migration: Implement `CloudQueue` (Redis/BullMQ)
- Jobs: tile generation with priority by zoom level

### Storage Adapter
- Current: Local filesystem
- Migration: S3/GCS with same read/write interface
- Consider CDN for tile serving

## Common Tasks

### Clear All Generated Tiles
```bash
rm -rf .tiles .meta .locks .queue
```

### Generate Default Tile
```bash
node scripts/create-default-tile.js
```

### Check Generation Status
```bash
curl http://localhost:3000/api/meta/8/128/128
```

### Force Regenerate Tile
```bash
curl -X POST http://localhost:3000/api/invalidate/8/128/128
```

## Troubleshooting

### Tiles Not Updating
- Check browser cache (add ?t=timestamp to force refresh)
- Verify generation completed via /api/meta endpoint
- Check .tiles/ directory for generated images
- Ensure tile layer redraw is called after generation

### Generation Failing
- Check console for errors in lib/generator.ts
- Verify style config exists at public/style-control/config.json
- Ensure ZMAX environment variable is set
- Check file permissions for .tiles directory

### Map Not Loading
- Verify default-tile.webp exists in public/
- Check Next.js is running (yarn dev)
- Confirm no port conflicts on 3000
- Check for Leaflet SSR issues (should use dynamic import)

### Next.js 15 Specific Issues
- Params must be awaited in API routes
- Use @tailwindcss/postcss instead of tailwindcss directly
- Dynamic imports required for client-only libraries

## Future Enhancements

### Planned Features
- [ ] Batch generation for areas
- [ ] Generation progress indicators
- [ ] Tile sharing/export functionality
- [ ] Multiple style presets
- [ ] Generation history/undo
- [ ] Collaborative generation (multiplayer)
- [ ] Tile versioning UI

### Performance Optimizations
- [ ] Metatiling (2×2 generation, then slice)
- [ ] Progressive detail (generate low-res first)
- [ ] Predictive pre-generation
- [ ] WebP quality adjustment by zoom
- [ ] Worker threads for generation

### AI Improvements
- [ ] Multiple model support
- [ ] Style transfer capabilities
- [ ] Coherence across zoom levels
- [ ] Seasonal/time-of-day variations
- [ ] Inpainting for tile updates

## Notes for AI Assistants

When working on this codebase:

1. **Always preserve the adapter pattern** - Don't directly use external services
2. **Maintain neighbor awareness** - Generation must consider adjacent tiles
3. **Keep it local-first** - Should work without internet (except AI API calls)
4. **Test with yarn dev** - Always verify changes work locally
5. **Update query params** - Maintain URL state for navigation features
6. **File-based by default** - Use filesystem before adding dependencies
7. **Handle Next.js 15 requirements** - Await params in API routes
8. **Check Tailwind v4 compatibility** - Use @tailwindcss/postcss

### Common Patterns
- API routes use async params: `{ params }: { params: Promise<{...}> }`
- Dynamic imports for client-only libraries
- File-based locks use process.pid
- Polling uses setTimeout recursion
- URL updates use replaceState with debouncing

### Testing Checklist
- [ ] Tiles load at all zoom levels
- [ ] Generation works at max zoom
- [ ] URL updates on navigation
- [ ] Position restores from URL
- [ ] Tiles refresh after generation
- [ ] Popups show generation status

## License

Private project - see repository settings for details.

<CLAUDE_CONTEXT_PATROL_DO_NOT_EDIT>
[git_hash:af05977648dbe11f1de60317b5e544dd7e4a88c5]
I'll generate the context for the specified directories based on the actual files found:

# app Directory
The `app` directory contains the Next.js application structure:

## Routing and Pages
- (app/page.tsx): Simple redirect component that immediately navigates to the `/map` route
- (app/map/page.tsx): Map page with a client-side boundary
  - Uses Suspense for loading fallback
  - Dynamically imports MapClient component
  - Renders full-screen map container

## API Routes
Comprehensive set of API routes for tile-related operations:
- (app/api/claim/[z]/[x]/[y]/route.ts): Handles tile generation requests
  - Supports generation only at maximum zoom level
  - Validates prompt input
  - Marks tile as PENDING
  - Enqueues tile generation job
- (app/api/confirm-edit/[z]/[x]/[y]/route.ts): Confirms tile edits
  - Supports blending generated tiles with existing tiles
  - Handles selective tile application
  - Regenerates parent tiles automatically
- (app/api/delete/[z]/[x]/[y]/route.ts): Allows deletion of tiles
  - Removes tile file
  - Updates database metadata
  - Regenerates parent tiles
- (app/api/edit-tile/[z]/[x]/[y]/route.ts): Prepares tile edit previews
  - Generates 3x3 grid preview
  - Supports blending modes
- (app/api/generate-parents/route.ts): Triggers parent tile generation
- (app/api/invalidate/[z]/[x]/[y]/route.ts): Allows regeneration of existing tiles
- (app/api/meta/[z]/[x]/[y]/route.ts): Retrieves tile metadata
- (app/api/preview/[id]/route.ts): Serves tile preview images
- (app/api/tiles/[z]/[x]/[y]/route.ts): Serves tile images with caching

## Layout and Styling
- (app/layout.tsx): Root application layout
  - Sets page title as "Infinimap"
  - Provides basic HTML structure
- (app/globals.css): Global stylesheet
  - Imports Tailwind CSS
  - Sets full height for HTML elements

# components Directory
- (components/MapClient.tsx): Interactive map client component
  - Uses Leaflet for map rendering
  - Features:
    * Dynamic tile generation
    * Hover-based tile interactions
    * URL state management
    * Tile existence checking
    * Zoom level controls
- (components/TileControls.tsx): Tile interaction controls
  - Provides UI for generating, regenerating, and deleting tiles
  - Uses Radix UI components
  - Supports different states for empty and existing tiles
- (components/TileGenerateModal.tsx): Advanced tile generation modal
  - Supports 3x3 grid preview
  - Allows selective tile application
  - Provides blending options
  - Handles tile generation and editing workflows

# lib Directory
## Adapters
- (lib/adapters/db.file.ts): File-based database implementation
  - Manages tile metadata storage
  - Supports CRUD operations on tile records
- (lib/adapters/db.ts): Database interface definitions
- (lib/adapters/lock.file.ts): File-based locking mechanism
  - Prevents concurrent job processing
  - Includes stale lock cleanup
- (lib/adapters/queue.file.ts): File-based job queue
  - Handles tile generation jobs
  - Supports in-process job execution

## Utility Modules
- (lib/coords.ts): Coordinate and tile-related utilities
  - Defines tile and zoom constants
  - Provides parent/child tile calculations
- (lib/gemini.ts): Google GenAI client configuration
- (lib/generator.ts): Tile generation logic
  - Uses Gemini AI for image generation
  - Supports neighbor-aware generation
  - Handles fallback generation
- (lib/hashing.ts): Cryptographic utilities
  - Provides content hashing
  - Supports hash bubbling for parent tiles
- (lib/parentTiles.ts): Parent tile generation
  - Creates parent tiles from child tiles
  - Supports regeneration across zoom levels
- (lib/paths.ts): Defines directory paths for application data
- (lib/storage.ts): File storage operations for tiles
- (lib/style.ts): Loads style configuration

# scripts Directory
- (scripts/create-default-tile.js): Creates a default tile image
  - Generates a 256x256 gray tile with grid pattern
- (scripts/generate-parents.ts): Script for regenerating parent tiles (no content available)
- (scripts/regen-parents.cjs): Wrapper script for parent tile regeneration (no content available)

The application is a generative, neighbor-aware map system with dynamic tile creation, Leaflet-based interaction, and AI-powered content generation.
</CLAUDE_CONTEXT_PATROL_DO_NOT_EDIT>