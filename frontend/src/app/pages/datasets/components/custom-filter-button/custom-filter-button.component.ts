import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-custom-filter-button',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  template: `
    <div class="smart-filter-cta">
      <button
        type="button"
        class="filter-cta-btn"
        [class.has-filters]="hasActiveFilters"
        (click)="onClick()">

        <div class="btn-main-content">
          <div class="icon-wrapper">
            <mat-icon class="main-icon">auto_awesome</mat-icon>
            <mat-icon class="secondary-icon">tune</mat-icon>
          </div>
          
          <div class="text-content">
            <div class="primary-text">{{ 'DATASETS.FILTERS.CTA_TITLE' | translate }}</div>
          </div>
        </div>

        <div class="action-indicator">
          <mat-icon class="arrow-icon">arrow_forward</mat-icon>
        </div>

        <span
          *ngIf="hasActiveFilters && filterCount > 0"
          class="filters-badge">
          {{ filterCount }}
        </span>
      </button>
    </div>
  `,
  styleUrls: ['./custom-filter-button.component.scss']
})
export class CustomFilterButtonComponent {
  @Input() buttonText: string = 'Filter';
  @Input() hasActiveFilters: boolean = false;
  @Input() filterCount: number = 0;
  @Output() click = new EventEmitter<void>();

  onClick(): void {
    this.click.emit();
  }
}
