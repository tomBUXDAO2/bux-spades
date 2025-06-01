# Bux Spades 2.0

A modern multiplayer Spades card game platform with customizable rules, real-time gameplay, and social features.

## Features

### Authentication
- **Discord OAuth2 Integration**: Quick login with Discord account
- **Email/Password**: Traditional authentication method
- Secure JWT-based session management
- Profile linking between authentication methods

### Game Modes
- **Partners/Solo Play**: Choose between team-based or individual gameplay
- **Flexible Bidding Options**:
  - Regular (with optional nil and blind nil)
  - Whiz (must bid nil or number of spades)
  - Mirrors (forced to bid number of spades)
  - Gimmick (hearts, bid 3, bid 4 or nil, suicide)
- **Special Rules**:
  - Screamer (spade play restrictions)
  - Assassin (forced spade cutting and leading)

### Game Settings
- Customizable point ranges (-250 to -100 minimum, 100 to 650 maximum)
- Flexible coin buy-in (100k minimum, 50k increments)
- House rake: 10%
- Prize distribution: 180k per player

### Social Features
- Real-time chat in lobby and game rooms
- Friends list system
- Player blocking functionality
- Profile customization
- Detailed statistics tracking

### Anti-Cheating Measures
- Face-down card dealing
- Cards revealed only when player becomes active
- Blind nil risk confirmation before card reveal

## Tech Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Redux Toolkit** for state management
- **Socket.IO Client** for real-time communication
- **Tailwind CSS** for styling
- **React Router** for navigation

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **Prisma** for database ORM
- **PostgreSQL** for data storage
- **Socket.IO** for real-time communication
- **Passport.js** for authentication
- **JWT** for session management

## Project Structure

```
bux-spades-2.0/
├── client/                      # Frontend React application
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── auth/          # Authentication components
│   │   │   ├── game/          # Game-related components
│   │   │   ├── lobby/         # Lobby components
│   │   │   ├── chat/          # Chat components
│   │   │   └── common/        # Shared components
│   │   ├── pages/             # Main page components
│   │   ├── store/             # Redux store and slices
│   │   ├── services/          # API and socket services
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # React context providers
│   │   ├── utils/             # Utility functions
│   │   ├── types/             # TypeScript type definitions
│   │   └── assets/            # Static assets
│   ├── public/                # Public static files
│   └── package.json           # Frontend dependencies
│
├── server/                     # Backend Node.js application
│   ├── src/
│   │   ├── controllers/       # Route controllers
│   │   ├── models/            # Database models
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── socket/            # Socket.IO event handlers
│   │   ├── middleware/        # Express middleware
│   │   ├── config/            # Configuration files
│   │   ├── utils/             # Utility functions
│   │   └── types/             # TypeScript type definitions
│   ├── prisma/                # Database schema and migrations
│   └── package.json           # Backend dependencies
│
├── shared/                     # Shared types and utilities
│   └── types/                 # Shared TypeScript types
│
└── README.md                  # Project documentation
```

## Game Rules

### Basic Spades Rules
- Spades are always trump
- Must follow suit if possible
- Highest card of the led suit wins unless a spade is played
- Highest spade wins if any spades are played

### Scoring Rules
#### Basic Scoring
- Each trick is worth 10 points
- Bidding and making exactly your bid: 10 points per trick × bid amount
- Overtricks (bags): 1 point each
- Every 10 bags = -100 point penalty
- After earning the -100 point penalty, bags reset to 0
- Failing to make bid: -10 points per trick bid
- Nil bid (making it): 100 points
- Blind nil bid (making it): 200 points
- Failing nil bid: -100 points
- Failing blind nil bid: -200 points

#### Bag Rules
- Bags are overtricks (tricks won beyond your bid)
- Each bag is worth 1 point
- Every 10 bags = -100 point penalty
- After earning the -100 point penalty, bags reset to 0
- Bags are tracked separately from regular points
- Example: If you have 9 bags and get 2 more, you get:
  - 2 points for the bags
  - -100 point penalty
  - Bags reset to 1

#### Team Scoring
- Partners' points are combined
- Bags are combined between partners
- Team must reach minimum points to win (e.g., 500)
- Team must not reach maximum negative points to avoid losing (e.g., -200)

#### Game Mode Scoring
All game modes use the same scoring system, with differences only in bidding rules:
- **Regular**: Standard bidding with optional nil and blind nil
- **Whiz**: Must bid nil or number of spades in hand
- **Mirrors**: Forced to bid number of spades in hand
- **Gimmick**: Forced specific bids:
  - Hearts bid: Must bid hearts
  - Bid 3: Must bid 3
  - Bid 4 or nil: Must bid either 4 or nil
  - Suicide: One partner from each team must bid nil

### Special Rules
- **Screamer**: Cannot play spades unless following spade lead or no other suits available
- **Assassin**: Must cut and lead spades when possible
- **Blind Nil**: Option to bid nil before seeing cards
- **Suicide**: One partner from each team must bid nil

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Docker and Docker Compose (optional)
- Discord Developer Account (for OAuth2)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bux-spades-2.0.git
cd bux-spades-2.0
```

2. Install dependencies:
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

3. Set up environment variables:
```bash
# In server directory
cp .env.example .env
# Edit .env with your configuration:
# - Database credentials
# - JWT secret
# - Discord OAuth2 credentials (Client ID and Secret)
# - Email service credentials (if using email authentication)

# In client directory
cp .env.example .env
# Edit .env with your configuration:
# - API endpoints
# - Discord OAuth2 Client ID
```

4. Set up the database:
```bash
# In server directory
npx prisma migrate dev
```

5. Start the development servers:
```bash
# Start backend (from server directory)
npm run dev

# Start frontend (from client directory)
npm run dev
```

### Docker Deployment
```bash
docker-compose up --build
```

## Development Workflow

1. **Authentication System**
   - Discord OAuth2 integration
   - Email/password authentication
   - JWT session management
   - Profile management

2. **Game Lobby**
   - Real-time game list
   - Game creation with customizable rules
   - Player joining/leaving
   - Chat system

3. **Game Implementation**
   - Card dealing and shuffling
   - Bidding system
   - Trick taking
   - Scoring system
   - Real-time updates

4. **Social Features**
   - Friends list
   - Player blocking
   - Profile customization
   - Statistics tracking

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to all contributors and testers
- Inspired by traditional Spades card game
- Built with modern web technologies 