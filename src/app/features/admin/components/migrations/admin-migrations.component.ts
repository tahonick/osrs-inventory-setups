import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { AdminService, UserListItem } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-admin-migrations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTableModule
  ],
  template: `
    <div class="admin-migrations">
      <h2>Account Migrations</h2>

      <!-- Orphaned Accounts Section -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-icon>warning</mat-icon>
          <h3>Orphaned Accounts</h3>
        </mat-card-header>
        <mat-card-content>
          <p>Inactive accounts (no activity in 90+ days) with loadouts:</p>
          
          <button mat-stroked-button (click)="scanOrphanedAccounts()" [disabled]="scanningOrphans">
            <mat-spinner diameter="20" *ngIf="scanningOrphans"></mat-spinner>
            <mat-icon *ngIf="!scanningOrphans">search</mat-icon>
            Scan for Orphaned Accounts
          </button>

          <div class="orphaned-list" *ngIf="orphanedAccounts.length > 0">
            <table mat-table [dataSource]="orphanedAccounts">
              <ng-container matColumnDef="user">
                <th mat-header-cell *matHeaderCellDef>User</th>
                <td mat-cell *matCellDef="let account">
                  {{ account.displayName }}
                  <span *ngIf="account.osrsUsername" class="osrs-name">({{ account.osrsUsername }})</span>
                </td>
              </ng-container>

              <ng-container matColumnDef="loadouts">
                <th mat-header-cell *matHeaderCellDef>Loadouts</th>
                <td mat-cell *matCellDef="let account">{{ account.loadoutCount }}</td>
              </ng-container>

              <ng-container matColumnDef="lastActive">
                <th mat-header-cell *matHeaderCellDef>Last Active</th>
                <td mat-cell *matCellDef="let account">{{ formatDate(account.lastActive) }}</td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef>Actions</th>
                <td mat-cell *matCellDef="let account">
                  <button mat-button color="warn" (click)="deleteOrphanedAccount(account)">
                    Delete
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="['user', 'loadouts', 'lastActive', 'actions']"></tr>
              <tr mat-row *matRowDef="let row; columns: ['user', 'loadouts', 'lastActive', 'actions'];"></tr>
            </table>
          </div>

          <div class="no-orphans" *ngIf="!scanningOrphans && orphanedAccounts.length === 0 && orphansScanComplete">
            <mat-icon>check_circle</mat-icon>
            <p>No orphaned accounts found</p>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Bulk Migration Tool -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-icon>swap_horiz</mat-icon>
          <h3>Bulk Migration Tool</h3>
        </mat-card-header>
        <mat-card-content>
          <p>Migrate all loadouts from one user to another:</p>

          <div class="migration-form">
            <mat-form-field appearance="outline">
              <mat-label>From User ID</mat-label>
              <input matInput [formControl]="fromUserControl" placeholder="Source user ID">
              <mat-icon matPrefix>person</mat-icon>
            </mat-form-field>

            <mat-icon class="arrow-icon">arrow_forward</mat-icon>

            <mat-form-field appearance="outline">
              <mat-label>To User ID</mat-label>
              <input matInput [formControl]="toUserControl" placeholder="Destination user ID">
              <mat-icon matPrefix>person</mat-icon>
            </mat-form-field>

            <button 
              mat-raised-button 
              color="primary" 
              (click)="executeMigration()"
              [disabled]="!canMigrate() || migrating">
              <mat-spinner diameter="20" *ngIf="migrating"></mat-spinner>
              <mat-icon *ngIf="!migrating">sync</mat-icon>
              <span *ngIf="!migrating">Migrate</span>
            </button>
          </div>

          <mat-progress-bar 
            *ngIf="migrating" 
            mode="indeterminate">
          </mat-progress-bar>

          <div class="migration-result" *ngIf="migrationResult">
            <mat-icon [class.success]="migrationResult.success" [class.error]="!migrationResult.success">
              {{ migrationResult.success ? 'check_circle' : 'error' }}
            </mat-icon>
            <p>{{ migrationResult.message }}</p>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-divider></mat-divider>

      <!-- Single Loadout Reassignment -->
      <mat-card class="section-card">
        <mat-card-header>
          <mat-icon>edit</mat-icon>
          <h3>Single Loadout Reassignment</h3>
        </mat-card-header>
        <mat-card-content>
          <p>Reassign a specific loadout to a different user:</p>

          <div class="reassignment-form">
            <mat-form-field appearance="outline">
              <mat-label>Loadout ID</mat-label>
              <input matInput [formControl]="loadoutIdControl" placeholder="Enter loadout ID">
              <mat-icon matPrefix>inventory_2</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>New Owner User ID</mat-label>
              <input matInput [formControl]="newOwnerControl" placeholder="Destination user ID">
              <mat-icon matPrefix>person</mat-icon>
            </mat-form-field>

            <button 
              mat-raised-button 
              color="accent" 
              (click)="reassignSingleLoadout()"
              [disabled]="!canReassign() || reassigning">
              <mat-spinner diameter="20" *ngIf="reassigning"></mat-spinner>
              <mat-icon *ngIf="!reassigning">swap_horiz</mat-icon>
              <span *ngIf="!reassigning">Reassign</span>
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .admin-migrations {
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;

      h2 {
        margin: 0 0 2rem 0;
        font-size: 2rem;
        font-weight: 500;
      }

      mat-divider {
        margin: 2rem 0;
      }
    }

    .section-card {
      margin-bottom: 2rem;

      mat-card-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1.5rem;
        background: rgba(var(--mat-primary-color-rgb, 103, 58, 183), 0.05);

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          color: var(--mat-primary-color);
        }

        h3 {
          margin: 0;
          font-size: 1.3rem;
          font-weight: 500;
        }
      }

      mat-card-content {
        padding: 1.5rem;

        > p {
          margin: 0 0 1.5rem 0;
          opacity: 0.8;
        }
      }
    }

    .orphaned-list {
      margin-top: 1.5rem;

      table {
        width: 100%;

        th {
          font-weight: 600;
          padding: 0.75rem;
        }

        td {
          padding: 0.75rem;

          .osrs-name {
            font-size: 0.9rem;
            opacity: 0.7;
            margin-left: 0.5rem;
          }
        }
      }
    }

    .no-orphans {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem;
      opacity: 0.5;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: green;
      }
    }

    .migration-form,
    .reassignment-form {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;

      mat-form-field {
        flex: 1;
        min-width: 200px;
      }

      .arrow-icon {
        margin-top: 0.5rem;
        font-size: 32px;
        width: 32px;
        height: 32px;
        opacity: 0.5;
      }

      button {
        margin-top: 0.5rem;
        min-width: 120px;
      }
    }

    .migration-result {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 1.5rem;
      padding: 1rem;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.05);

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;

        &.success {
          color: #4caf50;
        }

        &.error {
          color: #f44336;
        }
      }

      p {
        margin: 0;
        font-weight: 500;
      }
    }
  `]
})
export class AdminMigrationsComponent implements OnInit {
  orphanedAccounts: UserListItem[] = [];
  scanningOrphans = false;
  orphansScanComplete = false;

  fromUserControl = new FormControl('');
  toUserControl = new FormControl('');
  migrating = false;
  migrationResult: { success: boolean; message: string } | null = null;

  loadoutIdControl = new FormControl('');
  newOwnerControl = new FormControl('');
  reassigning = false;

  constructor(
    private adminService: AdminService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit() {
    // Auto-scan for orphaned accounts on load
    this.scanOrphanedAccounts();
  }

  async scanOrphanedAccounts() {
    this.scanningOrphans = true;
    this.orphansScanComplete = false;
    try {
      this.orphanedAccounts = await this.adminService.findOrphanedAccounts(90);
      this.orphansScanComplete = true;
    } catch (error) {
      console.error('Error scanning orphaned accounts:', error);
      this.snackBar.open('Failed to scan orphaned accounts', 'Close', { duration: 3000 });
    } finally {
      this.scanningOrphans = false;
    }
  }

  async deleteOrphanedAccount(account: UserListItem) {
    if (!confirm(`Delete account "${account.displayName}" and all ${account.loadoutCount} loadouts? This cannot be undone.`)) {
      return;
    }

    try {
      await this.adminService.deleteUserAndLoadouts(account.uid);
      this.snackBar.open('Account deleted successfully', 'Close', { duration: 3000 });
      await this.scanOrphanedAccounts();
    } catch (error) {
      console.error('Error deleting orphaned account:', error);
      this.snackBar.open('Failed to delete account', 'Close', { duration: 3000 });
    }
  }

  canMigrate(): boolean {
    const from = this.fromUserControl.value?.trim();
    const to = this.toUserControl.value?.trim();
    return !!from && !!to && from !== to;
  }

  async executeMigration() {
    if (!this.canMigrate()) return;

    const fromUserId = this.fromUserControl.value!.trim();
    const toUserId = this.toUserControl.value!.trim();

    if (!confirm(`Migrate all loadouts from\n${fromUserId}\nto\n${toUserId}?\n\nThis will update the userId and creator info for all affected loadouts.`)) {
      return;
    }

    this.migrating = true;
    this.migrationResult = null;

    try {
      const migratedCount = await this.adminService.migrateUserLoadouts(fromUserId, toUserId);
      
      this.migrationResult = {
        success: true,
        message: `Successfully migrated ${migratedCount} loadouts from ${fromUserId} to ${toUserId}`
      };

      this.snackBar.open(`Migrated ${migratedCount} loadouts successfully`, 'Close', { duration: 5000 });
      
      // Clear form
      this.fromUserControl.reset();
      this.toUserControl.reset();
    } catch (error: any) {
      console.error('Error during migration:', error);
      this.migrationResult = {
        success: false,
        message: `Migration failed: ${error.message}`
      };
      this.snackBar.open('Migration failed', 'Close', { duration: 3000 });
    } finally {
      this.migrating = false;
    }
  }

  canReassign(): boolean {
    const loadoutId = this.loadoutIdControl.value?.trim();
    const newOwner = this.newOwnerControl.value?.trim();
    return !!loadoutId && !!newOwner;
  }

  async reassignSingleLoadout() {
    if (!this.canReassign()) return;

    const loadoutId = this.loadoutIdControl.value!.trim();
    const newOwner = this.newOwnerControl.value!.trim();

    if (!confirm(`Reassign loadout ${loadoutId} to user ${newOwner}?`)) {
      return;
    }

    this.reassigning = true;

    try {
      await this.adminService.reassignLoadout(loadoutId, newOwner);
      this.snackBar.open('Loadout reassigned successfully', 'Close', { duration: 3000 });
      
      // Clear form
      this.loadoutIdControl.reset();
      this.newOwnerControl.reset();
    } catch (error: any) {
      console.error('Error reassigning loadout:', error);
      this.snackBar.open(`Failed: ${error.message}`, 'Close', { duration: 3000 });
    } finally {
      this.reassigning = false;
    }
  }

  formatDate(timestamp: any): string {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString();
  }
}
