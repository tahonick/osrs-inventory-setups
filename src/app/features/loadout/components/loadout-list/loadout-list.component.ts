import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, takeUntil, map, startWith, combineLatest } from 'rxjs/operators';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { firstValueFrom } from 'rxjs';

import { FirebaseService } from '../../../../core/services/firebase.service';
import { LoadoutData, Category } from '../../../../shared/models/inventory.model';
import { LoadoutModalComponent } from '../loadout-modal/loadout-modal.component';
import { LoadoutUploaderDialogComponent } from '../loadout-uploader/loadout-uploader-dialog.component';
import { FirebaseDatePipe } from '../../../../shared/pipes/firebase-date.pipe';
import { DeleteConfirmationComponent } from '../../../../shared/components/delete-confirmation/delete-confirmation.component';
import { InventoryGridComponent } from '../../../inventory/components/inventory-grid/inventory-grid.component';
import { LoadoutService } from '../../../../core/services/loadout.service';
import { RunePouchComponent } from '../../../inventory/components/rune-pouch/rune-pouch.component';
import { BankTagLayoutGridComponent } from '../../../inventory/components/bank-tag-layout-grid/bank-tag-layout-grid.component';
import { BankTagLayout } from '../../../../shared/models/bank-tag-layout.model';

@Component({
  selector: 'app-loadout-list',
  templateUrl: './loadout-list.component.html',
  styleUrls: ['./loadout-list.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSnackBarModule,
    FormsModule,
    ReactiveFormsModule,
    FirebaseDatePipe,
    InventoryGridComponent,
    RunePouchComponent,
    BankTagLayoutGridComponent
  ]
})
export class LoadoutListComponent implements OnInit, OnDestroy {
  filteredLoadouts$: Observable<LoadoutData[]>;
  private allLoadouts = new BehaviorSubject<LoadoutData[]>([]);
  searchControl: FormControl<string | null>;
  categoryControl: FormControl<Category['type'] | ''>;
  isLoggedIn$: Observable<boolean>;
  private destroy$ = new Subject<void>();
  
  readonly categories: { type: Category['type']; name: string; }[] = [
    { type: 'PVM', name: 'PVM' },
    { type: 'Skilling', name: 'Skilling' },
    { type: 'PvP', name: 'PvP' },
    { type: 'Minigames', name: 'Minigames' },
    { type: 'Other', name: 'Other' }
  ];

  constructor(
    private firebaseService: FirebaseService,
    private loadoutService: LoadoutService,
    private dialog: MatDialog,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar
  ) {
    this.isLoggedIn$ = this.firebaseService.isLoggedIn$;
    this.searchControl = new FormControl('');
    this.categoryControl = new FormControl<Category['type'] | ''>('');

    // Use LoadoutService for filtered loadouts
    this.filteredLoadouts$ = this.loadoutService.getFilteredLoadouts();

    // Subscribe to search changes
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(search => {
      this.loadoutService.updateFilters({ search: search || '' });
    });

    // Subscribe to category changes
    this.categoryControl.valueChanges.pipe(
      startWith(''),
      takeUntil(this.destroy$)
    ).subscribe(category => {
      this.loadoutService.updateFilters({ 
        categories: category ? [category] : [] 
      });
    });
  }

  ngOnInit(): void {
    // Initial data fetch
    this.firebaseService.refreshLoadouts();

    // Subscribe to auth state changes
    this.firebaseService.isLoggedIn$.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged()
    ).subscribe(isLoggedIn => {
      console.log('LoadoutList auth state changed:', isLoggedIn);
      // Only refresh if logged in state changes
      this.firebaseService.refreshLoadouts();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openLoadoutModal(loadout: LoadoutData): void {
    const dialogRef = this.dialog.open(LoadoutModalComponent, {
      width: '800px',
      data: loadout,
      panelClass: 'modern-dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'deleted') {
        this.firebaseService.refreshLoadouts();
      }
    });
  }

  isOwner(loadout: LoadoutData): boolean {
    return this.firebaseService.isLoadoutOwner(loadout);
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(LoadoutUploaderDialogComponent, {
      width: '90vw',
      maxWidth: '1400px',
      disableClose: false
    });

    dialogRef.afterClosed().pipe(
      takeUntil(this.destroy$)
    ).subscribe(result => {
      if (result) {
        this.firebaseService.refreshLoadouts();
      }
    });
  }

  openLoadout(loadout: LoadoutData): void {
    const dialogRef = this.dialog.open(LoadoutModalComponent, {
      width: '800px',
      data: loadout,
      panelClass: 'modern-dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'deleted') {
        this.firebaseService.refreshLoadouts();
      }
    });
  }

  async deleteLoadout(event: Event, loadout: LoadoutData): Promise<void> {
    event.stopPropagation(); // Prevent opening the modal when clicking delete

    const dialogRef = this.dialog.open(DeleteConfirmationComponent, {
      data: { name: loadout.setup.name },
      width: '400px'
    });

    try {
      const confirmed = await firstValueFrom(dialogRef.afterClosed());
      if (confirmed) {
        await this.firebaseService.deleteLoadout(loadout.id);
        // Wait for a short delay to ensure Firestore has propagated the changes
        await new Promise(resolve => setTimeout(resolve, 500));
        await this.firebaseService.refreshLoadouts();
      }
    } catch (error) {
      console.error('Error deleting loadout:', error);
      // TODO: Show error message to user
    }
  }

  async toggleLike(event: Event, loadout: LoadoutData): Promise<void> {
    event.stopPropagation(); // Prevent opening the modal when clicking like

    try {
      await this.loadoutService.toggleLike(loadout.id);
      const hasLiked = await this.loadoutService.hasUserLiked(loadout.id);
      loadout.likes = (loadout.likes || 0) + (hasLiked ? 1 : -1);
      
      this.snackBar.open(
        hasLiked ? 'Added to your likes' : 'Removed from your likes',
        'Close',
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Error toggling like:', error);
      this.snackBar.open(
        'You must be logged in to like loadouts',
        'Close',
        { duration: 3000 }
      );
    }
  }

  async hasUserLiked(loadoutId: string): Promise<boolean> {
    return this.loadoutService.hasUserLiked(loadoutId);
  }

  isLayoutType(loadout: LoadoutData): boolean {
    return loadout.type === 'banktag' || loadout.type === 'banktaglayout';
  }

  getBankTagLayout(loadout: LoadoutData): BankTagLayout {
    return {
      name: loadout.setup.name,
      items: Object.entries(loadout.setup.afi || {}).map(([pos, item]) => ({
        id: item.id,
        position: parseInt(pos),
        q: item.q || 1
      })),
      bankTag: Object.values(loadout.setup.afi || {}).map(item => item.id),
      width: 8
    };
  }
} 