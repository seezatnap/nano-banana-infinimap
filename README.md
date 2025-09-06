# Nano Banana Infinimap

An experimental AI-powered infinite map generator that creates seamless, neighbor-aware tiles on demand.

**⚠️ Experimental Software**: This project is in active development and should be used at your own risk.

<img width="1502" height="510" alt="image" src="https://github.com/user-attachments/assets/45c19d3b-5f6a-44cc-a085-a51693f9250b" />

## TL;DR

This is an experiment I made to test Nano Banana's ability to consistently infill, plus how to handle minor differences in renders by blending outputs.
The solution I hit on was to break the image up into many tiles, of which a 3x3 grid of tiles can fit comfily into Gemini's input limits. I then radially blend the generations with the previous tiles (if one exists at that position) to handle minor differences.
You can use it to generate gigantic maps at a reasonable cost (or within Gemini's free tier).

## Caveats

- To promote accurate infills I use a photoshop-esque background matte (i.e. checkerboard) which greatly improved Nano Banana's willingness to just fill in the blank spaces without changing anything. But, this is maybe only 75% accurate. Sometimes you just have to regenerate, especially if it's rendering something decent (just misaligned)
- Sometimes nothing will render at all, and you still pay the nickle to Google for the render. Sad. When it repeatedly renders nothing either make your text prompt more explicit or move over a tile and try there.
- This was vibe coded in an afternoon to test the concept, so I make no guarantees that the code is comprehensible or friendly. But you should be able to tweak the major knobs if you're so inclined.

## Features

- 🗺️ Infinite(-ish), explorable map with Leaflet-based navigation
- 🤖 AI-powered tile generation using Google's Nano Banana model
- 🔗 Neighbor-aware generation for seamless tile edges
- 💾 Local-first architecture with file-based storage

## Installation

### Prerequisites

- Node.js 18+
- Yarn package manager
- Google Cloud Platform account with Gemini API access

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/infinimap.git
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

6. Open http://localhost:3000 in your browser

## Getting Started

1. **Navigate the Map**: Use your mouse to pan and scroll to zoom
2. **Generate Your First Tile**: 
   - Zoom in to the maximum level (level 8)
   - Enter a prompt like "isometric video game island" or "ancient temple ruins"
   - Click on any empty tile to generate it
3. **Explore**: Generated tiles are neighbor-aware, creating seamless transitions between areas
4. **Regenerate**: Right-click existing tiles to regenerate or edit them

## Development

```bash
yarn dev        # Start development server
yarn build      # Build for production
yarn start      # Run production build
```

### Project Structure

```
infinimap/
├── app/          # Next.js app directory
├── components/   # React components
├── lib/          # Core logic and utilities
├── public/       # Static assets
└── scripts/      # Utility scripts
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

[@seezatnap](https://twitter.com/seezatnap)

## Contributing

This is experimental software. Issues and PRs welcome, but expect breaking changes.
