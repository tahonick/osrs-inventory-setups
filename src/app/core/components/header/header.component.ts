import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { FirebaseService } from '../../services/firebase.service';
import { ThemeService } from '../../services/theme.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs';
import { User, UserInfo } from 'firebase/auth';

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
    RouterModule
  ]
})
export class HeaderComponent {
  stats$: Observable<Stats>;
  isStatsLoaded$: Observable<boolean>;
  isDarkTheme$: Observable<boolean>;
  currentUser$: Observable<User | null>;

  constructor(
    private firebaseService: FirebaseService,
    private themeService: ThemeService
  ) {
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

    this.stats$ = this.firebaseService.stats$;
    this.isStatsLoaded$ = this.stats$.pipe(
      map(stats => stats.totalLoadouts > 0 || stats.totalUsers > 0 || stats.totalLikes > 0)
    );
    this.isDarkTheme$ = this.themeService.isDarkTheme$;
    this.currentUser$ = this.firebaseService.currentUser$;
    
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
} 