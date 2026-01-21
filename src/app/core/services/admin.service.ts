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

      if (snapshot.empty) return 0;

      // Get destination user's info for creator fields
      const toUserRef = doc(this.db, 'users', toUserId);
      const toUserSnap = await getDoc(toUserRef);
      const toUserData = toUserSnap.exists() ? toUserSnap.data() : null;

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
      }

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
      // Get new user's info
      const userRef = doc(this.db, 'users', newUserId);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;

      const loadoutRef = doc(this.db, 'loadouts', loadoutId);
      await updateDoc(loadoutRef, {
        userId: newUserId,
        creatorDisplayName: userData?.['displayName'] || 'Unknown User',
        creatorOsrsUsername: userData?.['osrsUsername'] || null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error reassigning loadout:', error);
      throw error;
    }
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
}
