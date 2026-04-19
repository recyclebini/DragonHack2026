# Seenesthesia

Seenesthesia turns voice into color in real time so emotion can be seen, not only heard.  
It analyzes vocal features (such as pitch, energy, and timbre) and maps them into a dynamic color signature that updates live.

The project is designed as an inclusive communication concept, especially for people with hearing disabilities, by adding a visual emotional layer to speech.

## Why Seenesthesia

Human communication is emotional, but text and subtitles often flatten that emotional context. Seenesthesia aims to make communication more human by visualizing emotional tone directly in language, media, and social interaction.

## Core Experiences

- **Voice Scan**: capture a person’s voice and generate a personal voice-color identity.
- **Conversation Mode**: display live spoken words in emotion-colored text.
- **Film Mode**: upload video and generate color-aware subtitles.
- **Music Mode**: transform transcribed lyrics into emotion-colored text and timelines.
- **Live Visual Mode**: realtime reactive visual art driven by vocal emotion.
- **People Map**: explore saved voices, harmonies, and a collective group color.

## How It Works (Conceptual)

Seenesthesia combines acoustic analysis with color mapping:

1. Extract voice features from audio (pitch, energy, brightness, etc.).
2. Infer emotional cues from those features and transcript context.
3. Map voice + emotion into a color space.
4. Render that color as:
  - live animated visuals,
  - emotion-colored words/subtitles,
  - identity and group color signatures.

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Routing/App Framework**: TanStack Router + TanStack Start
- **Build Tool**: Vite
- **Styling/UI**: Tailwind CSS + Radix UI
- **Audio/Color**: Web Audio APIs + chroma-js
- **Realtime/Storage**: Supabase
- **Speech-to-Text**: Deepgram
- **Optional emotion classification**: Anthropic API (fallback logic exists if key is not provided)

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create a `.env` file (or copy `.env.example`) and set:

```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_DEEPGRAM_API_KEY=your-deepgram-key
```

Optional (used in conversation mode for text-based emotion classification):

```env
VITE_ANTHROPIC_API_KEY=your-anthropic-key
```

### 3) Run in development

```bash
npm run dev
```

Open the app at the local URL shown by Vite.

## Available Scripts

- `npm run dev` - start development server
- `npm run build` - production web build
- `npm run build:dev` - development-mode build
- `npm run build:mobile` - mobile-targeted build (Capacitor config)
- `npm run preview` - preview production build locally
- `npm run lint` - run ESLint
- `npm run format` - run Prettier

## Main Routes

- `/` - voice scan and identity color creation
- `/conversation` - live conversation with emotion-colored transcript
- `/film` - video upload with color-aware subtitles and color journey
- `/music` - audio upload with lyric coloring and timeline
- `/visualize` - fullscreen realtime voice visualization
- `/map` - people map, harmony exploration, and group color

## Accessibility and Inclusion

Seenesthesia is built around inclusive communication:

- adds emotional context for people who may not perceive vocal tone clearly,
- provides multimodal expression (text + color + motion),
- helps social and educational communication feel more intuitive and empathic.

## Project Status

Prototype / concept implementation for DragonHack 2026.  
The app demonstrates interactive emotional color mapping workflows across live speech, conversation, video, and music.