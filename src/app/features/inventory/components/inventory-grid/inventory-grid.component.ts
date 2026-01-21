import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { InventoryItem, Setup } from '../../../../shared/models/inventory.model';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { DuplicateDetectionService } from '../../../../core/services/duplicate-detection.service';

@Component({
  selector: 'app-inventory-grid',
  templateUrl: './inventory-grid.component.html',
  styleUrls: ['./inventory-grid.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class InventoryGridComponent implements OnInit, OnChanges {
  @Input() items: (InventoryItem | null)[] = [];
  @Input() layout: (string | number)[] = [];
  @Input() compact = false;
  @Input() comparisonSetup?: Setup; // Optional setup to compare against
  @Output() itemsChange = new EventEmitter<{ items: (InventoryItem | null)[] }>();

  readonly ROWS = 7;
  readonly COLS = 4;
  readonly TOTAL_SLOTS = 28;
  
  private itemMap = new Map<number | string, InventoryItem>();
  private comparisonDiff: any = null;

  constructor(
    private osrsApi: OsrsApiService,
    private duplicateDetection: DuplicateDetectionService
  ) {}

  ngOnInit() {
    // Create a map of item IDs to items for faster lookup
    this.items.forEach(item => {
      if (item) {
        this.itemMap.set(item.id, item);
        this.itemMap.set(item.id.toString(), item);
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.comparisonSetup && (changes['items'] || changes['comparisonSetup'])) {
      const currentSetup: Setup = {
        inv: this.items,
        eq: [],
        name: '',
        rp: []
      };
      this.comparisonDiff = this.duplicateDetection.calculateDifferences(currentSetup, this.comparisonSetup);
    }
  }

  getItemAtPosition(index: number): InventoryItem | null {
    return index < this.items.length ? this.items[index] : null;
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(id);
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(id);
  }

  getSlots(): number[] {
    return Array(this.TOTAL_SLOTS).fill(0).map((_, i) => i);
  }

  trackByFn(index: number): number {
    return index;
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
   * Check if an item is different when comparing
   */
  isDifferent(item: InventoryItem | null, index: number): boolean {
    if (!item || !this.comparisonDiff) return false;
    const comparisonItem = this.comparisonSetup?.inv?.[index];
    if (!comparisonItem) return false;
    
    // Check if item is in added, removed, or quantity changed lists
    return this.comparisonDiff.inventoryDiff.added?.some((added: any) => added.id === item.id) ||
           this.comparisonDiff.inventoryDiff.removed?.some((removed: any) => removed.id === item.id) ||
           this.comparisonDiff.inventoryDiff.quantityChanged?.some((changed: any) => changed.item.id === item.id) ||
           false;
  }

  /**
   * Check if item has quantity
   */
  hasQuantity(item: InventoryItem | null): boolean {
    return !!(item && item.q && item.q > 1);
  }

  /**
   * Get quantity difference when comparing
   */
  getQuantityDifference(item: InventoryItem | null): { oldQty: number; newQty: number } | null {
    if (!item || !this.comparisonDiff) return null;
    const qtyChange = this.comparisonDiff.inventoryDiff.quantityChanged?.find(
      (changed: any) => changed.item.id === item.id
    );
    return qtyChange ? { oldQty: qtyChange.oldQty, newQty: qtyChange.newQty } : null;
  }
} 