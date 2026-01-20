import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule, MatChipGrid } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

@Component({
  selector: 'app-tag-editor',
  templateUrl: './tag-editor.component.html',
  styleUrls: ['./tag-editor.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatChipsModule,
    MatIconModule,
    MatAutocompleteModule,
    MatInputModule
  ]
})
export class TagEditorComponent {
  @Input() tags: string[] = [];
  @Input() readonly = false;
  @Input() canRemove = true;
  @Input() label = 'Tags';
  @Input() placeholder = 'Add tag...';
  @Output() tagsChange = new EventEmitter<string[]>();

  @ViewChild('tagInput') tagInput!: ElementRef<HTMLInputElement>;

  readonly separatorKeysCodes: number[] = [ENTER, COMMA];
  tagCtrl = new FormControl('');
  filteredTags$!: Observable<string[]>;

  readonly allAvailableTags = [
    'Bossing', 'Slayer', 'Wilderness', 'Minigames', 'Skilling', 'Questing',
    'ToB', 'CoX', 'ToA', 'Beginner', 'Intermediate', 'Advanced', 'Endgame',
    'AFK', 'Money-Making', 'Ironman', 'PvP'
  ];

  constructor() {
    this.filteredTags$ = this.tagCtrl.valueChanges.pipe(
      startWith(null),
      map((tag: string | null) => (tag ? this._filter(tag) : this.getAvailableTags()))
    );
  }

  addTag(tagName: string): void {
    const value = (tagName || '').trim();
    if (value && !this.tags.includes(value)) {
      const updatedTags = [...this.tags, value];
      this.tagsChange.emit(updatedTags);
    }
    this.tagCtrl.setValue('');
    if (this.tagInput) {
      this.tagInput.nativeElement.value = '';
    }
  }

  removeTag(tag: string): void {
    const updatedTags = this.tags.filter(t => t !== tag);
    this.tagsChange.emit(updatedTags);
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    this.addTag(event.option.viewValue);
    if (this.tagInput) {
      this.tagInput.nativeElement.value = '';
    }
    this.tagCtrl.setValue('');
  }

  private _filter(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.getAvailableTags().filter(tag => 
      tag.toLowerCase().includes(filterValue)
    );
  }

  private getAvailableTags(): string[] {
    return this.allAvailableTags.filter(tag => !this.tags.includes(tag));
  }
}
