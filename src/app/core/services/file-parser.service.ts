import { Injectable } from '@angular/core';
import { Setup, LoadoutJson } from '../../shared/models/inventory.model';
import { OsrsEntityDatabaseService } from './osrs-entity-database.service';

export interface ParsedSetup {
  setup: Setup;
  layout?: number[];
  metadata: {
    fileName: string;
    originalFormat: string;
    suggestedCategory?: 'Combat' | 'Skilling' | 'PvP' | 'Other';
    detectedTags?: string[];
    editing?: boolean; // For inline editing UI state
  };
  selected: boolean;
}

export interface ParseError {
  fileName: string;
  line?: number;
  message: string;
  context?: string;
}

export interface ParseResult {
  setups: ParsedSetup[];
  errors: ParseError[];
  totalFiles: number;
  successfulFiles: number;
}

@Injectable({
  providedIn: 'root'
})
export class FileParserService {
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_EXTENSIONS = ['.json', '.txt', '.properties', ''];

  constructor(private osrsEntityDb: OsrsEntityDatabaseService) {}

  /**
   * Parse multiple files and extract all setups
   */
  async parseFiles(files: File[]): Promise<ParseResult> {
    const allSetups: ParsedSetup[] = [];
    const allErrors: ParseError[] = [];
    let successfulFiles = 0;

    for (const file of files) {
      // Validate file
      const validationError = this.validateFile(file);
      if (validationError) {
        allErrors.push(validationError);
        continue;
      }

      try {
        const content = await this.readFileContent(file);
        const fileResult = this.parseFileContent(content, file.name);
        
        allSetups.push(...fileResult.setups);
        allErrors.push(...fileResult.errors);
        
        if (fileResult.setups.length > 0) {
          successfulFiles++;
        }
      } catch (error) {
        allErrors.push({
          fileName: file.name,
          message: error instanceof Error ? error.message : 'Failed to read file',
        });
      }
    }

    return {
      setups: allSetups,
      errors: allErrors,
      totalFiles: files.length,
      successfulFiles
    };
  }

  /**
   * Parse a single text content (from paste or file)
   */
  parseText(text: string, fileName: string = 'pasted-content'): ParseResult {
    return this.parseFileContent(text, fileName);
  }

  /**
   * Validate a file before parsing
   */
  private validateFile(file: File): ParseError | null {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        fileName: file.name,
        message: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
      };
    }

    // Check file extension (allow files without extension for RuneLite config files)
    const extension = this.getFileExtension(file.name);
    if (extension && !this.ALLOWED_EXTENSIONS.includes(extension)) {
      return {
        fileName: file.name,
        message: `File type '${extension}' not supported. Allowed types: ${this.ALLOWED_EXTENSIONS.filter(e => e).join(', ')} or files without extension`
      };
    }

    return null;
  }

  /**
   * Read file content as text
   */
  private readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Parse file content and extract setups
   */
  private parseFileContent(content: string, fileName: string): ParseResult {
    const setups: ParsedSetup[] = [];
    const errors: ParseError[] = [];

    // Clean the input text
    let cleanText = content.trim();
    
    // Remove zero-width characters
    cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (!cleanText) {
      errors.push({
        fileName,
        message: 'File is empty'
      });
      return { setups, errors, totalFiles: 1, successfulFiles: 0 };
    }

    // Try to detect format
    if (cleanText.startsWith('banktaglayoutsplugin:') || cleanText.startsWith('banktags,')) {
      // Bank tag format - not supported in bulk import yet
      errors.push({
        fileName,
        message: 'Bank tag layouts should be imported individually through the standard import dialog'
      });
      return { setups, errors, totalFiles: 1, successfulFiles: 0 };
    }

    // Check if this is a RuneLite .properties file format
    if (cleanText.includes('inventorysetups.setupsV3_') || cleanText.startsWith('#RuneLite configuration')) {
      return this.parsePropertiesFile(cleanText, fileName);
    }

    // Try to parse as JSON (single or array)
    try {
      const parsed = this.parseJSON(cleanText);
      
      if (Array.isArray(parsed)) {
        // Array of setups
        parsed.forEach((item, index) => {
          try {
            const setup = this.validateAndExtractSetup(item, fileName, index);
            if (setup) {
              setups.push(setup);
            }
          } catch (error) {
            errors.push({
              fileName,
              line: index + 1,
              message: error instanceof Error ? error.message : 'Invalid setup format',
              context: `Setup ${index + 1}`
            });
          }
        });
      } else {
        // Single setup
        try {
          const setup = this.validateAndExtractSetup(parsed, fileName);
          if (setup) {
            setups.push(setup);
          }
        } catch (error) {
          errors.push({
            fileName,
            message: error instanceof Error ? error.message : 'Invalid setup format'
          });
        }
      }
    } catch (error) {
      errors.push({
        fileName,
        message: error instanceof Error ? error.message : 'Invalid JSON format'
      });
    }

    return {
      setups,
      errors,
      totalFiles: 1,
      successfulFiles: setups.length > 0 ? 1 : 0
    };
  }

  /**
   * Parse JSON with support for concatenated objects
   */
  private parseJSON(text: string): any {
    // Try to parse as standard JSON first
    try {
      return JSON.parse(text);
    } catch (firstError) {
      // If that fails, try to extract multiple concatenated JSON objects
      const objects = this.extractConcatenatedJSON(text);
      if (objects.length > 0) {
        return objects;
      }
      throw firstError;
    }
  }

  /**
   * Extract multiple concatenated JSON objects
   */
  private extractConcatenatedJSON(text: string): any[] {
    const objects: any[] = [];
    let currentPos = 0;
    
    while (currentPos < text.length) {
      // Skip whitespace
      while (currentPos < text.length && /\s/.test(text[currentPos])) {
        currentPos++;
      }
      
      if (currentPos >= text.length) break;
      
      // Find the next complete JSON object
      const objStart = currentPos;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = currentPos; i < text.length; i++) {
        const char = text[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              // Found a complete object
              const objText = text.substring(objStart, i + 1);
              try {
                const obj = JSON.parse(objText);
                objects.push(obj);
              } catch (e) {
                // Invalid JSON, skip it
              }
              currentPos = i + 1;
              break;
            }
          }
        }
      }
      
      // If we didn't find a complete object, break
      if (braceCount !== 0) {
        break;
      }
    }
    
    return objects;
  }

  /**
   * Validate and extract setup from parsed JSON
   */
  private validateAndExtractSetup(
    data: any,
    fileName: string,
    index?: number
  ): ParsedSetup | null {
    // Validate that data is an object
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid setup format: expected an object');
    }

    // Check for setup object
    if (!data.setup || typeof data.setup !== 'object') {
      throw new Error('Invalid setup format: missing or invalid "setup" object');
    }

    const setup = data.setup;

    // Validate required fields
    if (!setup.name || typeof setup.name !== 'string') {
      throw new Error('Invalid setup format: missing or invalid "setup.name"');
    }

    if (!Array.isArray(setup.inv)) {
      throw new Error('Invalid setup format: "setup.inv" must be an array');
    }

    if (!Array.isArray(setup.eq)) {
      throw new Error('Invalid setup format: "setup.eq" must be an array');
    }

    // Validate array lengths
    if (setup.inv.length !== 28) {
      throw new Error(`Invalid setup format: inventory must have exactly 28 slots, got ${setup.inv.length}`);
    }

    if (setup.eq.length !== 14) {
      throw new Error(`Invalid setup format: equipment must have exactly 14 slots, got ${setup.eq.length}`);
    }

    // Extract layout if present
    const layout = data.layout
      ? data.layout
          .map((val: any) => (typeof val === 'string' ? parseInt(val, 10) : val))
          .filter((val: any): val is number => typeof val === 'number' && !isNaN(val))
      : undefined;

    // Detect suggested category and tags based on setup name and notes
    const { suggestedCategory, detectedTags } = this.detectMetadata(setup);

    return {
      setup,
      layout,
      metadata: {
        fileName,
        originalFormat: JSON.stringify(data),
        suggestedCategory,
        detectedTags
      },
      selected: true // Default to selected
    };
  }

  /**
   * Fallback keyword-based detection (original logic)
   */
  private detectMetadataFallback(setup: Setup): {
    suggestedCategory?: 'Combat' | 'Skilling' | 'PvP' | 'Other';
    detectedTags?: string[];
  } {
    const name = setup.name.toLowerCase();
    const notes = (setup.notes || '').toLowerCase();
    const combined = `${name} ${notes}`;

    // Detect category (MECE: Mutually Exclusive, Collectively Exhaustive)
    let suggestedCategory: 'Combat' | 'Skilling' | 'PvP' | 'Other' | undefined;
    
    // PvP Keywords (Priority 1 - most specific)
    const pvpKeywords = [
      'pvp', 'pk', 'pking', 'player kill', 'lms', 'last man standing',
      'pvp world', 'bounty', 'duel', 'arena', 'soul wars', 'castle wars'
    ];

    // Skilling Keywords (Priority 2)
    const skillingKeywords = [
      // Core Skills
      'mining', 'fishing', 'woodcutting', 'wc', 'agility', 'thieving', 'farming',
      'runecrafting', 'runecraft', 'rc', 'hunter', 'construction', 'con', 
      'smithing', 'crafting', 'fletching', 'cooking', 'firemaking', 'fm', 'herblore', 'herb',
      // Skilling Activities  
      'tithe', 'farm run', 'bird house', 'birdhouse', 'seaweed',
      'mlm', 'motherlode', 'blast mine', 'volcanic mine', 'drift net',
      'aerial', 'karambwan', 'monkfish', 'shark', 'minnow', 'barbarian fishing',
      'gotr', 'guardians of the rift'
    ];

    // Combat Keywords (Priority 3 - includes all PvM)
    const combatKeywords = [
      // Bosses
      'boss', 'pvm',
      // GWD
      'bandos', 'graardor', 'armadyl', 'kreearra', 'kree', 'saradomin', 'zilyana', 
      'zamorak', 'kril', 'k\'ril', 'nex',
      // DKs
      'dag', 'dagannoth', 'supreme', 'prime', 'rex', 'dks', 'dk',
      // Wilderness Bosses
      'callisto', 'venenatis', 'vetion', 'vet\'ion', 'scorpia', 'chaos elemental', 
      'crazy archaeologist', 'chaos fanatic',
      // Dragon Bosses
      'vorkath', 'galvek', 'kbd', 'king black dragon', 'brutal black dragon',
      // Slayer Bosses
      'cerberus', 'alchemical hydra', 'thermonuclear', 'kraken', 'abyssal sire',
      // Raids
      'cox', 'chambers', 'olm', 'tob', 'theatre', 'verzik', 'maiden', 'bloat',
      'nylocas', 'sotetseg', 'xarpus', 'toa', 'tombs', 'amascut', 'wardens', 'raid',
      // Major Bosses
      'zulrah', 'jad', 'zuk', 'inferno', 'fight cave', 'gauntlet', 'corrupted',
      'nightmare', 'phosani', 'corp', 'corporeal', 'muspah',
      'leviathan', 'duke', 'whisperer', 'vardorvis', 'dt2',
      // Insect Bosses
      'kalphite queen', 'kq', 'kalphite', 'kalphites', 'sarachnis',
      // Slayer
      'slayer', 'task', 'assignment',
      'hellhound', 'fire giant', 'greater demon', 'black demon', 'bloodveld',
      'aberrant', 'abyssal demon', 'gargoyle', 'nechryael', 'dust devil',
      'kurask', 'turoth', 'ankou', 'cave horror', 'basilisk', 'spectre',
      'suqah', 'elf', 'elves', 'iorwerth', 'drake', 'wyrm',
      // Dragons
      'dragon', 'mithril dragon', 'iron dragon', 'steel dragon', 'bronze dragon',
      'blue dragon', 'red dragon', 'black dragon', 'green dragon', 'lava dragon',
      'wyvern', 'skeletal wyvern',
      // Combat Training
      'nmz', 'nightmare zone', 'combat', 'training', 'crabs', 'sand crab', 'ammonite',
      'rock crab', 'experiments', 'melee', 'range', 'magic', 'prayer'
    ];

    // Other Keywords (Priority 4 - minigames, quests, clues)
    const otherKeywords = [
      // Minigames
      'wintertodt', 'tempoross', 'zalcano', 'barrows', 'minigame',
      'pest control', 'pc', 'barbarian assault', 'ba', 'fight pit',
      // Quests & Activities
      'quest', 'clue', 'treasure', 'elite clue', 'hard clue', 'medium clue',
      'diary', 'achievement', 'bank', 'fashionscape'
    ];

    // Determine category (MECE - each setup belongs to exactly ONE category)
    if (pvpKeywords.some(keyword => combined.includes(keyword))) {
      suggestedCategory = 'PvP';
    } 
    else if (skillingKeywords.some(keyword => combined.includes(keyword))) {
      suggestedCategory = 'Skilling';
    }
    else if (combatKeywords.some(keyword => combined.includes(keyword))) {
      suggestedCategory = 'Combat';
    }
    else if (otherKeywords.some(keyword => combined.includes(keyword))) {
      suggestedCategory = 'Other';
    }
    else {
      // Equipment-based fallback
      const hasCombatGear = setup.eq?.some(item => {
        if (!item || item.id <= 0) return false;
        const itemId = Math.abs(item.id);
        return (
          (itemId >= 1153 && itemId <= 1185) || // Bronze to rune
          (itemId >= 1215 && itemId <= 1305) || // Dragon
          (itemId >= 4708 && itemId <= 4759) || // Barrows
          (itemId >= 11732 && itemId <= 11808) || // GWD
          [4151, 6528, 4587, 11284].includes(itemId) // Whip, Gmaul, D scim, DDS
        );
      });
      
      suggestedCategory = hasCombatGear ? 'Combat' : 'Other';
    }

    // Detect tags (simple MECE core tags only)
    const detectedTags: string[] = [];
    
    const tagKeywords = {
      // Activity (6 tags)
      'Bossing': ['boss', 'gwd', 'god wars', 'zulrah', 'vorkath', 'nightmare', 'corp', 'nex', 'dt2', 
                  'bandos', 'armadyl', 'saradomin', 'zilyana', 'callisto', 'venenatis', 'cerberus', 'hydra'],
      'Slayer': ['slayer', 'task', 'assignment', 'hellhound', 'fire giant', 'bloodveld', 'gargoyle', 
                 'abyssal demon', 'dust devil', 'nechryael', 'superior'],
      'Skilling': ['skill', 'runecraft', 'rc', 'mining', 'mlm', 'woodcutting', 'wc', 'fishing', 'barb',
                   'agility', 'rooftop', 'thieving', 'pickpocket', 'hunter', 'herblore', 'farming'],
      'Questing': ['quest', 'recipe for disaster', 'dt2', 'song of the elves', 'monkey madness', 'dragon slayer'],
      'Minigames': ['wintertodt', 'tempoross', 'zalcano', 'ba', 'barbarian assault', 'pest control', 'lms',
                    'soul wars', 'castle wars', 'gotr', 'guardians'],
      'PvP': ['pvp', 'pk', 'pking', 'lms', 'soul wars', 'bounty', 'wilderness', 'wildy', 'revenant'],
      
      // Progression (4 tags)
      'Beginner': ['beginner', 'starter', 'budget', 'low level', 'f2p', 'obor', 'easy'],
      'Intermediate': ['intermediate', 'mid', 'medium', 'barrows'],
      'Advanced': ['advanced', 'high level', 'max', 'hard mode', 'cm'],
      'Endgame': ['endgame', 'bis', 'inferno', 'tob', 'corrupted gauntlet', 'master', 'elite'],
      
      // Utility (3 tags)
      'AFK': ['afk', 'semi-afk', 'chill', 'relaxed', 'nmz', 'crabs', 'ammonite', 'blood', 'redwood'],
      'Money-Making': ['money', 'profit', 'gp', 'gold', 'vorkath', 'zulrah', 'cox', 'tob', 'toa', 'revenant'],
      'Ironman': ['ironman', 'iron', 'uim', 'hcim', 'hardcore', 'im']
    };

    Object.entries(tagKeywords).forEach(([tag, keywords]) => {
      if (keywords.some(keyword => combined.includes(keyword))) {
        detectedTags.push(tag);
      }
    });

    return {
      suggestedCategory,
      detectedTags: detectedTags.length > 0 ? detectedTags : undefined
    };
  }

  /**
   * Synchronous metadata detection using cached database
   */
  private detectMetadata(setup: Setup): {
    suggestedCategory?: 'Combat' | 'Skilling' | 'PvP' | 'Other';
    detectedTags?: string[];
  } {
    // Try smart detection first (uses cached database)
    try {
      const classification = this.osrsEntityDb.classifySetupSync(setup.name, setup.notes);
      
      if (classification && (classification.confidence === 'high' || classification.confidence === 'medium')) {
        return {
          suggestedCategory: classification.category,
          detectedTags: classification.tags.length > 0 ? classification.tags : undefined
        };
      }
    } catch (error) {
      console.warn('Smart detection failed, falling back to keyword matching:', error);
    }

    // Fallback to keyword-based detection
    return this.detectMetadataFallback(setup);
  }

  /**
   * Parse RuneLite .properties file format
   */
  private parsePropertiesFile(content: string, fileName: string): ParseResult {
    const setups: ParsedSetup[] = [];
    const errors: ParseError[] = [];
    
    // Split into lines and find all inventory setup entries
    const lines = content.split('\n');
    let lineNumber = 0;
    
    for (const line of lines) {
      lineNumber++;
      
      // Look for lines starting with inventorysetups.setupsV3_
      if (line.startsWith('inventorysetups.setupsV3_')) {
        try {
          // Extract the JSON part after the equals sign
          const equalsIndex = line.indexOf('=');
          if (equalsIndex === -1) {
            continue;
          }
          
          let jsonString = line.substring(equalsIndex + 1).trim();
          
          // Unescape Java properties format
          // Java properties escape these characters: : = # ! and space at start/end
          // But JSON only recognizes: \" \\ \/ \b \f \n \r \t \uXXXX
          // So we need to remove the backslashes for non-JSON escape sequences
          jsonString = jsonString
            .replace(/\\:/g, ':')     // Unescape colons
            .replace(/\\#/g, '#')     // Unescape hash (for hex colors like #FF0000)
            .replace(/\\=/g, '=')     // Unescape equals
            .replace(/\\!/g, '!')     // Unescape exclamation
            .replace(/\\ /g, ' ');    // Unescape spaces
          
          // Parse the JSON
          const setupData = JSON.parse(jsonString);
          
          // Wrap in the expected format
          const wrappedData = {
            setup: setupData,
            layout: undefined
          };
          
          const parsedSetup = this.validateAndExtractSetup(wrappedData, fileName);
          if (parsedSetup) {
            setups.push(parsedSetup);
          }
        } catch (error) {
          errors.push({
            fileName,
            line: lineNumber,
            message: `Failed to parse setup: ${error instanceof Error ? error.message : 'Invalid format'}`,
            context: line.substring(0, 50) + '...'
          });
        }
      }
    }
    
    if (setups.length === 0 && errors.length === 0) {
      errors.push({
        fileName,
        message: 'No inventory setups found in this file. Make sure this is a RuneLite configuration file with saved setups.'
      });
    }
    
    return {
      setups,
      errors,
      totalFiles: 1,
      successfulFiles: setups.length > 0 ? 1 : 0
    };
  }

  /**
   * Get file extension including the dot
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot >= 0 ? fileName.substring(lastDot).toLowerCase() : '';
  }
}
