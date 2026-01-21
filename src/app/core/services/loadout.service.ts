import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import { LoadoutData, Category } from '../../shared/models/inventory.model';
import { FirebaseService, LoadoutQueryOptions } from './firebase.service';
import { RecaptchaService } from './recaptcha.service';
import { LoadoutStateService } from './loadout-state.service';
import { 
  serverTimestamp, 
  Timestamp, 
  increment, 
  runTransaction,
  getDoc,
  getDocs,
  query,
  where,
  DocumentReference,
  DocumentData,
  setDoc,
  doc,
  collection,
  writeBatch,
  QueryDocumentSnapshot
} from 'firebase/firestore';

export interface LoadoutFilters {
  search: string;
  categories: Category['type'][];
  tags: string[];
  sortBy: 'date' | 'likes' | 'views' | 'name' | 'category';
  sortDirection: 'asc' | 'desc';
  showPersonalOnly: boolean;
  isPublic?: boolean;
  type?: 'inventory' | 'banktag' | 'banktaglayout';
}

export interface PaginationState {
  pageSize: number;
  lastVisible: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  loading: boolean;
}

export interface GroupedLoadouts {
  created: LoadoutData[];
  liked: LoadoutData[];
}

const DEFAULT_FILTERS: LoadoutFilters = {
  search: '',
  categories: [],
  tags: [],
  sortBy: 'likes',
  sortDirection: 'desc',
  showPersonalOnly: false,
  isPublic: undefined // undefined means show all public + user's own (handled client-side)
};

const DEFAULT_PAGINATION: PaginationState = {
  pageSize: 10,
  lastVisible: null,
  hasMore: true,
  loading: false
};

@Injectable({
  providedIn: 'root'
})
export class LoadoutService {
  private filters = new BehaviorSubject<LoadoutFilters>(DEFAULT_FILTERS);
  private pagination = new BehaviorSubject<PaginationState>(DEFAULT_PAGINATION);

  constructor(
    private firebaseService: FirebaseService,
    private recaptchaService: RecaptchaService,
    private loadoutStateService: LoadoutStateService
  ) {
    // Subscribe to filter changes to reset pagination and reload data
    this.filters.subscribe(() => {
      this.resetPagination();
      this.loadInitialData();
    });

    // Reload data when user auth state changes (e.g., anonymous -> Google sign in)
    this.firebaseService.currentUser$.subscribe(() => {
      // Small delay to ensure auth state is fully updated
      setTimeout(() => {
        this.loadInitialData();
      }, 100);
    });
  }

  private async loadInitialData() {
    try {
      this.setPaginationLoading(true);
      const result = await this.firebaseService.getLoadouts(this.createQueryOptions());
      
      this.loadoutStateService.updateLoadouts(result.loadouts);
      this.updatePaginationState(result.lastVisible, result.hasMore);
    } catch (error) {
      console.error('Error loading loadouts:', error);
      this.loadoutStateService.updateLoadouts([]);
    } finally {
      this.setPaginationLoading(false);
    }
  }

  private createQueryOptions(): LoadoutQueryOptions {
    const filters = this.filters.value;
    const { pageSize, lastVisible } = this.pagination.value;

    // For default view (isPublic === undefined), we need to fetch all loadouts
    // and filter client-side to show public OR user's own
    // For "My Setups Only", fetch only user's loadouts
    // For explicit isPublic filter, use it in the query
    
    let queryIsPublic: boolean | undefined = undefined;
    if (filters.showPersonalOnly) {
      // When showing personal only, don't filter by isPublic in query
      // We'll show both public and private user loadouts
      queryIsPublic = undefined;
    } else if (typeof filters.isPublic === 'boolean') {
      // Explicit filter
      queryIsPublic = filters.isPublic;
    } else {
      // Default: fetch all (we'll filter client-side to show public OR user's own)
      queryIsPublic = undefined;
    }

    return {
      categories: filters.categories.length > 0 ? filters.categories : undefined,
      sortBy: filters.sortBy,
      sortDirection: filters.sortDirection,
      pageSize,
      lastVisible: lastVisible || undefined,
      searchTerm: filters.search || undefined,
      tags: filters.tags.length > 0 ? filters.tags : undefined,
      showPersonalOnly: filters.showPersonalOnly,
      isPublic: queryIsPublic,
      type: filters.type
    };
  }

  async loadNextPage(): Promise<void> {
    const { hasMore, loading, lastVisible } = this.pagination.value;
    if (!hasMore || loading || !lastVisible) return;

    try {
      this.setPaginationLoading(true);
      const result = await this.firebaseService.getLoadouts({
        ...this.createQueryOptions(),
        lastVisible
      });

      // Get current loadouts and their IDs
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const currentIds = new Set(currentLoadouts.map(l => l.id));

      // Filter out any duplicates from the new loadouts
      const newLoadouts = result.loadouts.filter(loadout => !currentIds.has(loadout.id));

      // Only append if we have new loadouts
      if (newLoadouts.length > 0) {
        this.loadoutStateService.updateLoadouts([...currentLoadouts, ...newLoadouts]);
      }

      // Update pagination state with the last document from the new results
      this.updatePaginationState(
        result.lastVisible,
        // Only mark as having more if we got a full page of new (non-duplicate) loadouts
        newLoadouts.length === this.pagination.value.pageSize
      );
    } catch (error) {
      console.error('Error loading next page:', error);
    } finally {
      this.setPaginationLoading(false);
    }
  }

  private updatePaginationState(
    lastVisible: QueryDocumentSnapshot<DocumentData> | null,
    hasMore: boolean
  ) {
    this.pagination.next({
      ...this.pagination.value,
      lastVisible,
      hasMore
    });
  }

  private setPaginationLoading(loading: boolean) {
    this.pagination.next({
      ...this.pagination.value,
      loading
    });
  }

  private resetPagination() {
    this.pagination.next(DEFAULT_PAGINATION);
  }

  // Observable getters
  getLoadouts(): Observable<LoadoutData[]> {
    return this.loadoutStateService.getLoadouts();
  }

  getPaginationState(): Observable<PaginationState> {
    return this.pagination.asObservable();
  }

  getFilteredLoadouts(): Observable<LoadoutData[]> {
    return combineLatest([
      this.loadoutStateService.getLoadouts(),
      this.filters,
      this.firebaseService.getCurrentUser()
    ]).pipe(
      map(([loadouts, filters, currentUser]) => {
        let filtered = [...loadouts];

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(loadout => 
            loadout.setup.name.toLowerCase().includes(searchLower) ||
            loadout.setup.notes?.toLowerCase().includes(searchLower) ||
            loadout.tags?.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }

        if (filters.categories.length > 0) {
          filtered = filtered.filter(loadout => 
            filters.categories.includes(loadout.category)
          );
        }

        if (filters.tags.length > 0) {
          filtered = filtered.filter(loadout =>
            filters.tags.every(tag => loadout.tags?.includes(tag))
          );
        }

        if (filters.type) {
          filtered = filtered.filter(loadout => {
            if (filters.type === 'inventory') {
              return !loadout.type || loadout.type === 'inventory';
            }
            if (filters.type === 'banktaglayout') {
              return loadout.type === 'banktag' || loadout.type === 'banktaglayout';
            }
            return loadout.type === filters.type;
          });
        }

        // Handle privacy filtering
        if (filters.showPersonalOnly) {
          // Show user's own loadouts AND liked loadouts
          if (currentUser?.uid) {
            // When showPersonalOnly is true, FirebaseService fetches both user's own and liked loadouts
            // We separate them here: created = userId matches, liked = userId doesn't match
            const created = filtered.filter(loadout => 
              loadout.userId === currentUser.uid
            );
            const liked = filtered.filter(loadout => 
              loadout.userId !== currentUser.uid
            );
            console.log('My Setups filter:', {
              totalLoadouts: filtered.length,
              created: created.length,
              liked: liked.length,
              userId: currentUser.uid
            });
            // Combine: created first, then liked
            filtered = [...created, ...liked];
          } else {
            // No user: return empty array when filtering for personal only
            console.log('My Setups filter: No current user');
            filtered = [];
          }
        } else if (typeof filters.isPublic === 'boolean') {
          // Explicit filter: show only public or only private
          filtered = filtered.filter(loadout => 
            loadout.isPublic === filters.isPublic
          );
        } else {
          // Default: show all public loadouts OR user's own loadouts (public + private)
          if (currentUser?.uid) {
            // Include public loadouts OR loadouts owned by current user (anonymous or otherwise)
            const beforeFilter = filtered.length;
            filtered = filtered.filter(loadout => 
              loadout.isPublic === true || loadout.userId === currentUser.uid
            );
            if (beforeFilter !== filtered.length) {
              console.log('Default filter applied:', {
                before: beforeFilter,
                after: filtered.length,
                userId: currentUser.uid,
                userOwned: filtered.filter(l => l.userId === currentUser.uid).length
              });
            }
          } else {
            // Not logged in: show only public
            filtered = filtered.filter(loadout => 
              loadout.isPublic === true
            );
          }
        }

        filtered.sort((a, b) => {
          let comparison = 0;
          switch (filters.sortBy) {
            case 'date': {
              comparison = this.getTimestamp(b.createdAt) - this.getTimestamp(a.createdAt);
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
          return filters.sortDirection === 'desc' ? comparison : -comparison;
        });

        return filtered;
      })
    );
  }

  getGroupedLoadouts(): Observable<GroupedLoadouts> {
    return combineLatest([
      this.loadoutStateService.getLoadouts(),
      this.filters,
      this.firebaseService.getCurrentUser()
    ]).pipe(
      map(([loadouts, filters, currentUser]) => {
        if (!filters.showPersonalOnly || !currentUser?.uid) {
          return { created: [], liked: [] };
        }

        // Apply all filters except showPersonalOnly
        let filtered = [...loadouts];

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(loadout => 
            loadout.setup.name.toLowerCase().includes(searchLower) ||
            loadout.setup.notes?.toLowerCase().includes(searchLower) ||
            loadout.tags?.some(tag => tag.toLowerCase().includes(searchLower))
          );
        }

        if (filters.categories.length > 0) {
          filtered = filtered.filter(loadout => 
            filters.categories.includes(loadout.category)
          );
        }

        if (filters.tags.length > 0) {
          filtered = filtered.filter(loadout =>
            filters.tags.every(tag => loadout.tags?.includes(tag))
          );
        }

        if (filters.type) {
          filtered = filtered.filter(loadout => {
            if (filters.type === 'inventory') {
              return !loadout.type || loadout.type === 'inventory';
            }
            if (filters.type === 'banktaglayout') {
              return loadout.type === 'banktag' || loadout.type === 'banktaglayout';
            }
            return loadout.type === filters.type;
          });
        }

        // Separate created vs liked
        const created = filtered.filter(loadout => 
          loadout.userId === currentUser.uid
        );
        const liked = filtered.filter(loadout => 
          loadout.userId !== currentUser.uid
        );

        // Sort each group
        const sortFn = (a: LoadoutData, b: LoadoutData) => {
          let comparison = 0;
          switch (filters.sortBy) {
            case 'date': {
              comparison = this.getTimestamp(b.createdAt) - this.getTimestamp(a.createdAt);
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
          return filters.sortDirection === 'desc' ? comparison : -comparison;
        };

        created.sort(sortFn);
        liked.sort(sortFn);

        return { created, liked };
      })
    );
  }

  private getTimestamp(date: Date | Timestamp): number {
    if (date instanceof Date) {
      return date.getTime();
    }
    if (date instanceof Timestamp) {
      return date.toMillis();
    }
    return Date.now();
  }

  async createLoadout(loadout: LoadoutData): Promise<string> {
    try {
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) {
        throw new Error('Must be logged in to create a loadout');
      }

      const db = this.firebaseService.getFirestore();

      // Create a new document reference with auto-generated ID
      const loadoutRef = doc(collection(db, 'loadouts'));
      const loadoutId = loadoutRef.id;

      // Create the loadout with userId and timestamps
      const loadoutWithTimestamps = {
        ...loadout,
        id: loadoutId,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isPublic: loadout.isPublic ?? true,
        version: loadout.version ?? 1,
        likes: 0,
        views: 0
      };

      console.log('✅ Creating loadout:', {
        id: loadoutId,
        name: loadout.setup.name,
        userId: userId,
        isPublic: loadoutWithTimestamps.isPublic
      });

      // First, add the new loadout to the current list with client-side timestamps
      const newLoadout = {
        ...loadoutWithTimestamps,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date())
      } as LoadoutData;

      // Update the loadouts list with the new loadout based on current sort
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const filters = this.filters.value;
      const updatedLoadouts = filters.sortBy === 'date' && filters.sortDirection === 'desc'
        ? [newLoadout, ...currentLoadouts]
        : [...currentLoadouts, newLoadout];
      this.loadoutStateService.updateLoadouts(updatedLoadouts);

      // Now perform the transaction
      await runTransaction(db, async (transaction) => {
        // Create the document
        transaction.set(loadoutRef, loadoutWithTimestamps);

        // Update user stats
        const userRef = this.firebaseService.doc(`users/${userId}`);
        transaction.update(userRef, {
          loadoutCount: increment(1),
          lastLoadoutCreated: serverTimestamp()
        });

        // Update global stats
        const statsRef = this.firebaseService.doc('stats/global');
        transaction.set(statsRef, {
          totalLoadouts: increment(1),
          lastUpdated: serverTimestamp()
        }, { merge: true });
      });

      // Wait a short moment for Firestore to process the transaction
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update pagination state to reflect the new loadout
      this.updatePaginationState(
        this.pagination.value.lastVisible,
        true
      );

      return loadoutId;
    } catch (error) {
      console.error('Error creating loadout:', error);
      throw error;
    }
  }

  async deleteLoadout(id: string): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) throw new Error('Must be logged in to delete loadout');

      // Get all necessary document references
      const loadoutRef = this.firebaseService.doc(`loadouts/${id}`);
      const userRef = this.firebaseService.doc(`users/${userId}`);
      const statsRef = this.firebaseService.doc('stats/global');

      // Perform all reads before the transaction
      const loadoutSnap = await getDoc(loadoutRef);
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }

      const loadoutData = loadoutSnap.data() as LoadoutData;
      if (loadoutData.userId !== userId) {
        throw new Error('You do not have permission to delete this loadout');
      }

      // Get likes for this loadout
      const likesRef = this.firebaseService.collectionGroup('likes');
      const likesQuery = query(likesRef, where('loadoutId', '==', id));
      const likesSnap = await getDocs(likesQuery);
      
      // Delete likes in batches if there are any
      if (!likesSnap.empty) {
        const batch = writeBatch(db);
        likesSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
      }

      // Now perform the transaction with no reads
      await runTransaction(db, async (transaction) => {
        // Delete the loadout document
        transaction.delete(loadoutRef);

        // Update user stats
        transaction.update(userRef, {
          loadoutCount: increment(-1),
          lastUpdated: serverTimestamp()
        });

        // Update global stats
        transaction.update(statsRef, {
          totalLoadouts: increment(-1),
          lastUpdated: serverTimestamp()
        });
      });

      // Wait for Firestore to propagate the changes
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use firebaseService to refresh loadouts
      await this.firebaseService.refreshLoadouts();
    } catch (error) {
      console.error('Error deleting loadout:', error);
      throw error;
    }
  }

  async toggleLike(loadoutId: string): Promise<void> {
    if (!loadoutId) {
      throw new Error('Loadout ID is required');
    }

    try {
      const db = this.firebaseService.getFirestore();
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) throw new Error('Must be logged in to like loadouts');

      // Get all necessary document references
      const loadoutRef = this.firebaseService.doc(`loadouts/${loadoutId}`) as DocumentReference<LoadoutData>;
      const likeRef = this.firebaseService.doc(`users/${userId}/likes/${loadoutId}`);

      // Perform all reads before the transaction
      const hasLiked = await this.hasUserLiked(loadoutId);
      const loadoutSnap = await getDoc(loadoutRef);
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }
      const loadoutData = loadoutSnap.data() as LoadoutData;
      const ownerRef = this.firebaseService.doc(`users/${loadoutData.userId}`);

      // Update local state first
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const updatedLoadouts = currentLoadouts.map(loadout => {
        if (loadout.id === loadoutId) {
          return {
            ...loadout,
            likes: (loadout.likes || 0) + (hasLiked ? -1 : 1)
          };
        }
        return loadout;
      });
      this.loadoutStateService.updateLoadouts(updatedLoadouts);

      // Now perform the transaction with no reads
      await runTransaction(db, async (transaction) => {
        if (hasLiked) {
          // Remove like
          transaction.delete(likeRef);
          transaction.update(loadoutRef, {
            likes: increment(-1)
          });

          // Update owner's stats
          transaction.update(ownerRef, {
            totalLikes: increment(-1),
            lastUpdated: serverTimestamp()
          });
        } else {
          // Add like
          transaction.set(likeRef, {
            loadoutId,
            createdAt: serverTimestamp()
          });
          transaction.update(loadoutRef, {
            likes: increment(1)
          });

          // Update owner's stats
          transaction.update(ownerRef, {
            totalLikes: increment(1),
            lastUpdated: serverTimestamp()
          });
        }
      });
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  }

  async hasUserLiked(loadoutId: string): Promise<boolean> {
    if (!loadoutId) return false;
    return this.firebaseService.hasUserLiked(loadoutId);
  }

  async getLoadoutStats(): Promise<{ total: number; today: number }> {
    try {
      // Get global stats
      const statsRef = this.firebaseService.doc('stats/global');
      const statsSnap = await getDoc(statsRef);
      
      // If stats don't exist, create them
      if (!statsSnap.exists()) {
        // Count all loadouts
        const result = await this.firebaseService.getLoadouts();
        const total = result.loadouts.length;

        // Initialize stats document
        await setDoc(statsRef, {
          totalLoadouts: total,
          lastUpdated: serverTimestamp()
        });

        return {
          total,
          today: 0 // Will be calculated below
        };
      }

      const stats = statsSnap.data();

      // Get today's loadouts
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayResult = await this.firebaseService.getLoadouts({
        createdAfter: today
      });

      return {
        total: stats['totalLoadouts'] || 0,
        today: todayResult.loadouts.length
      };
    } catch (error) {
      console.error('Error getting loadout stats:', error);
      return { total: 0, today: 0 };
    }
  }

  async getUserStats(userId: string): Promise<{
    loadoutCount: number;
    totalLikes: number;
    totalViews: number;
  }> {
    try {
      const userRef = this.firebaseService.doc(`users/${userId}`);
      const userSnap = await getDoc(userRef);
      
      // If user stats don't exist, calculate them
      if (!userSnap.exists()) {
        // Get all user's loadouts
        const result = await this.firebaseService.getLoadouts({ 
          showPersonalOnly: true,
          isPublic: undefined // Include both public and private loadouts
        });
        const loadoutCount = result.loadouts.length;
        const totalLikes = result.loadouts.reduce((sum: number, loadout) => sum + (loadout.likes || 0), 0);
        const totalViews = result.loadouts.reduce((sum: number, loadout) => sum + (loadout.views || 0), 0);

        // Initialize user stats
        await setDoc(userRef, {
          loadoutCount,
          totalLikes,
          totalViews,
          lastUpdated: serverTimestamp()
        }, { merge: true });

        return {
          loadoutCount,
          totalLikes,
          totalViews
        };
      }

      const userData = userSnap.data();
      return {
        loadoutCount: userData['loadoutCount'] || 0,
        totalLikes: userData['totalLikes'] || 0,
        totalViews: userData['totalViews'] || 0
      };
    } catch (error) {
      console.error('Error getting user stats:', error);
      return { loadoutCount: 0, totalLikes: 0, totalViews: 0 };
    }
  }

  updateFilters(newFilters: Partial<LoadoutFilters>) {
    this.filters.next({
      ...this.filters.value,
      ...newFilters
    });
  }

  getAllTags(): Observable<string[]> {
    return this.loadoutStateService.getLoadouts().pipe(
      map(loadouts => {
        const tagSet = new Set<string>();
        loadouts.forEach(loadout => {
          loadout.tags?.forEach(tag => tagSet.add(tag));
        });
        return Array.from(tagSet).sort();
      })
    );
  }

  resetFilters() {
    this.filters.next(DEFAULT_FILTERS);
  }

  async updateLoadoutPrivacy(loadoutId: string, isPublic: boolean): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) throw new Error('Must be logged in to update loadout privacy');

      const loadoutRef = this.firebaseService.doc(`loadouts/${loadoutId}`);
      const loadoutSnap = await getDoc(loadoutRef);
      
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }

      const loadoutData = loadoutSnap.data() as LoadoutData;
      if (loadoutData.userId !== userId) {
        throw new Error('You do not have permission to update this loadout');
      }

      // Update the loadout
      await runTransaction(db, async (transaction) => {
        transaction.update(loadoutRef, {
          isPublic,
          updatedAt: serverTimestamp()
        });
      });

      // Update local state
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const updatedLoadouts = currentLoadouts.map(loadout => {
        if (loadout.id === loadoutId) {
          return {
            ...loadout,
            isPublic,
            updatedAt: Timestamp.fromDate(new Date())
          };
        }
        return loadout;
      });
      this.loadoutStateService.updateLoadouts(updatedLoadouts);

      // Refresh from server to ensure consistency
      await this.firebaseService.refreshLoadouts();
    } catch (error) {
      console.error('Error updating loadout privacy:', error);
      throw error;
    }
  }

  /**
   * Update loadout tags (community tagging - anyone logged in can add tags)
   */
  async updateLoadoutCategory(loadoutId: string, category: string): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) throw new Error('Must be logged in to update category');

      const loadoutRef = this.firebaseService.doc(`loadouts/${loadoutId}`);

      // Update the loadout (ownership check handled by Firestore rules)
      await runTransaction(db, async (transaction) => {
        transaction.update(loadoutRef, {
          category,
          updatedAt: serverTimestamp()
        });
      });

      // Update local state and refresh
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const updatedLoadouts = currentLoadouts.map(loadout => {
        if (loadout.id === loadoutId) {
          return { ...loadout, category: category as 'Combat' | 'Skilling' | 'PvP' | 'Other' };
        }
        return loadout;
      });
      this.loadoutStateService.updateLoadouts(updatedLoadouts);
      await this.firebaseService.refreshLoadouts();

      console.log(`Updated loadout ${loadoutId} category:`, category);
    } catch (error) {
      console.error('Error updating loadout category:', error);
      throw error;
    }
  }

  async updateLoadoutTags(loadoutId: string, tags: string[]): Promise<void> {
    try {
      const db = this.firebaseService.getFirestore();
      const userId = await this.firebaseService.getCurrentUserId();
      if (!userId) throw new Error('Must be logged in to update tags');

      const loadoutRef = this.firebaseService.doc(`loadouts/${loadoutId}`);
      const loadoutSnap = await getDoc(loadoutRef);
      
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }

      // Update the loadout (no ownership check - community tagging!)
      await runTransaction(db, async (transaction) => {
        transaction.update(loadoutRef, {
          tags,
          updatedAt: serverTimestamp()
        });
      });

      // Update local state
      const currentLoadouts = this.loadoutStateService.getCurrentLoadouts();
      const updatedLoadouts = currentLoadouts.map(loadout => {
        if (loadout.id === loadoutId) {
          return { ...loadout, tags };
        }
        return loadout;
      });
      this.loadoutStateService.updateLoadouts(updatedLoadouts);

      // Refresh from server to ensure consistency
      await this.firebaseService.refreshLoadouts();

      console.log(`Updated loadout ${loadoutId} tags:`, tags);
    } catch (error) {
      console.error('Error updating loadout tags:', error);
      throw error;
    }
  }

  /**
   * Create multiple loadouts in a batch operation
   * Returns summary of success/failure
   */
  async bulkCreateLoadouts(
    loadouts: LoadoutData[],
    batchId?: string
  ): Promise<{
    success: string[];
    failed: Array<{ loadout: LoadoutData; error: string }>;
    totalCount: number;
  }> {
    const db = this.firebaseService.getFirestore();
    const userId = await this.firebaseService.getCurrentUserId();
    
    if (!userId) {
      throw new Error('Must be logged in to create loadouts');
    }

    const success: string[] = [];
    const failed: Array<{ loadout: LoadoutData; error: string }> = [];
    const BATCH_SIZE = 500; // Firestore batch limit

    // Process in batches of 500
    for (let i = 0; i < loadouts.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const batchLoadouts = loadouts.slice(i, i + BATCH_SIZE);
      const batchIds: string[] = [];

      try {
        for (const loadout of batchLoadouts) {
          const loadoutRef = doc(collection(db, 'loadouts'));
          const loadoutId = loadoutRef.id;
          batchIds.push(loadoutId);

          const loadoutWithTimestamps = {
            ...loadout,
            id: loadoutId,
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isPublic: loadout.isPublic ?? false, // Default to private for bulk imports
            version: loadout.version ?? 1,
            likes: 0,
            views: 0,
            syncMetadata: {
              ...loadout.syncMetadata,
              source: 'bulk_import' as const,
              importDate: serverTimestamp(),
              batchId: batchId || `batch_${Date.now()}`
            }
          };

          batch.set(loadoutRef, loadoutWithTimestamps);
        }

        // Update user stats in the same batch
        const userRef = this.firebaseService.doc(`users/${userId}`);
        batch.update(userRef, {
          loadoutCount: increment(batchLoadouts.length),
          lastLoadoutCreated: serverTimestamp()
        });

        // Update global stats
        const statsRef = this.firebaseService.doc('stats/global');
        batch.set(statsRef, {
          totalLoadouts: increment(batchLoadouts.length),
          lastUpdated: serverTimestamp()
        }, { merge: true });

        // Commit the batch
        await batch.commit();

        // Add to success list
        success.push(...batchIds);

        console.log(`Successfully created batch ${i / BATCH_SIZE + 1}: ${batchLoadouts.length} loadouts`);
      } catch (error) {
        console.error(`Error in batch ${i / BATCH_SIZE + 1}:`, error);
        
        // Add all loadouts in this batch to failed list
        batchLoadouts.forEach(loadout => {
          failed.push({
            loadout,
            error: error instanceof Error ? error.message : 'Unknown error during batch operation'
          });
        });
      }
    }

    // Refresh loadouts from server if any succeeded
    if (success.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.firebaseService.refreshLoadouts();
    }

    return {
      success,
      failed,
      totalCount: loadouts.length
    };
  }

  /**
   * Replace an existing loadout with a new one
   */
  async replaceLoadout(existingId: string, newLoadout: LoadoutData): Promise<void> {
    const db = this.firebaseService.getFirestore();
    const userId = await this.firebaseService.getCurrentUserId();
    
    if (!userId) {
      throw new Error('Must be logged in to replace loadouts');
    }

    const loadoutRef = this.firebaseService.doc(`loadouts/${existingId}`);
    const loadoutSnap = await getDoc(loadoutRef);
    
    if (!loadoutSnap.exists()) {
      throw new Error('Loadout not found');
    }

    const existingData = loadoutSnap.data() as LoadoutData;
    if (existingData.userId !== userId) {
      throw new Error('You do not have permission to replace this loadout');
    }

    // Merge tags: combine existing + new, remove duplicates
    const mergedTags = Array.from(new Set([
      ...(existingData.tags || []),
      ...(newLoadout.tags || [])
    ]));

    await runTransaction(db, async (transaction) => {
      transaction.update(loadoutRef, {
        setup: newLoadout.setup,
        layout: newLoadout.layout,
        category: newLoadout.category,
        tags: mergedTags, // Use merged tags instead of replacing
        type: newLoadout.type,
        originalFormat: newLoadout.originalFormat,
        syncMetadata: {
          ...newLoadout.syncMetadata,
          source: 'bulk_import' as const,
          importDate: serverTimestamp(),
          duplicateOf: existingId
        },
        updatedAt: serverTimestamp()
      });
    });

    // Refresh from server
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.firebaseService.refreshLoadouts();
  }
} 