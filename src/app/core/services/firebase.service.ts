import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { initializeApp } from 'firebase/app';
import { 
  Auth, 
  getAuth, 
  signInWithPopup,
  linkWithPopup,
  GoogleAuthProvider, 
  signInAnonymously,
  signOut as firebaseSignOut,
  User,
  onAuthStateChanged,
  browserPopupRedirectResolver
} from 'firebase/auth';
import { 
  Firestore, 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  CollectionReference,
  Query,
  DocumentData,
  runTransaction,
  serverTimestamp,
  increment,
  DocumentReference,
  setDoc,
  updateDoc,
  collectionGroup,
  writeBatch,
  QueryDocumentSnapshot,
  Timestamp,
  QueryConstraint
} from 'firebase/firestore';
import { Analytics, getAnalytics } from 'firebase/analytics';
import { environment } from '../../../environments/environment';
import { LoadoutData, Category } from '../../shared/models/inventory.model';
import { LoadoutStateService } from './loadout-state.service';
import { StorageService } from './storage.service';
import { SignInInfoComponent } from '../../shared/components/sign-in-info/sign-in-info.component';

export interface LoadoutQueryOptions {
  categories?: Category['type'][];
  searchTerm?: string;
  tags?: string[];
  sortBy?: 'date' | 'likes' | 'views' | 'name' | 'category';
  sortDirection?: 'asc' | 'desc';
  pageSize?: number;
  lastVisible?: QueryDocumentSnapshot<DocumentData>;
  createdAfter?: Date;
  showPersonalOnly?: boolean;
  isPublic?: boolean;
  type?: 'inventory' | 'banktag' | 'banktaglayout';
}

export interface LoadoutQueryResult {
  loadouts: LoadoutData[];
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

interface CachedStats {
  data: {
    totalLoadouts: number;
    totalUsers: number;
    totalLikes: number;
    newToday: number;
  };
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  private app = initializeApp(environment.firebase);
  private analytics: Analytics = getAnalytics(this.app);
  private auth: Auth = getAuth(this.app);
  private db: Firestore = getFirestore(this.app);
  
  private currentUser = new BehaviorSubject<User | null>(null);
  currentUser$ = this.currentUser.asObservable();
  user$ = this.currentUser$;
  
  private stats = new BehaviorSubject<{
    totalLoadouts: number;
    totalUsers: number;
    totalLikes: number;
    newToday: number;
  }>({
    totalLoadouts: 0,
    totalUsers: 0,
    totalLikes: 0,
    newToday: 0
  });
  stats$ = this.stats.asObservable();
  
  isLoggedIn$ = this.currentUser$.pipe(
    map((user: User | null) => !!user)
  );

  private readonly STATS_CACHE_KEY = 'inventory_setups_stats';
  private readonly STATS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private isSigningInWithGoogle = false; // Flag to prevent auto anonymous sign-in during Google sign-in
  
  constructor(
    private loadoutStateService: LoadoutStateService,
    private storageService: StorageService,
    private dialog: MatDialog
  ) {
    this.loadCachedStats();
    onAuthStateChanged(this.auth, (user: User | null) => {
      this.currentUser.next(user);
      // Only refresh loadouts if we're not in the middle of a Google sign-in
      // (to avoid conflicts during the sign-out -> sign-in transition)
      if (!this.isSigningInWithGoogle) {
        // If user is null (signed out), delay refresh to allow anonymous sign-in
        // If user exists, refresh immediately
        if (user) {
          this.refreshLoadouts();
        } else {
          // Delay refresh to allow anonymous sign-in to complete
          setTimeout(() => {
            // Check if we now have a user (anonymous sign-in might have completed)
            if (this.auth.currentUser && !this.isSigningInWithGoogle) {
              this.refreshLoadouts();
            }
          }, 1000);
        }
      }
      // Always refresh stats, but handle errors gracefully
      this.refreshStats().catch(error => {
        // Silently ignore permission errors during auth transitions
        if (error?.code !== 'permission-denied') {
          console.error('Error refreshing stats:', error);
        }
      });
    });

    // Refresh stats periodically if cached
    setInterval(() => {
      this.loadStatsFromCache().subscribe(cached => {
        if (cached) {
          this.refreshStats();
        }
      });
    }, this.STATS_CACHE_DURATION);
  }

  private loadCachedStats(): void {
    this.loadStatsFromCache().subscribe(cached => {
      if (cached) {
        this.stats.next(cached.data);
      }
    });
  }

  private loadStatsFromCache(): Observable<CachedStats | null> {
    return this.storageService.getItem<CachedStats>('stats', this.STATS_CACHE_KEY).pipe(
      map(cached => {
        if (cached && Date.now() - cached.timestamp < this.STATS_CACHE_DURATION) {
          return cached;
        }
        return null;
      }),
      catchError(error => {
        console.warn('Error loading stats from cache:', error);
        return of(null);
      })
    );
  }

  private saveStatsToCache(stats: CachedStats['data']): void {
    const cache: CachedStats = {
      data: stats,
      timestamp: Date.now()
    };
    this.storageService.setItem('stats', this.STATS_CACHE_KEY, cache).subscribe({
      next: () => console.debug('Stats cached successfully'),
      error: error => console.warn('Error saving stats to cache:', error)
    });
  }

  private async refreshStats(): Promise<void> {
    try {
      // If no user is authenticated and we're in the middle of auth transition,
      // skip stats refresh (it will be called again after anonymous sign-in completes)
      // For public stats, we can still try, but catch errors gracefully
      
      // Get loadouts count and total likes
      const loadoutsRef = collection(this.db, 'loadouts');
      const loadoutsSnap = await getDocs(loadoutsRef);
      const totalLoadouts = loadoutsSnap.size;
      const totalLikes = loadoutsSnap.docs.reduce((sum, doc) => sum + (doc.data()['likes'] || 0), 0);

      // Get total users count
      const usersRef = collection(this.db, 'users');
      const usersSnap = await getDocs(usersRef);
      const totalUsers = usersSnap.size;

      // Calculate new loadouts today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayTimestamp = Timestamp.fromDate(today);
      
      const newTodayQuery = query(
        loadoutsRef,
        where('createdAt', '>=', todayTimestamp)
      );
      const newTodaySnap = await getDocs(newTodayQuery);
      const newToday = newTodaySnap.size;

      const stats = {
        totalLoadouts,
        totalUsers,
        totalLikes,
        newToday
      };

      // Only update the stats document if user is authenticated
      if (this.currentUser.value) {
        const statsRef = doc(this.db, 'stats/global');
        await setDoc(statsRef, {
          ...stats,
          lastUpdated: serverTimestamp()
        }, { merge: true }).catch(error => {
          // Silently ignore write errors (might be permission denied)
          console.debug('Could not update stats document:', error);
        });
      }

      // Update local stats and cache
      this.stats.next(stats);
      this.saveStatsToCache(stats);
    } catch (error: any) {
      // Handle permission errors gracefully during auth transitions
      if (error?.code === 'permission-denied' || error?.code === 7) {
        // Permission denied - try to use cached stats
        this.loadStatsFromCache().subscribe(cached => {
          if (cached) {
            this.stats.next(cached.data);
          }
        });
        // Don't log permission errors during auth transitions
        return;
      }
      
      console.error('Error refreshing stats:', error);
      
      // If error, try to use cached stats
      this.loadStatsFromCache().subscribe(cached => {
        if (cached) {
          this.stats.next(cached.data);
        }
      });
    }
  }

  // Make refreshLoadouts public so components can call it
  // Note: This should generally not be called directly - use LoadoutService instead
  // This is kept for backward compatibility and for cases where we need to refresh without filters
  async refreshLoadouts(options: LoadoutQueryOptions = { sortBy: 'likes', sortDirection: 'desc' }): Promise<void> {
    try {
      // Don't override LoadoutService's filtering - just trigger a reload
      // The LoadoutService will handle the actual data fetching with proper filters
      // This method is mainly for backward compatibility
      const result = await this.getLoadouts(options);
      // Only update if we got results - LoadoutService manages the state
      if (result.loadouts.length > 0) {
        this.loadoutStateService.updateLoadouts(result.loadouts);
      }
    } catch (error) {
      console.error('Error refreshing loadouts:', error);
    }
  }

  getFirestore(): Firestore {
    return this.db;
  }

  doc(path: string): DocumentReference<DocumentData> {
    return doc(this.db, path);
  }

  collection(path: string): CollectionReference<DocumentData> {
    return collection(this.db, path);
  }

  collectionGroup(collectionId: string): Query<DocumentData> {
    return collectionGroup(this.db, collectionId);
  }

  async getCurrentUserId(): Promise<string | null> {
    return this.currentUser.value?.uid || null;
  }

  getCurrentUser(): Observable<User | null> {
    return this.currentUser$;
  }

  // Add a new method for getting current user synchronously
  getCurrentUserSync(): User | null {
    return this.currentUser.value;
  }

  // Check if we're in the middle of a Google sign-in flow
  isSigningInWithGoogleFlow(): boolean {
    return this.isSigningInWithGoogle;
  }

  async signInAnonymously(): Promise<void> {
    try {
      const result = await signInAnonymously(this.auth);
      const user = result.user;
      
      // Create or update user document
      const userRef = doc(this.db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          displayName: 'Anonymous User',
          photoURL: null,
          lastActive: serverTimestamp(),
          loadoutCount: 0,
          totalLikes: 0,
          totalViews: 0,
          createdAt: serverTimestamp(),
          isAnonymous: true
        });
      } else {
        await updateDoc(userRef, {
          lastActive: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error signing in anonymously:', error);
      throw error;
    }
  }

  async signInWithGoogle(): Promise<void> {
    // Set flag to prevent automatic anonymous sign-in during this flow
    this.isSigningInWithGoogle = true;
    
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ 
      // Don't force account selection - only prompt if not already signed in
      // This prevents the double-click issue
      display: 'popup'
    });
    
    // Log the auth domain for debugging
    console.log('Firebase Auth Domain:', this.auth.config.authDomain);
    console.log('Current origin:', window.location.origin);
    console.log('Expected redirect URI:', `${window.location.origin}/__/auth/handler`);
    
    try {
      const currentUser = this.auth.currentUser;
      let result;
      let user: User;

      // If user is currently anonymous, try to link the Google account to preserve data
      if (currentUser && currentUser.isAnonymous) {
        console.log('Attempting to link anonymous account with Google...');
        try {
          result = await linkWithPopup(currentUser, provider, browserPopupRedirectResolver);
          user = result.user;
          console.log('Anonymous account successfully linked with Google');
        } catch (linkError: any) {
          // If linking fails, handle different error cases
          if (linkError?.code === 'auth/credential-already-in-use') {
            // The Google account is already linked to another account
            // We can't link them. We need to sign out anonymous first, then sign in with Google
            console.warn('Google account already in use with another account. Signing out anonymous and signing in with Google.');
            
            // Sign out anonymous user - this is still in the same user action context
            // The flag prevents automatic re-authentication
            await firebaseSignOut(this.auth);
            
            // Small delay to ensure sign-out completes
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Now sign in with Google - still in user action context, so popup won't be blocked
            result = await signInWithPopup(this.auth, provider, browserPopupRedirectResolver);
            user = result.user;
            console.log('Signed in with Google after signing out anonymous account');
            
            // Show info dialog after a short delay to ensure sign-in completes
            // Keep the flag set until dialog closes to prevent anonymous re-auth
            setTimeout(() => {
              const dialogRef = this.dialog.open(SignInInfoComponent, {
                width: '400px',
                data: {
                  title: 'Signed In Successfully',
                  icon: 'check_circle',
                  message: 'You can now save setups, like (❤️) favorites, and access them from any device.',
                  note: 'Note: Any setups created while anonymous remain on the anonymous account and won\'t be accessible with this Google account.'
                }
              });
              
              // Reset flag only after dialog closes
              dialogRef.afterClosed().subscribe(() => {
                // Small delay before resetting flag to ensure auth state is stable
                setTimeout(() => {
                  this.isSigningInWithGoogle = false;
                }, 500);
              });
            }, 500);
          } else if (linkError?.code === 'auth/popup-blocked') {
            // Popup was blocked - re-throw to be handled by outer catch
            throw linkError;
          } else if (linkError?.code === 'auth/popup-closed-by-user') {
            // User closed popup - silently return
            this.isSigningInWithGoogle = false; // Reset flag
            return;
          } else {
            // Other linking errors - try regular sign in as fallback
            console.warn('Failed to link anonymous account, attempting regular sign in:', linkError);
            // Don't sign out - just try to sign in, which will switch accounts
            result = await signInWithPopup(this.auth, provider, browserPopupRedirectResolver);
            user = result.user;
            console.log('Signed in with Google (anonymous account not linked)');
          }
        }
      } else {
        // Regular sign in
        result = await signInWithPopup(this.auth, provider, browserPopupRedirectResolver);
        user = result.user;
      }
      
      const userRef = doc(this.db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Check if there are existing loadouts from anonymous account
        const loadoutsRef = collection(this.db, 'loadouts');
        const userLoadoutsQuery = query(loadoutsRef, where('userId', '==', user.uid));
        const userLoadoutsSnap = await getDocs(userLoadoutsQuery);
        const loadoutCount = userLoadoutsSnap.size;
        const totalLikes = userLoadoutsSnap.docs.reduce((sum, doc) => {
          const data = doc.data();
          return sum + (data['likes'] || 0);
        }, 0);
        const totalViews = userLoadoutsSnap.docs.reduce((sum, doc) => {
          const data = doc.data();
          return sum + (data['views'] || 0);
        }, 0);

        await setDoc(userRef, {
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastActive: serverTimestamp(),
          loadoutCount,
          totalLikes,
          totalViews,
          createdAt: serverTimestamp(),
          isAnonymous: false
        });
      } else {
        // Update existing user document
        await updateDoc(userRef, {
          displayName: user.displayName,
          photoURL: user.photoURL,
          lastActive: serverTimestamp(),
          isAnonymous: false
        });
      }

      // Don't reset flag yet - only reset after dialog closes (if shown) or after a delay
      // This prevents the header component from re-authenticating anonymously
      // Force a refresh of loadouts after sign-in to ensure user's own loadouts are visible
      this.refreshLoadouts();
      
      console.log('Sign-in complete:', {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        isAnonymous: user.isAnonymous,
        providerData: user.providerData.map(p => ({
          providerId: p.providerId,
          email: p.email,
          displayName: p.displayName
        }))
      });
      
      // Log the current auth state for debugging
      console.log('Current auth state:', {
        currentUser: this.auth.currentUser?.uid,
        isAnonymous: this.auth.currentUser?.isAnonymous,
        email: this.auth.currentUser?.email,
        displayName: this.auth.currentUser?.displayName
      });
      
      // Reset flag after a delay to ensure auth state is stable
      // If a dialog is shown, it will reset the flag when it closes
      setTimeout(() => {
        // Only reset if flag is still set (dialog might have already reset it)
        if (this.isSigningInWithGoogle) {
          this.isSigningInWithGoogle = false;
        }
      }, 2000);
    } catch (error: any) {
      // Reset flag on error
      this.isSigningInWithGoogle = false;
      
      // Don't treat user-closed popup as an error
      // Check multiple ways the error code might be represented
      const errorCode = error?.code || error?.a?.code || (error?.message?.includes('auth/popup-closed-by-user') ? 'auth/popup-closed-by-user' : null);
      
      if (errorCode === 'auth/popup-closed-by-user') {
        // User cancelled - silently return, don't log or throw
        return;
      }
      
      // Log all errors for debugging
      console.error('Sign-in error details:', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack
      });

      // Log redirect URI mismatch details for debugging
      if (error?.code === 'auth/popup-blocked') {
        console.error('Popup was blocked by browser. Please allow popups for this site and try again.');
        alert('Sign-in popup was blocked.\n\nPlease:\n1. Allow popups for this site in your browser settings\n2. Try again\n\nOr refresh the page and click "Sign in" again.');
      } else if (error?.message?.includes('redirect_uri_mismatch') || error?.code === 'auth/unauthorized-domain') {
        console.error('═══════════════════════════════════════════════════════════');
        console.error('❌ REDIRECT URI MISMATCH ERROR');
        console.error('═══════════════════════════════════════════════════════════');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('');
        console.error('📍 CURRENT CONFIGURATION:');
        console.error('  Auth Domain:', this.auth.config.authDomain);
        console.error('  Current Origin:', window.location.origin);
        console.error('  Required Redirect URI:', `${window.location.origin}/__/auth/handler`);
        console.error('');
        console.error('🔧 TO FIX THIS IN GOOGLE CLOUD CONSOLE:');
        console.error('1. Go to: https://console.cloud.google.com/apis/credentials?project=osrs-setups');
        console.error('2. Find the OAuth 2.0 Client ID (look for "Web client" or one with your app ID)');
        console.error('3. Click the pencil/edit icon');
        console.error('');
        console.error('4. ⚠️  IMPORTANT - Two Different Fields:');
        console.error('');
        console.error('   📍 "Authorized JavaScript origins" (DOMAINS ONLY, NO PATH):');
        console.error('      ✅ https://osrs-setups-nc.firebaseapp.com');
        console.error('      ✅ https://inventorysetups.patrickrottman.com');
        console.error('      ✅ http://localhost:4200');
        console.error('      ❌ NO trailing slash, NO paths');
        console.error('');
        console.error('   📍 "Authorized redirect URIs" (FULL PATH INCLUDED):');
        console.error('      ✅ https://osrs-setups-nc.firebaseapp.com/__/auth/handler');
        console.error('      ✅ https://inventorysetups.patrickrottman.com/__/auth/handler');
        console.error('      ✅ http://localhost:4200/__/auth/handler');
        console.error('      ✅ Path /__/auth/handler is REQUIRED here');
        console.error('');
        console.error('5. Click SAVE');
        console.error('6. Wait 5-10 minutes for changes to propagate');
        console.error('═══════════════════════════════════════════════════════════');
      } else {
        // Log other errors (not user cancellations)
        console.error('Error signing in with Google:', error);
      }
      
      // Only throw non-user-cancellation errors
      throw error;
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(this.auth);
      // After signing out, automatically sign in anonymously
      // Small delay to ensure sign-out completes first
      setTimeout(async () => {
        if (!this.auth.currentUser) {
          await this.signInAnonymously();
        }
      }, 100);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  }

  async getLoadouts(options: LoadoutQueryOptions = {}): Promise<{
    loadouts: LoadoutData[];
    lastVisible: QueryDocumentSnapshot<DocumentData> | null;
    hasMore: boolean;
  }> {
    try {
      const db = this.getFirestore();
      const loadoutsRef = collection(db, 'loadouts');
      const constraints: QueryConstraint[] = [];

      // Handle personal loadouts filter
      // Note: When filtering by userId, we need to handle sorting differently
      // because Firestore requires a composite index for userId + orderBy
      let needsClientSideSort = false;
      let likedLoadoutIds: string[] = [];
      
      if (options.showPersonalOnly) {
        const currentUser = this.getCurrentUserSync();
        console.log('🔍 My Setups Query:', {
          currentUser: currentUser ? { uid: currentUser.uid, email: currentUser.email, isAnonymous: currentUser.isAnonymous } : null,
          showPersonalOnly: options.showPersonalOnly
        });
        if (currentUser?.uid) {
          // Fetch user's own loadouts
          constraints.push(where('userId', '==', currentUser.uid));
          console.log('🔍 Added userId filter:', currentUser.uid);
          // When filtering by userId, we'll sort client-side to avoid index requirement
          needsClientSideSort = true;
          
          // Also fetch liked loadout IDs
          try {
            const likesRef = collection(db, `users/${currentUser.uid}/likes`);
            const likesSnapshot = await getDocs(likesRef);
            likedLoadoutIds = likesSnapshot.docs.map(doc => doc.id);
            console.log('🔍 Found liked loadouts:', likedLoadoutIds.length, likedLoadoutIds);
          } catch (error) {
            console.error('Error fetching liked loadouts:', error);
          }
        } else {
          console.log('⚠️ My Setups Query: No current user, returning empty');
          // If showPersonalOnly is true but no user is logged in, return no loadouts
          return {
            loadouts: [],
            lastVisible: null,
            hasMore: false
          };
        }
      }

      // Handle categories filter
      if (options.categories && options.categories.length > 0) {
        constraints.push(where('category', 'in', options.categories));
        // When filtering by category, we need to do client-side sorting
        // to avoid composite index requirements
        needsClientSideSort = true;
      }

      // Handle tags filter
      if (options.tags && options.tags.length > 0) {
        constraints.push(where('tags', 'array-contains-any', options.tags));
        // When filtering by tags, we need to do client-side sorting
        // to avoid composite index requirements
        needsClientSideSort = true;
      }

      // Handle public/private filter
      if (typeof options.isPublic === 'boolean') {
        constraints.push(where('isPublic', '==', options.isPublic));
      }

      // Handle type filter
      if (options.type) {
        if (options.type === 'inventory') {
          // For inventory type, include both null type and 'inventory' type
          constraints.push(where('type', 'in', [null, 'inventory']));
        } else if (options.type === 'banktaglayout') {
          // For bank tag layouts, include both 'banktag' and 'banktaglayout' types
          constraints.push(where('type', 'in', ['banktag', 'banktaglayout']));
        } else {
          constraints.push(where('type', '==', options.type));
        }
      }

      // Handle created after filter
      if (options.createdAfter) {
        constraints.push(where('createdAt', '>=', options.createdAfter));
      }

      // Handle sorting
      // Only sort at Firestore level if we're not filtering by userId (which needs client-side sort)
      // and only for fields that are indexed in Firestore (date, likes, views)
      // name and category will be sorted client-side by LoadoutService
      const serverSideSortFields = ['date', 'likes', 'views'];
      if (options.sortBy && !needsClientSideSort && serverSideSortFields.includes(options.sortBy)) {
        constraints.push(orderBy(options.sortBy === 'date' ? 'createdAt' : options.sortBy, 
          options.sortDirection || 'desc'));
      } else if (options.sortBy && !serverSideSortFields.includes(options.sortBy)) {
        // For name and category sorting, we need to do client-side sort
        needsClientSideSort = true;
      }

      // Handle pagination
      // When doing client-side sorting, we need to fetch all results first, then paginate
      if (options.pageSize && !needsClientSideSort) {
        constraints.push(limit(options.pageSize));
      } else if (needsClientSideSort) {
        // For client-side sorting, fetch a larger batch to ensure we have enough to sort
        // We'll limit to a reasonable maximum (e.g., 1000) to avoid memory issues
        constraints.push(limit(1000));
      }

      // Add startAfter if we have a lastVisible and we're not doing client-side sorting
      // (when sorting client-side, we handle pagination after fetching all results)
      if (options.lastVisible && !needsClientSideSort) {
        constraints.push(startAfter(options.lastVisible));
      }

      const q = query(loadoutsRef, ...constraints);
      const querySnapshot = await getDocs(q);

      console.log('🔍 Query Results:', {
        totalDocs: querySnapshot.size,
        showPersonalOnly: options.showPersonalOnly,
        needsClientSideSort,
        constraints: constraints.length
      });

      let loadouts = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as LoadoutData[];

      // If we have liked loadout IDs, fetch those loadouts too
      if (options.showPersonalOnly && likedLoadoutIds.length > 0) {
        try {
          // Fetch liked loadouts (exclude ones already fetched as user's own)
          const existingIds = new Set(loadouts.map(l => l.id));
          const likedIdsToFetch = likedLoadoutIds.filter(id => !existingIds.has(id));
          
          if (likedIdsToFetch.length > 0) {
            // Firestore 'in' queries are limited to 10 items, so we need to batch
            const batchSize = 10;
            const likedLoadouts: LoadoutData[] = [];
            
            for (let i = 0; i < likedIdsToFetch.length; i += batchSize) {
              const batch = likedIdsToFetch.slice(i, i + batchSize);
              // Fetch documents directly by ID
              const batchPromises = batch.map(id => getDoc(doc(db, 'loadouts', id)));
              const batchDocs = await Promise.all(batchPromises);
              const batchLoadouts = batchDocs
                .filter(docSnap => docSnap.exists())
                .map(docSnap => ({
                  ...docSnap.data(),
                  id: docSnap.id
                })) as LoadoutData[];
              likedLoadouts.push(...batchLoadouts);
            }
            
            console.log('🔍 Fetched liked loadouts:', likedLoadouts.length);
            // Mark liked loadouts with metadata (we'll use a property to track this)
            loadouts.push(...likedLoadouts);
          }
        } catch (error) {
          console.error('Error fetching liked loadouts:', error);
        }
      }

      // Debug: Log userIds of returned loadouts
      if (options.showPersonalOnly && loadouts.length > 0) {
        const currentUser = this.getCurrentUserSync();
        console.log('🔍 Returned loadouts:', {
          total: loadouts.length,
          userOwned: loadouts.filter(l => l.userId === currentUser?.uid).length,
          liked: loadouts.filter(l => l.userId !== currentUser?.uid && likedLoadoutIds.includes(l.id)).length,
          sample: loadouts.slice(0, 3).map(l => ({
            id: l.id,
            name: l.setup.name,
            userId: l.userId,
            isPublic: l.isPublic
          }))
        });
      } else if (options.showPersonalOnly && loadouts.length === 0) {
        console.log('⚠️ My Setups Query: No loadouts returned from Firestore');
      }

      // If we need client-side sorting (e.g., when filtering by userId or sorting by name/category), sort here
      if (needsClientSideSort && options.sortBy) {
        loadouts.sort((a, b) => {
          let comparison = 0;
          switch (options.sortBy) {
            case 'date': {
              const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 
                           (a.createdAt?.toMillis ? a.createdAt.toMillis() : 0);
              const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 
                           (b.createdAt?.toMillis ? b.createdAt.toMillis() : 0);
              comparison = bTime - aTime;
              break;
            }
            case 'likes': {
              comparison = (b.likes || 0) - (a.likes || 0);
              break;
            }
            case 'views': {
              comparison = (b.views || 0) - (a.views || 0);
              break;
            }
            case 'name': {
              comparison = (a.setup.name || '').localeCompare(b.setup.name || '');
              break;
            }
            case 'category': {
              comparison = (a.category || '').localeCompare(b.category || '');
              break;
            }
          }
          return options.sortDirection === 'asc' ? -comparison : comparison;
        });
        
        // Apply pagination after sorting
        const pageSize = options.pageSize || 10;
        let startIndex = 0;
        
        // If we have a lastVisible, find its position in the sorted array
        if (options.lastVisible) {
          const lastVisible = options.lastVisible;
          const lastVisibleId = lastVisible.id;
          const lastIndex = loadouts.findIndex(l => l.id === lastVisibleId);
          startIndex = lastIndex >= 0 ? lastIndex + 1 : 0;
        }
        
        const totalBeforePagination = loadouts.length;
        loadouts = loadouts.slice(startIndex, startIndex + pageSize);
        
        // Determine if there are more loadouts
        const hasMore = (startIndex + pageSize) < totalBeforePagination;
        
        // Return with the last item as lastVisible (if we have results)
        const lastVisible = loadouts.length > 0 
          ? querySnapshot.docs.find(doc => doc.id === loadouts[loadouts.length - 1].id) || null
          : null;
          
        return {
          loadouts,
          lastVisible,
          hasMore
        };
      }

      // If search term is provided, filter results client-side
      if (options.searchTerm) {
        const searchLower = options.searchTerm.toLowerCase();
        loadouts = loadouts.filter(loadout =>
          loadout.setup.name.toLowerCase().includes(searchLower) ||
          loadout.setup.notes?.toLowerCase().includes(searchLower) ||
          loadout.tags?.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }

      // Determine lastVisible for pagination
      const lastVisible = loadouts.length > 0 && loadouts.length === (options.pageSize || 10)
        ? querySnapshot.docs[querySnapshot.docs.length - 1] || null
        : null;

      return {
        loadouts,
        lastVisible,
        hasMore: needsClientSideSort 
          ? loadouts.length === (options.pageSize || 10) && querySnapshot.size > 0
          : querySnapshot.docs.length === (options.pageSize || 10)
      };
    } catch (error) {
      console.error('Error getting loadouts:', error);
      return {
        loadouts: [],
        lastVisible: null,
        hasMore: false
      };
    }
  }

  async createLoadout(loadout: LoadoutData): Promise<string> {
    try {
      const db = this.getFirestore();
      const user = this.currentUser.value;
      if (!user) throw new Error('Must be logged in to create loadout');

      // Create loadout in a transaction to update all related stats
      let loadoutId: string;
      await runTransaction(db, async (transaction) => {
        // Create the loadout document
        const loadoutRef = doc(collection(db, 'loadouts'));
        loadoutId = loadoutRef.id;
        
        transaction.set(loadoutRef, {
          ...loadout,
          id: loadoutId,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          likes: 0,
          views: 0
        });

        // Update user stats
        const userRef = doc(this.db, 'users', user.uid);
        transaction.update(userRef, {
          loadoutCount: increment(1),
          lastUpdated: serverTimestamp()
        });

        // Update global stats
        const statsRef = doc(this.db, 'stats/global');
        const statsDoc = await transaction.get(statsRef);
        
        if (statsDoc.exists()) {
          transaction.update(statsRef, {
            totalLoadouts: increment(1),
            lastUpdated: serverTimestamp()
          });
        } else {
          transaction.set(statsRef, {
            totalLoadouts: 1,
            totalLikes: 0,
            totalUsers: 1,
            lastUpdated: serverTimestamp()
          });
        }
      });

      // After transaction completes successfully, refresh the UI
      await Promise.all([
        this.refreshLoadouts(),
        this.refreshStats()
      ]);

      return loadoutId!;
    } catch (error) {
      console.error('Error creating loadout:', error);
      throw error;
    }
  }

  async deleteLoadout(id: string): Promise<void> {
    try {
      const user = this.currentUser.value;
      if (!user) throw new Error('Must be logged in to delete loadout');

      const db = this.getFirestore();

      // First verify ownership
      const loadoutRef = doc(this.db, 'loadouts', id);
      const loadoutSnap = await getDoc(loadoutRef);
      
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }

      const loadoutData = loadoutSnap.data();
      if (loadoutData['userId'] !== user.uid) {
        throw new Error('You do not have permission to delete this loadout');
      }

      // Create a batch for all operations
      const batch = writeBatch(db);

      // Delete the loadout document
      batch.delete(loadoutRef);

      // Update user stats
      const userRef = doc(this.db, 'users', user.uid);
      batch.update(userRef, {
        loadoutCount: increment(-1),
        lastUpdated: serverTimestamp()
      });

      // Delete the user's own like if it exists
      const userLikeRef = doc(this.db, `users/${user.uid}/likes/${id}`);
      const userLikeSnap = await getDoc(userLikeRef);
      if (userLikeSnap.exists()) {
        batch.delete(userLikeRef);
      }

      // Commit all changes in one batch
      await batch.commit();

      // Wait for Firestore to propagate the changes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Remove from local state first
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const updatedLoadouts = currentLoadouts.filter((loadout: LoadoutData) => loadout.id !== id);
      this.loadoutStateService.updateLoadouts(updatedLoadouts);

      // Then refresh from server
      await this.refreshLoadouts();

    } catch (error) {
      console.error('Error deleting loadout:', error);
      throw error;
    }
  }

  async hasUserLiked(loadoutId: string): Promise<boolean> {
    try {
      if (!loadoutId) return false;

      const user = this.currentUser.value;
      if (!user) return false;

      const likeRef = doc(this.db, `users/${user.uid}/likes/${loadoutId}`);
      const likeDoc = await getDoc(likeRef);
      return likeDoc.exists();
    } catch (error) {
      console.error('Error checking like status:', error);
      return false;
    }
  }

  // Helper method to check if user owns a loadout
  isLoadoutOwner(loadout: LoadoutData): boolean {
    const user = this.currentUser.value;
    return user ? loadout.userId === user.uid : false;
  }
}
