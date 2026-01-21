import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { StorageService } from './storage.service';

/**
 * OSRS Entity Database Service
 * 
 * Provides comprehensive data about OSRS monsters, bosses, NPCs, and activities
 * Data source: OSRSBox (https://www.osrsbox.com/) - a community-maintained database
 * 
 * This enables intelligent auto-tagging based on actual game data rather than keyword matching
 */

export interface OSRSMonster {
  id: number;
  name: string;
  combat_level?: number;
  slayer_level?: number;
  slayer_monster?: boolean; // From OSRSBox
  is_boss?: boolean; // Our classification
  duplicate?: boolean;
  examine?: string;
  wiki_url?: string;
  attack_level?: number;
  attributes?: string[];
}

export interface EntityClassification {
  category: 'PVM' | 'Skilling' | 'PvP' | 'Minigames' | 'Other';
  tags: string[];
  confidence: 'high' | 'medium' | 'low';
  matchedEntity?: string;
}

@Injectable({
  providedIn: 'root'
})
export class OsrsEntityDatabaseService {
  private readonly OSRSBOX_API = 'https://www.osrsbox.com/osrsbox-db';
  private readonly STORAGE_KEY_MONSTERS = 'osrs_monsters_db';
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  private monstersCache: OSRSMonster[] | null = null;
  private loadingPromise: Promise<OSRSMonster[]> | null = null;

  // Curated lists for intelligent categorization
  private readonly BOSS_NAMES = new Set([
    // GWD
    'general graardor', 'graardor', 'bandos', 'kree\'arra', 'kree', 'armadyl',
    'commander zilyana', 'zilyana', 'saradomin', 'k\'ril tsutsaroth', 'k\'ril', 'kril', 'zamorak', 'nex',
    // Wilderness
    'callisto', 'venenatis', 'vet\'ion', 'vetion', 'scorpia', 'chaos elemental', 'chaos fanatic',
    'crazy archaeologist', 'artio', 'calvar\'ion', 'spindel',
    // Dragon Bosses (ONLY actual boss dragons, not all dragons)
    'vorkath', 'galvek', 'king black dragon', 'kbd', 'brutal black dragon',
    // Slayer Bosses
    'cerberus', 'alchemical hydra', 'thermonuclear smoke devil', 'thermonuclear', 
    'kraken', 'abyssal sire', 'sire', 'araxxor',
    // Major Bosses
    'zulrah', 'tzkal-zuk', 'zuk', 'tztok-jad', 'jad', 'the nightmare', 'nightmare', 'phosani\'s nightmare', 'phosani',
    'corporeal beast', 'corp', 'kalphite queen', 'kq', 'sarachnis',
    'phantom muspah', 'muspah', 'duke sucellus', 'duke', 'vardorvis', 'the leviathan', 'leviathan', 'the whisperer', 'whisperer',
    // Raids
    'great olm', 'olm', 'verzik vitur', 'verzik', 'tumeken\'s warden', 'wardens',
    'maiden of sugadinti', 'bloat', 'nylocas', 'sotetseg', 'xarpus',
    // Minigame Bosses
    'wintertodt', 'tempoross', 'zalcano', 'sol heredit', 'the mimic',
    // DKs
    'dagannoth supreme', 'supreme', 'dagannoth prime', 'prime', 'dagannoth rex', 'rex', 'dks', 'dk',
    // Barrows
    'ahrim the blighted', 'dharok the wretched', 'guthan the infested',
    'karil the tainted', 'torag the corrupted', 'verac the defiled',
    'ahrim', 'dharok', 'guthan', 'karil', 'torag', 'verac', 'barrows'
  ]);

  private readonly RAID_KEYWORDS = new Set([
    'cox', 'chambers', 'olm', 'tob', 'theatre', 'verzik', 'maiden', 'bloat',
    'nylocas', 'sotetseg', 'xarpus', 'toa', 'tombs', 'amascut', 'wardens'
  ]);

  private readonly WILDERNESS_ACTIVITIES = new Set([
    'callisto', 'venenatis', 'vetion', 'vet\'ion', 'scorpia', 'chaos elemental',
    'artio', 'calvar\'ion', 'spindel', 'revenant', 'revs', 'chaos fanatic',
    'crazy archaeologist', 'lava dragon', 'wilderness', 'wildy'
  ]);

  private readonly SLAYER_MONSTERS = new Set([
    // Common Slayer Tasks (with typo variants)
    'hellhound', 'fire giant', 'greater demon', 'black demon', 'bloodveld',
    'aberrant spectre', 'aberrant', 'abhorrent', 'abhorant', 'spectre', 'specter',
    'abyssal demon', 'gargoyle', 'nechryael', 'dust devil',
    'kurask', 'turoth', 'ankou', 'cave horror', 'basilisk', 'fossil island wyvern',
    'suqah', 'elf warrior', 'elf', 'elves', 'iorwerth', 'drake', 'wyrm', 
    'superior', 'dark beast', 'smoke devil',
    // Dragons (PRIORITY - check before boss names)
    'metal dragon', 'metallic dragon', 'mithril dragon', 'iron dragon', 'steel dragon', 'bronze dragon',
    'blue dragon', 'red dragon', 'black dragon', 'green dragon',
    'lava dragon', 'skeletal wyvern',
    // Then general dragon keywords
    'dragon', 'dragons', 'wyvern',
    // Kalphites
    'kalphite', 'kalphites',
    // Trolls
    'troll', 'trolls', 'ice troll', 'mountain troll',
    // Other Common
    'demon', 'giant'
  ]);

  private readonly MINIGAME_ACTIVITIES = new Set([
    'nmz', 'nightmare zone', 'wintertodt', 'tempoross', 'zalcano', 
    'pest control', 'pc', 'barbarian assault', 'ba', 'fight pit', 
    'lms', 'last man standing', 'soul wars', 'castle wars', 
    'gauntlet', 'corrupted gauntlet', 'sepulchre', 'hallowed sepulchre', 
    'gotr', 'guardians of the rift', 'tithe farm', 'tithe'
  ]);

  private readonly SKILLING_ACTIVITIES = new Set([
    'mining', 'mlm', 'motherlode', 'blast mine', 'volcanic mine',
    'fishing', 'barb', 'barbarian fishing', 'drift net', 'aerial',
    'woodcutting', 'wc', 'redwood', 'teaks', 'mahogany',
    'agility', 'rooftop', 'seers', 'ardy', 'prif',
    'runecraft', 'runecrafting', 'rc', 'gotr', 'guardians', 'bloods', 'souls', 'lavas',
    'thieving', 'pickpocket', 'blackjack', 'ardy knights',
    'hunter', 'chinchompa', 'bird house', 'birdhouse', 'herbiboar',
    'farming', 'farm run', 'tithe', 'tithe farm',
    'construction', 'con', 'mahogany homes',
    'cooking', 'karambwan', 'wines',
    'firemaking', 'fm', 'wintertodt',
    'crafting', 'glass', 'battlestaves',
    'smithing', 'blast furnace', 'bf',
    'herblore', 'herb', 'potions',
    'fletching', 'darts', 'bolts',
    'sailing', 'fossil island'
  ]);

  constructor(
    private http: HttpClient,
    private storageService: StorageService
  ) {
    this.loadFromStorage();
  }

  /**
   * Load monster database from localStorage cache
   */
  private loadFromStorage(): void {
    this.storageService.getItem<{ data: OSRSMonster[], timestamp: number }>('osrs', this.STORAGE_KEY_MONSTERS)
      .subscribe(stored => {
        if (stored && Date.now() - stored.timestamp < this.CACHE_DURATION) {
          this.monstersCache = stored.data;
          console.log(`Loaded ${stored.data.length} monsters from cache`);
        } else {
          // Cache expired or doesn't exist, fetch fresh data
          this.fetchMonsterDatabase().then(() => {
            console.log('Monster database refreshed');
          });
        }
      });
  }

  /**
   * Save monster database to localStorage
   */
  private saveToStorage(data: OSRSMonster[]): void {
    this.storageService.setItem('osrs', this.STORAGE_KEY_MONSTERS, {
      data,
      timestamp: Date.now()
    }).subscribe();
  }

  /**
   * Fetch monster database from OSRSBox
   * Falls back to curated static list if API fails
   */
  async fetchMonsterDatabase(): Promise<OSRSMonster[]> {
    // Return cached data if available
    if (this.monstersCache) {
      return this.monstersCache;
    }

    // If already loading, return existing promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start new fetch
    this.loadingPromise = new Promise((resolve) => {
      this.http.get<{ [key: string]: OSRSMonster }>(`${this.OSRSBOX_API}/monsters-complete.json`)
        .pipe(
          map(monstersDict => {
            // Convert dictionary to array and filter out duplicates
            const monstersArray = Object.values(monstersDict)
              .filter(m => !m.duplicate)
              .map(m => ({
                id: m.id,
                name: m.name,
                combat_level: m.combat_level,
                slayer_level: m.slayer_level,
                slayer_monster: m.slayer_monster,
                is_boss: this.BOSS_NAMES.has(m.name.toLowerCase()),
                examine: m.examine,
                wiki_url: m.wiki_url,
                attributes: m.attributes || []
              }));
            
            return monstersArray;
          }),
          tap(monsters => {
            this.monstersCache = monsters;
            this.saveToStorage(monsters);
            console.log(`Fetched ${monsters.length} monsters from OSRSBox`);
          }),
          catchError(error => {
            console.warn('Failed to fetch from OSRSBox, using curated fallback', error);
            const fallback = this.getCuratedFallbackData();
            this.monstersCache = fallback;
            this.saveToStorage(fallback);
            return of(fallback);
          })
        )
        .subscribe(
          monsters => resolve(monsters),
          error => {
            const fallback = this.getCuratedFallbackData();
            this.monstersCache = fallback;
            resolve(fallback);
          }
        );
    });

    return this.loadingPromise;
  }

  /**
   * Classify a setup name/notes into category and tags (SYNCHRONOUS VERSION)
   * This is the SMART auto-tagging function
   * Uses cached database if available, otherwise returns null
   */
  classifySetupSync(name: string, notes?: string): EntityClassification | null {
    const combined = `${name} ${notes || ''}`.toLowerCase();
    
    // Only proceed if database is already loaded
    if (!this.monstersCache || this.monstersCache.length === 0) {
      // Trigger async load for next time
      this.fetchMonsterDatabase().catch(err => console.warn('DB fetch failed:', err));
      return null;
    }

    // Priority 1: Check for PvP
    if (this.containsAny(combined, ['pvp', 'pk', 'pking', 'player kill', 'lms', 'bounty', 'duel'])) {
      return {
        category: 'PvP',
        tags: ['PvP', ...this.getWildernessTag(combined)],
        confidence: 'high'
      };
    }

    // Priority 2: Check for Minigames (BEFORE Skilling and Combat!)
    const minigameMatch = this.matchMinigames(combined);
    if (minigameMatch) {
      return minigameMatch;
    }

    // Priority 3: Check for Skilling
    const skillingMatch = this.matchSkilling(combined);
    if (skillingMatch) {
      return skillingMatch;
    }

    // Priority 4: Check for PVM (Bosses, Slayer, etc.)
    const combatMatch = this.matchCombatSync(combined);
    if (combatMatch) {
      return combatMatch;
    }

    // Priority 5: Minigames (Quests, etc.)
    const otherMatch = this.matchOther(combined);
    if (otherMatch) {
      return otherMatch;
    }

    // Default: Other
    return {
      category: 'Other',
      tags: [],
      confidence: 'low'
    };
  }

  /**
   * Match against minigames (EARLY priority to catch NMZ, etc.)
   */
  private matchMinigames(text: string): EntityClassification | null {
    for (const activity of this.MINIGAME_ACTIVITIES) {
      if (text.includes(activity)) {
        const tags = ['Minigames', ...this.getUtilityTags(text)];
        return {
          category: 'Minigames',
          tags: tags.filter(Boolean),
          confidence: 'high',
          matchedEntity: activity
        };
      }
    }
    return null;
  }

  /**
   * Match against skilling activities
   */
  private matchSkilling(text: string): EntityClassification | null {
    for (const skill of this.SKILLING_ACTIVITIES) {
      if (text.includes(skill)) {
        const tags = ['Skilling', this.getProgressionTag(text), ...this.getUtilityTags(text)];
        return {
          category: 'Skilling',
          tags: tags.filter(Boolean),
          confidence: 'high',
          matchedEntity: skill
        };
      }
    }
    return null;
  }

  /**
   * Match against combat activities using DATABASE + curated lists
   * PRIORITY ORDER: Raids > Database Lookup > Keyword Fallback
   */
  private matchCombatSync(text: string): EntityClassification | null {
    const tags: string[] = [];

    // Priority 1: Check for raids (highest priority)
    if (this.containsAny(text, Array.from(this.RAID_KEYWORDS))) {
      tags.push('Bossing', 'Endgame');
      if (text.includes('tob') || text.includes('theatre')) tags.push('ToB');
      if (text.includes('cox') || text.includes('chambers')) tags.push('CoX');
      if (text.includes('toa') || text.includes('tombs')) tags.push('ToA');
      
      return {
        category: 'PVM',
        tags: tags.concat(this.getWildernessTag(text), this.getUtilityTags(text)),
        confidence: 'high'
      };
    }

    // Priority 2: DATABASE LOOKUP - Search for matching monsters
    if (this.monstersCache && this.monstersCache.length > 0) {
      const matchedMonster = this.findMonsterInDatabase(text);
      
      if (matchedMonster) {
        // Determine if it's a boss or slayer monster based on database
        const isBoss = matchedMonster.is_boss || this.BOSS_NAMES.has(matchedMonster.name.toLowerCase());
        const isSlayerMonster = matchedMonster.slayer_monster || (matchedMonster.slayer_level && matchedMonster.slayer_level > 0);
        
        if (isBoss) {
          tags.push('Bossing');
          
          // Check if it's also a slayer boss
          if (isSlayerMonster) {
            tags.push('Slayer');
          }
        } else if (isSlayerMonster) {
          tags.push('Slayer');
        }
        
        // Add progression tag
        const progressionTag = this.getProgressionTag(text);
        if (progressionTag) tags.push(progressionTag);
        
        // Check for wilderness
        if (this.WILDERNESS_ACTIVITIES.has(matchedMonster.name.toLowerCase())) {
          tags.push('Wilderness');
        }
        
        // Add utility tags
        tags.push(...this.getUtilityTags(text));
        
        return {
          category: 'PVM',
          tags: tags.filter(Boolean),
          confidence: 'high',
          matchedEntity: matchedMonster.name
        };
      }
    }

    // Priority 3: Keyword-based fallback for slayer monsters
    for (const monster of this.SLAYER_MONSTERS) {
      if (text.includes(monster)) {
        tags.push('Slayer');
        
        // Only add Bossing if it's actually a slayer boss
        if (['cerberus', 'hydra', 'alchemical hydra', 'thermonuclear', 'kraken', 'abyssal sire', 'sire', 'araxxor'].some(b => text.includes(b))) {
          tags.push('Bossing');
        }
        
        const progressionTag = this.getProgressionTag(text);
        if (progressionTag) tags.push(progressionTag);
        tags.push(...this.getUtilityTags(text));
        
        return {
          category: 'PVM',
          tags: tags.filter(Boolean),
          confidence: 'high',
          matchedEntity: monster
        };
      }
    }

    // Priority 4: Keyword-based fallback for bosses
    for (const boss of this.BOSS_NAMES) {
      if (text.includes(boss)) {
        tags.push('Bossing');
        
        const progressionTag = this.getProgressionTag(text);
        if (progressionTag) tags.push(progressionTag);
        
        if (this.WILDERNESS_ACTIVITIES.has(boss)) {
          tags.push('Wilderness');
        }
        
        tags.push(...this.getUtilityTags(text));
        
        return {
          category: 'PVM',
          tags: tags.filter(Boolean),
          confidence: 'high',
          matchedEntity: boss
        };
      }
    }

    // Priority 5: General slayer keywords
    if (this.containsAny(text, ['slayer', 'task', 'assignment'])) {
      return {
        category: 'PVM',
        tags: ['Slayer', ...this.getUtilityTags(text)],
        confidence: 'medium'
      };
    }
    
    // Priority 6: General PvM/Combat keywords (NMZ removed - it's a minigame!)
    if (this.containsAny(text, ['pvm', 'crabs', 'sand crab', 'ammonite'])) {
      return {
        category: 'PVM',
        tags: this.getUtilityTags(text),
        confidence: 'medium'
      };
    }
    
    // Priority 7: Generic combat style setups (mage, melee, range)
    if (this.containsAny(text, ['mage', 'magic', 'melee', 'range', 'ranged', 'combat'])) {
      return {
        category: 'PVM',
        tags: this.getUtilityTags(text),
        confidence: 'low'
      };
    }

    return null;
  }

  /**
   * Find a monster in the database by fuzzy name matching
   */
  private findMonsterInDatabase(text: string): OSRSMonster | null {
    if (!this.monstersCache) return null;

    // Try exact word match first
    const words = text.split(/\s+/);
    
    for (const monster of this.monstersCache) {
      const monsterNameLower = monster.name.toLowerCase();
      
      // Exact name match
      if (text.includes(monsterNameLower)) {
        return monster;
      }
      
      // Partial word match (e.g., "Blue Dragon" matches "blue dragon")
      if (words.some(word => monsterNameLower.includes(word) && word.length > 3)) {
        return monster;
      }
    }
    
    return null;
  }

  /**
   * Match against other activities (quests, clues, etc.)
   * Note: Minigames are now handled earlier in matchMinigames()
   */
  private matchOther(text: string): EntityClassification | null {
    // Check for quests
    if (this.containsAny(text, ['quest', 'recipe for disaster', 'dt2', 'song of the elves'])) {
      return {
        category: 'Minigames',
        tags: ['Questing'],
        confidence: 'high'
      };
    }

    // Check for clues
    if (text.includes('clue')) {
      return {
        category: 'Minigames',
        tags: [],
        confidence: 'medium'
      };
    }

    return null;
  }

  /**
   * Get wilderness tag if applicable
   */
  private getWildernessTag(text: string): string[] {
    for (const activity of this.WILDERNESS_ACTIVITIES) {
      if (text.includes(activity)) {
        return ['Wilderness'];
      }
    }
    return [];
  }

  /**
   * Get progression tag based on keywords (returns single tag)
   */
  private getProgressionTag(text: string): string {
    if (this.containsAny(text, ['beginner', 'starter', 'budget', 'low level', 'f2p'])) return 'Beginner';
    if (this.containsAny(text, ['endgame', 'bis', 'inferno', 'cm', 'hard mode', 'master'])) return 'Endgame';
    if (this.containsAny(text, ['advanced', 'high level', 'max'])) return 'Advanced';
    if (this.containsAny(text, ['intermediate', 'mid', 'medium'])) return 'Intermediate';
    return '';
  }

  /**
   * Get utility tags (can return multiple)
   */
  private getUtilityTags(text: string): string[] {
    const tags: string[] = [];
    
    if (this.containsAny(text, ['afk', 'semi-afk', 'semi afk', 'chill', 'relaxed'])) {
      tags.push('AFK');
    }
    
    if (this.containsAny(text, ['money', 'profit', 'gp', 'gold', 'money making', 'moneymaking'])) {
      tags.push('Money-Making');
    }
    
    if (this.containsAny(text, ['ironman', 'iron', 'uim', 'hcim', 'hardcore', ' im '])) {
      tags.push('Ironman');
    }
    
    return tags;
  }

  /**
   * Helper: Check if text contains any of the given keywords
   */
  private containsAny(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => text.includes(keyword));
  }

  /**
   * Curated fallback data if API fails
   * Includes most common bosses and monsters
   */
  private getCuratedFallbackData(): OSRSMonster[] {
    return Array.from(this.BOSS_NAMES).map((name, index) => ({
      id: 10000 + index,
      name,
      is_boss: true
    }));
  }

  /**
   * Search for a monster by name (fuzzy match)
   */
  async searchMonster(query: string): Promise<OSRSMonster[]> {
    await this.fetchMonsterDatabase();
    
    if (!this.monstersCache) return [];

    const lowerQuery = query.toLowerCase();
    return this.monstersCache
      .filter(m => m.name.toLowerCase().includes(lowerQuery))
      .slice(0, 10); // Limit to top 10 results
  }
}
