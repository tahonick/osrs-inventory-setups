import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AdminService, UserListItem } from '../../../../core/services/admin.service';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatMenuModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  template: `
    <div class="admin-users">
      <div class="header">
        <h2>User Management</h2>
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Search users</mat-label>
          <input matInput [formControl]="searchControl" placeholder="Name, email, or OSRS username">
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>
      </div>

      <div class="loading" *ngIf="loading">
        <mat-spinner diameter="40"></mat-spinner>
      </div>

      <div class="table-container" *ngIf="!loading">
        <table mat-table [dataSource]="filteredUsers" class="users-table">
          <!-- Display Name Column -->
          <ng-container matColumnDef="displayName">
            <th mat-header-cell *matHeaderCellDef>User</th>
            <td mat-cell *matCellDef="let user">
              <div class="user-cell">
                <mat-icon>{{ user.isAnonymous ? 'person_outline' : 'account_circle' }}</mat-icon>
                <div class="user-info">
                  <div class="name">{{ user.displayName }}</div>
                  <div class="email" *ngIf="user.email">{{ user.email }}</div>
                </div>
              </div>
            </td>
          </ng-container>

          <!-- OSRS Username Column -->
          <ng-container matColumnDef="osrsUsername">
            <th mat-header-cell *matHeaderCellDef>OSRS Username</th>
            <td mat-cell *matCellDef="let user">
              <mat-chip *ngIf="user.osrsUsername" class="osrs-chip">
                <mat-icon matChipAvatar>sports_esports</mat-icon>
                {{ user.osrsUsername }}
              </mat-chip>
              <span *ngIf="!user.osrsUsername" class="not-set">Not set</span>
            </td>
          </ng-container>

          <!-- Stats Column -->
          <ng-container matColumnDef="stats">
            <th mat-header-cell *matHeaderCellDef>Stats</th>
            <td mat-cell *matCellDef="let user">
              <div class="stats-cell">
                <span><mat-icon>inventory_2</mat-icon> {{ user.loadoutCount }}</span>
                <span><mat-icon>favorite</mat-icon> {{ user.totalLikes }}</span>
                <span><mat-icon>visibility</mat-icon> {{ user.totalViews }}</span>
              </div>
            </td>
          </ng-container>

          <!-- Last Active Column -->
          <ng-container matColumnDef="lastActive">
            <th mat-header-cell *matHeaderCellDef>Last Active</th>
            <td mat-cell *matCellDef="let user">
              {{ formatDate(user.lastActive) }}
            </td>
          </ng-container>

          <!-- Actions Column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef>Actions</th>
            <td mat-cell *matCellDef="let user">
              <button mat-icon-button [matMenuTriggerFor]="menu">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="viewUserLoadouts(user)">
                  <mat-icon>inventory_2</mat-icon>
                  <span>View Loadouts</span>
                </button>
                <button mat-menu-item (click)="editUser(user)">
                  <mat-icon>edit</mat-icon>
                  <span>Edit Profile</span>
                </button>
                <button mat-menu-item (click)="deleteUser(user)">
                  <mat-icon>delete</mat-icon>
                  <span>Delete User</span>
                </button>
              </mat-menu>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <div class="no-results" *ngIf="filteredUsers.length === 0">
          <mat-icon>search_off</mat-icon>
          <p>No users found</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-users {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        gap: 2rem;

        h2 {
          margin: 0;
          font-size: 2rem;
          font-weight: 500;
        }

        .search-field {
          min-width: 300px;
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
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);

      .users-table {
        width: 100%;

        th {
          background: var(--mat-primary-color);
          color: white;
          font-weight: 600;
          padding: 1rem;
        }

        td {
          padding: 1rem;
        }

        .user-cell {
          display: flex;
          align-items: center;
          gap: 0.75rem;

          mat-icon {
            font-size: 32px;
            width: 32px;
            height: 32px;
            opacity: 0.7;
          }

          .user-info {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;

            .name {
              font-weight: 600;
            }

            .email {
              font-size: 0.85rem;
              opacity: 0.7;
            }
          }
        }

        .osrs-chip {
          background: rgba(var(--mat-primary-color-rgb, 103, 58, 183), 0.15);
          
          mat-icon {
            font-size: 20px;
            width: 20px;
            height: 20px;
          }
        }

        .not-set {
          opacity: 0.5;
          font-style: italic;
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
export class AdminUsersComponent implements OnInit {
  displayedColumns = ['displayName', 'osrsUsername', 'stats', 'lastActive', 'actions'];
  users: UserListItem[] = [];
  filteredUsers: UserListItem[] = [];
  loading = true;
  searchControl = new FormControl('');

  constructor(
    private adminService: AdminService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  async ngOnInit() {
    await this.loadUsers();

    // Set up search
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filterUsers(value || '');
    });
  }

  async loadUsers() {
    this.loading = true;
    try {
      this.users = await this.adminService.getUsers(100);
      this.filteredUsers = [...this.users];
    } catch (error) {
      console.error('Error loading users:', error);
      this.snackBar.open('Failed to load users', 'Close', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  filterUsers(searchTerm: string) {
    const search = searchTerm.toLowerCase();
    this.filteredUsers = this.users.filter(user =>
      user.displayName?.toLowerCase().includes(search) ||
      user.email?.toLowerCase().includes(search) ||
      user.osrsUsername?.toLowerCase().includes(search)
    );
  }

  viewUserLoadouts(user: UserListItem) {
    // Navigate to home with user filter (to be implemented)
    this.snackBar.open(`View loadouts by ${user.displayName}`, 'Close', { duration: 2000 });
  }

  editUser(user: UserListItem) {
    // Open edit dialog (to be implemented)
    this.snackBar.open(`Edit user: ${user.displayName}`, 'Close', { duration: 2000 });
  }

  async deleteUser(user: UserListItem) {
    if (!confirm(`Delete user "${user.displayName}" and all their loadouts? This cannot be undone.`)) {
      return;
    }

    try {
      await this.adminService.deleteUserAndLoadouts(user.uid);
      this.snackBar.open('User deleted successfully', 'Close', { duration: 3000 });
      await this.loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      this.snackBar.open('Failed to delete user', 'Close', { duration: 3000 });
    }
  }

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
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  }
}
