import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { FirebaseService } from '../../../core/services/firebase.service';
import { LoadoutService } from '../../../core/services/loadout.service';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  template: `
    <div class="profile-dialog">
      <div class="header">
        <div class="user-avatar">
          <mat-icon>account_circle</mat-icon>
        </div>
        <h2 mat-dialog-title>{{ data.isFirstTimePrompt ? 'Welcome!' : 'User Profile' }}</h2>
      </div>

      <mat-dialog-content>
        <!-- Welcome message for first-time prompt -->
        <div class="welcome-message" *ngIf="data.isFirstTimePrompt">
          <mat-icon>info</mat-icon>
          <div class="message-content">
            <h3>Set Your OSRS Username</h3>
            <p>Let the community know who you are! Your OSRS username will be displayed on all your setups.</p>
          </div>
        </div>

        <div class="profile-section">
          <h3>Account Information</h3>
          <p class="privacy-note">
            <mat-icon>lock</mat-icon>
            <span>Private - Only visible to you, never shown to other users</span>
          </p>
          
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Display Name (from Google)</mat-label>
            <input matInput [value]="data.user.displayName || 'Not set'" readonly>
            <mat-icon matPrefix>person</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Email</mat-label>
            <input matInput [value]="data.user.email || 'Not available'" readonly>
            <mat-icon matPrefix>email</mat-icon>
          </mat-form-field>
        </div>

        <mat-divider></mat-divider>

        <div class="profile-section">
          <h3>OSRS Username</h3>
          <p class="public-note">
            <mat-icon>public</mat-icon>
            <span><strong>Public</strong> - This will be displayed on all your setups for everyone to see</span>
          </p>
          
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>OSRS Username</mat-label>
            <input 
              matInput 
              [formControl]="osrsUsernameControl"
              placeholder="Enter your OSRS username"
              maxlength="12">
            <mat-icon matPrefix>sports_esports</mat-icon>
            <mat-hint>1-12 characters, letters, numbers, spaces, and hyphens only</mat-hint>
            <mat-error *ngIf="osrsUsernameControl.hasError('pattern')">
              Invalid format. Use letters, numbers, spaces, and hyphens only.
            </mat-error>
            <mat-error *ngIf="osrsUsernameControl.hasError('taken')">
              This username is already taken
            </mat-error>
          </mat-form-field>

          <div class="checkbox-option" *ngIf="stats.loadoutCount > 0">
            <mat-checkbox [formControl]="updateExistingControl">
              Update all {{stats.loadoutCount}} existing setups with new username
            </mat-checkbox>
          </div>
        </div>

        <mat-divider></mat-divider>

        <div class="profile-section stats-section">
          <h3>Your Statistics</h3>
          <div class="stats-grid">
            <div class="stat-card">
              <mat-icon>inventory_2</mat-icon>
              <div class="stat-info">
                <div class="stat-value">{{ stats.loadoutCount }}</div>
                <div class="stat-label">Setups Created</div>
              </div>
            </div>
            <div class="stat-card">
              <mat-icon>favorite</mat-icon>
              <div class="stat-info">
                <div class="stat-value">{{ stats.totalLikes }}</div>
                <div class="stat-label">Likes Received</div>
              </div>
            </div>
            <div class="stat-card">
              <mat-icon>visibility</mat-icon>
              <div class="stat-info">
                <div class="stat-value">{{ stats.totalViews }}</div>
                <div class="stat-label">Total Views</div>
              </div>
            </div>
          </div>
        </div>
      </mat-dialog-content>

      <mat-dialog-actions>
        <button mat-button (click)="onCancel()" [disabled]="saving">
          {{ data.isFirstTimePrompt ? 'Skip for Now' : 'Cancel' }}
        </button>
        <button 
          mat-raised-button 
          color="primary" 
          (click)="onSave()"
          [disabled]="saving || (!hasChanges() && !data.isFirstTimePrompt)">
          <mat-spinner diameter="20" *ngIf="saving"></mat-spinner>
          <span *ngIf="!saving">{{ data.isFirstTimePrompt ? 'Save & Continue' : 'Save Changes' }}</span>
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .profile-dialog {
      @media (max-width: 768px) {
        width: 100%;
        max-width: 100%;
      }
    }

    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.75rem 0 0.5rem 0;
      text-align: center;

      .user-avatar {
        margin-bottom: 0.75rem;

        mat-icon {
          font-size: 56px;
          width: 56px;
          height: 56px;
          color: var(--mat-primary-color);
        }
      }

      h2 {
        margin: 0;
        font-size: 1.5rem;
      }
    }

    mat-dialog-content {
      padding: 1rem 1.5rem 1.5rem 1.5rem;
      max-height: 65vh;
      overflow-y: auto;
    }

    .welcome-message {
      display: flex;
      gap: 0.75rem;
      padding: 0.875rem;
      margin-bottom: 1.25rem;
      background: rgba(var(--mat-primary-color-rgb, 103, 58, 183), 0.1);
      border-radius: 6px;
      border-left: 3px solid var(--mat-primary-color);

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        color: var(--mat-primary-color);
        flex-shrink: 0;
      }

      .message-content {
        h3 {
          margin: 0 0 0.375rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--mat-primary-color);
        }

        p {
          margin: 0;
          opacity: 0.9;
          line-height: 1.4;
          font-size: 0.9rem;
        }
      }
    }

    .profile-section {
      margin-bottom: 1.25rem;

      h3 {
        margin: 0 0 0.625rem 0;
        font-size: 1.05rem;
        font-weight: 500;
        color: var(--mat-primary-color);
      }

      .privacy-note {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 0.875rem 0;
        padding: 0.625rem 0.875rem;
        font-size: 0.85rem;
        background: rgba(76, 175, 80, 0.1);
        border-radius: 6px;
        border-left: 3px solid #4caf50;
        color: #4caf50;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        span {
          line-height: 1.3;
        }
      }

      .public-note {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0 0 0.875rem 0;
        padding: 0.625rem 0.875rem;
        font-size: 0.85rem;
        background: rgba(255, 152, 0, 0.1);
        border-radius: 6px;
        border-left: 3px solid #ff9800;
        color: #ff9800;

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }

        span {
          line-height: 1.3;
        }

        strong {
          font-weight: 600;
        }
      }

      .full-width {
        width: 100%;
        margin-bottom: 0.875rem;
      }

      .checkbox-option {
        margin-top: 0.5rem;
        padding: 0.75rem;
        background: rgba(var(--mat-primary-color-rgb, 103, 58, 183), 0.05);
        border-radius: 6px;
      }
    }

    .stats-section {
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;

        @media (max-width: 600px) {
          grid-template-columns: 1fr;
        }

        .stat-card {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem;
          background: var(--mat-card-background);
          border-radius: 8px;
          border: 1px solid var(--mat-divider-color);

          mat-icon {
            font-size: 28px;
            width: 28px;
            height: 28px;
            color: var(--mat-primary-color);
          }

          .stat-info {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;

            .stat-value {
              font-size: 1.3rem;
              font-weight: 600;
              line-height: 1;
            }

            .stat-label {
              font-size: 0.7rem;
              opacity: 0.7;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
          }
        }
      }
    }

    mat-divider {
      margin: 1.25rem 0;
    }

    mat-dialog-actions {
      padding: 0.875rem 1.5rem;
      display: flex;
      justify-content: flex-end;
      gap: 0.875rem;

      button {
        min-width: 110px;
        padding: 0 1.25rem;

        mat-spinner {
          display: inline-block;
          margin-right: 0.5rem;
        }
      }
    }
  `]
})
export class UserProfileComponent implements OnInit {
  osrsUsernameControl = new FormControl('', [
    Validators.pattern(/^[a-zA-Z0-9 -]{1,12}$/)
  ]);
  updateExistingControl = new FormControl(false);
  
  stats = {
    loadoutCount: 0,
    totalLikes: 0,
    totalViews: 0
  };

  saving = false;
  originalUsername = '';

  constructor(
    private dialogRef: MatDialogRef<UserProfileComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { 
      user: { uid: string; displayName: string | null; email: string | null; };
      currentOsrsUsername?: string;
      isFirstTimePrompt?: boolean;
    },
    private firebaseService: FirebaseService,
    private loadoutService: LoadoutService
  ) {}

  async ngOnInit() {
    // Set initial username
    this.originalUsername = this.data.currentOsrsUsername || '';
    this.osrsUsernameControl.setValue(this.originalUsername);

    // Load user stats
    try {
      this.stats = await this.loadoutService.getUserStats(this.data.user.uid);
    } catch (error) {
      console.error('Error loading user stats:', error);
    }
  }

  hasChanges(): boolean {
    return this.osrsUsernameControl.value?.trim() !== this.originalUsername;
  }

  async onSave() {
    if (this.osrsUsernameControl.invalid || this.saving) return;

    this.saving = true;
    const newUsername = this.osrsUsernameControl.value?.trim() || '';

    // If first time prompt and they didn't enter anything, allow closing
    if (this.data.isFirstTimePrompt && !newUsername) {
      this.dialogRef.close({ success: false, skipped: true });
      return;
    }

    try {
      // Check availability if username changed
      if (newUsername && newUsername !== this.originalUsername) {
        const isAvailable = await this.firebaseService.checkUsernameAvailability(
          newUsername, 
          this.data.user.uid
        );
        
        if (!isAvailable) {
          this.osrsUsernameControl.setErrors({ taken: true });
          this.saving = false;
          return;
        }
      }

      // Save the profile
      await this.firebaseService.updateUserProfile(
        newUsername,
        this.updateExistingControl.value || false
      );

      this.dialogRef.close({ success: true, username: newUsername });
    } catch (error: any) {
      console.error('Error saving profile:', error);
      if (error.message?.includes('already taken')) {
        this.osrsUsernameControl.setErrors({ taken: true });
      }
      this.saving = false;
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
