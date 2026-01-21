import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { trigger, transition, style, animate } from '@angular/animations';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { FileParserService, ParsedSetup, ParseError } from '../../../../core/services/file-parser.service';
import { DuplicateDetectionService, DuplicateMatch } from '../../../../core/services/duplicate-detection.service';
import { LoadoutService } from '../../../../core/services/loadout.service';
import { FirebaseService } from '../../../../core/services/firebase.service';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { LoadoutData, Category, SyncMetadata } from '../../../../shared/models/inventory.model';
import { Timestamp } from 'firebase/firestore';
import { SetupDiffViewerComponent } from '../setup-diff-viewer/setup-diff-viewer.component';
import { FilterNullPipe } from '../../../../shared/pipes/filter-null.pipe';

interface WizardState {
  currentStep: number;
  files: File[];
  parsedSetups: ParsedSetup[];
  parseErrors: ParseError[];
  duplicateMatches: DuplicateMatch[];
  currentDuplicateIndex: number;
  category: Category['type']; // 'PVM' | 'Skilling' | 'PvP' | 'Minigames'
  tags: string[];
  isPublic: boolean;
  importing: boolean;
  importResults?: {
    success: number;
    failed: number;
    skipped: number;
  };
}

@Component({
  selector: 'app-bulk-import-wizard',
  templateUrl: './bulk-import-wizard.component.html',
  styleUrls: ['./bulk-import-wizard.component.scss'],
  standalone: true,
  animations: [
    trigger('slideDown', [
      transition(':enter', [
        style({ height: '0', opacity: '0', overflow: 'hidden' }),
        animate('300ms ease-out', style({ height: '*', opacity: '1' }))
      ]),
      transition(':leave', [
        style({ height: '*', opacity: '1', overflow: 'hidden' }),
        animate('300ms ease-in', style({ height: '0', opacity: '0' }))
      ])
    ])
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatCheckboxModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    MatCardModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatDividerModule,
    MatAutocompleteModule,
    MatExpansionModule,
    MatMenuModule,
    SetupDiffViewerComponent,
    FilterNullPipe
  ]
})
export class BulkImportWizardComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  showHelp = false;
  setupSearchQuery = '';
  
  // Tag input
  tagCtrl = new FormControl('');
  filteredTags$!: Observable<string[]>;
  separatorKeysCodes: number[] = [ENTER, COMMA];
  currentEditingSetup: ParsedSetup | null = null;

  state: WizardState = {
    currentStep: 0,
    files: [],
    parsedSetups: [],
    parseErrors: [],
    duplicateMatches: [],
    currentDuplicateIndex: 0,
    category: 'PVM',
    tags: [],
    isPublic: true, // Default to public
    importing: false
  };

  readonly categories: { value: Category['type']; label: string }[] = [
    { value: 'PVM', label: 'PVM (Bossing, Slayer, Raids)' },
    { value: 'Skilling', label: 'Skilling (Non-combat)' },
    { value: 'PvP', label: 'PvP (Wilderness, PKing)' },
    { value: 'Minigames', label: 'Minigames (NMZ, Soul Wars, etc.)' },
    { value: 'Other', label: 'Other (Quests, Clues, etc.)' }
  ];

  // Core MECE tags
  readonly coreTags: string[] = [
    'Bossing', 'Slayer', 'Skilling', 'Questing', 'Minigames', 'PvP',
    'Beginner', 'Intermediate', 'Advanced', 'Endgame',
    'AFK', 'Money-Making', 'Ironman'
  ];
  
  // Common custom tags for autocomplete
  readonly commonCustomTags: string[] = [
    // Raids
    'ToB', 'CoX', 'ToA', 'Chambers', 'Theatre', 'Tombs',
    // Bosses
    'Vorkath', 'Zulrah', 'Cerberus', 'Hydra', 'Nightmare', 'Corp',
    // GWD
    'Bandos', 'Armadyl', 'Zamorak', 'Saradomin', 'Nex',
    // Wildy
    'Wilderness', 'Revs', 'Callisto', 'Venenatis', 'Vetion',
    // Slayer
    'Bloodvelds', 'Gargoyles', 'Nechryaels', 'Abyssal Demons',
    // Dragons
    'Blue Dragons', 'Mithril Dragons', 'Brutal Blacks',
    // Minigames
    'Wintertodt', 'Tempoross', 'GOTR', 'Sepulchre', 'Gauntlet',
    // Skills
    'Runecraft', 'Mining', 'Agility', 'Thieving',
    // Other
    'Clues', 'Barrows'
  ];
  
  // Combined list for autocomplete
  get allAvailableTags(): string[] {
    return [...this.coreTags, ...this.commonCustomTags].sort();
  }

  parsing = false;
  detectingDuplicates = false;
  existingLoadouts: LoadoutData[] = [];
  currentUserId: string | undefined;
  duplicateFilter: 'all' | 'exact' | 'fuzzy' | 'quantity' | 'variants' = 'all';

  onDuplicateFilterChange(): void {
    // Reset to first match when filter changes
    this.state.currentDuplicateIndex = 0;
  }

  getFilterLabel(): string {
    switch (this.duplicateFilter) {
      case 'all':
        return `All Matches (${this.nonExactMatches.length})`;
      case 'fuzzy':
        return 'Fuzzy Matches';
      case 'quantity':
        return 'Quantity Differences';
      case 'variants':
        return 'Item Variants';
      default:
        return 'Filter';
    }
  }

  constructor(
    private dialogRef: MatDialogRef<BulkImportWizardComponent>,
    private fileParser: FileParserService,
    private duplicateDetector: DuplicateDetectionService,
    private loadoutService: LoadoutService,
    private firebaseService: FirebaseService,
    private osrsApi: OsrsApiService,
    private snackBar: MatSnackBar
  ) {
    // Setup tag autocomplete
    this.filteredTags$ = this.tagCtrl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTags(value || ''))
    );
  }
  
  private _filterTags(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.allAvailableTags.filter(tag => 
      tag.toLowerCase().includes(filterValue)
    );
  }

  async ngOnInit() {
    // Get current user ID for ownership checks
    try {
      const userId = await this.firebaseService.getCurrentUserId();
      this.currentUserId = userId || undefined;
    } catch (error) {
      console.error('Error getting current user:', error);
    }
    
    // Load user's existing loadouts for duplicate detection
    try {
      const result = await this.firebaseService.getLoadouts({ showPersonalOnly: true });
      this.existingLoadouts = result.loadouts;
    } catch (error) {
      console.error('Error loading existing loadouts:', error);
    }
  }

  // ===== STEP 1: UPLOAD =====

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer?.files;
    if (files) {
      this.handleFiles(Array.from(files));
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(Array.from(input.files));
    }
  }

  async handleFiles(files: File[]): Promise<void> {
    this.parsing = true;
    this.state.files = files;

    try {
      const result = await this.fileParser.parseFiles(files);
      this.state.parsedSetups = result.setups;
      this.state.parseErrors = result.errors;

      if (result.setups.length > 0) {
        this.snackBar.open(
          `Successfully parsed ${result.setups.length} setup${result.setups.length > 1 ? 's' : ''}`,
          'Close',
          { duration: 3000 }
        );
      }

      if (result.errors.length > 0) {
        this.snackBar.open(
          `${result.errors.length} error${result.errors.length > 1 ? 's' : ''} occurred during parsing`,
          'View Errors',
          { duration: 5000 }
        );
      }
    } catch (error) {
      console.error('Error parsing files:', error);
      this.snackBar.open('Failed to parse files', 'Close', { duration: 3000 });
    } finally {
      this.parsing = false;
    }
  }

  removeFile(index: number): void {
    this.state.files.splice(index, 1);
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  canProceedFromUpload(): boolean {
    return this.state.parsedSetups.length > 0 && !this.parsing;
  }

  // ===== STEP 2: REVIEW =====

  toggleSetupSelection(setup: ParsedSetup): void {
    setup.selected = !setup.selected;
  }

  toggleAllSetups(): void {
    const allSelected = this.state.parsedSetups.every(s => s.selected);
    this.state.parsedSetups.forEach(s => s.selected = !allSelected);
  }

  get selectedCount(): number {
    return this.state.parsedSetups.filter(s => s.selected).length;
  }

  get filteredSetups(): ParsedSetup[] {
    if (!this.setupSearchQuery.trim()) {
      return this.state.parsedSetups;
    }
    const query = this.setupSearchQuery.toLowerCase();
    return this.state.parsedSetups.filter(setup =>
      setup.setup.name.toLowerCase().includes(query) ||
      (setup.setup.notes && setup.setup.notes.toLowerCase().includes(query))
    );
  }

  removeSetup(index: number): void {
    this.state.parsedSetups.splice(index, 1);
  }

  openCategoryEditor(setup: ParsedSetup, event: Event): void {
    event.stopPropagation();
    // Toggle editing state for this setup
    setup.metadata.editing = !setup.metadata.editing;
  }

  updateCategory(setup: ParsedSetup, newCategory: Category['type']): void {
    setup.metadata.suggestedCategory = newCategory;
    this.snackBar.open(`Category updated to ${newCategory}`, '', { duration: 2000 });
  }

  toggleTag(setup: ParsedSetup, tag: string): void {
    if (!setup.metadata.detectedTags) {
      setup.metadata.detectedTags = [];
    }
    
    const index = setup.metadata.detectedTags.indexOf(tag);
    if (index > -1) {
      setup.metadata.detectedTags.splice(index, 1);
    } else {
      setup.metadata.detectedTags.push(tag);
    }
    
    this.snackBar.open(`Tags updated`, '', { duration: 1500 });
  }

  hasTag(setup: ParsedSetup, tag: string): boolean {
    return setup.metadata.detectedTags?.includes(tag) || false;
  }
  
  addTag(setup: ParsedSetup, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    
    if (value) {
      if (!setup.metadata.detectedTags) {
        setup.metadata.detectedTags = [];
      }
      
      // Add tag if it doesn't exist
      if (!setup.metadata.detectedTags.includes(value)) {
        setup.metadata.detectedTags.push(value);
      }
    }
    
    // Clear the input
    event.chipInput!.clear();
    this.tagCtrl.setValue('');
  }
  
  removeTag(setup: ParsedSetup, tag: string): void {
    if (!setup.metadata.detectedTags) return;
    
    const index = setup.metadata.detectedTags.indexOf(tag);
    if (index >= 0) {
      setup.metadata.detectedTags.splice(index, 1);
    }
  }
  
  selectedTag(setup: ParsedSetup, event: MatAutocompleteSelectedEvent): void {
    const value = event.option.viewValue;
    
    if (!setup.metadata.detectedTags) {
      setup.metadata.detectedTags = [];
    }
    
    // Add tag if it doesn't exist
    if (!setup.metadata.detectedTags.includes(value)) {
      setup.metadata.detectedTags.push(value);
    }
    
    // Clear the input
    this.tagCtrl.setValue('');
  }

  canProceedFromReview(): boolean {
    return this.selectedCount > 0;
  }

  // ===== STEP 3: DUPLICATES =====

  async detectDuplicates(): Promise<void> {
    this.detectingDuplicates = true;

    try {
      const selectedSetups = this.state.parsedSetups.filter(s => s.selected);
      
      this.state.duplicateMatches = this.duplicateDetector.findDuplicates(
        selectedSetups,
        this.existingLoadouts,
        80 // 80% threshold
      );

      // Auto-set exact matches to 'skip'
      this.state.duplicateMatches.forEach(match => {
        if (this.isExactMatch(match)) {
          match.action = 'skip';
        }
      });

      const exactCount = this.exactMatches.length;
      const nonExactCount = this.nonExactMatches.length;

      if (this.state.duplicateMatches.length === 0) {
        this.snackBar.open('No duplicates found!', 'Close', { duration: 3000 });
      } else {
        let message = `Found ${this.state.duplicateMatches.length} potential duplicate${this.state.duplicateMatches.length > 1 ? 's' : ''}`;
        if (exactCount > 0) {
          message += ` (${exactCount} exact match${exactCount > 1 ? 'es' : ''} will be auto-skipped)`;
        }
        this.snackBar.open(message, 'Close', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error detecting duplicates:', error);
      this.snackBar.open('Error detecting duplicates', 'Close', { duration: 3000 });
    } finally {
      this.detectingDuplicates = false;
    }
  }

  get currentDuplicateMatch(): DuplicateMatch | null {
    const filtered = this.getFilteredDuplicates();
    // Ensure index is within bounds
    if (this.state.currentDuplicateIndex >= filtered.length) {
      this.state.currentDuplicateIndex = Math.max(0, filtered.length - 1);
    }
    return filtered[this.state.currentDuplicateIndex] || null;
  }

  /**
   * Check if a duplicate match is 100% exact (identical in all ways)
   */
  isExactMatch(match: DuplicateMatch): boolean {
    // Must be 100% similar
    if (match.similarityScore !== 100) {
      return false;
    }
    
    const diff = match.differences;
    
    // Check that there are no differences at all
    const hasAdded = (diff.inventoryDiff.added.length + 
                      diff.equipmentDiff.added.length + 
                      (diff.runePouchDiff?.added.length || 0) +
                      (diff.afiDiff?.added.length || 0)) > 0;
    
    const hasRemoved = (diff.inventoryDiff.removed.length + 
                        diff.equipmentDiff.removed.length + 
                        (diff.runePouchDiff?.removed.length || 0) +
                        (diff.afiDiff?.removed.length || 0)) > 0;
    
    const hasQuantityChanged = (diff.inventoryDiff.quantityChanged.length +
                                diff.equipmentDiff.quantityChanged.length +
                                (diff.runePouchDiff?.quantityChanged.length || 0) +
                                (diff.afiDiff?.quantityChanged.length || 0)) > 0;
    
    const hasFuzzy = (diff.equipmentDiff.fuzzyMatch?.length || 0) > 0 ||
                     (diff.runePouchDiff?.fuzzyMatch?.length || 0) > 0;
    
    // Exact match means no differences at all
    return !hasAdded && !hasRemoved && !hasQuantityChanged && !hasFuzzy;
  }

  /**
   * Get exact matches (100% identical, will be auto-skipped)
   */
  get exactMatches(): DuplicateMatch[] {
    return this.state.duplicateMatches.filter(match => this.isExactMatch(match));
  }

  /**
   * Get non-exact matches (need user review)
   */
  get nonExactMatches(): DuplicateMatch[] {
    return this.state.duplicateMatches.filter(match => !this.isExactMatch(match));
  }

  getFilteredDuplicates(): DuplicateMatch[] {
    // Filter only applies to non-exact matches
    const matchesToFilter = this.nonExactMatches;
    
    if (this.duplicateFilter === 'all') {
      return matchesToFilter;
    }

    return matchesToFilter.filter(match => {
      const diff = match.differences;
      
      switch (this.duplicateFilter) {
        case 'exact':
          // This shouldn't happen since exact matches are filtered out, but handle it
          return this.isExactMatch(match);
        case 'fuzzy':
          // Has fuzzy matches (variant differences)
          return (diff.equipmentDiff.fuzzyMatch?.length || 0) > 0 ||
                 (diff.runePouchDiff?.fuzzyMatch?.length || 0) > 0;
        case 'quantity':
          // Has quantity differences
          return (diff.inventoryDiff.quantityChanged.length +
                  diff.equipmentDiff.quantityChanged.length +
                  (diff.runePouchDiff?.quantityChanged.length || 0)) > 0;
        case 'variants':
          // Has item variants (negative IDs) or fuzzy matches
          return (diff.equipmentDiff.fuzzyMatch?.length || 0) > 0 ||
                 (diff.runePouchDiff?.fuzzyMatch?.length || 0) > 0;
        default:
          return true;
      }
    });
  }

  get filteredDuplicateCount(): number {
    return this.getFilteredDuplicates().length;
  }

  nextDuplicate(): void {
    const filtered = this.getFilteredDuplicates();
    if (this.state.currentDuplicateIndex < filtered.length - 1) {
      this.state.currentDuplicateIndex++;
    }
  }

  previousDuplicate(): void {
    if (this.state.currentDuplicateIndex > 0) {
      this.state.currentDuplicateIndex--;
    }
  }

  applyActionToAll(action: 'skip' | 'replace' | 'keep_both'): void {
    this.state.duplicateMatches.forEach(match => {
      match.action = action;
    });
    this.snackBar.open(`Applied "${action}" to all duplicates`, 'Close', { duration: 2000 });
  }

  canProceedFromDuplicates(): boolean {
    // All non-exact duplicates must have an action selected
    // Exact matches are auto-set to 'skip', so we only need to check non-exact matches
    return this.nonExactMatches.every(match => match.action !== undefined);
  }

  skipDuplicateDetection(): void {
    this.state.currentStep++;
  }

  // ===== STEP 4: CONFIGURE =====

  canProceedFromConfigure(): boolean {
    return true; // Configuration is optional
  }

  // ===== STEP 5: CONFIRM & IMPORT =====

  get finalSetupCount(): number {
    const selected = this.state.parsedSetups.filter(s => s.selected);
    // Only count skipped duplicates that are actually in the selected list
    const skippedDuplicates = this.state.duplicateMatches.filter(
      m => m.action === 'skip' && selected.includes(m.newSetup)
    );
    return selected.length - skippedDuplicates.length;
  }

  get replacingCount(): number {
    return this.state.duplicateMatches.filter(m => m.action === 'replace').length;
  }

  get skippingCount(): number {
    return this.state.duplicateMatches.filter(m => m.action === 'skip').length;
  }

  async performImport(): Promise<void> {
    this.state.importing = true;

    try {
      const batchId = `batch_${Date.now()}`;
      const loadoutsToImport: LoadoutData[] = [];
      const loadoutsToReplace: Array<{ existingId: string; newLoadout: LoadoutData }> = [];

      // Process selected setups
      const selectedSetups = this.state.parsedSetups.filter(s => s.selected);

      for (const setup of selectedSetups) {
        // Check if this setup has a duplicate match
        const duplicateMatch = this.state.duplicateMatches.find(
          m => m.newSetup === setup
        );

        if (duplicateMatch) {
          if (duplicateMatch.action === 'skip') {
            continue; // Skip this setup
          } else if (duplicateMatch.action === 'replace') {
            // Add to replace list
            loadoutsToReplace.push({
              existingId: duplicateMatch.existingSetup.id,
              newLoadout: this.createLoadoutData(setup, batchId)
            });
            continue;
          } else if (duplicateMatch.action === 'keep_both') {
            // Rename to avoid conflict
            setup.setup.name = `${setup.setup.name} (imported)`;
          }
        }

        // Add to import list
        loadoutsToImport.push(this.createLoadoutData(setup, batchId));
      }

      // Perform bulk create
      let successCount = 0;
      let failedCount = 0;

      if (loadoutsToImport.length > 0) {
        const result = await this.loadoutService.bulkCreateLoadouts(loadoutsToImport, batchId);
        successCount += result.success.length;
        failedCount += result.failed.length;
      }

      // Perform replacements
      for (const { existingId, newLoadout } of loadoutsToReplace) {
        try {
          await this.loadoutService.replaceLoadout(existingId, newLoadout);
          successCount++;
        } catch (error) {
          console.error('Error replacing loadout:', error);
          failedCount++;
        }
      }

      const skippedCount = this.state.duplicateMatches.filter(m => m.action === 'skip').length;

      this.state.importResults = {
        success: successCount,
        failed: failedCount,
        skipped: skippedCount
      };

      this.snackBar.open(
        `Import complete! ${successCount} imported, ${skippedCount} skipped`,
        'Close',
        { duration: 5000 }
      );

    } catch (error) {
      console.error('Error during import:', error);
      this.snackBar.open('Error during import', 'Close', { duration: 3000 });
    } finally {
      this.state.importing = false;
    }
  }

  private createLoadoutData(setup: ParsedSetup, batchId: string): LoadoutData {
    const syncMetadata: SyncMetadata = {
      source: 'bulk_import',
      importDate: Timestamp.now(),
      originalFileName: setup.metadata.fileName,
      batchId
    };

    const loadoutData: any = {
      id: '', // Will be set by service
      userId: '', // Will be set by service
      setup: setup.setup,
      category: setup.metadata.suggestedCategory || 'Minigames', // Use individual setup's detected category
      tags: setup.metadata.detectedTags || [], // Use individual setup's detected tags
      likes: 0,
      views: 0,
      isPublic: this.state.isPublic,
      version: 1,
      type: 'inventory',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      originalFormat: setup.metadata.originalFormat,
      syncMetadata
    };

    // Only include layout if it exists (Firestore doesn't accept undefined)
    if (setup.layout) {
      loadoutData.layout = setup.layout;
    }

    return loadoutData as LoadoutData;
  }

  finishImport(): void {
    this.dialogRef.close(this.state.importResults);
  }

  // ===== UTILITIES =====

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(Math.abs(id));
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(Math.abs(id));
  }

  copyToClipboard(text: string): void {
    // Copy the path as-is - Windows Run dialog handles environment variables
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Copied to clipboard!', 'Close', { duration: 2000 });
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.snackBar.open('Failed to copy to clipboard', 'Close', { duration: 2000 });
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
