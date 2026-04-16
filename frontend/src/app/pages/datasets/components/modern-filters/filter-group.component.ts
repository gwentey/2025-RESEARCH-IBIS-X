import { Component, Input, Output, EventEmitter, OnInit, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { TranslateModule } from '@ngx-translate/core';

import { DatasetService } from '../../../../services/dataset.service';

export interface FilterGroupConfig {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  expanded: boolean;
  fields: string[];
}

/**
 * Composant moderne pour un groupe de filtres - Style SaaS épuré
 */
@Component({
  selector: 'app-filter-group',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    TranslateModule
  ],
  templateUrl: './filter-group.component.html',
  styleUrls: ['./filter-group.component.scss']
})
export class FilterGroupComponent implements OnInit, AfterViewInit {
  @Input() groupConfig!: FilterGroupConfig;
  @Input() formGroup!: FormGroup;
  @Input() expanded: boolean = true; // Expanded par défaut pour visibilité immédiate
  @Input() hasActiveFilters: boolean = false;

  @Output() toggleExpansion = new EventEmitter<void>();
  @Output() resetGroup = new EventEmitter<void>();

  // Références DOM pour le double range slider
  @ViewChild('rangeTrack') rangeTrack!: ElementRef<HTMLDivElement>;
  @ViewChild('minRangeInput') minRangeInput!: ElementRef<HTMLInputElement>;
  @ViewChild('maxRangeInput') maxRangeInput!: ElementRef<HTMLInputElement>;

  private datasetService = inject(DatasetService);

  // État du slider actuel
  activeSlider: 'min' | 'max' | null = null;

  // Données pour les sélecteurs - avec fallback immédiat
  availableDomains: string[] = [
    'Santé', 'Finance', 'Éducation', 'Transport', 'Commerce',
    'Technologie', 'Agriculture', 'Énergie', 'Recherche', 'Social'
  ];

  availableTasks: string[] = [
    'Classification', 'Régression', 'Clustering', 'Réduction de dimension',
    'Détection d\'anomalies', 'Traitement du langage naturel', 'Vision par ordinateur'
  ];

  // Ranges pour les sliders et inputs numériques
  instancesRange = { min: 0, max: 1000000, step: 1000 };
  featuresRange = { min: 0, max: 1000, step: 1 };
  yearRange = { min: 1900, max: new Date().getFullYear(), step: 1 };

  // Slider vanilla configuré pour éviter les conflits de pointer-events

  ngOnInit(): void {
    this.loadFilterOptions();
  }

  ngAfterViewInit(): void {
    // Initialiser le slider après que la vue soit prête
    setTimeout(() => {
      this.syncInputValues();
      this.updateSliderConstraints();
      this.updateRangeTrack();
    }, 100);
  }

  /**
   * Charge les options depuis l'API (avec fallback)
   */
  private loadFilterOptions(): void {
    this.datasetService.getAvailableDomains().subscribe({
      next: (domains) => {
        if (domains && domains.length > 0) {
          this.availableDomains = domains;
        }
      },
      error: (error) => {
        console.log('Utilisation des domaines par défaut:', error);
        // Garde les valeurs par défaut
      }
    });

    this.datasetService.getAvailableTasks().subscribe({
      next: (tasks) => {
        if (tasks && tasks.length > 0) {
          this.availableTasks = tasks;
        }
      },
      error: (error) => {
        console.log('Utilisation des tâches par défaut:', error);
        // Garde les valeurs par défaut
      }
    });
  }

  /**
   * Toggle l'expansion du groupe
   */
  onToggleExpansion(): void {
    this.toggleExpansion.emit();
  }

  /**
   * Reset les filtres de ce groupe
   */
  onResetGroup(): void {
    this.resetGroup.emit();
  }

  // ===============================================
  // MÉTHODES POUR LES DOMAINES
  // ===============================================

  isDomainSelected(domain: string): boolean {
    const domainControl = this.formGroup.get('domain');
    const selectedDomains = domainControl?.value || [];
    return selectedDomains.includes(domain);
  }

  toggleDomain(domain: string): void {
    const domainControl = this.formGroup.get('domain');
    if (!domainControl) return;

    const currentDomains = domainControl.value || [];
    const isSelected = currentDomains.includes(domain);

    if (isSelected) {
      const updatedDomains = currentDomains.filter((d: string) => d !== domain);
      domainControl.setValue(updatedDomains);
    } else {
      const updatedDomains = [...currentDomains, domain];
      domainControl.setValue(updatedDomains);
    }
  }

  getDomainIcon(domain: string): string {
    const iconMap: { [key: string]: string } = {
      'Santé': 'medical_services',
      'Finance': 'attach_money',
      'Éducation': 'school',
      'Transport': 'directions_car',
      'Commerce': 'shopping_cart',
      'Technologie': 'computer',
      'Agriculture': 'eco',
      'Énergie': 'flash_on',
      'Recherche': 'science',
      'Social': 'people'
    };
    return iconMap[domain] || 'category';
  }

  // ===============================================
  // MÉTHODES POUR LES TÂCHES
  // ===============================================

  getTaskIcon(task: string): string {
    const iconMap: { [key: string]: string } = {
      'Classification': 'category',
      'Régression': 'trending_up',
      'Clustering': 'scatter_plot',
      'Réduction de dimension': 'compress',
      'Détection d\'anomalies': 'warning',
      'Traitement du langage naturel': 'translate',
      'Vision par ordinateur': 'visibility'
    };
    return iconMap[task] || 'psychology';
  }

  // ===============================================
  // MÉTHODES POUR LES CRITÈRES DE QUALITÉ
  // ===============================================

  /**
   * Vérifie si un critère de qualité est sélectionné
   */
  isQualityCriterionSelected(criterion: string): boolean {
    const control = this.formGroup.get(criterion);
    return control ? control.value === true : false;
  }

  /**
   * Toggle la sélection d'un critère de qualité
   */
  toggleQualityCriterion(criterion: string): void {
    const control = this.formGroup.get(criterion);
    if (control) {
      control.setValue(!control.value);
    }
  }

  // ===============================================
  // DOUBLE RANGE SLIDER VANILLA - SOLUTION DÉFINITIVE
  // ===============================================

  /**
   * Obtient la valeur minimum pour les instances
   */
  getInstancesMin(): number {
    return this.formGroup.get('instances_number_min')?.value || this.instancesRange.min;
  }

  /**
   * Obtient la valeur maximum pour les instances
   */
  getInstancesMax(): number {
    return this.formGroup.get('instances_number_max')?.value || this.instancesRange.max;
  }

  /**
   * Obtient la limite maximale dynamique pour le slider minimum
   * EMPÊCHE PHYSIQUEMENT le min de dépasser le max actuel
   */
  getDynamicMaxForMin(): number {
    const currentMax = this.getInstancesMax();
    return Math.min(currentMax, this.instancesRange.max);
  }

  /**
   * Obtient la limite minimale dynamique pour le slider maximum  
   * EMPÊCHE PHYSIQUEMENT le max de passer sous le min actuel
   */
  getDynamicMinForMax(): number {
    const currentMin = this.getInstancesMin();
    return Math.max(currentMin, this.instancesRange.min);
  }

  /**
   * Gère les changements des sliders avec contraintes en temps réel
   */
  onRangeInput(type: 'min' | 'max', event: any): void {
    const value = parseInt(event.target.value);
    
    console.log(`🎚️ SLIDER ${type.toUpperCase()} - Valeur appliquée:`, value);

    // Appliquer la valeur directement (les contraintes [min]/[max] empêchent le dépassement)
    if (type === 'min') {
      this.formGroup.get('instances_number_min')?.setValue(value);
      // Mettre à jour la limite min du slider max
      this.updateSliderConstraints();
    } else {
      this.formGroup.get('instances_number_max')?.setValue(value);
      // Mettre à jour la limite max du slider min
      this.updateSliderConstraints();
    }

    // Mettre à jour la track visuelle
    this.updateRangeTrack();
  }

  /**
   * Met à jour les contraintes dynamiques des sliders
   */
  updateSliderConstraints(): void {
    if (this.minRangeInput && this.maxRangeInput) {
      // Mettre à jour les attributs min/max des inputs HTML
      this.minRangeInput.nativeElement.max = this.getDynamicMaxForMin().toString();
      this.maxRangeInput.nativeElement.min = this.getDynamicMinForMax().toString();
    }
  }

  /**
   * Met à jour la track visuelle entre les deux poignées
   */
  updateRangeTrack(): void {
    if (!this.rangeTrack) return;

    const minVal = this.getInstancesMin();
    const maxVal = this.getInstancesMax();
    const min = this.instancesRange.min;
    const max = this.instancesRange.max;

    const leftPercent = ((minVal - min) / (max - min)) * 100;
    const rightPercent = ((maxVal - min) / (max - min)) * 100;

    const trackElement = this.rangeTrack.nativeElement;
    trackElement.style.left = leftPercent + '%';
    trackElement.style.width = (rightPercent - leftPercent) + '%';
  }

  /**
   * Gère l'effet visuel lors du mousedown
   */
  onSliderMouseDown(type: 'min' | 'max'): void {
    this.activeSlider = type;
    console.log(`🎯 ACTIVATION du slider ${type.toUpperCase()}`);
    
    const input = type === 'min' ? this.minRangeInput?.nativeElement : this.maxRangeInput?.nativeElement;
    if (input) {
      input.style.transform = 'scale(1.1)';
      input.style.filter = 'brightness(1.1)';
    }
  }

  /**
   * Retire les effets visuels lors du mouseup
   */
  onSliderMouseUp(): void {
    this.activeSlider = null;
    
    // Retirer les effets sur les deux sliders
    [this.minRangeInput?.nativeElement, this.maxRangeInput?.nativeElement].forEach(input => {
      if (input) {
        input.style.transform = '';
        input.style.filter = '';
      }
    });
  }

  /**
   * Synchronise les valeurs des inputs HTML avec le formulaire
   */
  syncInputValues(): void {
    if (this.minRangeInput && this.maxRangeInput) {
      this.minRangeInput.nativeElement.value = this.getInstancesMin().toString();
      this.maxRangeInput.nativeElement.value = this.getInstancesMax().toString();
    }
  }

  /**
   * Définit des valeurs prédéfinies (pour usage futur)
   */
  setInstancesRange(min: number, max: number): void {
    this.formGroup.get('instances_number_min')?.setValue(min);
    this.formGroup.get('instances_number_max')?.setValue(max);
    this.syncInputValues();
    this.updateSliderConstraints();
    this.updateRangeTrack();
  }

  // ===============================================
  // MÉTHODES POUR LES FEATURES
  // ===============================================

  getFeaturesMin(): number {
    return this.formGroup.get('features_number_min')?.value || this.featuresRange.min;
  }

  getFeaturesMax(): number {
    return this.formGroup.get('features_number_max')?.value || this.featuresRange.max;
  }

  onFeaturesMinChange(event: any): void {
    const value = parseInt(event.target.value);
    if (isNaN(value)) return;
    
    const currentMax = this.getFeaturesMax();
    
    // Toujours appliquer la nouvelle valeur min
    this.formGroup.get('features_number_min')?.setValue(value);
    
    // Si le nouveau min est supérieur au max actuel, ajuster le max
    if (value > currentMax) {
      this.formGroup.get('features_number_max')?.setValue(value);
    }
  }

  onFeaturesMaxChange(event: any): void {
    const value = parseInt(event.target.value);
    if (isNaN(value)) return;
    
    const currentMin = this.getFeaturesMin();
    
    // Toujours appliquer la nouvelle valeur max
    this.formGroup.get('features_number_max')?.setValue(value);
    
    // Si le nouveau max est inférieur au min actuel, ajuster le min
    if (value < currentMin) {
      this.formGroup.get('features_number_min')?.setValue(value);
    }
  }

  // ===============================================
  // MÉTHODES POUR LES ANNÉES
  // ===============================================

  getYearMin(): number {
    return this.formGroup.get('year_min')?.value || this.yearRange.min;
  }

  getYearMax(): number {
    return this.formGroup.get('year_max')?.value || this.yearRange.max;
  }

  onYearMinChange(event: any): void {
    const value = parseInt(event.target.value);
    if (isNaN(value)) return;
    
    const currentMax = this.getYearMax();
    
    // Toujours appliquer la nouvelle valeur min
    this.formGroup.get('year_min')?.setValue(value);
    
    // Si le nouveau min est supérieur au max actuel, ajuster le max
    if (value > currentMax) {
      this.formGroup.get('year_max')?.setValue(value);
    }
  }

  onYearMaxChange(event: any): void {
    const value = parseInt(event.target.value);
    if (isNaN(value)) return;
    
    const currentMin = this.getYearMin();
    
    // Toujours appliquer la nouvelle valeur max
    this.formGroup.get('year_max')?.setValue(value);
    
    // Si le nouveau max est inférieur au min actuel, ajuster le min
    if (value < currentMin) {
      this.formGroup.get('year_min')?.setValue(value);
    }
  }
}
