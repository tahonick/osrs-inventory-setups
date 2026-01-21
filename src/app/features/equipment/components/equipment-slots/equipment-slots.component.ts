import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { Equipment, Setup } from '../../../../shared/models/inventory.model';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { DuplicateDetectionService } from '../../../../core/services/duplicate-detection.service';

interface GridPosition {
  row: number;
  col: number;
}

// Define equipment slot indices in OSRS order
enum EquipmentSlot {
  HEAD = 0,      // Helmet
  CAPE = 1,      // Cape
  AMULET = 2,    // Amulet
  WEAPON = 3,    // Weapon
  BODY = 4,      // Body
  SHIELD = 5,    // Shield
  LEGS = 7,      // Legs
  GLOVES = 9,    // Gloves
  BOOTS = 10,    // Boots
  RING = 12,     // Ring
  AMMO = 13      // Ammo
}

// Create a type for the grid positions mapping
type GridPositionsMap = Record<EquipmentSlot, GridPosition>;

@Component({
  selector: 'app-equipment-slots',
  templateUrl: './equipment-slots.component.html',
  styleUrls: ['./equipment-slots.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class EquipmentSlotsComponent implements OnChanges {
  @Input() equipment: (Equipment | null)[] = [];
  @Input() spellbookId = 0;
  @Input() compact = false;
  @Input() comparisonSetup?: Setup; // Optional setup to compare against
  @Output() equipmentChange = new EventEmitter<{ equipment: (Equipment | null)[] }>();
  @Output() spellbookChange = new EventEmitter<{ spellbookId: number }>();

  readonly SLOTS = EquipmentSlot;
  private comparisonDiff: any = null;

  // Grid positions following OSRS 1-3-3-1-3 pattern
  readonly GRID_POSITIONS: GridPositionsMap = {
    [EquipmentSlot.HEAD]: { row: 1, col: 2 },     // Head (center top)
    [EquipmentSlot.CAPE]: { row: 3, col: 1 },     // Cape (left)
    [EquipmentSlot.AMULET]: { row: 3, col: 2 },   // Amulet (center)
    [EquipmentSlot.AMMO]: { row: 3, col: 3 },     // Ammo (right)
    [EquipmentSlot.WEAPON]: { row: 5, col: 1 },   // Weapon (left)
    [EquipmentSlot.BODY]: { row: 5, col: 2 },     // Body (center)
    [EquipmentSlot.SHIELD]: { row: 5, col: 3 },   // Shield (right)
    [EquipmentSlot.LEGS]: { row: 7, col: 2 },     // Legs (center)
    [EquipmentSlot.GLOVES]: { row: 9, col: 1 },   // Gloves (bottom left)
    [EquipmentSlot.BOOTS]: { row: 9, col: 2 },    // Boots (bottom center)
    [EquipmentSlot.RING]: { row: 9, col: 3 }      // Ring (bottom right)
  };

  readonly SPELLBOOKS = {
    0: { name: 'Standard', image: 'Standard_spellbook.png' },
    1: { name: 'Ancient', image: 'Ancient_spellbook.png' },
    2: { name: 'Lunar', image: 'Lunar_spellbook.png' },
    3: { name: 'Arceuus', image: 'Arceuus_spellbook.png' }
  } as const;

  constructor(
    private osrsApi: OsrsApiService,
    private duplicateDetection: DuplicateDetectionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (this.comparisonSetup && (changes['equipment'] || changes['comparisonSetup'])) {
      const currentSetup: Setup = {
        inv: [],
        eq: this.equipment,
        name: '',
        rp: []
      };
      this.comparisonDiff = this.duplicateDetection.calculateDifferences(currentSetup, this.comparisonSetup);
    }
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(id);
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(id);
  }

  getSpellbookImage(): string {
    const spellbookImage = this.SPELLBOOKS[this.spellbookId as keyof typeof this.SPELLBOOKS] || this.SPELLBOOKS[0];
    return `https://oldschool.runescape.wiki/images/${spellbookImage.image}?32`;
  }

  getSpellbookName(spellbookId: number): string {
    const spellbook = this.SPELLBOOKS[spellbookId as keyof typeof this.SPELLBOOKS] || this.SPELLBOOKS[0];
    return `${spellbook.name} Spellbook`;
  }

  getVisibleSlots(): number[] {
    return [
      EquipmentSlot.HEAD,
      EquipmentSlot.CAPE,
      EquipmentSlot.AMULET,
      EquipmentSlot.AMMO,
      EquipmentSlot.WEAPON,
      EquipmentSlot.BODY,
      EquipmentSlot.SHIELD,
      EquipmentSlot.LEGS,
      EquipmentSlot.GLOVES,
      EquipmentSlot.BOOTS,
      EquipmentSlot.RING
    ];
  }

  trackByFn(index: number): number {
    return index;
  }

  /**
   * Check if an item is a variant (has f:true flag or negative ID, indicating it's a variant of the base item)
   * This shows the indicator in ALL views, not just when comparing
   */
  isVariant(item: Equipment | null): boolean {
    if (!item) return false;
    // Check for f:true flag (from RuneLite export) or negative ID
    // The f property indicates a fuzzy/variant match in RuneLite exports
    const itemAny = item as any;
    // Check for f property (can be true, "true", or 1)
    const hasF = itemAny.f === true || itemAny.f === 'true' || itemAny.f === 1;
    const hasNegativeId = item.id < 0;
    return hasF || hasNegativeId;
  }

  /**
   * Check if an item is a fuzzy match (different variant of same base item) when comparing
   */
  isFuzzyMatch(item: Equipment | null, slotIndex: number): boolean {
    if (!item || !this.comparisonDiff) return false;
    const comparisonItem = this.comparisonSetup?.eq?.[slotIndex];
    if (!comparisonItem) return false;
    
    return this.comparisonDiff.equipmentDiff.fuzzyMatch?.some(
      (fuzzy: any) => fuzzy.item1.id === item.id || fuzzy.item2.id === item.id
    ) || false;
  }

  /**
   * Check if an item has a quantity difference when comparing
   */
  hasQuantityDifference(item: Equipment | null, slotIndex: number): { oldQty: number; newQty: number } | null {
    if (!item || !this.comparisonDiff) return null;
    const qtyChange = this.comparisonDiff.equipmentDiff.quantityChanged?.find(
      (changed: any) => changed.item.id === item.id
    );
    return qtyChange ? { oldQty: qtyChange.oldQty, newQty: qtyChange.newQty } : null;
  }

  /**
   * Check if item has quantity (for showing quantity indicator in all views)
   */
  hasQuantity(item: Equipment | null): boolean {
    return !!(item && item.q && item.q > 1);
  }

  /**
   * Normalize item ID for fuzzy matching
   */
  private normalizeItemId(itemId: number): number {
    return Math.abs(itemId);
  }
} 