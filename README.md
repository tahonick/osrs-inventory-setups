# Inventory Setups

A modern web app for OSRS players to share their gear setups. Copy loadouts directly from RuneLite's Inventory Setups plugin and share them with the community. Perfect for sharing boss strategies, raid setups, skilling outfits, and more.

## Overview

This project aims to make sharing OSRS gear setups as seamless as possible. Instead of taking screenshots or manually recreating setups, players can directly copy their setup from RuneLite and share it with the community. Other players can then import these setups back into RuneLite with a single click.

### Key Features
- **Direct RuneLite Integration**
  - Copy setups directly from RuneLite's Inventory Setups plugin
  - Import shared setups back into RuneLite
  - Preserves all item filters and additional inventory items

- **Rich Filtering & Search**
  - Filter by categories and tags
  - Search by setup name or description
  - Sort by date, likes, or views
  - Personal loadouts view

- **User Features**
  - Google authentication
  - Like and save favorite setups
  - Public/private loadout options
  - Dark/light theme support

- **Modern UI/UX**
  - Clean, responsive Material design
  - Real-time stats and updates
  - Mobile-friendly interface
  - Intuitive drag-and-drop interface

## Tech Stack

### Frontend
- Angular 19
- Angular Material UI
- Firebase SDK v11
- RxJS for state management
- SCSS with modern CSS features

### Backend & Services
- Firebase
  - Authentication with Google
  - Firestore for data storage
  - Security rules for data protection
  - Analytics integration
  - Real-time updates
- reCAPTCHA v3 for spam prevention

## Development

### Prerequisites
- Node.js 16+
- npm 8+
- Angular CLI (`npm install -g @angular/cli`)
- Firebase CLI (`npm install -g firebase-tools`)

### Getting Started
```bash
# Clone the repo
git clone https://github.com/yourusername/inventory-setups.git
cd inventory-setups

# Install dependencies
npm install

# Start development server
npm start
```

The dev server will run at `http://localhost:4200` by default.

### Environment Setup
1. Create a Firebase project at https://console.firebase.google.com
2. Enable Google Authentication
3. Create a Firestore database
4. Set up reCAPTCHA v3
5. Configure environment files:
   ```typescript
   // src/environments/environment.ts
   export const environment = {
     production: false,
     firebase: {
       // Your Firebase config
     },
     recaptcha: {
       siteKey: 'your-recaptcha-site-key'
     }
   };
   ```

### Project Structure
```
src/
├── app/
│   ├── core/           # Services, guards, interceptors
│   ├── features/       # Feature modules (loadouts, inventory)
│   ├── shared/         # Shared components, models, pipes
│   └── app.module.ts
├── assets/            # Images, icons, etc.
├── environments/      # Environment configs
└── styles/           # Global styles, themes
```

## Deployment
```bash
# Build production bundle
npm run build

# Deploy to Firebase
firebase deploy
```

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Guidelines
- Follow the Angular style guide
- Write clear commit messages
- Add tests for new features
- Update documentation as needed

## Nic's Enhancements

This fork includes significant improvements to authentication, privacy, user experience, and code quality. All enhancements maintain backward compatibility with the original project.

### 🔐 Authentication System

**Complete Google Sign-in Integration**
- Seamless Google OAuth 2.0 authentication with proper redirect URI handling
- Anonymous authentication for guests (automatic, no user action required)
- Smart account linking: When anonymous users sign in with Google, their anonymous account is linked to preserve all their created loadouts
- Graceful handling of edge cases:
  - Account already in use: Automatically signs out anonymous and signs in with Google
  - Popup blocking: Clear error messages with instructions
  - User cancellation: Silently handles popup closure without errors
- Auth state management with flags to prevent race conditions during sign-in flows

**User Interface**
- Authentication button in header with dynamic states (Sign in/Sign out)
- User info display showing name/email when signed in with Google
- Custom sign-in success dialog replacing browser alerts (Material Design, theme-aware)
- Visual feedback for authentication state changes

### 🔒 Privacy Features

**Loadout Privacy Controls**
- Public/Private toggle for loadouts (owner-only, accessible in loadout modal)
- Default view shows all public loadouts plus the user's own loadouts (both public and private)
- "My Setups Only" filter showing exclusively the user's created loadouts
- Grouped view when "My Setups" is active:
  - **"Setups I Created"** section at the top
  - Horizontal divider
  - **"Favorite Setups by Other Users"** section below (shows liked loadouts from other users)

**Data Privacy**
- Anonymous users can create loadouts without authentication
- Loadout ownership tied to user ID for proper permission checks
- Client-side filtering ensures users only see appropriate loadouts based on privacy settings

### 📥 Import Improvements

**Enhanced JSON Validation**
- Robust parsing with detailed error messages including position and context
- Handles edge cases:
  - Multiple concatenated JSON objects (extracts first valid object)
  - Zero-width characters and hidden whitespace (sanitized automatically)
  - Invalid JSON structure (clear error messages with context)
- Validates required fields (name, inv array length 28, eq array length 14)
- Better error messages for RuneLite Inventory Setups plugin compatibility

### 🎨 UI/UX Enhancements

**Header Improvements**
- Auth button with icon and text (text hidden on mobile for cleaner UI)
- User info badge showing display name or email
- Stats label updated from "Users" to "Visits" for clarity
- Responsive design with mobile optimizations

**Loadout Management**
- Section headers and dividers for grouped loadouts
- Visual separation between created and liked loadouts
- Privacy toggle with clear icons (public/lock)
- Improved error handling with user-friendly messages

### ⚡ Performance & Code Quality

**Query Optimization**
- Client-side sorting and pagination for complex queries (userId + orderBy) to avoid Firestore composite index requirements
- Efficient handling of "My Setups" filter with separate queries for created and liked loadouts
- Stats caching with 5-minute TTL to reduce Firestore reads

**TypeScript & Error Handling**
- Strict TypeScript compliance (no implicit any types)
- Comprehensive error handling for all async operations
- Proper null/undefined checks with optional chaining
- Debug logging for auth state changes and query operations

**Code Organization**
- Separation of concerns: `FirebaseService` for data access, `LoadoutService` for business logic
- Observable-based state management with RxJS
- Type-safe interfaces for all data structures
- Reusable components and services

### 🐛 Bug Fixes

- Fixed auth state race conditions during sign-in/sign-out transitions
- Fixed anonymous sign-in interfering with Google sign-in flow
- Fixed TypeScript compilation errors (undefined checks, type annotations)
- Fixed HTML template structure issues
- Fixed pagination with client-side sorting
- Improved error messages for better user experience

### 📝 Technical Details

**Key Files Modified**
- `src/app/core/services/firebase.service.ts` - Complete auth overhaul, account linking, query optimization
- `src/app/core/services/loadout.service.ts` - Privacy filtering, grouped loadouts, client-side processing
- `src/app/core/components/header/` - Auth UI, user info display
- `src/app/features/home/home.component.*` - Grouped loadouts UI, "My Setups" filter
- `src/app/features/loadout/components/loadout-modal/` - Privacy toggle
- `src/app/features/loadout/components/loadout-uploader/` - JSON validation improvements
- `src/app/shared/components/sign-in-info/` - New sign-in success dialog component

**Dependencies**
- Upgraded to Angular 19 (from Angular 16)
- Upgraded to Firebase SDK v11 (from v9)
- No breaking changes to existing functionality

## License
This project is MIT licensed.

## Acknowledgments
- [Inventory Setups Plugin](https://github.com/dillydill123/inventory-setups) - For the amazing Inventory Setups plugin
- [RuneLite](https://runelite.net/) - For the launcher itself <3
- [OSRS Wiki](https://oldschool.runescape.wiki/) - Item data and images
- The OSRS community for feedback and suggestions
- Patrick Rottman - Original project creator