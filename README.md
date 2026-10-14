# Maritime Shipping Simulator

A cinematic browser-based maritime shipping game where you captain a vessel through dangerous routes, rescue operations, weather changes, pirate threats, and story-driven cargo missions. Built with React, Vite, TypeScript, and Three.js, the project blends a polished game loop with a richly themed UI designed for both casual play and deeper strategy.

Whether you're looking for an engaging playable prototype, a storytelling simulation sandbox, or a developer-friendly codebase to extend, this project is designed to be approachable, extensible, and visually impressive.

## Why this project stands out

- Story-driven campaign with escalating chapters and outcomes
- Dynamic shipping contracts and daily challenges
- Upgradeable ship systems and strategic progression
- Real-time naval simulation feel with weather, hazards, and encounters
- Responsive interface for desktop and touch devices
- Offline-friendly save progress stored locally in the browser
- Built as a compact, single-page web app with strong performance characteristics

## Gameplay overview

You take command of a modern cargo vessel and navigate a living seascape filled with danger and opportunity.

Players can:

- Accept story missions and freight contracts
- Manage speed, steering, and engine efficiency
- Respond to hazards such as rough seas, pirate attacks, distressed craft, and wildlife
- Use tools like hoses, acoustic deterrents, and emergency power
- Unlock ship upgrades and improve your reputation as a captain
- Chase performance-based rewards, achievements, and higher ranks

The game balances simulation, decision-making, and presentation. It is designed to feel like a compact, polished shipping sim rather than a generic visual demo.

## Features

### Campaign and progression
- Multiple mission chapters with unlock progression
- Story decisions that influence future outcomes
- Rank progression and financial growth
- Achievement tracking for varied play styles

### Maritime simulation
- Open-water route simulation
- Dynamic weather and route pressure
- Pirate and hostile traffic encounters
- Distress calls, rescue scenarios, and cargo risk events
- Performance analysis after each voyage

### User experience
- Atmospheric UI and menu systems
- HUD overlays for live mission data and ship telemetry
- Pause, quality settings, and browser-safe local persistence
- Touch-friendly controls and responsive layout

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Three.js
- Local storage for saves and progression

## Quick start

### Prerequisites

- Node.js 18+ recommended
- npm or pnpm

### Install dependencies

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Then open the local dev server URL in your browser.

### Production build

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## Project structure

```text
.
├── public/                  # Static assets and portraits
├── src/
│   ├── game/               # Core simulation, missions, story logic, ships, routes
│   ├── ui/                 # HUD, menus, briefing, result screens, scene layers
│   ├── App.tsx             # Main app orchestrator
│   ├── index.css           # Styling and UI theme
│   └── main.tsx            # App entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── package-lock.json
└── README.md
```

## Controls

### Keyboard
- W / S: Engine telegraph
- A / D: Rudder
- Shift: Emergency power
- E: Fire hoses
- F: Acoustic burst / LRAD
- V: Call navy helicopter
- C: Camera toggle
- H: Horn
- Esc: Pause

### Touch / mobile
- On-screen controls are included for a simplified touch-friendly interface
- The game also includes a rotate-to-landscape prompt for portrait devices

## Why developers will like it

This repository is a strong starting point for building interactive web games or simulation-heavy UIs because it already demonstrates:

- Component-driven UI composition with React
- Game-state management and save persistence
- Scene orchestration and animation logic with Three.js
- Performance-aware rendering and toggleable visual quality settings
- A modular architecture that makes extending missions, hazards, and systems straightforward

The code is structured to support experimentation with new mission types, ship systems, AI behavior, narrative events, or richer game economies.

## Ideas for extension

- Additional routes, weather systems, and biomes
- More advanced enemy AI and escort mechanics
- Audio improvements and richer sound design
- Expanded campaign arcs and ending variations
- Procedural contract generation and dynamic mission difficulty
- Multiplayer or shared leaderboard concepts

## Contributing

Contributions are welcome. If you want to improve gameplay, UX, performance, or the codebase architecture:

1. Fork the project
2. Create a feature branch
3. Make your changes
4. Test locally with a production build
5. Submit a pull request with a clear summary

## License

This project does not currently declare a formal license in the repository metadata. If you plan to use or distribute it publicly, add an appropriate license before publication.

## A quick project pitch

Maritime Shipping Simulator is a compact, atmospheric shipping game designed to entertain players while giving developers a clean foundation for game systems, UI design, and interactive storytelling in the browser.

It offers a satisfying mix of tactical decision-making, arcade-style action, and narrative progression in a single, polished web experience.

---

Built for curious players, creative developers, and anyone who enjoys a rich browser game with a strong maritime theme.
