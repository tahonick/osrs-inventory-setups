import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { InventoryItem, Setup } from '../../../../shared/models/inventory.model';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { DuplicateDetectionService } from '../../../../core/services/duplicate-detection.service';

@Component({
  selector: 'app-rune-pouch',
  templateUrl: './rune-pouch.component.html',
  styleUrls: ['./rune-pouch.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class RunePouchComponent implements OnChanges {
  @Input() runes: (InventoryItem | null)[] = [];
  @Input() comparisonSetup?: Setup; // Optional setup to compare against
  
  private comparisonDiff: any = null;

  constructor(
    private osrsApi: OsrsApiService,
    private duplicateDetection: DuplicateDetectionService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (this.comparisonSetup && (changes['runes'] || changes['comparisonSetup'])) {
      const currentSetup: Setup = {
        inv: [],
        eq: [],
        name: '',
        rp: this.runes
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

  /**
   * Check if an item is a variant (has f:true flag or negative ID)
   */
  isVariant(item: InventoryItem | null): boolean {
    if (!item) return false;
    // Check for f:true flag (from RuneLite export) or negative ID
    const itemAny = item as any;
    const hasF = itemAny.f === true || itemAny.f === 'true' || itemAny.f === 1;
    return hasF || item.id < 0;
  }

  /**
   * Get similarity comparison indicator for rune pouch item
   * Returns the symbol to display based on sc property
   */
  getSimilarityComparison(item: InventoryItem | null): string | null {
    if (!item) return null;
    const itemAny = item as any;
    const sc = itemAny.sc;
    if (!sc) return null;
    
    // Handle both string and enum values
    const scStr = String(sc);
    switch (scStr) {
      case 'Greater_Than':
        return '>';
      case 'Less_Than':
        return '<';
      case 'Not_Equal':
        return '≠';
      case 'Standard':
      default:
        return null; // No indicator for standard/exact match
    }
  }

  /**
   * Check if an item is different when comparing
   */
  isDifferent(item: InventoryItem | null, index: number): boolean {
    if (!item || !this.comparisonDiff) {
      // If no comparison, check if item has sc property indicating a difference
      const sc = (item as any)?.sc;
      return sc === 'Greater_Than' || sc === 'Less_Than' || sc === 'Not_Equal';
    }
    const comparisonItem = this.comparisonSetup?.rp?.[index];
    if (!comparisonItem) return false;
    
    return this.comparisonDiff.runePouchDiff?.added?.some((added: any) => added.id === item.id) ||
           this.comparisonDiff.runePouchDiff?.removed?.some((removed: any) => removed.id === item.id) ||
           this.comparisonDiff.runePouchDiff?.quantityChanged?.some((changed: any) => changed.item.id === item.id) ||
           this.comparisonDiff.runePouchDiff?.fuzzyMatch?.some((fuzzy: any) => fuzzy.item1.id === item.id || fuzzy.item2.id === item.id) ||
           false;
  }

  /**
   * Check if item has quantity
   */
  hasQuantity(item: InventoryItem | null): boolean {
    return !!(item && item.q && item.q > 1);
  }
} 