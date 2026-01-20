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
  afiDiff?: ItemDiff;
  overallDifferences: string[];
}

export interface ItemDiff {
  added: Item[]; // Items in new but not in existing
  removed: Item[]; // Items in existing but not in new
  quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }>;
  identical: Item[];
}

@Injectable({
  providedIn: 'root'
})
export class DuplicateDetectionService {
  private readonly DEFAULT_THRESHOLD = 80; // 80% similarity
  private readonly WEIGHTS = {
    inventory: 0.5, // 50%
    equipment: 0.4, // 40%
    afi: 0.1 // 10%
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

    for (const newSetup of newSetups) {
      for (const existingLoadout of existingLoadouts) {
        const similarity = this.calculateSimilarity(newSetup.setup, existingLoadout.setup);

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
    }

    // Sort by similarity score (highest first)
    matches.sort((a, b) => b.similarityScore - a.similarityScore);

    return matches;
  }

  /**
   * Calculate overall similarity between two setups (0-100)
   */
  calculateSimilarity(setup1: Setup, setup2: Setup): number {
    const invSimilarity = this.compareInventory(setup1.inv, setup2.inv);
    const eqSimilarity = this.compareEquipment(setup1.eq, setup2.eq);
    const afiSimilarity = this.compareAfi(setup1.afi || {}, setup2.afi || {});

    // Weighted average
    const totalSimilarity =
      invSimilarity * this.WEIGHTS.inventory +
      eqSimilarity * this.WEIGHTS.equipment +
      afiSimilarity * this.WEIGHTS.afi;

    return Math.round(totalSimilarity * 100);
  }

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
      } else if (item1 && item2 && item1.id === item2.id) {
        // Same item in same slot
        matches++;
      }
      // If different items or one empty, no match
    }

    return matches / totalSlots;
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

    const equipmentDiff = this.calculateItemDiff(
      this.extractItems(setup1.eq),
      this.extractItems(setup2.eq)
    );

    let afiDiff: ItemDiff | undefined;
    if (setup1.afi || setup2.afi) {
      afiDiff = this.calculateItemDiff(
        Object.values(setup1.afi || {}),
        Object.values(setup2.afi || {})
      );
    }

    // Generate human-readable difference summary
    const overallDifferences: string[] = [];

    const totalAdded = inventoryDiff.added.length + equipmentDiff.added.length + (afiDiff?.added.length || 0);
    const totalRemoved = inventoryDiff.removed.length + equipmentDiff.removed.length + (afiDiff?.removed.length || 0);
    const totalQtyChanged = inventoryDiff.quantityChanged.length + equipmentDiff.quantityChanged.length + (afiDiff?.quantityChanged.length || 0);

    if (totalAdded > 0) {
      overallDifferences.push(`+${totalAdded} new item${totalAdded > 1 ? 's' : ''}`);
    }
    if (totalRemoved > 0) {
      overallDifferences.push(`-${totalRemoved} removed item${totalRemoved > 1 ? 's' : ''}`);
    }
    if (totalQtyChanged > 0) {
      overallDifferences.push(`${totalQtyChanged} quantity change${totalQtyChanged > 1 ? 's' : ''}`);
    }

    if (overallDifferences.length === 0) {
      overallDifferences.push('Identical');
    }

    return {
      inventoryDiff,
      equipmentDiff,
      afiDiff,
      overallDifferences
    };
  }

  /**
   * Calculate item-level differences
   */
  private calculateItemDiff(items1: Item[], items2: Item[]): ItemDiff {
    const map1 = this.createItemCountMap(items1);
    const map2 = this.createItemCountMap(items2);

    const added: Item[] = [];
    const removed: Item[] = [];
    const quantityChanged: Array<{ item: Item; oldQty: number; newQty: number }> = [];
    const identical: Item[] = [];

    const allItemIds = new Set([...map1.keys(), ...map2.keys()]);

    for (const itemId of allItemIds) {
      const qty1 = map1.get(itemId) || 0;
      const qty2 = map2.get(itemId) || 0;

      if (qty1 === 0 && qty2 > 0) {
        // Item added in setup2
        added.push({ id: itemId, q: qty2 });
      } else if (qty1 > 0 && qty2 === 0) {
        // Item removed in setup2
        removed.push({ id: itemId, q: qty1 });
      } else if (qty1 !== qty2) {
        // Quantity changed
        quantityChanged.push({
          item: { id: itemId, q: qty2 },
          oldQty: qty1,
          newQty: qty2
        });
      } else {
        // Identical
        identical.push({ id: itemId, q: qty1 });
      }
    }

    return { added, removed, quantityChanged, identical };
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
