import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import { AdminDashboardComponent } from './components/dashboard/admin-dashboard.component';
import { AdminUsersComponent } from './components/users/admin-users.component';
import { AdminLoadoutsComponent } from './components/loadouts/admin-loadouts.component';
import { AdminMigrationsComponent } from './components/migrations/admin-migrations.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatIconModule,
    MatButtonModule,
    AdminDashboardComponent,
    AdminUsersComponent,
    AdminLoadoutsComponent,
    AdminMigrationsComponent
  ],
  template: `
    <div class="admin-container">
      <div class="admin-header">
        <div class="header-content">
          <h1>
            <mat-icon>admin_panel_settings</mat-icon>
            Admin Portal
          </h1>
          <button mat-stroked-button (click)="goHome()">
            <mat-icon>home</mat-icon>
            Back to Home
          </button>
        </div>
      </div>

      <mat-tab-group animationDuration="300ms" class="admin-tabs">
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>dashboard</mat-icon>
            Dashboard
          </ng-template>
          <app-admin-dashboard></app-admin-dashboard>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>group</mat-icon>
            Users
          </ng-template>
          <app-admin-users></app-admin-users>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>inventory_2</mat-icon>
            Loadouts
          </ng-template>
          <app-admin-loadouts></app-admin-loadouts>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon>swap_horiz</mat-icon>
            Migrations
          </ng-template>
          <app-admin-migrations></app-admin-migrations>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [`
    .admin-container {
      min-height: 100vh;
      background: var(--mat-app-background-color);
    }

    .admin-header {
      background: linear-gradient(to right, #1a1a1a, #2d2d2d);
      color: white;
      padding: 1.5rem 2rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

      .header-content {
        max-width: 1600px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;

        h1 {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin: 0;
          font-size: 2rem;
          font-weight: 500;

          mat-icon {
            font-size: 36px;
            width: 36px;
            height: 36px;
            color: var(--mat-primary-color);
          }
        }

        button {
          color: white;
          border-color: rgba(255, 255, 255, 0.3);

          &:hover {
            border-color: rgba(255, 255, 255, 0.6);
            background: rgba(255, 255, 255, 0.05);
          }

          mat-icon {
            margin-right: 0.5rem;
          }
        }
      }
    }

    .admin-tabs {
      ::ng-deep .mat-mdc-tab-labels {
        background: var(--mat-card-background);
        border-bottom: 2px solid var(--mat-divider-color);
      }

      ::ng-deep .mat-mdc-tab-label {
        min-width: 120px;
        padding: 0 2rem;
        opacity: 0.7;

        mat-icon {
          margin-right: 0.5rem;
        }

        &.mdc-tab--active {
          opacity: 1;
        }
      }

      ::ng-deep .mat-mdc-tab-body-content {
        padding: 0;
        overflow-x: hidden;
      }
    }
  `]
})
export class AdminComponent {
  constructor(private router: Router) {}

  goHome() {
    this.router.navigate(['/']);
  }
}
