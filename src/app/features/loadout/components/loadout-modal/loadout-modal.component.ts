import { Component, Inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { LoadoutData, Setup } from '../../../../shared/models/inventory.model';
import { InventoryGridComponent } from '../../../inventory/components/inventory-grid/inventory-grid.component';
import { EquipmentSlotsComponent } from '../../../equipment/components/equipment-slots/equipment-slots.component';
import { RunePouchComponent } from '../../../inventory/components/rune-pouch/rune-pouch.component';
import { BankTagLayoutGridComponent } from '../../../inventory/components/bank-tag-layout-grid/bank-tag-layout-grid.component';
import { TagEditorComponent } from '../../../../shared/components/tag-editor/tag-editor.component';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { FirebaseService } from '../../../../core/services/firebase.service';
import { LoadoutService } from '../../../../core/services/loadout.service';
import { BankTagLayoutService } from '../../../../shared/services/bank-tag-layout.service';
import { BankTagLayout } from '../../../../shared/models/bank-tag-layout.model';
import { Observable } from 'rxjs';
import { FirebaseDatePipe } from '../../../../shared/pipes/firebase-date.pipe';
import { DeleteConfirmationComponent } from '../../../../shared/components/delete-confirmation/delete-confirmation.component';

interface SpellbookMap {
  [key: number]: {
    name: string;
    image: string;
  };
}

@Component({
  selector: 'app-loadout-modal',
  templateUrl: './loadout-modal.component.html',
  styleUrls: ['./loadout-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatOptionModule,
    InventoryGridComponent,
    EquipmentSlotsComponent,
    RunePouchComponent,
    BankTagLayoutGridComponent,
    TagEditorComponent,
    FirebaseDatePipe
  ],
  providers: [DatePipe]
})
export class LoadoutModalComponent {
  readonly SPELLBOOKS: SpellbookMap = {
    0: { name: 'Standard', image: 'Standard_spellbook_icon.png' },
    1: { name: 'Ancient', image: 'Ancient_spellbook_icon.png' },
    2: { name: 'Lunar', image: 'Lunar_spellbook_icon.png' },
    3: { name: 'Arceuus', image: 'Arceuus_spellbook_icon.png' }
  };

  isOwner = false;
  isLoggedIn$: Observable<boolean>;
  hasLiked = false;
  isPublic = true;
  // Community tagging enabled!

  constructor(
    public dialogRef: MatDialogRef<LoadoutModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: LoadoutData,
    private osrsApi: OsrsApiService,
    private snackBar: MatSnackBar,
    private firebaseService: FirebaseService,
    private loadoutService: LoadoutService,
    private bankTagLayoutService: BankTagLayoutService,
    private dialog: MatDialog
  ) {
    this.isLoggedIn$ = this.firebaseService.isLoggedIn$;
    this.isOwner = this.firebaseService.isLoadoutOwner(this.data);
    this.isPublic = this.data.isPublic ?? true;
    // Default category to 'Other' if not set
    if (!this.data.category) {
      this.data.category = 'Other';
    }
    this.checkLikeStatus();
  }

  get isLayoutType(): boolean {
    return this.data.type === 'banktag' || this.data.type === 'banktaglayout';
  }

  get bankTagLayout(): BankTagLayout | null {
    if (!this.data.setup.afi) return null;
    
    return {
      name: this.data.setup.name,
      items: Object.entries(this.data.setup.afi).map(([pos, item]) => ({
        id: item.id,
        position: parseInt(pos),
        q: item.q || 1
      })),
      bankTag: Object.values(this.data.setup.afi).map(item => item.id),
      width: 8,
      originalFormat: this.data.originalFormat || ''
    };
  }

  private async checkLikeStatus(): Promise<void> {
    if (!this.data.id) {
      console.error('Loadout ID is missing');
      return;
    }
    this.hasLiked = await this.loadoutService.hasUserLiked(this.data.id);
  }

  async toggleLike(): Promise<void> {
    try {
      if (!this.data.id) {
        throw new Error('Loadout ID is missing');
      }

      await this.loadoutService.toggleLike(this.data.id);
      this.hasLiked = !this.hasLiked;
      this.data.likes = (this.data.likes || 0) + (this.hasLiked ? 1 : -1);
      
      this.snackBar.open(
        this.hasLiked ? 'Added to your likes' : 'Removed from your likes',
        'Close',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Error toggling like:', error);
      this.snackBar.open(
        'You must be logged in to like loadouts',
        'Close',
        { duration: 3000 }
      );
    }
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(id);
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(id);
  }

  getFilteredItems() {
    if (!this.data.setup.afi) return [];
    return Object.values(this.data.setup.afi);
  }

  getSpellbookImage(spellbookId: number): string {
    const spellbook = this.SPELLBOOKS[spellbookId] || this.SPELLBOOKS[0];
    return `https://oldschool.runescape.wiki/images/${spellbook.image}`;
  }

  getSpellbookName(spellbookId: number): string {
    const spellbook = this.SPELLBOOKS[spellbookId] || this.SPELLBOOKS[0];
    return `${spellbook.name} Spellbook`;
  }

  async deleteLoadout(): Promise<void> {
    // Show confirmation dialog
    const dialogRef = this.dialog.open(DeleteConfirmationComponent, {
      width: '400px',
      data: { name: this.data.setup.name }
    });

    const confirmed = await dialogRef.afterClosed().toPromise();
    if (!confirmed) return;

    try {
      if (!this.data.id) {
        throw new Error('Loadout ID is missing');
      }

      await this.firebaseService.deleteLoadout(this.data.id);
      
      this.snackBar.open('Loadout deleted successfully', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      this.dialogRef.close('deleted');
    } catch (error) {
      console.error('Error deleting loadout:', error);
      this.snackBar.open('Failed to delete loadout', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  copyLoadout(): void {
    let exportText: string;

    if (this.isLayoutType && this.data.originalFormat) {
      // Use original format if available
      exportText = this.data.originalFormat;
    } else if (this.isLayoutType) {
      // Export as bank tag layout
      const layout = this.bankTagLayout;
      if (layout) {
        exportText = this.bankTagLayoutService.exportLayout(layout);
      } else {
        throw new Error('Failed to generate bank tag layout');
      }
    } else {
      // Export as inventory setup
      const setup: Setup = {
        inv: this.data.setup.inv,
        eq: this.data.setup.eq,
        name: this.data.setup.name,
        hc: this.data.setup.hc,
        hd: this.data.setup.hd,
        fb: this.data.setup.fb,
        uh: this.data.setup.uh,
        sb: this.data.setup.sb
      };

      // Add optional fields if they exist
      if (this.data.setup.notes) {
        setup.notes = this.data.setup.notes;
      }

      if (this.data.setup.afi) {
        setup.afi = this.data.setup.afi;
      }

      // Only add rp to setup if it exists and has items
      if (this.data.setup.rp?.length) {
        setup.rp = this.data.setup.rp;
      }

      const layout = this.calculateLayout(setup);

      exportText = JSON.stringify({
        setup,
        layout
      });
    }

    navigator.clipboard.writeText(exportText)
      .then(() => {
        this.snackBar.open('Copied to clipboard!', 'Close', {
          duration: 3000
        });
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        this.snackBar.open('Failed to copy to clipboard', 'Close', {
          duration: 3000
        });
      });
  }

  private calculateLayout(setup: Setup): number[] {
    const layout: number[] = new Array(56).fill(-1);  // Initialize all slots with -1
    
    // Map inventory items first (starting at index 4)
    if (setup.inv) {
      setup.inv.forEach((item, index) => {
        if (item) {
          layout[index + 4] = item.id;
        }
      });
    }

    // Map equipment items
    if (setup.eq) {
      // Equipment mapping based on the expected layout
      const eqMapping = [
        { slot: 0, index: 1 },  // Head
        { slot: 1, index: 8 },  // Cape
        { slot: 2, index: 9 },  // Neck
        { slot: 3, index: 16 }, // Weapon
        { slot: 4, index: 17 }, // Body
        { slot: 5, index: 18 }, // Shield
        { slot: 6, index: 25 }, // Legs
        { slot: 7, index: 26 }, // Hands
        { slot: 8, index: 27 }, // Feet
        { slot: 9, index: 32 }, // Ring
        { slot: 10, index: 33 }, // Ammo
        { slot: 11, index: 34 }, // Extra 1
        { slot: 12, index: 35 }, // Extra 2
        { slot: 13, index: 10 }  // Extra 3
      ];

      setup.eq.forEach((item, slot) => {
        if (item) {
          const mapping = eqMapping[slot];
          if (mapping) {
            layout[mapping.index] = item.id;
          }
        }
      });
    }

    // Map rune pouch items (starting at index 40)
    // Even if there's no rune pouch, we keep the layout structure the same
    // The slots will remain -1 if no rune pouch items exist
    if (setup.rp?.length) {
      setup.rp.forEach((item, index) => {
        if (item && index < 4) { // Ensure we only map up to 4 rune slots
          layout[index + 40] = item.id;
        }
      });
    }

    return layout;
  }

  /**
   * Handle category changed
   */
  async onCategoryChanged(newCategory: 'Combat' | 'Skilling' | 'PvP' | 'Other'): Promise<void> {
    const oldCategory = this.data.category;
    this.data.category = newCategory;
    
    // Save to Firestore if loadout has ID
    if (this.data.id) {
      try {
        await this.loadoutService.updateLoadoutCategory(this.data.id, newCategory);
        this.snackBar.open('Category updated!', 'Close', { duration: 2000 });
      } catch (error) {
        console.error('Error updating category:', error);
        // Revert on error
        this.data.category = oldCategory;
        this.snackBar.open('Failed to update category', 'Close', { duration: 3000 });
      }
    }
  }

  /**
   * Handle tags changed from tag editor component
   */
  async onTagsChanged(newTags: string[]): Promise<void> {
    const oldTags = this.data.tags || [];
    this.data.tags = newTags;
    
    // Save to Firestore if loadout has ID
    if (this.data.id) {
      try {
        await this.loadoutService.updateLoadoutTags(this.data.id, newTags);
        this.snackBar.open('Tags updated!', 'Close', { duration: 2000 });
      } catch (error) {
        console.error('Error updating tags:', error);
        // Revert on error
        this.data.tags = oldTags;
        this.snackBar.open('Failed to update tags', 'Close', { duration: 3000 });
      }
    }
  }

  /**
   * Can user remove this specific tag?
   * Only owner can remove tags
   */
  canRemoveTag(): boolean {
    return this.isOwner;
  }

  async togglePrivacy(): Promise<void> {
    if (!this.data.id) {
      this.snackBar.open('Loadout ID is missing', 'Close', { duration: 3000 });
      return;
    }

    try {
      const newPrivacy = !this.isPublic;
      await this.loadoutService.updateLoadoutPrivacy(this.data.id, newPrivacy);
      this.isPublic = newPrivacy;
      this.data.isPublic = newPrivacy;
      
      this.snackBar.open(
        newPrivacy ? 'Loadout is now public' : 'Loadout is now private',
        'Close',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Error updating privacy:', error);
      this.snackBar.open('Failed to update privacy', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  close(): void {
    this.dialogRef.close();
  }
} 