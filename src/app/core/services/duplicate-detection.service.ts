import { Injectable } from '@angular/core';
import { Setup, LoadoutData, Item } from '../../shared/models/inventory.model';
import { ParsedSetup } from './file-parser.service';

export interface DuplicateMatch {
  newSetup: ParsedSetup;
  existingSetup: LoadoutData;
  similarityScore: number; // 0-100
  differences: DiffResult;
  action: 'skip' | 'replace' | 'keep_both';
}

export interface DiffResult {
  inventoryDiff: ItemDiff;
  equipmentDiff: ItemDiff;
  runePouchDiff?: ItemDiff;
  afiDiff?: ItemDiff;
  overallDifferences: string[];
}

export interface ItemDiff {
  added: Item[]; // Items in new but not in existing
  removed: Item[]; // Items in existing but not in new
  quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }>;
  fuzzyMatch: Array<{ item1: Item; item2: Item }>; // Items that match via fuzzy matching (different variants)
  identical: Item[];
}

@Injectable({
  providedIn: 'root'
})
export class DuplicateDetectionService {
  private readonly DEFAULT_THRESHOLD = 80; // 80% similarity
  // Weights focus on core inventory and gear for duplicate detection
  // Rune pouch and quantity differences are shown but don't prevent duplicate flagging
  private readonly WEIGHTS = {
    inventory: 0.45, // 45% - core inventory is most important
    equipment: 0.40, // 40% - equipment is very important (uses fuzzy matching)
    runePouch: 0.10, // 10% - rune pouch differences are less critical
    afi: 0.05 // 5% - additional filtered items are least important
  };

  constructor() {}

  /**
   * Find duplicate matches for a list of new setups against existing setups
   */
  findDuplicates(
    newSetups: ParsedSetup[],
    existingLoadouts: LoadoutData[],
    threshold: number = this.DEFAULT_THRESHOLD
  ): DuplicateMatch[] {
    const matches: DuplicateMatch[] = [];
    
    // Reset logging flag
    this._hasLoggedFirstComparison = false;
    
    console.log(`🔍 findDuplicates: Comparing ${newSetups.length} new setups against ${existingLoadouts.length} existing loadouts (threshold: ${threshold}%)`);
    
    // Debug: Log sample of existing loadouts
    if (existingLoadouts.length > 0) {
      const sample = existingLoadouts[0];
      console.log('🔍 Sample existing loadout:', {
        name: sample.setup.name,
        invLength: sample.setup.inv?.length,
        invItems: sample.setup.inv?.filter(i => i).length,
        eqLength: sample.setup.eq?.length,
        eqItems: sample.setup.eq?.filter(i => i).length
      });
    }

    for (const newSetup of newSetups) {
      console.log(`🔍 Checking new setup: "${newSetup.setup.name}" (inv: ${newSetup.setup.inv?.filter(i => i).length || 0} items, eq: ${newSetup.setup.eq?.filter(i => i).length || 0} items)`);
      
      let bestMatch = { score: 0, name: '' };
      
      for (const existingLoadout of existingLoadouts) {
        const similarity = this.calculateSimilarity(newSetup.setup, existingLoadout.setup);
        
        // Track best match for debugging
        if (similarity > bestMatch.score) {
          bestMatch = { score: similarity, name: existingLoadout.setup.name };
        }
        
        // Log ALL comparisons for the first setup to debug
        if (newSetups.indexOf(newSetup) === 0 && existingLoadouts.indexOf(existingLoadout) < 5) {
          console.log(`🔍 Similarity: ${similarity}% - "${newSetup.setup.name}" vs "${existingLoadout.setup.name}"`);
        }
        
        // Log high similarity scores for debugging
        if (similarity >= threshold - 10) { // Log if within 10% of threshold
          console.log(`🔍 HIGH Similarity: ${similarity}% - "${newSetup.setup.name}" vs "${existingLoadout.setup.name}"`);
        }

        if (similarity >= threshold) {
          const differences = this.calculateDifferences(newSetup.setup, existingLoadout.setup);
          
          matches.push({
            newSetup,
            existingSetup: existingLoadout,
            similarityScore: similarity,
            differences,
            action: 'skip' // Default action
          });
        }
      }
      
      // Log best match for each new setup to see why duplicates aren't detected
      if (bestMatch.score > 0 && bestMatch.score < threshold) {
        console.log(`⚠️ Best match for "${newSetup.setup.name}": ${bestMatch.score}% (below ${threshold}% threshold) - "${bestMatch.name}"`);
      }
    }

    // Sort by similarity score (highest first)
    matches.sort((a, b) => b.similarityScore - a.similarityScore);
    
    console.log(`🔍 findDuplicates: Found ${matches.length} matches above ${threshold}% threshold`);

    return matches;
  }

  /**
   * Calculate overall similarity between two setups (0-100)
   */
  calculateSimilarity(setup1: Setup, setup2: Setup): number {
    // Debug: Log data structure for first comparison
    const isFirstComparison = !this._hasLoggedFirstComparison;
    if (isFirstComparison) {
      this._hasLoggedFirstComparison = true;
      console.log('🔍 First comparison data structure:', {
        setup1: {
          invLength: setup1.inv?.length,
          invItems: setup1.inv?.filter(i => i).length,
          eqLength: setup1.eq?.length,
          eqItems: setup1.eq?.filter(i => i).length,
          hasRp: !!setup1.rp,
          rpLength: setup1.rp?.length
        },
        setup2: {
          invLength: setup2.inv?.length,
          invItems: setup2.inv?.filter(i => i).length,
          eqLength: setup2.eq?.length,
          eqItems: setup2.eq?.filter(i => i).length,
          hasRp: !!setup2.rp,
          rpLength: setup2.rp?.length
        }
      });
    }
    
    const invSimilarity = this.compareInventory(setup1.inv, setup2.inv);
    const eqSimilarity = this.compareEquipment(setup1.eq, setup2.eq);
    const rpSimilarity = this.compareRunePouch(setup1.rp || [], setup2.rp || []);
    const afiSimilarity = this.compareAfi(setup1.afi || {}, setup2.afi || {});

    // Weighted average
    const totalSimilarity =
      invSimilarity * this.WEIGHTS.inventory +
      eqSimilarity * this.WEIGHTS.equipment +
      rpSimilarity * this.WEIGHTS.runePouch +
      afiSimilarity * this.WEIGHTS.afi;

    const finalScore = Math.round(totalSimilarity * 100);
    
    // Debug logging for low scores to understand why duplicates aren't detected
    if (finalScore >= 70 || isFirstComparison) { // Log if close to threshold or first comparison
      console.log(`🔍 Similarity breakdown: ${finalScore}% (inv: ${Math.round(invSimilarity * 100)}%, eq: ${Math.round(eqSimilarity * 100)}%, rp: ${Math.round(rpSimilarity * 100)}%, afi: ${Math.round(afiSimilarity * 100)}%)`);
    }

    return finalScore;
  }
  
  private _hasLoggedFirstComparison = false;

  /**
   * Compare inventory arrays (position-independent, considers quantities)
   */
  private compareInventory(inv1: (Item | null)[], inv2: (Item | null)[]): number {
    // Extract non-null items
    const items1 = this.extractItems(inv1);
    const items2 = this.extractItems(inv2);

    if (items1.length === 0 && items2.length === 0) {
      return 1.0; // Both empty = 100% similar
    }

    if (items1.length === 0 || items2.length === 0) {
      return 0.0; // One empty, one not = 0% similar
    }

    // Create item count maps
    const map1 = this.createItemCountMap(items1);
    const map2 = this.createItemCountMap(items2);

    // Calculate similarity based on item overlap and quantity similarity
    const allItemIds = new Set([...map1.keys(), ...map2.keys()]);
    let totalScore = 0;
    let maxPossibleScore = 0;

    for (const itemId of allItemIds) {
      const qty1 = map1.get(itemId) || 0;
      const qty2 = map2.get(itemId) || 0;

      if (qty1 > 0 || qty2 > 0) {
        maxPossibleScore += Math.max(qty1, qty2);
        
        if (qty1 > 0 && qty2 > 0) {
          // Both have this item - score based on quantity similarity
          const qtyScore = Math.min(qty1, qty2);
          totalScore += qtyScore;
        }
        // If only one has it, don't add to totalScore
      }
    }

    return maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0;
  }

  /**
   * Compare equipment arrays (position matters for equipment)
   * Uses fuzzy matching to handle item variants (e.g., charged vs uncharged)
   */
  private compareEquipment(eq1: (Item | null)[], eq2: (Item | null)[]): number {
    let matches = 0;
    let totalSlots = eq1.length;

    for (let i = 0; i < totalSlots; i++) {
      const item1 = eq1[i];
      const item2 = eq2[i];

      if (!item1 && !item2) {
        // Both slots empty
        matches++;
      } else if (item1 && item2) {
        // Use fuzzy matching: normalize item IDs (handles variants like charged/uncharged)
        const normalizedId1 = this.normalizeItemId(item1.id);
        const normalizedId2 = this.normalizeItemId(item2.id);
        
        if (normalizedId1 === normalizedId2) {
          // Same item (or variant) in same slot
          matches++;
        }
      }
      // If different items or one empty, no match
    }

    return matches / totalSlots;
  }

  /**
   * Compare rune pouch arrays (position matters, considers quantities)
   */
  private compareRunePouch(rp1: (Item | null)[], rp2: (Item | null)[]): number {
    // If both are empty or undefined, they're 100% similar
    if ((!rp1 || rp1.length === 0) && (!rp2 || rp2.length === 0)) {
      return 1.0;
    }

    // If one is empty and the other isn't, they're 0% similar
    if ((!rp1 || rp1.length === 0) || (!rp2 || rp2.length === 0)) {
      return 0.0;
    }

    // Normalize to same length (rune pouch can have up to 4 slots)
    const maxLength = Math.max(rp1.length, rp2.length);
    let matches = 0;
    let totalSlots = 0;

    for (let i = 0; i < maxLength; i++) {
      const item1 = rp1[i] || null;
      const item2 = rp2[i] || null;

      totalSlots++;

      if (!item1 && !item2) {
        // Both slots empty
        matches++;
      } else if (item1 && item2) {
        // Normalize item IDs for fuzzy matching
        const normalizedId1 = this.normalizeItemId(item1.id);
        const normalizedId2 = this.normalizeItemId(item2.id);
        
        if (normalizedId1 === normalizedId2) {
          // Same rune type - check quantity similarity
          const qty1 = item1.q || 1;
          const qty2 = item2.q || 1;
          
          // Calculate quantity similarity (partial match if quantities differ)
          const minQty = Math.min(qty1, qty2);
          const maxQty = Math.max(qty1, qty2);
          const qtySimilarity = maxQty > 0 ? minQty / maxQty : 0;
          
          // Weight: 70% for item match, 30% for quantity match
          matches += 0.7 + (0.3 * qtySimilarity);
        }
      }
      // If different items or one empty, no match
    }

    return totalSlots > 0 ? matches / totalSlots : 0;
  }

  /**
   * Normalize item ID for fuzzy matching
   * Handles variants like charged/uncharged versions by using absolute value
   * In OSRS, negative IDs often represent variants of the same base item
   */
  private normalizeItemId(itemId: number): number {
    return Math.abs(itemId);
  }

  /**
   * Compare additional filtered items
   */
  private compareAfi(
    afi1: Record<string, Item>,
    afi2: Record<string, Item>
  ): number {
    const items1 = Object.values(afi1);
    const items2 = Object.values(afi2);

    if (items1.length === 0 && items2.length === 0) {
      return 1.0; // Both empty
    }

    if (items1.length === 0 || items2.length === 0) {
      return 0.0; // One empty, one not
    }

    const ids1 = new Set(items1.map(item => item.id));
    const ids2 = new Set(items2.map(item => item.id));

    // Calculate Jaccard similarity (intersection / union)
    const intersection = new Set([...ids1].filter(id => ids2.has(id)));
    const union = new Set([...ids1, ...ids2]);

    return intersection.size / union.size;
  }

  /**
   * Calculate detailed differences between two setups
   */
  calculateDifferences(setup1: Setup, setup2: Setup): DiffResult {
    const inventoryDiff = this.calculateItemDiff(
      this.extractItems(setup1.inv),
      this.extractItems(setup2.inv)
    );

    // For equipment, compare by position (slot-by-slot)
    const equipmentDiff = this.calculateEquipmentDiff(setup1.eq, setup2.eq);

    // For rune pouch, compare by position (slot-by-slot) with fuzzy matching
    let runePouchDiff: ItemDiff | undefined;
    if (setup1.rp || setup2.rp) {
      runePouchDiff = this.calculateRunePouchDiff(setup1.rp || [], setup2.rp || []);
    }

    let afiDiff: ItemDiff | undefined;
    if (setup1.afi || setup2.afi) {
      afiDiff = this.calculateItemDiff(
        Object.values(setup1.afi || {}),
        Object.values(setup2.afi || {})
      );
    }

    // Generate human-readable difference summary
    const overallDifferences: string[] = [];

    const totalAdded = inventoryDiff.added.length + equipmentDiff.added.length + 
      (runePouchDiff?.added.length || 0) + (afiDiff?.added.length || 0);
    const totalRemoved = inventoryDiff.removed.length + equipmentDiff.removed.length + 
      (runePouchDiff?.removed.length || 0) + (afiDiff?.removed.length || 0);
    const totalQtyChanged = inventoryDiff.quantityChanged.length + equipmentDiff.quantityChanged.length + 
      (runePouchDiff?.quantityChanged.length || 0) + (afiDiff?.quantityChanged.length || 0);
    const totalFuzzy = equipmentDiff.fuzzyMatch.length + (runePouchDiff?.fuzzyMatch.length || 0);

    if (totalAdded > 0) {
      overallDifferences.push(`+${totalAdded} new item${totalAdded > 1 ? 's' : ''}`);
    }
    if (totalRemoved > 0) {
      overallDifferences.push(`-${totalRemoved} removed item${totalRemoved > 1 ? 's' : ''}`);
    }
    if (totalQtyChanged > 0) {
      overallDifferences.push(`${totalQtyChanged} quantity change${totalQtyChanged > 1 ? 's' : ''}`);
    }
    if (totalFuzzy > 0) {
      overallDifferences.push(`${totalFuzzy} variant difference${totalFuzzy > 1 ? 's' : ''} (fuzzy match)`);
    }

    if (overallDifferences.length === 0) {
      overallDifferences.push('Identical');
    }

    return {
      inventoryDiff,
      equipmentDiff,
      runePouchDiff,
      afiDiff,
      overallDifferences
    };
  }

  /**
   * Calculate equipment differences (position-aware, with fuzzy matching)
   */
  private calculateEquipmentDiff(eq1: (Item | null)[], eq2: (Item | null)[]): ItemDiff {
    const added: Item[] = [];
    const removed: Item[] = [];
    const quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }> = [];
    const fuzzyMatch: Array<{ item1: Item; item2: Item }> = [];
    const identical: Item[] = [];

    const maxLength = Math.max(eq1.length, eq2.length);

    for (let i = 0; i < maxLength; i++) {
      const item1 = eq1[i] || null;
      const item2 = eq2[i] || null;

      if (!item1 && !item2) {
        // Both empty - skip
        continue;
      } else if (!item1 && item2) {
        // Added in setup2
        added.push(item2);
      } else if (item1 && !item2) {
        // Removed in setup2
        removed.push(item1);
      } else if (item1 && item2) {
        // Both have items - compare
        if (item1.id === item2.id) {
          // Exact match
          if (item1.q === item2.q) {
            identical.push(item1);
          } else {
            // Quantity difference
            quantityChanged.push({
              item: item2,
              oldQty: item1.q || 1,
              newQty: item2.q || 1
            });
          }
        } else {
          // Different IDs - check for fuzzy match
          const normalizedId1 = this.normalizeItemId(item1.id);
          const normalizedId2 = this.normalizeItemId(item2.id);
          
          if (normalizedId1 === normalizedId2) {
            // Fuzzy match - same base item, different variant
            fuzzyMatch.push({ item1, item2 });
          } else {
            // Completely different items
            removed.push(item1);
            added.push(item2);
          }
        }
      }
    }

    return { added, removed, quantityChanged, fuzzyMatch, identical };
  }

  /**
   * Calculate rune pouch differences (position-aware, with fuzzy matching and quantity consideration)
   */
  private calculateRunePouchDiff(rp1: (Item | null)[], rp2: (Item | null)[]): ItemDiff {
    const added: Item[] = [];
    const removed: Item[] = [];
    const quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }> = [];
    const fuzzyMatch: Array<{ item1: Item; item2: Item }> = [];
    const identical: Item[] = [];

    const maxLength = Math.max(rp1.length, rp2.length);

    for (let i = 0; i < maxLength; i++) {
      const item1 = rp1[i] || null;
      const item2 = rp2[i] || null;

      if (!item1 && !item2) {
        // Both empty - skip
        continue;
      } else if (!item1 && item2) {
        // Added in setup2
        added.push(item2);
      } else if (item1 && !item2) {
        // Removed in setup2
        removed.push(item1);
      } else if (item1 && item2) {
        // Both have items - compare
        const normalizedId1 = this.normalizeItemId(item1.id);
        const normalizedId2 = this.normalizeItemId(item2.id);
        
        if (item1.id === item2.id) {
          // Exact match
          const qty1 = item1.q || 1;
          const qty2 = item2.q || 1;
          if (qty1 === qty2) {
            identical.push(item1);
          } else {
            // Quantity difference
            quantityChanged.push({
              item: item2,
              oldQty: qty1,
              newQty: qty2
            });
          }
        } else if (normalizedId1 === normalizedId2) {
          // Fuzzy match - same base rune, different variant
          fuzzyMatch.push({ item1, item2 });
          // Also check quantity difference
          const qty1 = item1.q || 1;
          const qty2 = item2.q || 1;
          if (qty1 !== qty2) {
            quantityChanged.push({
              item: item2,
              oldQty: qty1,
              newQty: qty2
            });
          }
        } else {
          // Completely different runes
          removed.push(item1);
          added.push(item2);
        }
      }
    }

    return { added, removed, quantityChanged, fuzzyMatch, identical };
  }

  /**
   * Calculate item-level differences (for inventory and AFI - position-independent)
   * @param useFuzzyMatching If true, uses normalized item IDs for comparison (handles variants)
   */
  private calculateItemDiff(items1: Item[], items2: Item[], useFuzzyMatching: boolean = false): ItemDiff {
    const added: Item[] = [];
    const removed: Item[] = [];
    const quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }> = [];
    const fuzzyMatch: Array<{ item1: Item; item2: Item }> = [];
    const identical: Item[] = [];

    if (useFuzzyMatching) {
      // For fuzzy matching, we need to compare items more carefully
      // to detect fuzzy matches vs exact matches vs quantity differences
      const map1 = this.createItemCountMap(items1);
      const map2 = this.createItemCountMap(items2);
      const fuzzyMap1 = this.createItemCountMapFuzzy(items1);
      const fuzzyMap2 = this.createItemCountMapFuzzy(items2);

      // Track which items we've processed
      const processed1 = new Set<number>();
      const processed2 = new Set<number>();

      // First, find exact matches and quantity changes
      for (const [itemId, qty1] of map1.entries()) {
        const qty2 = map2.get(itemId) || 0;
        processed1.add(itemId);
        processed2.add(itemId);

        if (qty2 > 0) {
          if (qty1 === qty2) {
            identical.push({ id: itemId, q: qty1 });
          } else {
            quantityChanged.push({
              item: { id: itemId, q: qty2 },
              oldQty: qty1,
              newQty: qty2
            });
          }
        }
      }

      // Now find fuzzy matches (normalized ID matches but actual ID differs)
      for (const item1 of items1) {
        if (processed1.has(item1.id)) continue;

        const normalizedId1 = this.normalizeItemId(item1.id);
        let foundFuzzy = false;

        for (const item2 of items2) {
          if (processed2.has(item2.id)) continue;

          const normalizedId2 = this.normalizeItemId(item2.id);
          
          if (normalizedId1 === normalizedId2 && item1.id !== item2.id) {
            // Fuzzy match - same base item, different variant
            fuzzyMatch.push({ item1, item2 });
            processed1.add(item1.id);
            processed2.add(item2.id);
            foundFuzzy = true;
            break;
          }
        }

        if (!foundFuzzy) {
          // Check if there's a fuzzy match by normalized ID in the maps
          const fuzzyQty2 = fuzzyMap2.get(normalizedId1) || 0;
          if (fuzzyQty2 > 0) {
            // There's a fuzzy match, but we need to find the actual item
            for (const item2 of items2) {
              if (processed2.has(item2.id)) continue;
              const normalizedId2 = this.normalizeItemId(item2.id);
              if (normalizedId1 === normalizedId2) {
                fuzzyMatch.push({ item1, item2 });
                processed1.add(item1.id);
                processed2.add(item2.id);
                break;
              }
            }
          } else {
            removed.push(item1);
          }
        }
      }

      // Find items added in setup2
      for (const item2 of items2) {
        if (!processed2.has(item2.id)) {
          added.push(item2);
        }
      }
    } else {
      // Exact matching (for inventory)
      const map1 = this.createItemCountMap(items1);
      const map2 = this.createItemCountMap(items2);

      const allItemIds = new Set([...map1.keys(), ...map2.keys()]);

      for (const itemId of allItemIds) {
        const qty1 = map1.get(itemId) || 0;
        const qty2 = map2.get(itemId) || 0;

        if (qty1 === 0 && qty2 > 0) {
          added.push({ id: itemId, q: qty2 });
        } else if (qty1 > 0 && qty2 === 0) {
          removed.push({ id: itemId, q: qty1 });
        } else if (qty1 !== qty2) {
          quantityChanged.push({
            item: { id: itemId, q: qty2 },
            oldQty: qty1,
            newQty: qty2
          });
        } else {
          identical.push({ id: itemId, q: qty1 });
        }
      }
    }

    return { added, removed, quantityChanged, fuzzyMatch, identical };
  }

  /**
   * Extract non-null items from an array
   */
  private extractItems(itemArray: (Item | null)[]): Item[] {
    return itemArray.filter((item): item is Item => item !== null);
  }

  /**
   * Create a map of item ID to total quantity
   */
  private createItemCountMap(items: Item[]): Map<number, number> {
    const map = new Map<number, number>();

    for (const item of items) {
      const currentQty = map.get(item.id) || 0;
      map.set(item.id, currentQty + (item.q || 1));
    }

    return map;
  }

  /**
   * Create a map of normalized item ID to total quantity (for fuzzy matching)
   * Groups item variants (e.g., charged/uncharged) together
   */
  private createItemCountMapFuzzy(items: Item[]): Map<number, number> {
    const map = new Map<number, number>();

    for (const item of items) {
      const normalizedId = this.normalizeItemId(item.id);
      const currentQty = map.get(normalizedId) || 0;
      map.set(normalizedId, currentQty + (item.q || 1));
    }

    return map;
  }

  /**
   * Get a quick similarity check (name-based)
   */
  hasNameSimilarity(name1: string, name2: string): boolean {
    const normalized1 = name1.toLowerCase().trim();
    const normalized2 = name2.toLowerCase().trim();

    // Exact match
    if (normalized1 === normalized2) {
      return true;
    }

    // Contains check
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return true;
    }

    return false;
  }
}
