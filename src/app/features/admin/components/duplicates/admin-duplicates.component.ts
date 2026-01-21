import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AdminService, DuplicateGroup } from '../../../../core/services/admin.service';
import { FirebaseService } from '../../../../core/services/firebase.service';
import { LoadoutModalComponent } from '../../../loadout/components/loadout-modal/loadout-modal.component';
import { LoadoutData } from '../../../../shared/models/inventory.model';
import { FirebaseDatePipe } from '../../../../shared/pipes/firebase-date.pipe';

@Component({
  selector: 'app-admin-duplicates',
  templateUrl: './admin-duplicates.component.html',
  styleUrls: ['./admin-duplicates.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    MatCheckboxModule,
    FirebaseDatePipe
  ],
  providers: [DatePipe]
})
export class AdminDuplicatesComponent implements OnInit {
  duplicateGroups: DuplicateGroup[] = [];
  loading = true;
  expandedGroups = new Set<string>();
  selectedLoadouts = new Set<string>();
  deleting = false;

  constructor(
    private adminService: AdminService,
    private firebaseService: FirebaseService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    await this.loadDuplicates();
  }

  async loadDuplicates() {
    try {
      this.loading = true;
      this.duplicateGroups = await this.adminService.findDuplicates();
    } catch (error) {
      console.error('Error loading duplicates:', error);
      this.snackBar.open('Failed to load duplicates', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.loading = false;
    }
  }

  toggleGroup(hash: string) {
    if (this.expandedGroups.has(hash)) {
      this.expandedGroups.delete(hash);
    } else {
      this.expandedGroups.add(hash);
    }
  }

  isGroupExpanded(hash: string): boolean {
    return this.expandedGroups.has(hash);
  }

  viewLoadout(loadout: LoadoutData) {
    this.dialog.open(LoadoutModalComponent, {
      width: '90vw',
      maxWidth: '1400px',
      maxHeight: '90vh',
      data: loadout
    });
  }

  async deleteLoadout(loadout: LoadoutData) {
    if (!confirm(`Delete "${loadout.setup?.name || 'this loadout'}"? This cannot be undone.`)) {
      return;
    }

    try {
      await this.firebaseService.deleteLoadout(loadout.id!);
      this.snackBar.open('Loadout deleted successfully', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
      await this.loadDuplicates(); // Reload to update the view
    } catch (error) {
      console.error('Error deleting loadout:', error);
      this.snackBar.open('Failed to delete loadout', 'Close', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }

  getTotalDuplicates(): number {
    return this.duplicateGroups.reduce((sum, group) => sum + group.count, 0);
  }

  getTotalDuplicateGroups(): number {
    return this.duplicateGroups.length;
  }

  toggleSelection(loadoutId: string) {
    if (this.selectedLoadouts.has(loadoutId)) {
      this.selectedLoadouts.delete(loadoutId);
    } else {
      this.selectedLoadouts.add(loadoutId);
    }
  }

  isSelected(loadoutId: string): boolean {
    return this.selectedLoadouts.has(loadoutId);
  }

  selectAllInGroup(group: DuplicateGroup) {
    // Keep the first one, select all others for deletion
    group.loadouts.slice(1).forEach(loadout => {
      this.selectedLoadouts.add(loadout.id!);
    });
  }

  deselectAllInGroup(group: DuplicateGroup) {
    group.loadouts.forEach(loadout => {
      this.selectedLoadouts.delete(loadout.id!);
    });
  }

  async bulkDelete() {
    if (this.selectedLoadouts.size === 0) {
      this.snackBar.open('No loadouts selected', 'Close', { duration: 3000 });
      return;
    }

    if (!confirm(`Delete ${this.selectedLoadouts.size} selected loadouts? This cannot be undone.`)) {
      return;
    }

    this.deleting = true;
    const toDelete = Array.from(this.selectedLoadouts);
    let successCount = 0;
    let errorCount = 0;

    for (const loadoutId of toDelete) {
      try {
        await this.firebaseService.deleteLoadout(loadoutId);
        successCount++;
        this.selectedLoadouts.delete(loadoutId);
      } catch (error) {
        console.error(`Error deleting loadout ${loadoutId}:`, error);
        errorCount++;
      }
    }

    this.deleting = false;

    if (successCount > 0) {
      this.snackBar.open(`Deleted ${successCount} loadout(s)`, 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar']
      });
    }

    if (errorCount > 0) {
      this.snackBar.open(`Failed to delete ${errorCount} loadout(s)`, 'Close', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    }

    await this.loadDuplicates();
  }

  clearSelection() {
    this.selectedLoadouts.clear();
  }
}
