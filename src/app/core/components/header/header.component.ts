import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ThemeService } from '../../services/theme.service';
import { AdminService } from '../../services/admin.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs';
import { User, UserInfo } from 'firebase/auth';
import { UserProfileComponent } from '../../../shared/components/user-profile/user-profile.component';

interface Stats {
  totalLoadouts: number;
  totalUsers: number;
  totalLikes: number;
  newToday: number;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    RouterModule
  ]
})
export class HeaderComponent {
  stats$: Observable<Stats>;
  isStatsLoaded$: Observable<boolean>;
  isDarkTheme$: Observable<boolean>;
  currentUser$: Observable<User | null>;
  isAdmin$: Observable<boolean>;
  
  // Mobile header auto-hide
  lastScrollPosition = 0;
  isHeaderVisible = true;

  constructor(
    private firebaseService: FirebaseService,
    private themeService: ThemeService,
    private adminService: AdminService,
    private dialog: MatDialog,
    private router: Router
  ) {
    // Initialize observables
    this.stats$ = this.firebaseService.stats$;
    this.isStatsLoaded$ = this.stats$.pipe(
      map(stats => stats.totalLoadouts > 0 || stats.totalUsers > 0 || stats.totalLikes > 0)
    );
    this.isDarkTheme$ = this.themeService.isDarkTheme$;
    this.currentUser$ = this.firebaseService.currentUser$;
    this.isAdmin$ = this.adminService.isAdmin();
    
    // Ensure we always have an anonymous session when signed out
    // But don't auto-sign-in if we're in the middle of a Google sign-in
    this.firebaseService.currentUser$.subscribe(user => {
      if (!user) {
        // Longer delay to avoid interfering with Google sign-in process
        setTimeout(() => {
          // Check again if user is still null and we're not in a Google sign-in flow
          if (!this.firebaseService.getCurrentUserSync() && !this.firebaseService.isSigningInWithGoogleFlow()) {
            this.firebaseService.signInAnonymously().catch(error => {
              // Ignore permission errors during sign-in flow
              if (error?.code !== 'permission-denied') {
                console.error('Error in anonymous sign in:', error);
              }
            });
          }
        }, 2000); // Increased delay to 2 seconds to allow Google sign-in to complete
      }
    });
    
    // Debug logging for auth state changes
    this.currentUser$.subscribe(user => {
      if (user) {
        console.log('Header: User state updated', {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          isAnonymous: user.isAnonymous,
          providerData: user.providerData.map((p: UserInfo) => p.providerId)
        });
      } else {
        console.log('Header: User signed out');
      }
    });
  }

  async signInWithGoogle(): Promise<void> {
    try {
      await this.firebaseService.signInWithGoogle();
      
      // After successful sign-in, wait for the success snackbar to dismiss
      // Then check if user needs to set OSRS username
      // Increased delay to 4 seconds to ensure login success message is shown and dismissed
      setTimeout(() => this.promptForUsernameIfNeeded(), 4000);
    } catch (error: any) {
      // Only log actual errors, not user cancellations
      // Check multiple ways the error code might be represented
      const errorCode = error?.code || error?.a?.code || (error?.message?.includes('auth/popup-closed-by-user') ? 'auth/popup-closed-by-user' : null);
      
      if (errorCode !== 'auth/popup-closed-by-user') {
        console.error('Error signing in with Google:', error);
      }
      // Otherwise silently ignore user cancellation
    }
  }

  private async promptForUsernameIfNeeded(): Promise<void> {
    const user = this.firebaseService.getCurrentUserSync();
    if (!user || user.isAnonymous) return;

    // Check if any dialogs are already open
    if (this.dialog.openDialogs.length > 0) {
      console.log('Dialog already open, skipping username prompt');
      return;
    }

    try {
      // Check if user has already set their OSRS username
      const userProfile = await this.firebaseService.getUserProfile(user.uid);
      
      // If no OSRS username set, prompt them to add it
      if (!userProfile?.['osrsUsername']) {
        const dialogRef = this.dialog.open(UserProfileComponent, {
          width: '580px',
          maxWidth: '90vw',
          disableClose: false, // Allow closing without setting username
          data: {
            user: {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email
            },
            currentOsrsUsername: '',
            isFirstTimePrompt: true // Flag to show welcome message
          }
        });

        // Optional: Handle the dialog result
        dialogRef.afterClosed().subscribe(result => {
          if (result?.success && result?.username) {
            console.log('User set OSRS username:', result.username);
          }
        });
      }
    } catch (error) {
      console.error('Error checking for OSRS username:', error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.firebaseService.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  async openUserProfile(): Promise<void> {
    const user = this.firebaseService.getCurrentUserSync();
    if (!user || user.isAnonymous) return;

    try {
      // Get current OSRS username from Firestore
      const userProfile = await this.firebaseService.getUserProfile(user.uid);
      
      this.dialog.open(UserProfileComponent, {
        width: '600px',
        data: {
          user: {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email
          },
          currentOsrsUsername: userProfile?.['osrsUsername'] || ''
        }
      });
    } catch (error) {
      console.error('Error opening user profile:', error);
    }
  }

  navigateToAdmin(): void {
    this.router.navigate(['/admin']);
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    // Only apply on mobile
    if (window.innerWidth > 768) {
      this.isHeaderVisible = true;
      return;
    }
    
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    const scrollDelta = currentScroll - this.lastScrollPosition;
    
    // Scrolling down - hide header
    if (scrollDelta > 5 && currentScroll > 100) {
      this.isHeaderVisible = false;
    } 
    // Scrolling up - show header
    else if (scrollDelta < -5) {
      this.isHeaderVisible = true;
    }
    
    this.lastScrollPosition = currentScroll <= 0 ? 0 : currentScroll;
  }
} 