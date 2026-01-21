import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AdminService, LoadoutListItem } from '../../../../core/services/admin.service';
import { LoadoutModalComponent } from '../../../loadout/components/loadout-modal/loadout-modal.component';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-admin-loadouts',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatMenuModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  template: `
    <div class="admin-loadouts">
      <div class="header">
        <h2>Loadout Moderation</h2>
        <div class="filters">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search loadouts</mat-label>
            <input matInput [formControl]="searchControl" placeholder="Name or creator">
            <mat-icon matPrefix>search</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-select">
            <mat-label>Category</mat-label>
            <mat-select [formControl]="categoryControl">
              <mat-option value="">All Categories</mat-option>
              <mat-option value="Combat">Combat</mat-option>
              <mat-option value="Skilling">Skilling</mat-option>
              <mat-option value="PvP">PvP</mat-option>
              <mat-option value="Other">Other</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-select">
            <mat-label>Visibility</mat-label>
            <mat-select [formControl]="visibilityControl">
              <mat-option value="">All</mat-option>
              <mat-option value="public">Public</mat-option>
              <mat-option value="private">Private</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      <div class="loading" *ngIf="loading">
        <mat-spinner diameter="40"></mat-spinner>
      </div>

      <div class="table-container" *ngIf="!loading">
        <table mat-table [dataSource]="filteredLoadouts" class="loadouts-table">
          <!-- Name Column -->
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Name</th>
            <td mat-cell *matCellDef="let loadout">
              <div class="name-cell">
                <div class="loadout-name">{{ loadout.name }}</div>
                <div class="creator">by {{ loadout.creatorOsrsUsername || loadout.creatorDisplayName || 'Unknown' }}</div>
              </div>
            </td>
          </ng-container>

          <!-- Category Column -->
          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef>Category</th>
            <td mat-cell *matCellDef="let loadout">
              <mat-chip class="category-chip">{{ loadout.category }}</mat-chip>
            </td>
          </ng-container>

          <!-- Tags Column -->
          <ng-container matColumnDef="tags">
            <th mat-header-cell *matHeaderCellDef>Tags</th>
            <td mat-cell *matCellDef="let loadout">
              <div class="tags-cell">
                <mat-chip *ngFor="let tag of loadout.tags.slice(0, 3)">{{ tag }}</mat-chip>
                <span *ngIf="loadout.tags.length > 3" class="more-tags">+{{ loadout.tags.length - 3 }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Visibility Column -->
          <ng-container matColumnDef="visibility">
            <th mat-header-cell *matHeaderCellDef>Visibility</th>
            <td mat-cell *matCellDef="let loadout">
              <mat-chip [class.public-chip]="loadout.isPublic" [class.private-chip]="!loadout.isPublic">
                <mat-icon>{{ loadout.isPublic ? 'public' : 'lock' }}</mat-icon>
                {{ loadout.isPublic ? 'Public' : 'Private' }}
              </mat-chip>
            </td>
          </ng-container>

          <!-- Stats Column -->
          <ng-container matColumnDef="stats">
            <th mat-header-cell *matHeaderCellDef>Stats</th>
            <td mat-cell *matCellDef="let loadout">
              <div class="stats-cell">
                <span><mat-icon>favorite</mat-icon> {{ loadout.likes }}</span>
                <span><mat-icon>visibility</mat-icon> {{ loadout.views }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Created Column -->
          <ng-container matColumnDef="created">
            <th mat-header-cell *matHeaderCellDef>Created</th>
            <td mat-cell *matCellDef="let loadout">
              {{ formatDate(loadout.createdAt) }}
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Actions</th>
            <td mat-cell *matCellDef="let loadout">
              <button mat-icon-button [matMenuTriggerFor]="menu">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="viewLoadout(loadout)">
                  <mat-icon>visibility</mat-icon>
                  <span>View/Edit</span>
                </button>
                <button mat-menu-item (click)="toggleVisibility(loadout)">
                  <mat-icon>{{ loadout.isPublic ? 'lock' : 'public' }}</mat-icon>
                  <span>Make {{ loadout.isPublic ? 'Private' : 'Public' }}</span>
                </button>
                <button mat-menu-item (click)="reassignLoadout(loadout)">
                  <mat-icon>swap_horiz</mat-icon>
                  <span>Reassign Owner</span>
                </button>
                <button mat-menu-item (click)="deleteLoadout(loadout)">
                  <mat-icon>delete</mat-icon>
                  <span>Delete</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <div class="no-results" *ngIf="filteredLoadouts.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>No loadouts found</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-loadouts {
      padding: 2rem;
      max-width: 1800px;
      margin: 0 auto;

      .header {
        margin-bottom: 2rem;

        h2 {
          margin: 0 0 1.5rem 0;
          font-size: 2rem;
          font-weight: 500;
        }

        .filters {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;

          .search-field {
            flex: 1;
            min-width: 250px;
          }

          .filter-select {
            min-width: 150px;
          }
        }
      }
    }

    .loading {
      display: flex;
      justify-content: center;
      padding: 3rem;
    }

    .table-container {
      background: var(--mat-card-background);
      border-radius: 8px;
      overflow-x: auto;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

      .loadouts-table {
        width: 100%;
        min-width: 1000px;

        th {
          background: var(--mat-primary-color);
          color: white;
          font-weight: 600;
          padding: 1rem;
        }

        td {
          padding: 0.75rem 1rem;
        }

        .name-cell {
          .loadout-name {
            font-weight: 600;
            margin-bottom: 0.25rem;
          }

          .creator {
            font-size: 0.85rem;
            opacity: 0.7;
          }
        }

        .category-chip {
          background: rgba(var(--mat-primary-color-rgb, 103, 58, 183), 0.15);
        }

        .tags-cell {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;

          mat-chip {
            font-size: 0.8rem;
            min-height: 24px;
          }

          .more-tags {
            font-size: 0.85rem;
            opacity: 0.7;
          }
        }

        .public-chip {
          background: rgba(76, 175, 80, 0.15);
          color: #4caf50;

          mat-icon {
            color: #4caf50;
          }
        }

        .private-chip {
          background: rgba(255, 152, 0, 0.15);
          color: #ff9800;

          mat-icon {
            color: #ff9800;
          }
        }

        .stats-cell {
          display: flex;
          gap: 1rem;
          font-size: 0.9rem;

          span {
            display: flex;
            align-items: center;
            gap: 0.25rem;

            mat-icon {
              font-size: 16px;
              width: 16px;
              height: 16px;
              opacity: 0.7;
            }
          }
        }
      }

      .no-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 3rem;
        opacity: 0.5;

        mat-icon {
          font-size: 48px;
          width: 48px;
          height: 48px;
        }
      }
    }
  `]
})
export class AdminLoadoutsComponent implements OnInit {
  displayedColumns = ['name', 'category', 'tags', 'visibility', 'stats', 'created', 'actions'];
  loadouts: LoadoutListItem[] = [];
  filteredLoadouts: LoadoutListItem[] = [];
  loading = true;
  
  searchControl = new FormControl('');
  categoryControl = new FormControl('');
  visibilityControl = new FormControl('');

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    await this.loadLoadouts();

    // Set up filters
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(() => this.applyFilters());

    this.categoryControl.valueChanges.subscribe(() => this.applyFilters());
    this.visibilityControl.valueChanges.subscribe(() => this.applyFilters());
  }

  async loadLoadouts() {
    this.loading = true;
    try {
      this.loadouts = await this.adminService.getAllLoadouts(200);
      this.filteredLoadouts = [...this.loadouts];
    } catch (error) {
      console.error('Error loading loadouts:', error);
      this.snackBar.open('Failed to load loadouts', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  applyFilters() {
    let filtered = [...this.loadouts];

    const search = this.searchControl.value?.toLowerCase() || '';
    if (search) {
      filtered = filtered.filter(loadout =>
        loadout.name.toLowerCase().includes(search) ||
        loadout.creatorOsrsUsername?.toLowerCase().includes(search) ||
        loadout.creatorDisplayName?.toLowerCase().includes(search)
      );
    }

    const category = this.categoryControl.value;
    if (category) {
      filtered = filtered.filter(loadout => loadout.category === category);
    }

    const visibility = this.visibilityControl.value;
    if (visibility === 'public') {
      filtered = filtered.filter(loadout => loadout.isPublic);
    } else if (visibility === 'private') {
      filtered = filtered.filter(loadout => !loadout.isPublic);
    }

    this.filteredLoadouts = filtered;
  }

  viewLoadout(loadout: LoadoutListItem) {
    // Open loadout in modal (to be fully implemented)
    this.snackBar.open(`View loadout: ${loadout.name}`, 'Close', { duration: 2000 });
  }

  async toggleVisibility(loadout: LoadoutListItem) {
    try {
      const newVisibility = !loadout.isPublic;
      await this.adminService.updateLoadoutVisibility(loadout.id, newVisibility);
      loadout.isPublic = newVisibility;
      this.snackBar.open(
        `Loadout is now ${newVisibility ? 'public' : 'private'}`, 
        'Close', 
        { duration: 2000 }
      );
    } catch (error) {
      console.error('Error toggling visibility:', error);
      this.snackBar.open('Failed to update visibility', 'Close', { duration: 3000 });
    }
  }

  async reassignLoadout(loadout: LoadoutListItem) {
    const newUserId = prompt(`Enter new user ID to reassign "${loadout.name}":`);
    if (!newUserId) return;

    try {
      await this.adminService.reassignLoadout(loadout.id, newUserId);
      this.snackBar.open('Loadout reassigned successfully', 'Close', { duration: 3000 });
      await this.loadLoadouts();
    } catch (error) {
      console.error('Error reassigning loadout:', error);
      this.snackBar.open('Failed to reassign loadout', 'Close', { duration: 3000 });
    }
  }

  async deleteLoadout(loadout: LoadoutListItem) {
    if (!confirm(`Delete loadout "${loadout.name}"? This cannot be undone.`)) {
      return;
    }

    // To be implemented - needs delete method in AdminService
    this.snackBar.open('Delete functionality to be implemented', 'Close', { duration: 2000 });
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  }
}
