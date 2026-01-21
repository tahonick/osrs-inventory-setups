import { Component, OnInit, OnDestroy, Renderer2, ViewChild } from '@angular/core';
import { MatStepper } from '@angular/material/stepper';
import { CommonModule, KeyValue } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { FormsModule } from '@angular/forms';
import { InventoryGridComponent } from '../../../inventory/components/inventory-grid/inventory-grid.component';
import { EquipmentSlotsComponent } from '../../../equipment/components/equipment-slots/equipment-slots.component';
import { RunePouchComponent } from '../../../inventory/components/rune-pouch/rune-pouch.component';
import { BankTagLayoutGridComponent } from '../../../inventory/components/bank-tag-layout-grid/bank-tag-layout-grid.component';
import { SetupDiffViewerComponent } from '../setup-diff-viewer/setup-diff-viewer.component';
import { MatRadioModule } from '@angular/material/radio';
import { OsrsApiService } from '../../../../core/services/osrs-api.service';
import { LoadoutService } from '../../../../core/services/loadout.service';
import { FirebaseService } from '../../../../core/services/firebase.service';
import { DuplicateDetectionService, DuplicateMatch } from '../../../../core/services/duplicate-detection.service';
import { ParsedSetup } from '../../../../core/services/file-parser.service';
import { LoadoutData, Setup, Category, Item } from '../../../../shared/models/inventory.model';
import { BankTagLayoutService } from '../../../../shared/services/bank-tag-layout.service';
import { BankTagLayout, BankTagLayoutItem } from '../../../../shared/models/bank-tag-layout.model';
import { firstValueFrom, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { serverTimestamp, collection, doc, Timestamp } from 'firebase/firestore';

interface LoadoutPreview {
  setup: Setup;
  layout?: (string | number)[];
  category?: Category['type'];
  tags?: string[];
  type?: 'inventory' | 'banktag' | 'banktaglayout';
  originalFormat?: string;  // Store the original format for export
}

@Component({
  selector: 'app-loadout-uploader-dialog',
  templateUrl: './loadout-uploader-dialog.component.html',
  styleUrls: ['./loadout-uploader-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatSelectModule,
    MatDividerModule,
    MatChipsModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    InventoryGridComponent,
    EquipmentSlotsComponent,
    RunePouchComponent,
    BankTagLayoutGridComponent,
    SetupDiffViewerComponent
  ]
})
export class LoadoutUploaderDialogComponent implements OnInit, OnDestroy {
  @ViewChild('stepper', { static: false }) stepper?: MatStepper;

  private jsonInputSubject = new Subject<string>();
  private subscriptions: Subscription[] = [];

  jsonForm: FormGroup;
  loadoutPreview: LoadoutPreview | null = null;
  isExpanded = false;
  imageError = false;

  readonly categories: { value: Category['type']; label: string }[] = [
    { value: 'PVM', label: 'PVM (Bossing, Slayer, Raids)' },
    { value: 'Skilling', label: 'Skilling (Non-combat)' },
    { value: 'PvP', label: 'PvP (Wilderness, PKing)' },
    { value: 'Minigames', label: 'Minigames (NMZ, Soul Wars, etc.)' },
    { value: 'Other', label: 'Other (Quests, Clues, etc.)' }
  ];

  readonly availableTags: string[] = [
    // Activity (6)
    'Bossing',
    'Slayer',
    'Skilling',
    'Questing',
    'Minigames',
    'PvP',
    // Progression (4)
    'Beginner',
    'Intermediate',
    'Advanced',
    'Endgame',
    // Utility (3)
    'AFK',
    'Money-Making',
    'Ironman'
  ];

  duplicateMatch: DuplicateMatch | null = null;
  detectingDuplicate = false;
  duplicateAction: 'skip' | 'replace' | 'keep_both' | null = null;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<LoadoutUploaderDialogComponent>,
    private snackBar: MatSnackBar,
    private osrsApi: OsrsApiService,
    private loadoutService: LoadoutService,
    private firebaseService: FirebaseService,
    private bankTagLayoutService: BankTagLayoutService,
    private duplicateDetection: DuplicateDetectionService,
    private renderer: Renderer2
  ) {
    this.jsonForm = this.fb.group({
      json: ['', Validators.required],
      category: ['PVM', Validators.required],
      tags: [[]]
    });

    // Set up debounced JSON input handling
    this.subscriptions.push(
      this.jsonInputSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(value => {
        if (value) {
          this.parseJson(value);
        } else {
          this.loadoutPreview = null;
        }
      })
    );

    // Listen to form changes
    this.subscriptions.push(
      this.jsonForm.get('json')?.valueChanges.subscribe(value => {
        this.jsonInputSubject.next(value);
      }) || new Subscription()
    );

    this.subscriptions.push(
      this.jsonForm.get('category')?.valueChanges.subscribe(category => {
        if (this.loadoutPreview) {
          this.loadoutPreview = {
            ...this.loadoutPreview,
            category
          };
        }
      }) || new Subscription()
    );

    this.subscriptions.push(
      this.jsonForm.get('tags')?.valueChanges.subscribe(tags => {
        if (this.loadoutPreview) {
          this.loadoutPreview = {
            ...this.loadoutPreview,
            tags
          };
        }
      }) || new Subscription()
    );
  }

  ngOnInit() {
    this.renderer.addClass(document.body, 'show-captcha-badge');
  }

  ngOnDestroy() {
    this.renderer.removeClass(document.body, 'show-captcha-badge');
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text) {
      this.jsonForm.patchValue({ json: text });
      this.jsonInputSubject.next(text);  // Trigger immediate parsing for paste
    }
  }

  async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      this.jsonForm.patchValue({ json: text });
      this.jsonInputSubject.next(text);  // Trigger immediate parsing for paste
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      this.snackBar.open('Failed to read from clipboard', 'Close', {
        duration: 3000
      });
    }
  }

  async parseJson(text: string) {
    try {
      // Clean the input text - remove any potential hidden characters
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid input: expected a string');
      }
      
      // Trim and normalize whitespace
      let cleanText = text.trim();
      
      // Remove any zero-width characters that might cause parsing issues
      cleanText = cleanText.replace(/[\u200B-\u200D\uFEFF]/g, '');
      
      // First, try to detect the format
      if (cleanText.startsWith('banktaglayoutsplugin:') || cleanText.startsWith('banktags,')) {
        // Validate format
        if (!this.isValidBankTagFormat(text)) {
          throw new Error('Invalid bank tag format');
        }

        // Parse as bank tag layout or bank tag
        const bankTagLayout = this.bankTagLayoutService.parseExport(cleanText);
        
        // Preserve existing category and tags if we're reparsing
        const category = this.loadoutPreview?.category || this.jsonForm.get('category')?.value || 'Minigames';
        const tags = this.loadoutPreview?.tags || this.jsonForm.get('tags')?.value || [];
        
        this.loadoutPreview = {
          setup: {
            name: bankTagLayout.name,
            inv: new Array(28).fill(null),  // Empty inventory
            eq: new Array(14).fill(null),   // Empty equipment
            afi: bankTagLayout.items.reduce((acc: Record<string, Item>, item: BankTagLayoutItem) => {
              acc[item.position.toString()] = { id: item.id, q: item.q };
              return acc;
            }, {})
          },
          type: text.startsWith('banktaglayoutsplugin:') ? 'banktaglayout' : 'banktag',
          category,
          tags,
          originalFormat: cleanText  // Store original format
        };
        return;
      }

      // Try to parse as inventory setup JSON
      let jsonData: LoadoutPreview;
      try {
        // Check if there are multiple JSON objects concatenated (common when pasting)
        // Try to find the first complete JSON object
        let jsonText = cleanText;
        
        // If we detect multiple JSON objects (looking for }{ pattern), extract just the first one
        const multipleJsonMatch = cleanText.match(/^(\{.*?\})\}\{/);
        if (multipleJsonMatch) {
          // Found concatenated JSON objects, use only the first one
          jsonText = multipleJsonMatch[1];
          console.warn('Detected multiple JSON objects concatenated. Using only the first one.');
        } else {
          // Try to find the first valid JSON object by finding where the first complete object ends
          // Look for the closing brace that matches the first opening brace
          let braceCount = 0;
          let firstJsonEnd = -1;
          for (let i = 0; i < cleanText.length; i++) {
            if (cleanText[i] === '{') {
              braceCount++;
            } else if (cleanText[i] === '}') {
              braceCount--;
              if (braceCount === 0) {
                firstJsonEnd = i + 1;
                break;
              }
            }
          }
          
          // If we found a complete JSON object and there's more content after it, extract just the first object
          if (firstJsonEnd > 0 && firstJsonEnd < cleanText.length) {
            const remainingText = cleanText.substring(firstJsonEnd).trim();
            if (remainingText.length > 0 && remainingText.startsWith('{')) {
              // There's another JSON object after this one, use only the first
              jsonText = cleanText.substring(0, firstJsonEnd);
              console.warn('Detected additional content after JSON object. Using only the first complete object.');
            }
          }
        }
        
        // Log the input for debugging (truncate if too long)
        if (jsonText.length > 200) {
          console.log('Parsing JSON (first 200 chars):', jsonText.substring(0, 200));
        } else {
          console.log('Parsing JSON:', jsonText);
        }
        
        const parsed = JSON.parse(jsonText);
        jsonData = parsed;
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Input text length:', cleanText.length);
        console.error('Input text (first 500 chars):', cleanText.substring(0, 500));
        
        // Check if it's a syntax error and provide helpful message
        if (parseError instanceof SyntaxError) {
          const errorMsg = parseError.message;
          const positionMatch = errorMsg.match(/position (\d+)/);
          if (positionMatch) {
            const position = parseInt(positionMatch[1]);
            const start = Math.max(0, position - 50);
            const end = Math.min(cleanText.length, position + 50);
            const context = cleanText.substring(start, end);
            console.error('Error context:', context);
            
            // Check if this is a "multiple JSON objects" issue
            if (context.includes('}{')) {
              throw new Error('Multiple JSON objects detected. Please paste only one JSON object at a time.');
            }
            
            throw new Error(`Invalid JSON format at position ${position}: ${errorMsg}. Context: ...${context}...`);
          }
          throw new Error(`Invalid JSON format: ${errorMsg}. Please check your JSON syntax.`);
        }
        throw new Error('Invalid JSON format. Please check your JSON syntax.');
      }

      // Validate that jsonData is an object
      if (!jsonData || typeof jsonData !== 'object') {
        throw new Error('Invalid loadout format: expected an object');
      }

      // Validate the setup structure with proper optional chaining
      if (!jsonData?.setup || typeof jsonData.setup !== 'object') {
        throw new Error('Invalid loadout format: missing or invalid "setup" object');
      }

      if (!jsonData.setup.name || typeof jsonData.setup.name !== 'string') {
        throw new Error('Invalid loadout format: missing or invalid "setup.name"');
      }

      if (!Array.isArray(jsonData.setup.inv)) {
        throw new Error('Invalid loadout format: "setup.inv" must be an array');
      }

      if (!Array.isArray(jsonData.setup.eq)) {
        throw new Error('Invalid loadout format: "setup.eq" must be an array');
      }

      // Validate array lengths
      if (jsonData.setup.inv.length !== 28) {
        throw new Error(`Invalid loadout format: inventory must have exactly 28 slots, got ${jsonData.setup.inv.length}`);
      }

      if (jsonData.setup.eq.length !== 14) {
        throw new Error(`Invalid loadout format: equipment must have exactly 14 slots, got ${jsonData.setup.eq.length}`);
      }

      // Preserve existing category and tags if we're reparsing
      const category = this.loadoutPreview?.category || this.jsonForm.get('category')?.value || 'Other';
      const tags = this.loadoutPreview?.tags || this.jsonForm.get('tags')?.value || [];

      this.loadoutPreview = {
        ...jsonData,
        type: 'inventory',
        category,
        tags
      };
    } catch (error) {
      console.error('Failed to parse input:', error);
      this.snackBar.open(
        error instanceof Error ? error.message : 'Invalid format',
        'Close',
        { duration: 3000 }
      );
      this.loadoutPreview = null;
    }
  }

  private isValidBankTagFormat(text: string): boolean {
    if (text.startsWith('banktaglayoutsplugin:')) {
      // Validate bank tag layout format
      const [layoutPart, tagPart] = text.split('banktag:');
      if (!layoutPart || !tagPart) return false;

      // Check if layout part has valid item:position pairs
      const itemStrings = layoutPart.split(',').slice(1); // Skip the name
      return itemStrings.every(str => {
        if (!str.includes(':')) return true; // Skip non-item strings
        const [idStr, posStr] = str.split(':');
        const id = parseInt(idStr);
        const pos = parseInt(posStr);
        return !isNaN(id) && !isNaN(pos) && pos >= 0;
      });
    } else if (text.startsWith('banktags,')) {
      // Validate bank tag format
      const parts = text.split(',');
      if (parts.length < 4) return false; // Need at least version, name, and one item

      // Check if all item IDs are valid numbers
      return parts.slice(3).every(idStr => {
        const id = parseInt(idStr);
        return !isNaN(id);
      });
    }
    return false;
  }

  getItemImageUrl(id: number): string {
    return this.osrsApi.getItemImageUrl(Math.abs(id));
  }

  getItemName(id: number): string {
    return this.osrsApi.getItemName(Math.abs(id));
  }

  getRunePouchSummary(): string {
    if (!this.loadoutPreview?.setup?.rp || this.loadoutPreview.setup.rp.length === 0) {
      return 'None';
    }
    
    return this.loadoutPreview.setup.rp
      .filter((rune): rune is Item => rune !== null)
      .map(rune => {
        const name = this.getItemName(rune.id);
        const qty = rune.q || 1;
        let indicator = '';
        
        if (rune.sc) {
          switch (rune.sc) {
            case 'Greater_Than':
              indicator = ' >';
              break;
            case 'Less_Than':
              indicator = ' <';
              break;
            case 'Not_Equal':
              indicator = ' ≠';
              break;
          }
        }
        
        if (rune.f) {
          indicator += '*';
        }
        
        return `${name} (${qty.toLocaleString()}${indicator})`;
      })
      .join(', ');
  }

  getAfiItems(): KeyValue<string, Item>[] {
    if (!this.loadoutPreview?.setup?.afi) return [];
    return Object.entries(this.loadoutPreview.setup.afi).map(([key, value]) => ({
      key,
      value
    }));
  }

  hasAfiItems(): boolean {
    const afi = this.loadoutPreview?.setup?.afi;
    return !!afi && Object.keys(afi).length > 0;
  }

  get bankTagLayout() {
    if (!this.loadoutPreview || !this.loadoutPreview.setup.afi) return null;
    
    return {
      name: this.loadoutPreview.setup.name,
      items: Object.entries(this.loadoutPreview.setup.afi).map(([pos, item]) => ({
        id: item.id,
        position: parseInt(pos),
        q: item.q || 1
      })),
      bankTag: Object.values(this.loadoutPreview.setup.afi).map(item => item.id),
      width: 8,
      originalFormat: this.loadoutPreview.originalFormat
    } as BankTagLayout;
  }

  async detectDuplicates(): Promise<void> {
    if (!this.loadoutPreview || this.loadoutPreview.type !== 'inventory') {
      // Only check duplicates for inventory setups - skip to configure step
      this.stepper?.next();
      return;
    }

    this.detectingDuplicate = true;
    this.duplicateMatch = null;
    this.duplicateAction = null;

    try {
      // Get existing loadouts
      const existingLoadouts = await this.firebaseService.getLoadouts({ 
        showPersonalOnly: false,
        pageSize: 1000 // Get enough to check against
      });

      // Convert layout to number[] if it exists
      const layoutAsNumbers = this.loadoutPreview.layout
        ? this.loadoutPreview.layout.map(val => typeof val === 'string' ? parseInt(val, 10) : val)
            .filter((val): val is number => typeof val === 'number' && !isNaN(val))
        : undefined;

      // Create a ParsedSetup-like object for duplicate detection
      const parsedSetup: ParsedSetup = {
        setup: this.loadoutPreview.setup,
        layout: layoutAsNumbers,
        metadata: {
          fileName: 'single-upload',
          originalFormat: this.loadoutPreview.originalFormat || '',
          suggestedCategory: this.loadoutPreview.category,
          detectedTags: this.jsonForm.get('tags')?.value || []
        },
        selected: true
      };

      // Find duplicates
      const matches = this.duplicateDetection.findDuplicates(
        [parsedSetup],
        existingLoadouts.loadouts,
        80 // 80% similarity threshold
      );

      if (matches.length > 0) {
        // Found a duplicate - show review UI
        this.duplicateMatch = matches[0]; // Take the first (highest similarity) match
        
        // Auto-set action for exact matches
        if (this.isExactMatch(this.duplicateMatch)) {
          this.duplicateAction = 'skip';
        }
        
        // Move to duplicates step
        this.stepper?.next();
      } else {
        // No duplicates - skip duplicates step and go to configure
        this.stepper?.next();
      }
    } catch (error) {
      console.error('Error detecting duplicates:', error);
      // If duplicate check fails, proceed to configure step
      this.stepper?.next();
    } finally {
      this.detectingDuplicate = false;
    }
  }

  isExactMatch(match: DuplicateMatch): boolean {
    if (match.similarityScore !== 100) {
      return false;
    }
    
    const diff = match.differences;
    
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
    
    return !hasAdded && !hasRemoved && !hasQuantityChanged && !hasFuzzy;
  }

  canProceedFromUpload(): boolean {
    return this.loadoutPreview !== null;
  }

  canProceedFromReview(): boolean {
    return this.loadoutPreview !== null;
  }

  canProceedFromDuplicates(): boolean {
    // If no duplicate match, can proceed
    if (!this.duplicateMatch) return true;
    
    // If exact match, auto-skip is set
    if (this.isExactMatch(this.duplicateMatch)) return true;
    
    // Otherwise need action selected
    return this.duplicateAction !== null;
  }

  canProceedFromConfigure(): boolean {
    return true; // Configuration is optional
  }

  async onReviewNext(): Promise<void> {
    // Move to duplicates step (which will detect duplicates)
    await this.detectDuplicates();
  }

  onDuplicatesNext(): void {
    // If duplicate is being skipped, close dialog
    if (this.duplicateMatch && this.duplicateAction === 'skip') {
      this.snackBar.open('Duplicate skipped', 'Close', { duration: 2000 });
      this.dialogRef.close(false);
      return;
    }
    
    // Otherwise proceed to configure step
    if (this.stepper) {
      this.stepper.next();
    }
  }

  async onSubmit(): Promise<void> {
    if (!this.loadoutPreview) return;
    await this.performSubmit();
  }

  async performSubmit(): Promise<void> {
    if (!this.loadoutPreview) return;

    try {
      const loadoutRef = doc(collection(this.firebaseService.getFirestore(), 'loadouts'));
      const loadoutId = loadoutRef.id;

      // Only include layout for inventory setups
      const layout = this.loadoutPreview.type === 'inventory' 
        ? this.loadoutPreview.layout?.map(val => 
            typeof val === 'string' ? parseInt(val, 10) : val
          ).filter((val): val is number => typeof val === 'number' && !isNaN(val))
        : undefined;

      const userId = await firstValueFrom(this.firebaseService.currentUser$);
      if (!userId) {
        throw new Error('Must be logged in to create a loadout');
      }

      const loadoutData: LoadoutData = {
        id: loadoutId,
        userId: userId.uid,
        setup: this.loadoutPreview.setup,
        ...(layout && { layout }), // Only include layout if it exists
        category: this.jsonForm.get('category')?.value || 'Custom',
        tags: this.jsonForm.get('tags')?.value || [],
        likes: 0,
        views: 0,
        isPublic: true,
        version: 1,
        type: this.loadoutPreview.type || 'inventory',
        createdAt: serverTimestamp() as unknown as Timestamp,
        updatedAt: serverTimestamp() as unknown as Timestamp,
        ...(this.loadoutPreview.originalFormat && { originalFormat: this.loadoutPreview.originalFormat }) // Include originalFormat if it exists
      };

      // Handle replace action
      if (this.duplicateMatch && this.duplicateAction === 'replace') {
        await this.loadoutService.replaceLoadout(this.duplicateMatch.existingSetup.id, loadoutData);
        this.snackBar.open('Loadout replaced successfully', 'Close', { duration: 2000 });
      } else {
        // Handle keep_both or no duplicate
        if (this.duplicateMatch && this.duplicateAction === 'keep_both') {
          // Rename to avoid conflict
          loadoutData.setup.name = `${loadoutData.setup.name} (imported)`;
        }
        await this.loadoutService.createLoadout(loadoutData);
        this.snackBar.open('Loadout created successfully', 'Close', { duration: 2000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Failed to save loadout:', error);
      let errorMessage = 'Failed to save loadout';
      
      if (error instanceof Error) {
        if (error.message.includes('reCAPTCHA')) {
          errorMessage = error.message;
        } else if (error.message === 'Must be logged in to create a loadout') {
          errorMessage = error.message;
        }
      }
      
      this.snackBar.open(errorMessage, 'Close', { duration: 3000 });
    }
  }

  setDuplicateAction(action: 'skip' | 'replace' | 'keep_both'): void {
    this.duplicateAction = action;
  }

  onDuplicateActionChanged(action: 'skip' | 'replace' | 'keep_both'): void {
    this.duplicateAction = action;
    if (this.duplicateMatch) {
      this.duplicateMatch.action = action;
    }
  }

  skipDuplicateStep(): void {
    // Skip duplicates step and go to configure
    if (this.stepper) {
      this.stepper.next();
    }
  }

  get currentUserId(): string | undefined {
    return this.firebaseService.getCurrentUserSync()?.uid;
  }

  copyToClipboard(): void {
    if (!this.loadoutPreview) return;

    let exportText: string;
    if (this.loadoutPreview.type === 'banktag' || this.loadoutPreview.type === 'banktaglayout') {
      // Export as bank tag layout
      const layout = this.bankTagLayout;
      if (layout) {
        exportText = this.bankTagLayoutService.exportLayout(layout);
      } else {
        throw new Error('Failed to generate bank tag layout');
      }
    } else {
      // Export as inventory setup
      const setup = {
        setup: this.loadoutPreview.setup,
        layout: this.loadoutPreview.layout
      };
      exportText = JSON.stringify(setup);
    }

    navigator.clipboard.writeText(exportText)
      .then(() => {
        this.snackBar.open('Copied to clipboard!', 'Close', {
          duration: 3000
        });
      })
      .catch(err => {
        console.error('Failed to copy:', err);
        this.snackBar.open('Failed to copy to clipboard', 'Close', {
          duration: 3000
        });
      });
  }
} 