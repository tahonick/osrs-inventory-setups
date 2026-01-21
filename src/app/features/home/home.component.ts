import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormControl } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Router } from '@angular/router';

import { FirebaseService } from '../../core/services/firebase.service';
import { LoadoutService, PaginationState, GroupedLoadouts } from '../../core/services/loadout.service';
import { LoadoutData, Category } from '../../shared/models/inventory.model';
import { LoadoutModalComponent } from '../loadout/components/loadout-modal/loadout-modal.component';
import { LoadoutUploaderDialogComponent } from '../loadout/components/loadout-uploader/loadout-uploader-dialog.component';
import { BulkImportWizardComponent } from '../loadout/components/bulk-import-wizard/bulk-import-wizard.component';
import { SignInInfoComponent } from '../../shared/components/sign-in-info/sign-in-info.component';
import { FirebaseDatePipe } from '../../shared/pipes/firebase-date.pipe';
import { OsrsApiService } from '../../core/services/osrs-api.service';
import { EquipmentSlotsComponent } from '../equipment/components/equipment-slots/equipment-slots.component';
import { BankTagLayoutGridComponent } from '../inventory/components/bank-tag-layout-grid/bank-tag-layout-grid.component';
import { BankTagLayout } from '../../shared/models/bank-tag-layout.model';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
    MatRadioModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    FirebaseDatePipe,
    EquipmentSlotsComponent,
    BankTagLayoutGridComponent
  ],
  providers: [DatePipe]
})
export class HomeComponent implements OnInit, OnDestroy, AfterViewInit {
  loadouts$: Observable<LoadoutData[]>;
  groupedLoadouts$: Observable<GroupedLoadouts>;
  availableTags$: Observable<string[]>;
  isLoggedIn$: Observable<boolean>;
  paginationState$: Observable<PaginationState>;
  
  searchControl = new FormControl('');
  selectedCategories = new FormControl<Category['type'][]>([]);
  selectedTags = new FormControl<string[]>([]);
  sortControl = new FormControl<'date' | 'likes' | 'name' | 'category'>('name');
  sortDirectionControl = new FormControl<'asc' | 'desc'>('asc');
  showInstructions = !localStorage.getItem('hideInstructions');
  showMobileSearch = false;
  showAllTags = false;
  @ViewChild('searchInput') searchInput!: ElementRef;

  private subscriptions = new Subscription();
  private observer: IntersectionObserver | null = null;

  readonly categories: { value: Category['type']; label: string }[] = [
    { value: 'Combat', label: 'Combat' },
    { value: 'Skilling', label: 'Skilling' },
    { value: 'PvP', label: 'PvP' },
    { value: 'Other', label: 'Other' }
  ];

  readonly sortOptions: { key: 'likes' | 'date' | 'name' | 'category'; label: string; icon: string }[] = [
    { key: 'likes', label: 'Likes', icon: 'favorite' },
    { key: 'date', label: 'Date Added', icon: 'schedule' },
    { key: 'name', label: 'Name', icon: 'sort_by_alpha' },
    { key: 'category', label: 'Category', icon: 'category' }
  ];

  selectedType = new FormControl<'inventory' | 'banktag' | 'banktaglayout' | ''>('');
  showMySetupsOnly = new FormControl(false);

  readonly loadoutTypes: { value: 'inventory' | 'banktag' | 'banktaglayout'; label: string }[] = [
    { value: 'inventory', label: 'Inventory Setups' },
    { value: 'banktaglayout', label: 'Bank Tag Layouts' }
  ];

  readonly quickFilters: { id: string; label: string; icon: string; category?: Category['type']; type?: 'inventory' | 'banktag' | 'banktaglayout' }[] = [
    { id: 'combat', label: 'Combat', icon: 'swords', category: 'Combat' },
    { id: 'skilling', label: 'Skilling', icon: 'trending_up', category: 'Skilling' },
    { id: 'pvp', label: 'PvP', icon: 'shield', category: 'PvP' },
    { id: 'banktags', label: 'Bank Tags', icon: 'grid_on', type: 'banktaglayout' }
  ];

  constructor(
    private loadoutService: LoadoutService,
    private dialog: MatDialog,
    private osrsApi: OsrsApiService,
    private firebaseService: FirebaseService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.loadouts$ = this.loadoutService.getFilteredLoadouts();
    this.groupedLoadouts$ = this.loadoutService.getGroupedLoadouts();
    this.availableTags$ = this.loadoutService.getAllTags();
    this.isLoggedIn$ = this.firebaseService.isLoggedIn$;
    this.paginationState$ = this.loadoutService.getPaginationState();

    // Subscribe to type changes
    this.subscriptions.add(
      this.selectedType.valueChanges.subscribe(() => {
        this.updateFilters();
      })
    );

    // Subscribe to "My Setups Only" toggle
    this.subscriptions.add(
      this.showMySetupsOnly.valueChanges.subscribe(value => {
        this.loadoutService.updateFilters({ showPersonalOnly: value || false });
      })
    );
  }

  ngOnInit() {
    // Set up search with debounce
    this.subscriptions.add(
      this.searchControl.valueChanges.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(value => {
        this.loadoutService.updateFilters({ search: value || '' });
      })
    );

    // Combined category and tag filter
    this.subscriptions.add(
      this.selectedCategories.valueChanges.subscribe(() => {
        this.updateFilters();
      })
    );

    this.subscriptions.add(
      this.selectedTags.valueChanges.subscribe(() => {
        this.updateFilters();
      })
    );

    // Sort controls
    this.subscriptions.add(
      this.sortControl.valueChanges.subscribe(value => {
        if (value) {
          this.loadoutService.updateFilters({ sortBy: value });
        }
      })
    );

    this.subscriptions.add(
      this.sortDirectionControl.valueChanges.subscribe(value => {
        if (value) {
          this.loadoutService.updateFilters({ sortDirection: value });
        }
      })
    );

    // Check if instructions should be hidden
    this.showInstructions = localStorage.getItem('hideInstructions') !== 'true';
  }

  ngAfterViewInit() {
    // Intersection observer removed - action bar now always visible
  }

  ngOnDestroy() {
    // Clean up the observer
    if (this.observer) {
      this.observer.disconnect();
    }
    this.subscriptions.unsubscribe();
    this.loadoutService.resetFilters();
  }

  private updateFilters() {
    this.loadoutService.updateFilters({
      categories: this.selectedCategories.value ?? [],
      tags: this.selectedTags.value ?? [],
      type: this.selectedType.value || undefined
    });
  }

  hasActiveFilters(): boolean {
    return (
      !!this.searchControl.value ||
      (this.selectedCategories.value?.length ?? 0) > 0 ||
      (this.selectedTags.value?.length ?? 0) > 0 ||
      !!this.selectedType.value ||
      this.sortControl.value !== 'likes' ||
      this.sortDirectionControl.value !== 'desc' ||
      (this.showMySetupsOnly.value ?? false)
    );
  }

  clearFilters() {
    this.searchControl.setValue('');
    this.selectedCategories.setValue([]);
    this.selectedTags.setValue([]);
    this.selectedType.setValue('');
    this.sortControl.setValue('date');
    this.sortDirectionControl.setValue('desc');
    this.showMySetupsOnly.setValue(false);
    this.loadoutService.resetFilters();
    
    if (this.showMobileSearch) {
      this.closeMobileSearch();
    }
  }

  openMobileSearch() {
    // Toggle the overlay instead of just opening
    this.showMobileSearch = !this.showMobileSearch;
    if (this.showMobileSearch) {
      setTimeout(() => {
        this.searchInput?.nativeElement?.focus();
      }, 300);
    }
  }

  closeMobileSearch() {
    this.showMobileSearch = false;
  }

  toggleMySetups() {
    // Check if user is signed in
    const currentUser = this.firebaseService.getCurrentUserSync();
    if (!currentUser || currentUser.isAnonymous) {
      // Show sign-in dialog
      this.dialog.open(SignInInfoComponent, {
        width: '400px',
        data: {
          title: 'Sign In Required',
          message: 'You need to sign in with Google to view your setups.',
          icon: 'lock'
        }
      });
      return;
    }
    
    const newValue = !this.showMySetupsOnly.value;
    
    // When turning on "My Setups", clear other filters for a clean view
    if (newValue) {
      // Clear all filters at once to avoid multiple queries
      this.searchControl.setValue('', { emitEvent: false });
      this.selectedCategories.setValue([], { emitEvent: false });
      this.selectedTags.setValue([], { emitEvent: false });
      this.selectedType.setValue('', { emitEvent: false });
      
      // Update all filters in a single batch
      this.loadoutService.updateFilters({
        search: '',
        categories: [],
        tags: [],
        type: undefined,
        showPersonalOnly: true
      });
    } else {
      // Just toggle off "My Setups"
      this.loadoutService.updateFilters({ showPersonalOnly: false });
    }
    
    // Update the form control to reflect the new state (without triggering subscription)
    this.showMySetupsOnly.setValue(newValue, { emitEvent: false });
  }

  removeCategory(category: Category['type']) {
    const current = this.selectedCategories.value ?? [];
    this.selectedCategories.setValue(current.filter(c => c !== category));
  }

  toggleCategory(category: Category['type']) {
    const current = this.selectedCategories.value ?? [];
    if (current.includes(category)) {
      this.selectedCategories.setValue(current.filter(c => c !== category));
    } else {
      this.selectedCategories.setValue([...current, category]);
    }
  }

  removeTag(tag: string) {
    const current = this.selectedTags.value ?? [];
    this.selectedTags.setValue(current.filter(t => t !== tag));
  }

  getTypeLabel(type: 'inventory' | 'banktag' | 'banktaglayout'): string {
    const typeObj = this.loadoutTypes.find(t => t.value === type);
    return typeObj ? typeObj.label : type;
  }

  toggleQuickFilter(filter: typeof this.quickFilters[0]) {
    if (filter.category) {
      const current = this.selectedCategories.value ?? [];
      if (current.includes(filter.category)) {
        this.selectedCategories.setValue(current.filter(c => c !== filter.category));
      } else {
        this.selectedCategories.setValue([...current, filter.category]);
      }
    } else if (filter.type) {
      if (this.selectedType.value === filter.type) {
        this.selectedType.setValue('');
      } else {
        this.selectedType.setValue(filter.type);
      }
    }
  }

  isQuickFilterActive(filter: typeof this.quickFilters[0]): boolean {
    if (filter.category) {
      return (this.selectedCategories.value ?? []).includes(filter.category);
    } else if (filter.type) {
      return this.selectedType.value === filter.type;
    }
    return false;
  }

  getVisibleTags(allTags: string[]): string[] {
    if (this.showAllTags || allTags.length <= 10) {
      return allTags;
    }
    return allTags.slice(0, 10);
  }

  toggleShowAllTags() {
    this.showAllTags = !this.showAllTags;
  }

  toggleTag(tag: string) {
    const current = this.selectedTags.value ?? [];
    if (current.includes(tag)) {
      this.selectedTags.setValue(current.filter(t => t !== tag));
    } else {
      this.selectedTags.setValue([...current, tag]);
    }
  }

  @HostListener('window:scroll', ['$event'])
  onScroll() {
    // Check if we're near the bottom of the page for infinite scroll
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollBottom = scrollTop + windowHeight;

    if (documentHeight - scrollBottom < 200) { // Load more when within 200px of bottom
      this.loadMore();
    }
  }

  async loadMore() {
    await this.loadoutService.loadNextPage();
  }

  openCreateDialog(): void {
    this.dialog.open(LoadoutUploaderDialogComponent, {
      width: '90vw',
      maxWidth: '1400px',
      disableClose: false
    });
  }

  openBulkImportDialog(): void {
    const dialogRef = this.dialog.open(BulkImportWizardComponent, {
      width: '95vw',
      maxWidth: '1600px',
      height: '90vh',
      disableClose: false,
      panelClass: 'bulk-import-dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log('Import completed:', result);
      }
    });
  }

  openLoadout(loadout: LoadoutData) {
    this.dialog.open(LoadoutModalComponent, {
      data: loadout,
      panelClass: 'loadout-modal',
      maxWidth: '90vw',
      width: '80%'
    });
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(id);
  }

  toggleSortDirection() {
    const current = this.sortDirectionControl.value;
    this.sortDirectionControl.setValue(current === 'asc' ? 'desc' : 'asc');
  }

  getSortIcon(): string {
    const direction = this.sortDirectionControl.value;
    return direction === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  hideInstructions(): void {
    this.showInstructions = false;
  }

  dontShowInstructionsAgain(): void {
    const currentUser = this.firebaseService.getCurrentUserSync();
    
    if (!currentUser || currentUser.isAnonymous) {
      // Show snackbar for anonymous users
      this.snackBar.open(
        '💡 Sign in to hide permanently, or use the ✕ for now',
        '×',
        {
          duration: 4000,
          horizontalPosition: 'center',
          verticalPosition: 'top',
          panelClass: ['info-snackbar']
        }
      );
      return;
    }
    
    // Signed-in users can hide permanently
    localStorage.setItem('hideInstructions', 'true');
    this.showInstructions = false;
  }

  handleFilterKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
    }
  }

  isLayoutType(loadout: LoadoutData): boolean {
    return loadout.type === 'banktag' || loadout.type === 'banktaglayout';
  }

  getBankTagLayout(loadout: LoadoutData): BankTagLayout {
    // Get all items sorted by position
    const items = Object.entries(loadout.setup.afi || {})
      .map(([pos, item]) => ({
        id: item.id,
        position: parseInt(pos),
        q: item.q || 1
      }))
      .sort((a, b) => a.position - b.position);

    // Calculate how many rows we currently have
    const maxPosition = Math.max(...items.map(item => item.position));
    const totalRows = Math.floor(maxPosition / 8) + 1;

    // If we have more than 7 rows, only take items from first 7 rows
    const maxAllowedPosition = 7 * 8 - 1; // 7 rows * 8 columns - 1 (0-based)
    const limitedItems = totalRows > 7 
      ? items.filter(item => item.position <= maxAllowedPosition)
      : items;

    return {
      name: loadout.setup.name,
      items: limitedItems,
      bankTag: limitedItems.map(item => item.id),
      width: 8,
      originalFormat: loadout.originalFormat || ''
    };
  }
} 