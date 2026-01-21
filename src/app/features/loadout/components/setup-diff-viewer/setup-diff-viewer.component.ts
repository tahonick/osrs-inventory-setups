import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { DuplicateMatch, ItemDiff } from '../../../../core/services/duplicate-detection.service';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { Item } from '../../../../shared/models/inventory.model';
import { RunePouchComponent } from '../../../inventory/components/rune-pouch/rune-pouch.component';

@Component({
  selector: 'app-setup-diff-viewer',
  templateUrl: './setup-diff-viewer.component.html',
  styleUrls: ['./setup-diff-viewer.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatTooltipModule,
    RunePouchComponent
  ]
})
export class SetupDiffViewerComponent {
  @Input() match!: DuplicateMatch;
  @Input() currentIndex: number = 0;
  @Input() totalMatches: number = 1;
  @Input() currentUserId?: string; // For ownership check
  @Input() hideActionSelection: boolean = false; // Hide action selection when used in single upload dialog
  @Output() actionChanged = new EventEmitter<'skip' | 'replace' | 'keep_both'>();
  @Output() next = new EventEmitter<void>();
  @Output() previous = new EventEmitter<void>();

  constructor(private osrsApi: OsrsApiService) {}

  get selectedAction(): 'skip' | 'replace' | 'keep_both' {
    return this.match.action;
  }

  set selectedAction(value: 'skip' | 'replace' | 'keep_both') {
    this.match.action = value;
    this.actionChanged.emit(value);
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(Math.abs(id));
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(Math.abs(id));
  }

  /**
   * Get CSS class for inventory slot based on diff status
   */
  getSlotClass(item: Item | null, slotType: 'inventory' | 'equipment'): string {
    if (!item) return '';

    const diff = slotType === 'inventory' 
      ? this.match.differences.inventoryDiff 
      : this.match.differences.equipmentDiff;

    // Check if item is in added list
    if (diff.added.some(added => added.id === item.id)) {
      return 'diff-added';
    }

    // Check if item is in removed list
    if (diff.removed.some(removed => removed.id === item.id)) {
      return 'diff-removed';
    }

    // Check if quantity changed
    if (diff.quantityChanged.some(changed => changed.item.id === item.id)) {
      return 'diff-quantity';
    }

    return 'diff-identical';
  }

  /**
   * Get comparison status for existing setup items
   */
  getExistingSlotClass(item: Item | null, slotType: 'inventory' | 'equipment'): string {
    if (!item) return '';

    const diff = slotType === 'inventory'
      ? this.match.differences.inventoryDiff
      : this.match.differences.equipmentDiff;

    // If item is in removed list (exists in old but not in new)
    if (diff.removed.some(removed => removed.id === item.id)) {
      return 'diff-removed';
    }

    // Check for fuzzy match (highlight as different)
    if (diff.fuzzyMatch && diff.fuzzyMatch.some(fuzzy => fuzzy.item1.id === item.id)) {
      return 'diff-fuzzy';
    }

    // If quantity changed (highlight as different)
    const qtyChange = diff.quantityChanged.find(changed => changed.item.id === item.id);
    if (qtyChange) {
      return 'diff-quantity';
    }

    // If item exists in both and is identical
    if (diff.identical.some(identical => identical.id === item.id)) {
      return 'diff-identical';
    }

    return '';
  }

  /**
   * Check if an item is a fuzzy match (different variant of same base item)
   */
  isFuzzyMatch(item: Item | null, slotType: 'inventory' | 'equipment', isExisting: boolean): boolean {
    if (!item) return false;

    const diff = slotType === 'inventory'
      ? this.match.differences.inventoryDiff
      : this.match.differences.equipmentDiff;

    if (!diff.fuzzyMatch) return false;

    if (isExisting) {
      return diff.fuzzyMatch.some(fuzzy => fuzzy.item1.id === item.id);
    } else {
      return diff.fuzzyMatch.some(fuzzy => fuzzy.item2.id === item.id);
    }
  }

  /**
   * Check if an item has a quantity difference
   */
  hasQuantityDifference(item: Item | null, slotType: 'inventory' | 'equipment'): { oldQty: number; newQty: number } | null {
    if (!item) return null;

    const diff = slotType === 'inventory'
      ? this.match.differences.inventoryDiff
      : this.match.differences.equipmentDiff;

    const qtyChange = diff.quantityChanged.find(changed => changed.item.id === item.id);
    return qtyChange ? { oldQty: qtyChange.oldQty, newQty: qtyChange.newQty } : null;
  }

  /**
   * Get comparison status for new setup items
   */
  getNewSlotClass(item: Item | null, slotType: 'inventory' | 'equipment'): string {
    if (!item) return '';

    const diff = slotType === 'inventory'
      ? this.match.differences.inventoryDiff
      : this.match.differences.equipmentDiff;

    // If item is in added list (exists in new but not in old)
    if (diff.added.some(added => added.id === item.id)) {
      return 'diff-added';
    }

    // Check for fuzzy match (highlight as different)
    if (diff.fuzzyMatch && diff.fuzzyMatch.some(fuzzy => fuzzy.item2.id === item.id)) {
      return 'diff-fuzzy';
    }

    // If quantity changed (highlight as different)
    if (diff.quantityChanged.some(changed => changed.item.id === item.id)) {
      return 'diff-quantity';
    }

    // If item exists in both and is identical
    if (diff.identical.some(identical => identical.id === item.id)) {
      return 'diff-identical';
    }

    return '';
  }

  /**
   * Format date for display
   */
  formatDate(timestamp: any): string {
    if (!timestamp) return 'Unknown';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  onNext(): void {
    this.next.emit();
  }

  onPrevious(): void {
    this.previous.emit();
  }

  /**
   * Check if user can replace this setup (must own it)
   */
  canReplace(): boolean {
    if (!this.currentUserId) return false;
    return this.match.existingSetup.userId === this.currentUserId;
  }

  /**
   * Check if there are tag differences to show merge notice
   */
  hasTagDifferences(): boolean {
    const existingTags = this.match.existingSetup.tags || [];
    const newTags = this.match.newSetup.metadata.detectedTags || [];
    
    // Check if there are any new tags that would be added
    return newTags.some(tag => !existingTags.includes(tag)) || 
           existingTags.some(tag => !newTags.includes(tag));
  }
}
