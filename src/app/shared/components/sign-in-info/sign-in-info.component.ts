import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-sign-in-info',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule
  ],
  template: `
    <div class="dialog-wrapper">
      <div class="dialog-icon" [class.success-icon]="data.icon === 'check_circle'" [class.warning-icon]="data.icon === 'lock'">
        <mat-icon>{{ data.icon || 'check_circle' }}</mat-icon>
      </div>
      <h2 mat-dialog-title>{{ data.title || 'Signed In Successfully' }}</h2>
      <mat-dialog-content>
        <p class="message">{{ data.message }}</p>
        <div *ngIf="data.note" class="note-container">
          <mat-icon class="info-icon">info</mat-icon>
          <p class="note">{{ data.note }}</p>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-raised-button color="primary" [mat-dialog-close]="true">Got it</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-wrapper {
      padding: 8px 0;
    }

    .dialog-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 1.5rem;
    }

    .dialog-icon mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      padding: 12px;
      animation: scaleIn 0.3s ease-out;
    }

    .success-icon mat-icon {
      color: #4caf50;
      background: rgba(76, 175, 80, 0.1);
    }

    .warning-icon mat-icon {
      color: #ff9800;
      background: rgba(255, 152, 0, 0.1);
    }

    @keyframes scaleIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    h2[mat-dialog-title] {
      text-align: center;
      margin: 0 0 1.5rem 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--mat-dialog-container-text-color, rgba(255, 255, 255, 0.87));
      padding: 0;
    }
    
    mat-dialog-content {
      margin: 0 0 1.5rem 0;
      padding: 0 24px;
      max-width: 100%;
    }
    
    .message {
      margin: 0 0 1.25rem 0;
      font-size: 1rem;
      line-height: 1.6;
      color: var(--mat-dialog-container-text-color, rgba(255, 255, 255, 0.87));
      text-align: center;
    }
    
    .note-container {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--mat-divider-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      border-left: 3px solid var(--mat-primary-color, #2196f3);
    }

    .note-container .info-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: var(--mat-primary-color, #2196f3);
      flex-shrink: 0;
      margin-top: 2px;
    }
    
    .note {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.5;
      color: var(--mat-card-subtitle-text-color, rgba(255, 255, 255, 0.6));
      flex: 1;
    }
    
    mat-dialog-actions {
      padding: 0.5rem 24px 0;
      margin: 0;
      justify-content: flex-end;
      min-height: auto;
    }

    ::ng-deep {
      .mat-mdc-dialog-container {
        --mdc-dialog-container-shape: 16px;
        padding: 32px 0 24px;
        max-width: 440px;
        min-width: 320px;
      }

      .mat-mdc-dialog-surface {
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
    }
  `]
})
export class SignInInfoComponent {
  constructor(
    public dialogRef: MatDialogRef<SignInInfoComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { 
      title?: string;
      message: string; 
      note?: string;
      icon?: string;
    }
  ) {}
}
