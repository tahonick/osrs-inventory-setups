import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { AdminService, AdminStats } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  template: `
    <div class="admin-dashboard">
      <h2>Dashboard Overview</h2>

      <div class="loading" *ngIf="loading">
        <mat-spinner diameter="40"></mat-spinner>
        <p>Loading statistics...</p>
      </div>

      <div class="stats-grid" *ngIf="!loading && stats">
        <!-- User Stats -->
        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>group</mat-icon>
              <h3>Total Users</h3>
            </div>
            <div class="stat-value">{{ stats.totalUsers }}</div>
            <mat-divider></mat-divider>
            <div class="stat-details">
              <div class="detail-row">
                <span>Google Sign-in:</span>
                <span class="value">{{ stats.googleUsers }}</span>
              </div>
              <div class="detail-row">
                <span>Anonymous:</span>
                <span class="value">{{ stats.anonymousUsers }}</span>
              </div>
              <div class="detail-row">
                <span>New Today:</span>
                <span class="value highlight">{{ stats.usersToday }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Loadout Stats -->
        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>inventory_2</mat-icon>
              <h3>Total Loadouts</h3>
            </div>
            <div class="stat-value">{{ stats.totalLoadouts }}</div>
            <mat-divider></mat-divider>
            <div class="stat-details">
              <div class="detail-row">
                <span>Public:</span>
                <span class="value">{{ stats.publicLoadouts }}</span>
              </div>
              <div class="detail-row">
                <span>Private:</span>
                <span class="value">{{ stats.privateLoadouts }}</span>
              </div>
              <div class="detail-row">
                <span>New Today:</span>
                <span class="value highlight">{{ stats.loadoutsToday }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Engagement Stats -->
        <mat-card class="stat-card">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>favorite</mat-icon>
              <h3>Total Likes</h3>
            </div>
            <div class="stat-value">{{ stats.totalLikes }}</div>
            <mat-divider></mat-divider>
            <div class="stat-details">
              <div class="detail-row">
                <span>Total Views:</span>
                <span class="value">{{ stats.totalViews }}</span>
              </div>
              <div class="detail-row">
                <span>Avg per Loadout:</span>
                <span class="value">{{ getAvgLikes() }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Top Creators -->
        <mat-card class="stat-card top-creators">
          <mat-card-content>
            <div class="stat-header">
              <mat-icon>stars</mat-icon>
              <h3>Top Creators</h3>
            </div>
            <div class="creators-list" *ngIf="topCreators.length > 0">
              <div class="creator-item" *ngFor="let creator of topCreators; let i = index">
                <div class="rank">#{{ i + 1 }}</div>
                <div class="creator-info">
                  <div class="name">{{ creator.osrsUsername || creator.displayName }}</div>
                  <div class="stats-small">
                    {{ creator.loadoutCount }} setups • {{ creator.totalLikes }} likes
                  </div>
                </div>
              </div>
            </div>
            <div class="no-data" *ngIf="topCreators.length === 0">
              <p>No creators yet</p>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <div class="error" *ngIf="error">
        <mat-icon>error</mat-icon>
        <p>{{ error }}</p>
      </div>
    </div>
  `,
  styles: [`
    .admin-dashboard {
      padding: 2rem;
      max-width: 1600px;
      margin: 0 auto;

      h2 {
        margin: 0 0 2rem 0;
        font-size: 2rem;
        font-weight: 500;
      }
    }

    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 3rem;
      opacity: 0.7;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;

      .stat-card {
        mat-card-content {
          padding: 1.5rem;

          .stat-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1rem;

            mat-icon {
              font-size: 32px;
              width: 32px;
              height: 32px;
              color: var(--mat-primary-color);
            }

            h3 {
              margin: 0;
              font-size: 1.1rem;
              font-weight: 500;
              opacity: 0.9;
            }
          }

          .stat-value {
            font-size: 3rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: var(--mat-primary-color);
          }

          mat-divider {
            margin: 1rem 0;
          }

          .stat-details {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;

            .detail-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 0.95rem;

              span {
                opacity: 0.8;
              }

              .value {
                font-weight: 600;
                opacity: 1;

                &.highlight {
                  color: var(--mat-primary-color);
                }
              }
            }
          }
        }

        &.top-creators {
          grid-column: span 2;

          @media (max-width: 1024px) {
            grid-column: span 1;
          }

          .creators-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;

            .creator-item {
              display: flex;
              align-items: center;
              gap: 1rem;
              padding: 0.75rem;
              background: var(--mat-card-background);
              border: 1px solid var(--mat-divider-color);
              border-radius: 8px;
              transition: transform 0.2s;

              &:hover {
                transform: translateX(4px);
              }

              .rank {
                font-size: 1.5rem;
                font-weight: 700;
                color: var(--mat-primary-color);
                min-width: 40px;
                text-align: center;
              }

              .creator-info {
                flex: 1;

                .name {
                  font-weight: 600;
                  font-size: 1rem;
                  margin-bottom: 0.25rem;
                }

                .stats-small {
                  font-size: 0.85rem;
                  opacity: 0.7;
                }
              }
            }
          }

          .no-data {
            text-align: center;
            padding: 2rem;
            opacity: 0.5;
          }
        }
      }
    }

    .error {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
      color: var(--mat-error-color);

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }
  `]
})
export class AdminDashboardComponent implements OnInit {
  loading = true;
  error: string | null = null;
  stats: AdminStats | null = null;
  topCreators: Array<{ uid: string; displayName: string; osrsUsername?: string; loadoutCount: number; totalLikes: number; }> = [];

  constructor(private adminService: AdminService) {}

  async ngOnInit() {
    await this.loadDashboardData();
  }

  async loadDashboardData() {
    this.loading = true;
    this.error = null;

    try {
      [this.stats, this.topCreators] = await Promise.all([
        this.adminService.getAdminStats(),
        this.adminService.getTopCreators(10)
      ]);
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      this.error = error.message || 'Failed to load dashboard data';
    } finally {
      this.loading = false;
    }
  }

  getAvgLikes(): string {
    if (!this.stats || this.stats.totalLoadouts === 0) return '0';
    return (this.stats.totalLikes / this.stats.totalLoadouts).toFixed(1);
  }
}
