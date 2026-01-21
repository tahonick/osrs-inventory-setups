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

### 👤 OSRS Username Integration (January 2026)

**Player Identity System**
- Set your OSRS username in your profile (visible to all users when viewing your loadouts)
- Search for setups by creator's OSRS username
- First-time login prompt for new users to set their username
- Profile dialog with privacy controls and clear explanation of public visibility
- Username displayed alongside loadouts in search results and detail views
- Automatic username prompt timing to avoid conflicts with Google sign-in popups

**Profile Management**
- Edit profile dialog accessible from header menu
- Change OSRS username or display name anytime
- Privacy notice explaining that username is public when set
- Sign-out option in profile dialog
- Responsive design optimized for mobile and desktop

**Loadout Name Editing**
- Users can rename their own loadouts inline (pencil icon in modal)
- Clean edit/cancel interface with Material icons
- Real-time updates with optimistic UI feedback
- Admins can edit ANY loadout names (overrides ownership)

### 🛡️ Admin Portal & Moderation (January 2026)

**Comprehensive Admin Dashboard** (Admin-only feature)
- **Dashboard Tab**: Real-time statistics
  - Total users (Google vs Anonymous breakdown)
  - Total loadouts (Public vs Private)
  - Engagement metrics (likes, views)
  - Top creators leaderboard
  - Today's new users and loadouts
  - Refresh button for real-time updates
  
- **User Management Tab**:
  - View all users with search/filter
  - User ID display with copy button for easy migration
  - User stats (loadout count, total likes, total views)
  - Recalculate individual user stats
  - Delete users and their loadouts
  - Last active tracking
  
- **Loadouts Tab**:
  - Browse all loadouts with moderation controls
  - Admin can edit/delete any loadout (overrides ownership)
  - Visibility controls (make public/private)
  - Bulk moderation actions
  
- **Migrations Tab**:
  - Migrate all loadouts from one user to another
  - Automatic stats recalculation after migrations
  - Single loadout reassignment
  - Orphaned account detection and cleanup
  - Detailed console logging for debugging
  
- **Duplicates Tab**:
  - Automatic duplicate detection based on inventory/equipment content
  - Grouped view of duplicate loadouts
  - Bulk selection with "Select Duplicates" button (keeps first, selects rest)
  - Bulk delete functionality
  - Expandable groups with detailed comparison
  - Visual feedback for selected items

**Admin Features**
- Admin user IDs configured in `admin.service.ts`
- Firestore security rules enforce admin permissions
- Admin Portal hidden on mobile devices
- Automatic visibility in header when logged in as admin

### 📱 Mobile-First UI Overhaul (January 2026)

**Unified Filter & Sort Experience**
- Complete redesign of filtering interface with a single overlay for both mobile and desktop
- Bottom-anchored mobile search bar with filter button for quick access
- Toggle-based Filter & Sort button that opens/closes the overlay without explicit close button
- All interactive elements optimized for mobile touch (48x48px minimum)
- Responsive KPI stats in header that adapt gracefully to all screen sizes
- Default sort by name (ascending) for predictable loadout ordering
- Incremental search loading (100 results immediately, 400 more in background)

**Mobile Header Behavior**
- Auto-hide header on scroll down for more screen space
- Auto-show header on scroll up for easy navigation access
- Smooth slide animations with transform transitions
- Debounced scroll detection for performance
- Works seamlessly with filter overlay interactions

**Enhanced Search & Filtering**
- Fixed search bar bug that made all setups disappear while typing
- Incremental search loading: 100 results immediately, 400 more in background
- Improved performance for large result sets with client-side filtering
- Search by setup name, description, or creator username

**Enhanced Authentication Flow**
- Clear "Sign in" / "Sign out" buttons with improved anonymous-to-Google account linking
- Dynamic sign-in info dialogs explaining features available after signing in
- Built-in migration tool for handling orphaned loadouts between accounts (admin use)
- Improved anonymous user experience with clear messaging about feature availability

**Filtering & Sorting Improvements**
- Hybrid client-side/server-side sorting approach to avoid Firestore composite index requirements
- Batch filter updates prevent race conditions from multiple simultaneous queries
- Default sort by creation date (descending) - newest loadouts appear first
- Smart "My Setups" toggle that automatically clears other filters for clean view

**Performance & Data Management**
- Firestore query optimization reducing unnecessary composite indexes
- Granular security rules allowing owners full control while restricting others to likes-only
- HTML-based migration tool for bulk userId migrations when accounts become orphaned

**UX Enhancements**
- Dismissible instructions banner with option to hide permanently (requires sign-in)
- Persistent user preferences via localStorage (instruction visibility, theme, etc.)
- Clear branding as "Inventory Setups Viewer" with subtitle clarifying it's a community tool
- Mobile footer content accessible within dismissible welcome banner
- Modern glassmorphism snackbar notifications with backdrop blur and gradients

**Bug Fixes**
- Fixed category filter race conditions that caused duplicate queries
- Resolved Firestore index errors for category + sorting combinations
- Corrected filter count badge to accurately display number of active filters
- Fixed desktop filter button to properly open/close overlay on all screen sizes

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
  - **""** section at the top
  - Horizontal divider
  - **"Favorite Setups by Other Users"** section below (shows liked loadouts from other users)

**Data Privacy**
- Anonymous users can create loadouts without authentication
- Loadout ownership tied to user ID for proper permission checks
- Client-side filtering ensures users only see appropriate loadouts based on privacy settings

### 📥 Bulk Import & Sync System

**Multi-Step Import Wizard**
- **File Upload**: Drag-and-drop or file selection supporting both `.properties` (RuneLite profiles) and `.json` formats
- **Review Step**: Search and filter imported setups, edit categories/tags inline before import
- **Duplicate Detection**: Intelligent fuzzy matching (80%+ similarity) with visual side-by-side comparison
- **Conflict Resolution**: Choose to keep existing, use new (with tag merging), or keep both versions
- **Privacy Controls**: "Make setups public" checkbox (checked by default) with clear visual callout

**Smart Auto-Tagging System**
- **3-Tier Intelligence Architecture**:
  1. **OSRSBox Database Integration** (Primary): Fetches 1,300+ monsters from OSRSBox API with real game data
     - Uses actual `slayer_monster` and `slayer_level` properties for accurate categorization
     - Checks `is_boss` flags and combat levels
     - Local caching (7-day TTL) for performance
  2. **Curated Keyword Lists** (Secondary): 70+ boss names, 50+ slayer monsters, comprehensive activity lists
     - Handles spelling variations and typos (e.g., "abhorrent" vs "aberrant", "vetion" vs "vet'ion")
     - Fuzzy name matching for partial matches
  3. **Generic Keywords** (Fallback): Broad category keywords for low-confidence classification

- **Category System**:
  - **PVM**: Bosses (including Barrows), Slayer, Raids, Combat
  - **Skilling**: All 23 skills plus skilling-focused activities
  - **PvP**: Player vs Player activities
  - **Minigames**: NMZ, Soul Wars, Gauntlet, etc.
  - **Other**: Quests, Clue scrolls, miscellaneous activities

- **Auto-Tag Detection**:
  - **Activity Tags**: Bossing, Slayer, Wilderness, Minigames, Skilling, Questing
  - **Raid Tags**: ToB, CoX, ToA (auto-detected from names/notes)
  - **Progression Tags**: Beginner, Intermediate, Advanced, Endgame
  - **Utility Tags**: AFK, Money-Making, Ironman
  - **Custom Tags**: User-defined with autocomplete and wildcard search

**File Format Support**
- **RuneLite Profiles** (`.properties`): Parses Java properties format with embedded JSON
  - Handles escape sequences (`\:`, `\#`, `\=`, `\!`, `\ `)
  - Supports both `profiles/` and `profiles2/` directory structures
  - Multi-profile import (all setups from a single file)
- **Exported JSON** (`.json`): Direct RuneLite export format
  - Validates structure and required fields
  - Sanitizes hidden characters and whitespace
  - Detailed error messages with position and context

**Duplicate Detection & Resolution**
- **Fuzzy Matching Algorithm**: Compares inventory, equipment, and rune pouch with configurable thresholds
- **Visual Diff Viewer**: Side-by-side comparison showing:
  - Item differences (added, removed, changed)
  - Equipment differences
  - Rune pouch differences
  - Tag differences with merge notice
- **Smart Tag Merging**: When replacing, new tags are merged with existing tags (no data loss)
- **Ownership Protection**: Users cannot replace other users' setups (only keep prior or keep both)

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
- `src/app/core/services/firebase.service.ts` - Complete auth overhaul, account linking, loadout renaming, admin checks
- `src/app/core/services/admin.service.ts` - **NEW**: Admin operations, stats, migrations, duplicates detection
- `src/app/core/services/loadout.service.ts` - Privacy filtering, grouped loadouts, incremental search loading
- `src/app/core/services/file-parser.service.ts` - Multi-format parser (.properties + .json), escape sequence handling
- `src/app/core/services/duplicate-detection.service.ts` - Fuzzy matching algorithm, diff calculation
- `src/app/core/services/osrs-entity-database.service.ts` - OSRSBox integration, smart classification
- `src/app/core/components/header/` - Auth UI, user info display, OSRS username prompt, auto-hide on scroll
- `src/app/features/admin/` - **NEW**: Complete admin portal with dashboard, users, loadouts, migrations, duplicates
- `src/app/features/home/home.component.*` - Grouped loadouts UI, "My Setups" filter, username search
- `src/app/features/loadout/components/loadout-modal/` - Privacy toggle, inline name editing, OSRS username display
- `src/app/features/loadout/components/loadout-uploader/` - JSON validation improvements
- `src/app/features/loadout/components/bulk-import-wizard/` - Multi-step wizard, inline editing, search
- `src/app/features/loadout/components/setup-diff-viewer/` - Visual diff comparison, ownership checks
- `src/app/shared/components/sign-in-info/` - Sign-in success dialog, username prompt component
- `src/app/shared/models/inventory.model.ts` - Added UserProfile with OSRS username fields
- `firestore.rules` - Enhanced security with admin overrides and username field protection

**Bulk Import Methodology**
1. **File Upload & Parsing**:
   - Detect file format (`.properties` vs `.json`)
   - Parse using appropriate parser with error recovery
   - Extract all setups from multi-setup files

2. **Smart Auto-Tagging**:
   - Check OSRSBox cache (localStorage with 7-day TTL)
   - If cache miss, fetch from `https://www.osrsbox.com/osrsbox-db/monsters-complete.json`
   - For each setup:
     - Priority 1: Check for PvP keywords
     - Priority 2: Check for Minigame activities (NMZ, Barrows, etc.)
     - Priority 3: Check for Skilling keywords
     - Priority 4: Database lookup for monsters (exact + fuzzy match)
     - Priority 5: Curated keyword fallback
     - Priority 6: Generic combat keywords
   - Extract utility tags (AFK, Money-Making, Ironman) from names/notes
   - Assign confidence level (high/medium/low)

3. **Duplicate Detection**:
   - Load user's existing loadouts from Firestore
   - For each imported setup:
     - Compare inventory items (fuzzy match with 80% threshold)
     - Compare equipment slots (fuzzy match)
     - Compare rune pouch contents
     - Calculate overall similarity score
   - If match found, mark as duplicate and store diff

4. **User Review & Editing**:
   - Display all setups in searchable grid
   - Allow inline editing of category and tags
   - Show duplicate badges
   - Filter by name/notes

5. **Conflict Resolution**:
   - For each duplicate, show side-by-side comparison
   - Display item diffs (added/removed/changed)
   - Show tag merge preview
   - Enforce ownership rules (cannot replace others' setups)

6. **Batch Import**:
   - Use Firestore `writeBatch` for atomic operations
   - Apply user's chosen actions (skip, replace, keep both)
   - Merge tags when replacing (union of existing + new)
   - Set privacy based on global checkbox
   - Add sync metadata for tracking

### 🏷️ Community Tagging & Metadata System

**Interactive Tag Editor (Reusable Component)**
- Shared component (`app-tag-editor`) used in both bulk import wizard and loadout modal
- Material chip-grid with autocomplete for consistent UX
- Green chips with borders matching bulk import aesthetic
- Real-time tag suggestions with fuzzy filtering
- Support for custom tags (type and press Enter)

**Community Tagging Features**
- **Anyone can add tags**: Any logged-in user can add tags to any setup to help with discovery
- **Owner controls removal**: Only setup owners can remove tags (prevents vandalism)
- **Tag persistence**: All tag changes saved to Firestore with optimistic UI updates
- **Autocomplete suggestions**: Pre-populated with common tags (Bossing, Slayer, Wilderness, ToB, CoX, ToA, AFK, etc.)
- **Custom tags**: Users can create any custom tag with autocomplete filtering against existing tags

**Category Management**
- **Owner-only editing**: Category dropdown visible for setup owners (logged in)
- **Categories**: PVM, Skilling, PvP, Minigames, Other
- **Default handling**: Existing setups without categories default to "Other" on first view
- **Visual feedback**: Toast notifications for successful updates or errors
- **Readonly display**: Non-owners see category badge (no dropdown)

**Inline Metadata Display**
- Category and tags always visible below inventory/equipment (no hidden popovers)
- "Storage Items" renamed to "Inventory" for clarity
- Help text explaining community tagging permissions
- Clean, form-based layout matching bulk import wizard

**Firestore Security**
- Rules updated to allow:
  - **Tags**: Any authenticated user can update `tags` + `updatedAt` fields
  - **Category**: Only owner can update `category` + `updatedAt` fields
  - **Likes**: Any authenticated user can update `likes` field
  - **Full loadout**: Only owner can update all other fields

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