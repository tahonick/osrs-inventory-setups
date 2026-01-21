import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { 
  Firestore, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { FirebaseService } from './firebase.service';
import { LoadoutData, UserProfile } from '../../shared/models/inventory.model';

// Admin user IDs - these users have full admin access
const ADMIN_USER_IDS = [
  'zVBENBUCoocuLjF7oGaomqgzzjo2' // Nic Carlson
];

export interface AdminStats {
  totalUsers: number;
  googleUsers: number;
  anonymousUsers: number;
  totalLoadouts: number;
  publicLoadouts: number;
  privateLoadouts: number;
  totalLikes: number;
  totalViews: number;
  loadoutsToday: number;
  usersToday: number;
}

export interface UserListItem {
  uid: string;
  displayName: string;
  email?: string;
  osrsUsername?: string;
  isAnonymous: boolean;
  loadoutCount: number;
  totalLikes: number;
  totalViews: number;
  lastActive: Timestamp;
  createdAt: Timestamp;
}

export interface LoadoutListItem {
  id: string;
  name: string;
  category: string;
  tags: string[];
  userId: string;
  creatorDisplayName?: string;
  creatorOsrsUsername?: string;
  isPublic: boolean;
  likes: number;
  views: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DuplicateGroup {
  hash: string;
  loadouts: LoadoutData[];
  count: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private db: Firestore;

  constructor(private firebaseService: FirebaseService) {
    this.db = this.firebaseService.getFirestore();
  }

  /**
   * Check if current user is an admin
   */
  isAdmin(): Observable<boolean> {
    return this.firebaseService.getCurrentUser().pipe(
      map(user => user ? ADMIN_USER_IDS.includes(user.uid) : false)
    );
  }

  /**
   * Check if current user is admin (synchronous)
   */
  isAdminSync(): boolean {
    const user = this.firebaseService.getCurrentUserSync();
    return user ? ADMIN_USER_IDS.includes(user.uid) : false;
  }

  /**
   * Get admin dashboard statistics
   */
  async getAdminStats(): Promise<AdminStats> {
    try {
      const [usersSnap, loadoutsSnap] = await Promise.all([
        getDocs(collection(this.db, 'users')),
        getDocs(collection(this.db, 'loadouts'))
      ]);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let googleUsers = 0;
      let anonymousUsers = 0;
      let usersToday = 0;

      usersSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data['isAnonymous']) {
          anonymousUsers++;
        } else {
          googleUsers++;
        }
        
        const createdAt = data['createdAt']?.toDate?.();
        if (createdAt && createdAt >= todayStart) {
          usersToday++;
        }
      });

      let publicLoadouts = 0;
      let privateLoadouts = 0;
      let totalLikes = 0;
      let totalViews = 0;
      let loadoutsToday = 0;

      loadoutsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data['isPublic']) {
          publicLoadouts++;
        } else {
          privateLoadouts++;
        }
        totalLikes += data['likes'] || 0;
        totalViews += data['views'] || 0;

        const createdAt = data['createdAt']?.toDate?.();
        if (createdAt && createdAt >= todayStart) {
          loadoutsToday++;
        }
      });

      return {
        totalUsers: usersSnap.size,
        googleUsers,
        anonymousUsers,
        totalLoadouts: loadoutsSnap.size,
        publicLoadouts,
        privateLoadouts,
        totalLikes,
        totalViews,
        loadoutsToday,
        usersToday
      };
    } catch (error) {
      console.error('Error getting admin stats:', error);
      throw error;
    }
  }

  /**
   * Get all users with pagination
   */
  async getUsers(limitCount: number = 50, orderByField: string = 'lastActive'): Promise<UserListItem[]> {
    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, orderBy(orderByField, 'desc'), firestoreLimit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data() as any
      }));
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  }

  /**
   * Get all loadouts for admin moderation
   */
  async getAllLoadouts(limitCount: number = 100): Promise<LoadoutListItem[]> {
    try {
      const loadoutsRef = collection(this.db, 'loadouts');
      const q = query(loadoutsRef, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data['setup']?.['name'] || 'Unnamed',
          category: data['category'] || 'Other',
          tags: data['tags'] || [],
          userId: data['userId'],
          creatorDisplayName: data['creatorDisplayName'],
          creatorOsrsUsername: data['creatorOsrsUsername'],
          isPublic: data['isPublic'] || false,
          likes: data['likes'] || 0,
          views: data['views'] || 0,
          createdAt: data['createdAt'],
          updatedAt: data['updatedAt']
        };
      });
    } catch (error) {
      console.error('Error getting all loadouts:', error);
      return [];
    }
  }

  /**
   * Find orphaned accounts (no recent activity)
   */
  async findOrphanedAccounts(daysInactive: number = 90): Promise<UserListItem[]> {
    try {
      const usersRef = collection(this.db, 'users');
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

      const snapshot = await getDocs(usersRef);
      
      return snapshot.docs
        .filter(doc => {
          const data = doc.data();
          const lastActive = data['lastActive']?.toDate?.();
          return lastActive && lastActive < cutoffDate;
        })
        .map(doc => ({
          uid: doc.id,
          ...doc.data() as any
        }));
    } catch (error) {
      console.error('Error finding orphaned accounts:', error);
      return [];
    }
  }

  /**
   * Migrate all loadouts from one user to another
   */
  async migrateUserLoadouts(fromUserId: string, toUserId: string): Promise<number> {
    try {
      const loadoutsRef = collection(this.db, 'loadouts');
      const q = query(loadoutsRef, where('userId', '==', fromUserId));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log('ℹ️  No loadouts found to migrate');
        return 0;
      }

      console.log(`🔄 Starting migration of ${snapshot.size} loadouts`);

      // Get destination user's info for creator fields
      const toUserRef = doc(this.db, 'users', toUserId);
      const toUserSnap = await getDoc(toUserRef);
      const toUserData = toUserSnap.exists() ? toUserSnap.data() : null;

      if (!toUserSnap.exists()) {
        throw new Error(`Destination user ${toUserId} not found`);
      }

      // Batch update in groups of 500
      const batchSize = 500;
      let migratedCount = 0;

      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = writeBatch(this.db);
        const batchDocs = snapshot.docs.slice(i, i + batchSize);

        batchDocs.forEach(docSnapshot => {
          const loadoutRef = doc(this.db, 'loadouts', docSnapshot.id);
          batch.update(loadoutRef, {
            userId: toUserId,
            creatorDisplayName: toUserData?.['displayName'] || 'Unknown User',
            creatorOsrsUsername: toUserData?.['osrsUsername'] || null,
            updatedAt: serverTimestamp()
          });
        });

        await batch.commit();
        migratedCount += batchDocs.length;
        console.log(`  ✓ Migrated ${migratedCount}/${snapshot.size} loadouts`);
      }

      console.log(`✅ Loadout migration complete. Recalculating stats for both users...`);
      
      // Recalculate stats for both users to ensure accuracy
      await this.recalculateUserStats(toUserId);
      
      // Recalculate source user stats if they exist
      try {
        const fromUserRef = doc(this.db, 'users', fromUserId);
        const fromUserSnap = await getDoc(fromUserRef);
        if (fromUserSnap.exists()) {
          await this.recalculateUserStats(fromUserId);
        }
      } catch (error) {
        console.warn('Could not recalculate source user stats (may not exist):', error);
      }
      
      console.log('✅ Migration and stats recalculation complete');

      return migratedCount;
    } catch (error) {
      console.error('Error migrating user loadouts:', error);
      throw error;
    }
  }

  /**
   * Delete user and all their loadouts
   */
  async deleteUserAndLoadouts(userId: string): Promise<void> {
    try {
      // Get all user's loadouts
      const loadoutsRef = collection(this.db, 'loadouts');
      const q = query(loadoutsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      // Delete in batches
      const batchSize = 500;
      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = writeBatch(this.db);
        const batchDocs = snapshot.docs.slice(i, i + batchSize);

        batchDocs.forEach(docSnapshot => {
          batch.delete(doc(this.db, 'loadouts', docSnapshot.id));
        });

        await batch.commit();
      }

      // Delete user's likes subcollection
      const likesRef = collection(this.db, `users/${userId}/likes`);
      const likesSnap = await getDocs(likesRef);
      if (!likesSnap.empty) {
        const batch = writeBatch(this.db);
        likesSnap.docs.forEach(docSnapshot => {
          batch.delete(doc(this.db, `users/${userId}/likes/${docSnapshot.id}`));
        });
        await batch.commit();
      }

      // Finally, delete user document
      await deleteDoc(doc(this.db, 'users', userId));
    } catch (error) {
      console.error('Error deleting user and loadouts:', error);
      throw error;
    }
  }

  /**
   * Update loadout visibility (public/private)
   */
  async updateLoadoutVisibility(loadoutId: string, isPublic: boolean): Promise<void> {
    const loadoutRef = doc(this.db, 'loadouts', loadoutId);
    await updateDoc(loadoutRef, {
      isPublic,
      updatedAt: serverTimestamp()
    });
  }

  /**
   * Reassign loadout to different user
   */
  async reassignLoadout(loadoutId: string, newUserId: string): Promise<void> {
    try {
      console.log(`🔄 Reassigning loadout ${loadoutId} to user ${newUserId}`);
      
      // Get loadout data first to know old owner
      const loadoutRef = doc(this.db, 'loadouts', loadoutId);
      const loadoutSnap = await getDoc(loadoutRef);
      
      if (!loadoutSnap.exists()) {
        throw new Error('Loadout not found');
      }

      const loadoutData = loadoutSnap.data();
      const oldUserId = loadoutData['userId'];

      // Get new user's info for creator fields
      const newUserRef = doc(this.db, 'users', newUserId);
      const newUserSnap = await getDoc(newUserRef);
      const newUserData = newUserSnap.exists() ? newUserSnap.data() : null;

      if (!newUserSnap.exists()) {
        throw new Error(`Destination user ${newUserId} not found`);
      }

      // Update the loadout
      await updateDoc(loadoutRef, {
        userId: newUserId,
        creatorDisplayName: newUserData?.['displayName'] || 'Unknown User',
        creatorOsrsUsername: newUserData?.['osrsUsername'] || null,
        updatedAt: serverTimestamp()
      });

      console.log(`✅ Loadout reassigned. Recalculating stats for both users...`);

      // Recalculate stats for destination user
      await this.recalculateUserStats(newUserId);

      // Recalculate stats for source user if different
      if (oldUserId && oldUserId !== newUserId) {
        try {
          const oldUserRef = doc(this.db, 'users', oldUserId);
          const oldUserSnap = await getDoc(oldUserRef);
          
          if (oldUserSnap.exists()) {
            await this.recalculateUserStats(oldUserId);
          }
        } catch (error) {
          console.warn('Could not recalculate old user stats (may not exist):', error);
        }
      }

      console.log('✅ Reassignment and stats recalculation complete');
    } catch (error) {
      console.error('Error reassigning loadout:', error);
      throw error;
    }
  }

  /**
   * Recalculate a user's stats from their actual loadouts
   */
  async recalculateUserStats(userId: string): Promise<void> {
    try {
      console.log(`🔄 Recalculating stats for user: ${userId}`);
      
      // Get all user's loadouts
      const loadoutsRef = collection(this.db, 'loadouts');
      const q = query(loadoutsRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      let loadoutCount = 0;
      let totalLikes = 0;
      let totalViews = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        loadoutCount++;
        totalLikes += data['likes'] || 0;
        totalViews += data['views'] || 0;
      });

      console.log(`📊 Calculated stats: ${loadoutCount} loadouts, ${totalLikes} likes, ${totalViews} views`);

      // Update user document
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, {
        loadoutCount,
        totalLikes,
        totalViews,
        lastUpdated: serverTimestamp()
      });

      console.log(`✅ User stats updated successfully`);
    } catch (error) {
      console.error('Error recalculating user stats:', error);
      throw error;
    }
  }

  /**
   * Migrate category names from old to new
   * Combat -> PVM
   * (Other remains as Other)
   */
  async migrateCategoryNames(): Promise<{ updated: number; errors: number }> {
    console.log('🔄 Starting category migration...');
    const loadoutsRef = collection(this.db, 'loadouts');
    
    // Find all loadouts with Combat category
    const combatQuery = query(loadoutsRef, where('category', '==', 'Combat'));
    const combatSnapshot = await getDocs(combatQuery);
    
    console.log(`📊 Found ${combatSnapshot.size} Combat loadouts to migrate to PVM`);
    
    let batch = writeBatch(this.db);
    let batchCount = 0;
    let updated = 0;
    let errors = 0;
    
    // Update Combat -> PVM
    for (const docSnapshot of combatSnapshot.docs) {
      const docRef = doc(this.db, 'loadouts', docSnapshot.id);
      batch.update(docRef, { 
        category: 'PVM',
        updatedAt: serverTimestamp()
      });
      batchCount++;
      updated++;
      
      // Firestore batch limit is 500 operations
      if (batchCount >= 500) {
        try {
          await batch.commit();
          console.log(`✅ Batch committed: ${batchCount} Combat -> PVM updates`);
          batch = writeBatch(this.db);
          batchCount = 0;
        } catch (error) {
          console.error('❌ Batch commit error:', error);
          errors += batchCount;
          batch = writeBatch(this.db);
          batchCount = 0;
        }
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      try {
        await batch.commit();
        console.log(`✅ Final batch committed: ${batchCount} updates`);
      } catch (error) {
        console.error('❌ Final batch commit error:', error);
        errors += batchCount;
      }
    }
    
    console.log(`✨ Category migration complete: ${updated} updated, ${errors} errors`);
    return { updated, errors };
  }

  /**
   * Get top creators
   */
  async getTopCreators(limitCount: number = 10): Promise<Array<{ 
    uid: string; 
    displayName: string; 
    osrsUsername?: string;
    loadoutCount: number; 
    totalLikes: number; 
  }>> {
    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, orderBy('loadoutCount', 'desc'), firestoreLimit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          displayName: data['displayName'] || 'Unknown',
          osrsUsername: data['osrsUsername'],
          loadoutCount: data['loadoutCount'] || 0,
          totalLikes: data['totalLikes'] || 0
        };
      });
    } catch (error) {
      console.error('Error getting top creators:', error);
      return [];
    }
  }

  /**
   * Find duplicate loadouts based on inventory and equipment contents
   */
  async findDuplicates(): Promise<DuplicateGroup[]> {
    try {
      const loadoutsRef = collection(this.db, 'loadouts');
      const snapshot = await getDocs(loadoutsRef);

      // Map to group loadouts by content hash
      const hashMap = new Map<string, LoadoutData[]>();

      snapshot.docs.forEach(doc => {
        const data = doc.data() as LoadoutData;
        data.id = doc.id;

        // Create a hash of the loadout's inventory and equipment
        const hash = this.createLoadoutHash(data);
        
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash)!.push(data);
      });

      // Filter to only groups with 2+ loadouts (duplicates)
      const duplicates: DuplicateGroup[] = [];
      hashMap.forEach((loadouts, hash) => {
        if (loadouts.length > 1) {
          duplicates.push({
            hash,
            loadouts,
            count: loadouts.length
          });
        }
      });

      // Sort by count descending (most duplicates first)
      return duplicates.sort((a, b) => b.count - a.count);
    } catch (error) {
      console.error('Error finding duplicates:', error);
      return [];
    }
  }

  /**
   * Create a hash of a loadout's contents for duplicate detection
   */
  private createLoadoutHash(loadout: LoadoutData): string {
    // Sort and stringify inventory and equipment to create consistent hash
    const invSorted = [...(loadout.setup.inv || [])].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (a.id || 0) - (b.id || 0);
    });
    
    const eqSorted = [...(loadout.setup.eq || [])].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (a.id || 0) - (b.id || 0);
    });
    
    const runePouchSorted = [...(loadout.setup.rp || [])].sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return (a.id || 0) - (b.id || 0);
    });
    
    return JSON.stringify({
      inv: invSorted.map(item => item ? { id: item.id, q: item.q } : null),
      eq: eqSorted.map(item => item ? { id: item.id, q: item.q } : null),
      rp: runePouchSorted.map(item => item ? { id: item.id, q: item.q } : null),
      spellbook: loadout.setup.sb || 0
    });
  }
}
