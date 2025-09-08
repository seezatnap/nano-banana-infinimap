# Nano Banana Infinimap

An experimental AI-powered infinite map generator that creates seamless, neighbor-aware tiles on demand.

**⚠️ Experimental Software**: This project is an experimental demonstration of the Gemini Nano Banana model's potential and should be used at your own risk.

<img width="1200" height="600" alt="Nano Banana Infinimap - Modern Interface" src="https://github.com/user-attachments/assets/1b6f9319-e0f0-4d54-abad-02761256555c" />

## TL;DR

This is an experiment I made to test Nano Banana's ability to consistently infill, plus how to handle minor differences in renders by blending outputs.
The solution I hit on was to break the image up into many tiles, of which a 3x3 grid of tiles can fit comfily into Gemini's input limits. I then radially blend the generations with the previous tiles (if one exists at that position) to handle minor differences.
You can use it to generate gigantic, continuous maps at a reasonable cost.

## Technical Notes

- **Infill Accuracy**: Uses a checkerboard background matte to improve Nano Banana's infilling behavior. Accuracy is ~75% - sometimes regeneration is needed for better alignment.
- **Generation Reliability**: Occasionally renders may fail or produce unexpected results. Clear, descriptive prompts generally yield better results.
- **Performance**: The 3×3 preview system helps avoid bad generations before committing changes, reducing waste and improving results.
- **Code Quality**: Recently refactored with modern React patterns, TypeScript, performance optimizations, and modular component architecture.

## Features

- 🗺️ **Infinite Map**: Explorable map with smooth Leaflet-based navigation and URL state management
- 🤖 **AI-Powered Generation**: Uses Google's Gemini Nano Banana model for intelligent tile creation
- 🔗 **Neighbor-Aware**: Seamless tile edges with 3×3 context-aware generation
- 🎨 **Interactive Preview**: Advanced 3×3 grid preview with selective tile application
- 💾 **Local-First**: File-based storage with no external databases required
- ⚡ **Performance Optimized**: React.memo, efficient re-renders, and smart caching
- 🎯 **Modern UI**: Glass morphism design with intuitive hover states and controls
- 🔄 **Real-time Updates**: Auto-refresh tiles when generation completes
- 📍 **Shareable Links**: Position tracked in URL for easy sharing and bookmarking

## Installation

### Prerequisites

- Node.js 18+
- Yarn package manager
- Google Cloud Platform account with Gemini API access

### Setup

1. Clone the repository:
```bash
git clone https://github.com/seezatnap/infinimap.git
cd infinimap
```

2. Install dependencies:
```bash
yarn
```

3. Configure environment variables:
```bash
cp .env.local.example .env.local
```

4. Add your Gemini API key to `.env.local`:
```env
GEMINI_API_KEY=your-api-key-here
```

You can obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

5. Start the development server:
```bash
yarn dev
```

6. Open http://localhost:3000/map in your browser

## Getting Started

1. **Navigate the Map**: 
   - Use mouse to pan and scroll wheel to zoom
   - Position information automatically updates in URL for easy sharing
   - Glass panel shows current coordinates and zoom level

2. **Generate Your First Tile**: 
   - App starts at maximum zoom level (level 8) - tiles are immediately interactive
   - Hover over empty areas to see tile highlights
   - Click any tile to open the interactive menu
   - Choose "Generate" (green + button) for empty tiles

3. **Advanced Generation**:
   - Enter descriptive prompts like "mystical forest clearing" or "ancient stone bridge"
   - Use the **3×3 Preview System**: See a full 3×3 grid before committing changes
   - **Selective Application**: Choose which tiles to apply from the preview
   - **Blending Modes**: Toggle between raw output and edge-blended results

4. **Manage Existing Tiles**:
   - Click existing tiles to access **Regenerate** (blue ↻ button) or **Delete** (orange D button)
   - Delete removes tiles instantly without confirmation
   - Regenerate opens the same preview system for existing content

5. **Canvas Management**:
   - **Canvas Menu**: Located in top-right corner (⚙️ icon)
   - **Reset Canvas**: Clears all tiles and data for a fresh start
   - **Refresh Page**: Reloads the application

6. **Tips for Best Results**:
   - Nano Banana works best with clear, descriptive prompts
   - Use the preview system to avoid bad blends
   - Regenerate tiles that don't match neighboring content
   - The system automatically handles edge continuity

## Development

```bash
yarn dev        # Start development server
```

### Utility Scripts

```bash
# Reset canvas (clear all tiles and data)
node scripts/reset-canvas.js

# Create default tile (if missing)
node scripts/create-default-tile.js
```

## Recent Improvements (v2.0)

This project has been significantly refactored and improved:

### 🏗️ **Architecture Improvements**
- **Component Refactoring**: Large components broken down into focused, reusable pieces
- **Custom Hooks**: Complex logic extracted into composable hooks (`useMapInteractions`, `useTileGeneration`, etc.)
- **Performance Optimization**: React.memo, useMemo, and optimized re-renders
- **TypeScript Enhancement**: Better type safety and developer experience

### 🎨 **UI/UX Enhancements**
- **Modern Design**: Glass morphism with backdrop blur effects
- **Interactive Previews**: Advanced 3×3 grid with selective tile application
- **Enhanced Feedback**: Better loading states, error handling, and user guidance
- **Keyboard Shortcuts**: ⌘+Enter to generate, improved accessibility
- **Canvas Management**: Easy reset functionality with confirmation dialog

### 🚀 **Developer Experience**
- **Modular Components**: Easy to maintain and extend
- **Clean Code**: Removed debug logs, improved naming, consistent patterns
- **Better Error Handling**: User-friendly error messages with retry options
- **Documented Structure**: Clear component organization and responsibilities

### Project Structure

```
infinimap/
├── app/                           # Next.js 15 app directory
│   ├── api/                      # API routes for tile operations
│   │   ├── tiles/[z]/[x]/[y]/    # Serve tiles with caching
│   │   ├── claim/[z]/[x]/[y]/    # Generate new tiles
│   │   ├── edit-tile/[z]/[x]/[y]/ # 3×3 preview generation
│   │   ├── confirm-edit/[z]/[x]/[y]/ # Apply selected tiles
│   │   ├── delete/[z]/[x]/[y]/   # Delete tiles
│   │   └── meta/[z]/[x]/[y]/     # Tile metadata
│   └── map/                      # Map viewer page
├── components/                    # React components (refactored)
│   ├── hooks/                    # Custom React hooks
│   │   ├── useMapInteractions.ts # Mouse events & tile selection
│   │   ├── useMapPolling.ts     # Tile status polling
│   │   ├── useTileGeneration.ts # Generation & preview logic
│   │   ├── useTileRefresh.ts    # Tile layer refresh
│   │   └── useUrlState.ts       # URL state management
│   ├── map/                     # Map-specific components
│   │   ├── map-controls.tsx     # Position display & instructions
│   │   ├── tile-highlight.tsx   # Visual tile highlighting
│   │   └── tile-menu.tsx        # Tile interaction menu
│   ├── ui/                      # Reusable UI components
│   │   ├── action-button.tsx    # Consistent button component
│   │   ├── error-message.tsx    # User-friendly errors
│   │   ├── glass-panel.tsx      # Modern floating panels
│   │   ├── loading-spinner.tsx  # Configurable loading states
│   │   ├── preview-controls.tsx # Preview settings & tabs
│   │   ├── prompt-input.tsx     # Enhanced text input
│   │   └── tile-grid.tsx        # Reusable tile grid display
│   ├── tile-generate-modal/     # Generation modal system
│   ├── tile-controls/           # Legacy tile controls
│   └── map-client/              # Main map client
├── lib/                         # Core logic and utilities
│   ├── adapters/                # Swappable storage implementations
│   │   ├── db.file.ts          # File-based tile metadata
│   │   ├── queue.file.ts       # In-process job queue
│   │   └── lock.file.ts        # File-based locks
│   ├── generator.ts             # AI generation with Gemini
│   ├── hashing.ts              # Content hashing & Merkle tree
│   ├── storage.ts              # Tile image storage
│   └── coords.ts               # Coordinate utilities
├── public/                     # Static assets
│   ├── default-tile.webp       # Placeholder tile
│   └── style-control/          # Generation parameters
└── scripts/                    # Utility scripts
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

[@seezatnap](https://twitter.com/seezatnap)

## Contributing

While this started as an experimental demonstration of Nano Banana, it has evolved into a well-structured, maintainable codebase. The recent refactoring makes it much easier to:

- **Extend functionality**: Modular components and hooks make adding features straightforward
- **Fix bugs**: Clean architecture makes debugging and testing easier  
- **Customize behavior**: Well-organized configuration and clear separation of concerns
- **Fork and modify**: TypeScript interfaces and documented structure support customization

Feel free to fork, extend, or build upon this project! The modular architecture should make it easy to adapt for your specific use cases.
