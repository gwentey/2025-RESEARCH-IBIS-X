import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ProjectService } from '../../services/project.service';
import { DatasetService } from '../../services/dataset.service';
import { Project, ProjectCreate, ProjectUpdate, CriterionWeight } from '../../models/project.models';
import { DatasetFilterCriteria, DatasetScored } from '../../models/dataset.models';
import { RecommendationHeatmapComponent } from './components/recommendation-heatmap.component';

@Component({
  selector: 'app-project-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSliderModule,
    MatDividerModule,
    MatChipsModule,
    MatSelectModule,
    MatCheckboxModule,
    RecommendationHeatmapComponent,
    TranslateModule
  ],
  templateUrl: './project-form.component.html',
  styles: [`
    .full-height-content {
      height: 320px;
      display: flex;
      flex-direction: column;
    }

    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
    }

    .empty-icon {
      font-size: 48px !important;
      width: 48px !important;
      height: 48px !important;
      color: #bbb;
      margin-bottom: 12px;
    }

    .rankings-list {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-evenly;
      padding: 20px 0;
    }

    .ranking-item {
      display: flex;
      align-items: center;
      padding: 16px 12px;
      border-radius: 8px;
      background: #f8f9fa;
      margin-bottom: 12px;
      transition: all 0.2s ease;
    }

    .ranking-item:hover {
      background: #e9ecef;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .ranking-item:last-child {
      margin-bottom: 0;
    }

    .ranking-badge {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: white;
      font-size: 14px;
      margin-right: 12px;
      flex-shrink: 0;
    }

    .badge-1 {
      background: linear-gradient(135deg, #FFD700, #FFA500);
      box-shadow: 0 2px 4px rgba(255, 165, 0, 0.3);
    }

    .badge-2 {
      background: linear-gradient(135deg, #C0C0C0, #A9A9A9);
      box-shadow: 0 2px 4px rgba(169, 169, 169, 0.3);
    }

    .badge-3 {
      background: linear-gradient(135deg, #CD7F32, #B8860B);
      box-shadow: 0 2px 4px rgba(184, 134, 11, 0.3);
    }

    .dataset-info {
      flex: 1;
      min-width: 0;
    }

    .dataset-name {
      font-weight: 600;
      font-size: 14px;
      margin: 0 0 4px 0;
      color: #2c3e50;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dataset-meta {
      font-size: 12px;
      color: #6c757d;
      margin: 0;
    }

    .score-display {
      margin-left: 12px;
      flex-shrink: 0;
    }

    .score-value {
      font-weight: 700;
      font-size: 16px;
    }

    /* === FORCE BRUTALE TEXTE BLANC CHIPS - ULTRA AGRESSIF === */

    // === DESIGN MODERNE CRITÈRES DE SÉLECTION - INSPIRÉ LINEAR/STRIPE ===
    // Utilise des design tokens similaires aux filtres modernes existants
    
    :host ::ng-deep {
      /* === OVERRIDE ULTRA BRUTAL POUR CHIPS BLANCS === */
      .active-criteria-chips {
        
        /* 1. Fond et base des chips */
        .mat-mdc-chip,
        mat-chip,
        .mat-chip,
        .mdc-evolution-chip {
          background: #1976d2 !important;
          background-color: #1976d2 !important;
          color: #ffffff !important;
          border: 1px solid #1565c0 !important;
          
          /* Force sur tous les éléments enfants */
          * {
            color: #ffffff !important;
          }
          
          /* 2. Actions et conteneurs */
          .mdc-evolution-chip__action,
          .mat-mdc-chip-action,
          .mdc-evolution-chip__action--primary,
          .mdc-evolution-chip__action--presentational,
          .mdc-evolution-chip__cell,
          .mdc-evolution-chip__cell--primary {
            color: #ffffff !important;
            background: transparent !important;
            
            /* Force encore sur les enfants */
            * {
              color: #ffffff !important;
            }
          }
          
          /* 3. Texte - TOUS les sélecteurs possibles */
          .mdc-evolution-chip__text-label,
          .mat-mdc-chip-action-label,
          span,
          [class*="text"],
          [class*="label"] {
            color: #ffffff !important;
            
            /* Et leurs enfants aussi */
            * {
              color: #ffffff !important;
            }
          }
          
          /* 4. États hover et focus */
          &:hover,
          &:focus,
          &:active {
            background: #1565c0 !important;
            background-color: #1565c0 !important;
            color: #ffffff !important;
            
            /* Force sur tous les enfants au hover */
            *,
            .mdc-evolution-chip__text-label,
            .mat-mdc-chip-action-label,
            span {
              color: #ffffff !important;
            }
          }
        }
        
        /* 5. Ciblage ultra-spécifique mat-primary */
        .mat-mdc-chip.mat-primary,
        mat-chip.mat-primary {
          background: #1976d2 !important;
          color: #ffffff !important;
          
          /* Tous les enfants en blanc */
          *,
          span,
          .mdc-evolution-chip__text-label,
          .mat-mdc-chip-action-label {
            color: #ffffff !important;
          }
        }
        
        /* 6. Fallback ultra-brutal - si rien ne marche */
        * {
          color: #ffffff !important;
        }
        
        span {
          color: #ffffff !important;
        }
        
        [class*="mdc"] {
          color: #ffffff !important;
        }
        
        [class*="mat"] {
          color: #ffffff !important;
        }
      }
      // Container principal des critères
      .criteria-selection-modern {
        // Variables CSS pour cohérence
        --criteria-primary: #242e54; // Bleu Sorbonne
        --criteria-accent: #4ecdc4; // Teal moderne
        --criteria-bg-glass: rgba(255, 255, 255, 0.85);
        --criteria-bg-section: rgba(248, 250, 252, 0.95);
        --criteria-border-light: #e2e8f0;
        --criteria-border-focus: #242e54;
        --criteria-shadow-subtle: 0 1px 3px rgba(0, 0, 0, 0.04);
        --criteria-shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.08);
        --criteria-shadow-focus: 0 0 0 3px rgba(78, 205, 196, 0.15);
        --criteria-radius-lg: 16px;
        --criteria-radius-md: 12px;
        --criteria-space-lg: 24px;
        --criteria-space-md: 16px;
        --criteria-space-sm: 12px;
        
        // Container des critères modernisé
        .mat-mdc-card {
          background: var(--criteria-bg-glass) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          border: 1px solid var(--criteria-border-light) !important;
          border-radius: var(--criteria-radius-lg) !important;
          box-shadow: var(--criteria-shadow-subtle) !important;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          overflow: hidden !important;
          
          &:hover {
            box-shadow: var(--criteria-shadow-hover) !important;
            transform: translateY(-2px) !important;
          }
        }
        
        // Header de section modernisé
        .mat-mdc-card-header {
          background: var(--criteria-bg-section) !important;
          border-bottom: 1px solid var(--criteria-border-light) !important;
          padding: var(--criteria-space-lg) !important;
          
          .mat-mdc-card-title {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
            font-weight: 600 !important;
            font-size: 1.25rem !important;
            letter-spacing: -0.025em !important;
            color: var(--criteria-primary) !important;
            
            mat-icon {
              color: var(--criteria-accent) !important;
              margin-right: var(--criteria-space-sm) !important;
            }
          }
          
          .mat-mdc-card-subtitle {
            font-size: 0.875rem !important;
            color: #64748b !important;
            font-weight: 400 !important;
            margin-top: 4px !important;
          }
        }
        
        // Content modernisé
        .mat-mdc-card-content {
          padding: var(--criteria-space-lg) !important;
          background: transparent !important;
        }
        
        // Sections de critères
        .criteria-section {
          background: rgba(255, 255, 255, 0.6) !important;
          border: 1px solid rgba(226, 232, 240, 0.8) !important;
          border-radius: var(--criteria-radius-md) !important;
          padding: var(--criteria-space-lg) !important;
          margin-bottom: var(--criteria-space-lg) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          transition: all 0.2s ease !important;
          
          &:hover {
            background: rgba(255, 255, 255, 0.8) !important;
            border-color: rgba(78, 205, 196, 0.3) !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06) !important;
          }
          
          &:last-child {
            margin-bottom: 0 !important;
          }
        }
        
        // Titres de sections
        .criteria-section h6 {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
          font-weight: 600 !important;
          font-size: 1.125rem !important;
          letter-spacing: -0.025em !important;
          color: var(--criteria-primary) !important;
          margin-bottom: var(--criteria-space-md) !important;
          display: flex !important;
          align-items: center !important;
          gap: var(--criteria-space-sm) !important;
          
          mat-icon {
            color: var(--criteria-accent) !important;
            font-size: 20px !important;
            width: 20px !important;
            height: 20px !important;
          }
          
          .mat-caption {
            font-size: 0.75rem !important;
            color: #94a3b8 !important;
            font-weight: 400 !important;
            margin-left: auto !important;
          }
        }
        
        // Form fields modernisés - Style Linear/Stripe (SANS bordures pour éviter le conflit)
        .mat-mdc-form-field {
          width: 100% !important;
          
          // Suppression du fond blanc agressif - SANS ajouter de bordures
          .mat-mdc-form-field-flex {
            background: transparent !important;
          }
          
          .mat-mdc-form-field-infix {
            background: transparent !important;
          }
          
          // Amélioration des bordures Material existantes
          .mat-mdc-form-field-outline .mat-mdc-notched-outline__notch {
            border-right: 1px solid transparent !important;
            border-left: 1px solid transparent !important;
          }
          
          &.mat-focused {
            .mat-mdc-form-field-outline {
              .mat-mdc-notched-outline__leading,
              .mat-mdc-notched-outline__notch,
              .mat-mdc-notched-outline__trailing {
                border-color: var(--criteria-border-focus) !important;
                border-width: 2px !important;
              }
            }
          }
          
          &:hover:not(.mat-focused) {
            .mat-mdc-form-field-outline {
              .mat-mdc-notched-outline__leading,
              .mat-mdc-notched-outline__notch,
              .mat-mdc-notched-outline__trailing {
                border-color: rgba(36, 46, 84, 0.4) !important;
              }
            }
          }
          
          // Labels modernisés
          .mat-mdc-floating-label {
            color: #64748b !important;
            font-weight: 500 !important;
            letter-spacing: -0.01em !important;
          }
          
          &.mat-focused .mat-mdc-floating-label {
            color: var(--criteria-primary) !important;
          }
          
          // Inputs et textareas
          input, textarea {
            color: #1e293b !important;
            font-weight: 400 !important;
            caret-color: var(--criteria-accent) !important;
            background: transparent !important;
            
            &::placeholder {
              color: #94a3b8 !important;
              font-weight: 400 !important;
            }
          }
          
          // Icônes
          .mat-mdc-form-field-icon-suffix mat-icon {
            color: #94a3b8 !important;
            transition: color 0.2s ease !important;
          }
          
          &.mat-focused .mat-mdc-form-field-icon-suffix mat-icon {
            color: var(--criteria-accent) !important;
          }
          
          // Hints modernisés
          .mat-mdc-form-field-hint {
            color: #64748b !important;
            font-size: 0.75rem !important;
            font-weight: 400 !important;
            margin-top: 6px !important;
          }
        }
        
        // Selects modernisés
        .mat-mdc-select {
          .mat-mdc-select-value {
            color: #1e293b !important;
            font-weight: 400 !important;
          }
          
          .mat-mdc-select-placeholder {
            color: #94a3b8 !important;
          }
          
          .mat-mdc-select-arrow {
            color: #64748b !important;
          }
        }
        
        // Checkboxes modernisées
        .mat-mdc-checkbox {
          .mat-mdc-checkbox-frame {
            border-color: var(--criteria-border-light) !important;
            border-width: 1.5px !important;
            border-radius: 6px !important;
            background: rgba(255, 255, 255, 0.9) !important;
          }
          
          &.mat-mdc-checkbox-checked .mat-mdc-checkbox-background {
            background-color: var(--criteria-primary) !important;
            border-color: var(--criteria-primary) !important;
          }
          
          .mat-mdc-checkbox-label {
            color: #475569 !important;
            font-size: 0.875rem !important;
            font-weight: 500 !important;
          }
        }
        
        // Labels personnalisés modernisés
        .mat-label {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
          font-weight: 600 !important;
          font-size: 0.875rem !important;
          color: #374151 !important;
          letter-spacing: -0.01em !important;
          margin-bottom: 8px !important;
          display: block !important;
        }
        
        // Inputs de plage (min-max) modernisés
        .d-flex.gap-8.align-items-center {
          gap: 16px !important;
          
          .flex-1 {
            flex: 1 !important;
          }
          
          .text-muted {
            color: #64748b !important;
            font-weight: 500 !important;
            font-size: 0.875rem !important;
          }
        }
        
        // Colonnes modernisées - Bootstrap grid responsive
        .row {
          margin-left: -8px !important;
          margin-right: -8px !important;
          
          .col-lg-6, .col-lg-4, .col-lg-12 {
            padding-left: 8px !important;
            padding-right: 8px !important;
          }
          
          // Force l'alignement côte à côte pour les champs de domaine
          &.align-items-start {
            display: flex !important;
            flex-wrap: wrap !important;
            
            .col-lg-6 {
              flex: 1 1 calc(50% - 16px) !important;
              max-width: calc(50% - 16px) !important;
              margin-bottom: 16px !important;
            }
            
            // Responsive - stacking sur petits écrans
            @media (max-width: 768px) {
              .col-lg-6 {
                flex: 1 1 100% !important;
                max-width: 100% !important;
              }
            }
          }
        }
        
        // Groupe de checkboxes
        .d-flex.flex-column.gap-8 {
          gap: 12px !important;
          
          .mat-mdc-checkbox {
            &:hover {
              .mat-mdc-checkbox-frame {
                border-color: rgba(36, 46, 84, 0.4) !important;
              }
            }
          }
        }
        
        // Animation d'entrée pour les sections
        .criteria-section {
          animation: slideInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
      }
    }
    
    // Animation keyframes
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.98);
        filter: blur(2px);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }
    
    // Responsive pour mobile
    @media (max-width: 768px) {
      :host ::ng-deep .criteria-selection-modern {
        --criteria-space-lg: 16px;
        --criteria-space-md: 12px;
        --criteria-space-sm: 8px;
        
        .criteria-section {
          padding: var(--criteria-space-md) !important;
          margin-bottom: var(--criteria-space-md) !important;
        }
        
        .mat-mdc-card-header,
        .mat-mdc-card-content {
          padding: var(--criteria-space-md) !important;
        }
      }
    }
  `]
})
export class ProjectFormComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private projectService = inject(ProjectService);
  private datasetService = inject(DatasetService);
  private translateService = inject(TranslateService);
  private destroy$ = new Subject<void>();

  // État
  isLoading = false;
  isSaving = false;
  error: string | null = null;
  isEditMode = false;
  projectId: string | null = null;

  // Formulaire
  projectForm: FormGroup;

  // Critères et poids
  currentCriteria: DatasetFilterCriteria = {};
  currentWeights: CriterionWeight[] = [];

  // Preview des recommandations
  previewDatasets: DatasetScored[] = [];
  previewCount = 0;
  isLoadingPreview = false;

  // Poids prédéfinis disponibles
  defaultWeights: any[] = [];

  constructor() {
    this.projectForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      description: [''],
      // Ajout des critères de recherche dans le formulaire réactif
      criteria: this.fb.group({
        domain: [[]],
        task: [[]],
        instances_number_min: [null],
        instances_number_max: [null],
        features_number_min: [null],
        features_number_max: [null],
        year_min: [null],
        year_max: [null],
        ethical_score_min: [null],
        is_split: [false],
        is_anonymized: [false],
        is_public: [false]
      })
    });

    // Initialiser les poids par défaut
    this.initializeDefaultWeights();
    this.currentWeights = this.projectService.getDefaultWeights();
  }

  /**
   * Initialise les poids par défaut
   */
  private initializeDefaultWeights(): void {
    this.defaultWeights = [
      { criterion_name: 'ethical_score', weight: 0.4, label: 'PROJECTS.CRITERIA.ETHICAL_SCORE', icon: 'security' },
      { criterion_name: 'technical_score', weight: 0.4, label: 'PROJECTS.CRITERIA.TECHNICAL_SCORE', icon: 'engineering' },
      { criterion_name: 'popularity_score', weight: 0.2, label: 'PROJECTS.CRITERIA.POPULARITY_SCORE', icon: 'trending_up' },
      { criterion_name: 'anonymization', weight: 0.0, label: 'PROJECTS.CRITERIA.ANONYMIZATION', icon: 'verified_user' },
      { criterion_name: 'documentation', weight: 0.0, label: 'PROJECTS.CRITERIA.DOCUMENTATION', icon: 'description' },
      { criterion_name: 'data_quality', weight: 0.0, label: 'PROJECTS.CRITERIA.DATA_QUALITY', icon: 'high_quality' }
    ];
  }

  ngOnInit(): void {
    // Vérifier si on est en mode édition
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.isEditMode = true;
        this.projectId = params['id'];
        this.loadProject();
      }
    });

    // Écouter les changements pour le preview - maintenant sur tout le formulaire
    this.setupPreview();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Configure le preview automatique
   */
  private setupPreview(): void {
    // Debounce pour éviter trop d'appels API - fonctionne maintenant pour tous les champs
    this.projectForm.valueChanges
      .pipe(debounceTime(800), takeUntil(this.destroy$))
      .subscribe((formValues) => {
        // Synchroniser les critères depuis le formulaire avec nettoyage
        this.currentCriteria = this.cleanCriteria(formValues.criteria || {});
        this.updatePreview();
      });
  }

  /**
   * Nettoie les critères en supprimant les valeurs falsy et les types invalides
   */
  private cleanCriteria(rawCriteria: any): DatasetFilterCriteria {
    const cleaned: any = {};

    // Fonction helper pour vérifier si une valeur est valide
    const isValidValue = (value: any): boolean => {
      if (value === null || value === undefined || value === '') return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === 'string' && value.trim() === '') return false;
      return true;
    };

    // Nettoyer chaque propriété du critère
    Object.keys(rawCriteria).forEach(key => {
      const value = rawCriteria[key];
      
      // Validation spécifique selon le type de champ
      switch (key) {
        case 'domain':
        case 'task':
          // Arrays : nettoyer et garder seulement si non vide
          if (Array.isArray(value) && value.length > 0) {
            const cleanedArray = value.filter(v => v && typeof v === 'string' && v.trim() !== '');
            if (cleanedArray.length > 0) {
              cleaned[key] = cleanedArray;
            }
          }
          break;
          
        case 'year_min':
        case 'year_max':
        case 'instances_number_min':
        case 'instances_number_max':
        case 'features_number_min':
        case 'features_number_max':
        case 'ethical_score_min':
          // Numbers : convertir et valider
          if (value !== null && value !== undefined) {
            const numValue = typeof value === 'string' ? parseInt(value, 10) : value;
            if (!isNaN(numValue) && numValue > 0) {
              cleaned[key] = numValue;
            }
          }
          break;
          
        case 'is_split':
        case 'is_anonymized':
        case 'is_public':
        case 'has_temporal_factors':
        case 'has_missing_values':
          // Booleans : garder seulement les true explicites
          if (value === true) {
            cleaned[key] = true;
          }
          break;
          
        case 'dataset_name':
          // Strings : nettoyer les espaces
          if (typeof value === 'string' && value.trim() !== '') {
            cleaned[key] = value.trim();
          }
          break;
          
        default:
          // Pour les autres champs, utiliser la validation générique
          if (isValidValue(value)) {
            cleaned[key] = value;
          }
      }
    });

    return cleaned;
  }

  /**
   * Nettoie et valide les poids avant envoi
   */
  private cleanWeights(weights: CriterionWeight[]): CriterionWeight[] {
    if (!weights || !Array.isArray(weights)) {
      return this.getDefaultWeightsForPreview();
    }

    const validWeights = weights.filter(weight => {
      // Vérifier que le poids a les propriétés requises
      if (!weight || typeof weight !== 'object') return false;
      if (!weight.criterion_name || typeof weight.criterion_name !== 'string') return false;
      if (typeof weight.weight !== 'number') return false;
      if (isNaN(weight.weight)) return false;
      if (weight.weight < 0 || weight.weight > 1) return false;
      
      return true;
    });

    // Si aucun poids valide, retourner les poids par défaut
    if (validWeights.length === 0) {
      return this.getDefaultWeightsForPreview();
    }

    return validWeights;
  }

  /**
   * Déclenche le preview quand les critères changent (méthode dépréciée)
   */
  onCriteriaUpdate(): void {
    // Cette méthode n'est plus nécessaire car le debouncing automatique gère tout
    // Garder pour compatibilité temporaire
  }

  /**
   * Charge le projet à éditer
   */
  private loadProject(): void {
    if (!this.projectId) return;

    this.isLoading = true;
    this.projectService.getProject(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (project) => {
          this.projectForm.patchValue({
            name: project.name,
            description: project.description
          });
          
          if (project.criteria) {
            this.projectForm.get('criteria')?.patchValue(project.criteria);
            this.currentCriteria = this.cleanCriteria(project.criteria);
          }
          
          if (project.weights) {
            this.currentWeights = project.weights;
          }
          
          this.updatePreview();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Erreur lors du chargement du projet:', error);
          this.error = 'Projet non trouvé';
          this.isLoading = false;
        }
      });
  }



  /**
   * Gestion des changements de poids
   */
  onWeightChange(index: number, value: any): void {
    // Validation de l'index
    if (index < 0 || index >= this.defaultWeights.length) {
      console.warn('Index de poids invalide:', index);
      return;
    }

    // Conversion et validation de la valeur
    let numericWeight: number;
    if (typeof value === 'string') {
      numericWeight = parseFloat(value);
    } else if (typeof value === 'number') {
      numericWeight = value;
    } else {
      console.warn('Valeur de poids invalide:', value);
      return;
    }

    // Validation de la plage
    if (isNaN(numericWeight) || numericWeight < 0 || numericWeight > 1) {
      console.warn('Valeur de poids hors plage:', numericWeight);
      return;
    }

    // Éviter les modifications inutiles
    if (Math.abs(this.defaultWeights[index].weight - numericWeight) < 0.001) {
      return;
    }

    // Mettre à jour le poids
    this.defaultWeights[index].weight = numericWeight;
    
    // Recalculer les poids actifs
    this.currentWeights = this.defaultWeights
      .filter(w => w.weight > 0)
      .map(w => ({
        criterion_name: w.criterion_name,
        weight: w.weight
      }));

    // Mettre à jour le preview avec un délai pour éviter les appels en cascade
    setTimeout(() => this.updatePreview(), 100);
  }

  /**
   * Reset des poids aux valeurs par défaut
   */
  resetWeights(): void {
    // Réinitialiser les poids par défaut
    this.defaultWeights.forEach(w => {
      switch (w.criterion_name) {
        case 'ethical_score':
          w.weight = 0.4;
          break;
        case 'technical_score':
          w.weight = 0.4;
          break;
        case 'popularity_score':
          w.weight = 0.2;
          break;
        default:
          w.weight = 0.0;
      }
    });
    
    // Recalculer les poids actifs
    this.currentWeights = this.defaultWeights
      .filter(w => w.weight > 0)
      .map(w => ({
        criterion_name: w.criterion_name,
        weight: w.weight
      }));
    
    // Mettre à jour le preview
    this.updatePreview();
  }

  /**
   * Met à jour l'aperçu des recommandations
   */
  private updatePreview(): void {
    // Afficher un aperçu même sans critères spécifiques (avec les poids par défaut)
    if (Object.keys(this.currentCriteria).length === 0 && this.currentWeights.length === 0) {
      // Utiliser les poids par défaut pour l'aperçu initial
      this.currentWeights = this.getDefaultWeightsForPreview();
    }

    // Nettoyer et valider les poids avant envoi
    const cleanedWeights = this.cleanWeights(this.currentWeights);

    console.log('🔍 DEBUG Preview - Critères:', this.currentCriteria);
    console.log('🔍 DEBUG Preview - Poids:', cleanedWeights);

    this.isLoadingPreview = true;
    this.projectService.previewRecommendations(this.currentCriteria, cleanedWeights)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (datasets) => {
          this.previewDatasets = datasets.slice(0, 3); // Afficher les 3 premiers
          this.previewCount = datasets.length;
          this.isLoadingPreview = false;
        },
        error: (error) => {
          console.warn('Erreur lors du preview:', error);
          this.previewDatasets = [];
          this.previewCount = 0;
          this.isLoadingPreview = false;
        }
      });
  }

  /**
   * Retourne des poids par défaut pour l'aperçu initial
   */
  private getDefaultWeightsForPreview(): CriterionWeight[] {
    return [
      { criterion_name: 'ethical_score', weight: 0.4 },
      { criterion_name: 'technical_score', weight: 0.4 },
      { criterion_name: 'popularity_score', weight: 0.2 }
    ];
  }

  /**
   * Sauvegarde le projet
   */
  onSave(): void {
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const formValue = this.projectForm.value;
    const projectData = {
      name: formValue.name,
      description: formValue.description,
      criteria: Object.keys(this.currentCriteria).length > 0 ? this.currentCriteria : undefined,
      weights: this.currentWeights.length > 0 ? this.currentWeights : undefined
    };

    const saveOperation = this.isEditMode && this.projectId
      ? this.projectService.updateProject(this.projectId, projectData as ProjectUpdate)
      : this.projectService.createProject(projectData as ProjectCreate);

    saveOperation
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (project) => {
          this.isSaving = false;
          this.router.navigate(['/app/projects', project.id]);
        },
        error: (error) => {
          console.error('Erreur lors de la sauvegarde:', error);
          this.error = 'Erreur lors de la sauvegarde du projet';
          this.isSaving = false;
        }
      });
  }

  /**
   * Annule les modifications
   */
  onCancel(): void {
    if (this.isEditMode && this.projectId) {
      this.router.navigate(['/app/projects', this.projectId]);
    } else {
      this.router.navigate(['/app/projects']);
    }
  }

  /**
   * Obtient le titre de la page
   */
  getPageTitle(): string {
    return this.isEditMode ? 
      this.translateService.instant('PROJECTS.FORM.EDIT_PROJECT') : 
      this.translateService.instant('PROJECTS.FORM.CREATE_PROJECT');
  }

  /**
   * Vérifie si le formulaire a des modifications
   */
  hasChanges(): boolean {
    return this.projectForm.dirty || 
           Object.keys(this.currentCriteria).length > 0 || 
           this.currentWeights.length > 0;
  }

  /**
   * Obtient le pourcentage d'un poids pour l'affichage
   */
  getWeightPercent(criterionName: string): number {
    const weight = this.currentWeights.find(w => w.criterion_name === criterionName);
    return weight ? Math.round(weight.weight * 100) : 0;
  }

  /**
   * Génère un tooltip détaillé pour le score d'un dataset
   */
  getScoreTooltip(dataset: DatasetScored): string {
    const totalScore = Math.round(dataset.score * 100);
    let tooltip = `Score total : ${totalScore}%\n\nDétail par critère :\n`;
    
    // Calcul approximatif des scores individuels pour le tooltip
    const ethicalScore = this.estimateEthicalScore(dataset);
    const technicalScore = this.estimateTechnicalScore(dataset);
    const popularityScore = this.estimatePopularityScore(dataset);
    
    tooltip += `• Éthique : ${Math.round(ethicalScore * 100)}% (poids: ${this.getWeightPercent('ethical_score')}%)\n`;
    tooltip += `• Technique : ${Math.round(technicalScore * 100)}% (poids: ${this.getWeightPercent('technical_score')}%)\n`;
    tooltip += `• Popularité : ${Math.round(popularityScore * 100)}% (poids: ${this.getWeightPercent('popularity_score')}%)\n\n`;
    tooltip += `Cliquez sur "Voir formules détaillées" pour comprendre le calcul.`;
    
    return tooltip;
  }

  /**
   * Estime le score éthique basé sur les critères disponibles
   */
  private estimateEthicalScore(dataset: DatasetScored): number {
    let count = 0;
    let total = 0;
    
    // Estimation basée sur les champs disponibles dans DatasetScored
    if (dataset.anonymization_applied !== undefined) { total++; if (dataset.anonymization_applied) count++; }
    if (dataset.transparency !== undefined) { total++; if (dataset.transparency) count++; }
    if (dataset.informed_consent !== undefined) { total++; if (dataset.informed_consent) count++; }
    
    return total > 0 ? count / total : 0.7; // Valeur par défaut si pas d'info
  }

  /**
   * Estime le score technique basé sur la taille et les caractéristiques
   */
  private estimateTechnicalScore(dataset: DatasetScored): number {
    let score = 0;
    
    // Score basé sur la taille du dataset (échelle logarithmique)
    if (dataset.instances_number && dataset.instances_number > 0) {
      const logInstances = Math.log10(Math.max(1, dataset.instances_number));
      const instanceScore = Math.min(1.0, Math.max(0.0, (logInstances - 2) / 3));
      score += instanceScore * 0.4;
    } else {
      score += 0.5 * 0.4; // Score moyen si pas d'info
    }
    
    // Score basé sur le nombre de features (optimal 10-100)
    if (dataset.features_number && dataset.features_number > 0) {
      let featureScore = 0;
      if (dataset.features_number >= 10 && dataset.features_number <= 100) {
        featureScore = 1.0;
      } else if (dataset.features_number > 100) {
        featureScore = Math.max(0.5, 1 - (dataset.features_number - 100) / 1000);
      } else {
        featureScore = dataset.features_number / 10;
      }
      score += featureScore * 0.3;
    } else {
      score += 0.5 * 0.3; // Score moyen si pas d'info
    }
    
    // Score de documentation (estimation moyenne)
    score += 0.6 * 0.3;
    
    return score;
  }

  /**
   * Estime le score de popularité basé sur les citations
   */
  private estimatePopularityScore(dataset: DatasetScored): number {
    if (!dataset.num_citations || dataset.num_citations <= 0) {
      return 0.0;
    }
    
    // Formule logarithmique : log10(citations) / 3 (max à 1000 citations)
    const logCitations = Math.log10(dataset.num_citations);
    return Math.min(1.0, Math.max(0.0, logCitations / 3));
  }

  /**
   * Obtient la couleur basée sur le score
   */
  getScoreColor(score: number): string {
    return this.projectService.getScoreColor(score);
  }
} 
