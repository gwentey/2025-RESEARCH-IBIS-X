import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { FileColumn, DatasetFile, MissingDataScore, ColumnMissingStats, MissingDataAnalysisResponse } from '../../../models/dataset.models';
import { MissingDataDetailsModalComponent } from './missing-data-details-modal.component';
import { DatasetService } from '../../../services/dataset.service';



@Component({
  selector: 'app-missing-data-score',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule,
    TranslateModule
  ],
  template: `
    <mat-card class="modern-missing-data-card">
      <!-- En-tête simplifié -->
      <div class="card-header">
        <div class="header-content">
          <mat-icon class="header-icon">assessment</mat-icon>
          <div class="header-text">
            <h3 class="card-title">{{ 'DATASET_DETAIL.MISSING_DATA.TITLE' | translate }}</h3>
            <p class="card-subtitle">{{ 'DATASET_DETAIL.MISSING_DATA.SUBTITLE' | translate }}</p>
          </div>
        </div>
      </div>
      
      <!-- Corps de la carte -->
      <div class="card-body">
        <!-- Section du score améliorée -->
        <div class="score-container">
          <div class="score-main">
            <!-- Affichage normal avec score -->
            <div class="score-display" *ngIf="!error && !isLoading">
              <span class="score-number">{{ scoreData.overallScore }}</span>
              <span class="score-label">/ 100</span>
            </div>
            <!-- Affichage d'erreur -->
            <div class="score-display" *ngIf="error && !isLoading">
              <span class="error-message">Analyse indisponible</span>
            </div>
            <!-- Affichage de chargement -->
            <div class="score-display" *ngIf="isLoading">
              <span class="loading-message">Analyse...</span>
            </div>
          </div>
          
          <div class="score-status">
            <div class="status-indicator" [class]="'status-' + scoreData.qualityLevel">
              <mat-icon>{{ getQualityIcon() }}</mat-icon>
            </div>
            <span class="status-text">{{ getQualityLabel() | translate }}</span>
          </div>
        </div>
        
        <!-- Barre de progression -->
        <div class="progress-container">
          <mat-progress-bar 
            mode="determinate" 
            [value]="scoreData.overallScore"
            class="progress-bar">
          </mat-progress-bar>
        </div>
        
        <!-- Statistiques -->
        <div class="stats-container">
          <div class="stat-row">
            <span class="stat-label">{{ 'DATASET_DETAIL.MISSING_DATA.ANALYZED_COLUMNS' | translate }}</span>
            <span class="stat-value">{{ scoreData.analyzedColumns }} / {{ scoreData.totalColumns }}</span>
          </div>
          <div class="stat-row" *ngIf="scoreData.excludedColumns.length > 0">
            <span class="stat-label">{{ 'DATASET_DETAIL.MISSING_DATA.EXCLUDED_COLUMNS' | translate }}</span>
            <span class="stat-value">{{ scoreData.excludedColumns.length }}</span>
          </div>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="card-actions">
        <button mat-stroked-button (click)="openDetailsModal()" class="details-btn">
          <mat-icon>visibility</mat-icon>
          {{ 'DATASET_DETAIL.MISSING_DATA.VIEW_DETAILS' | translate }}
        </button>
      </div>
    </mat-card>
  `,
  styles: [`
    .modern-missing-data-card {
      margin: 16px 0;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .modern-missing-data-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
    }

    /* En-tête */
    .card-header {
      padding: 24px 24px 0;
    }

    .header-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-icon {
      color: #666;
      font-size: 24px;
      opacity: 0.8;
    }

    .header-text {
      flex: 1;
    }

    .card-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: #333;
    }

    .card-subtitle {
      margin: 4px 0 0;
      font-size: 0.875rem;
      color: #666;
      line-height: 1.4;
    }

    /* Corps */
    .card-body {
      padding: 24px;
    }

    /* Score compact et équilibré */
    .score-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      margin-bottom: 20px;
      padding: 1rem 1.25rem;
      background: rgba(var(--mat-sys-primary-rgb, 63, 81, 181), 0.04);
      border-radius: 12px;
      border: 1px solid rgba(var(--mat-sys-primary-rgb, 63, 81, 181), 0.1);
      
      @media (max-width: 640px) {
        flex-direction: column;
        gap: 1rem;
        text-align: center;
        padding: 1rem;
      }
    }

    .score-main {
      display: flex;
      align-items: center;
    }

    .score-display {
      display: flex;
      align-items: baseline;
      gap: 0.25rem;
    }

    .score-number {
      font-size: 1.6rem;
      font-weight: 700;
      color: #2c3e50;
      line-height: 1;
    }

    .score-label {
      font-size: 0.9rem;
      color: #7f8c8d;
      font-weight: 500;
    }
    

    .score-status {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-shrink: 0;
      max-width: 65%;
    }

    .status-indicator {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f8f9fa;
      transition: all 0.3s ease;
      
      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .status-indicator.status-perfect {
      background: #d4edda;
      color: #155724;
    }

    .status-indicator.status-good {
      background: #d1ecf1;
      color: #0c5460;
    }

    .status-indicator.status-warning {
      background: #fff3cd;
      color: #856404;
    }

    .status-indicator.status-critical {
      background: #f8d7da;
      color: #721c24;
    }

    .status-text {
      font-size: 0.8rem;
      font-weight: 500;
      color: #495057;
      line-height: 1.3;
      word-wrap: break-word;
    }

    /* Barre de progression */
    .progress-container {
      margin-bottom: 24px;
    }

    .progress-bar {
      height: 8px;
      border-radius: 4px;
      background-color: #e9ecef;
    }

    /* Statistiques */
    .stats-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
    }

    .stat-label {
      font-size: 0.875rem;
      color: #6c757d;
    }

    .stat-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: #495057;
    }

    /* Actions */
    .card-actions {
      padding: 0 24px 24px;
      display: flex;
      justify-content: flex-end;
    }

    .details-btn {
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 8px;
    }

    .details-btn mat-icon {
      margin-right: 8px;
      font-size: 18px;
    }

    /* Adaptation pour espaces restreints */
    @media (max-width: 768px) {
      .modern-missing-data-card .card-header {
        padding: 16px 16px 0;
      }

      .modern-missing-data-card .card-body {
        padding: 16px;
      }

      .modern-missing-data-card .score-container {
        margin-bottom: 16px;
      }

      .modern-missing-data-card .score-number {
        font-size: 2rem;
      }

      .modern-missing-data-card .score-label {
        font-size: 1rem;
      }

      .modern-missing-data-card .status-indicator {
        width: 32px;
        height: 32px;
      }

      .modern-missing-data-card .progress-container {
        margin-bottom: 16px;
      }

      .modern-missing-data-card .card-actions {
        padding: 0 16px 16px;
      }

      .modern-missing-data-card .card-title {
        font-size: 1rem;
      }

      .modern-missing-data-card .card-subtitle {
        font-size: 0.8rem;
      }

      .modern-missing-data-card .stats-container {
        gap: 8px;
      }

      .modern-missing-data-card .stat-row {
        padding: 6px 0;
      }
    }

    /* Layout compact séparé */
    .compact-layout .modern-missing-data-card .card-header {
      padding: 16px 16px 0;
    }

    .compact-layout .modern-missing-data-card .card-body {
      padding: 16px;
    }

    .compact-layout .modern-missing-data-card .score-container {
      margin-bottom: 16px;
    }

    .compact-layout .modern-missing-data-card .score-number {
      font-size: 2rem;
    }

    .compact-layout .modern-missing-data-card .score-label {
      font-size: 1rem;
    }

    .compact-layout .modern-missing-data-card .status-indicator {
      width: 32px;
      height: 32px;
    }

    .compact-layout .modern-missing-data-card .progress-container {
      margin-bottom: 16px;
    }

    .compact-layout .modern-missing-data-card .card-actions {
      padding: 0 16px 16px;
    }

    .compact-layout .modern-missing-data-card .card-title {
      font-size: 1rem;
    }

    .compact-layout .modern-missing-data-card .card-subtitle {
      font-size: 0.8rem;
    }

    .compact-layout .modern-missing-data-card .stats-container {
      gap: 8px;
    }

    .compact-layout .modern-missing-data-card .stat-row {
      padding: 6px 0;
    }

    /* Version ultra-compacte pour sidebars */
    .sidebar-layout .modern-missing-data-card {
      .card-header {
        padding: 12px 12px 0;
      }

      .card-body {
        padding: 12px;
      }

      .score-container {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 12px;
      }

      .score-number {
        font-size: 1.75rem;
      }

      .score-label {
        font-size: 0.9rem;
      }

      .status-indicator {
        width: 28px;
        height: 28px;
      }

      .status-text {
        font-size: 0.8rem;
      }

      .card-actions {
        padding: 0 12px 12px;
      }
    }

    /* Styles pour les messages d'état */
    .error-message {
      color: #f44336;
      font-size: 0.9rem;
      font-weight: 500;
    }

    .loading-message {
      color: #666;
      font-size: 0.9rem;
      font-style: italic;
    }
  `]
})
export class MissingDataScoreComponent implements OnInit {
  @Input() datasetId: string = '';
  @Input() files: DatasetFile[] = [];
  @Input() columns: FileColumn[] = [];
  @Input() dataset?: any;  // Ajout du dataset complet pour accéder aux vraies stats

  scoreData: MissingDataScore = {
    overallScore: 0,
    totalColumns: 0,
    analyzedColumns: 0,
    excludedColumns: [],
    columnStats: [],
    qualityLevel: 'critical'
  };

  isLoading = false;
  error: string | null = null;

  constructor(
    private dialog: MatDialog,
    private datasetService: DatasetService
  ) {}

  ngOnInit(): void {
    console.log('=== DEBUG MISSING DATA SCORE COMPONENT ===');
    console.log('DatasetId:', this.datasetId);
    console.log('Dataset global_missing_percentage:', this.dataset?.global_missing_percentage);
    console.log('Files count:', this.files?.length);
    console.log('Columns count:', this.columns?.length);
    
    // Priorité 1: Utiliser les données du dataset si disponibles
    if (this.dataset?.global_missing_percentage !== null && this.dataset?.global_missing_percentage !== undefined) {
      console.log('=== Utilisation des données dataset directement ===');
      this.useDatasetMissingData();
      return;
    }
    
    // Priorité 2: Essayer l'API backend si datasetId disponible
    if (this.datasetId) {
      console.log('=== Tentative API backend ===');
      this.loadMissingDataAnalysis();
    } else {
      // Priorité 3: Fallback avec métadonnées disponibles
      console.log('=== Fallback avec métadonnées ===');
      this.calculateMissingDataScore();
    }
  }

  /**
   * Utilise directement les données du dataset (plus rapide et fiable)
   */
  private useDatasetMissingData(): void {
    const globalMissingPercentage = this.dataset?.global_missing_percentage || 0;
    const overallScore = Math.max(0, Math.round(100 - globalMissingPercentage));
    
    let qualityLevel: 'perfect' | 'good' | 'warning' | 'critical';
    if (globalMissingPercentage === 0) qualityLevel = 'perfect';
    else if (globalMissingPercentage < 5) qualityLevel = 'good';
    else if (globalMissingPercentage < 20) qualityLevel = 'warning';
    else qualityLevel = 'critical';

    this.scoreData = {
      overallScore,
      totalColumns: this.columns?.length || 0,
      analyzedColumns: this.columns?.length || 0,
      excludedColumns: [],
      columnStats: [],
      qualityLevel
    };
    
    console.log(`=== SCORE FINAL - Dataset directement ===`);
    console.log(`Pourcentage global: ${globalMissingPercentage}%`);
    console.log(`Score: ${overallScore}/100 (${qualityLevel})`);
  }

  /**
   * Charge l'analyse des données manquantes depuis le backend
   */
  private loadMissingDataAnalysis(): void {
    this.isLoading = true;
    this.error = null;

    this.datasetService.getMissingDataAnalysis(this.datasetId).subscribe({
      next: (response: MissingDataAnalysisResponse) => {
        this.scoreData = response.missingDataScore;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement de l\'analyse des données manquantes:', error);
        this.error = 'Impossible de charger l\'analyse des données manquantes';
        this.isLoading = false;
        
        // Fallback : utiliser les données du dataset ou calcul basique
        if (this.dataset?.global_missing_percentage !== null && this.dataset?.global_missing_percentage !== undefined) {
          this.useDatasetMissingData();
        } else {
          this.calculateMissingDataScore();
        }
      }
    });
  }

  /**
   * Calcule le score des données manquantes en utilisant les vraies données du dataset
   * SUPPRIMÉ: L'ancien fallback avec Math.random() (fake data interdite)
   */
  /**
   * Fallback: Calcule un score basique avec les données disponibles (pas de fake data)
   */
  private calculateMissingDataScore(): void {
    // ATTENTION: Plus de Math.random() - fake data interdite !
    // Utiliser les vraies données du dataset si disponibles
    
    // D'abord, vérifier si on a des vraies données du dataset
    if (this.dataset?.global_missing_percentage !== null && this.dataset?.global_missing_percentage !== undefined) {
      // Utiliser le pourcentage global réel du dataset
      const globalMissingPercentage = this.dataset.global_missing_percentage;
      const overallScore = Math.max(0, Math.round(100 - globalMissingPercentage));
      
      let qualityLevel: 'perfect' | 'good' | 'warning' | 'critical';
      if (globalMissingPercentage === 0) qualityLevel = 'perfect';
      else if (globalMissingPercentage < 5) qualityLevel = 'good';
      else if (globalMissingPercentage < 20) qualityLevel = 'warning';
      else qualityLevel = 'critical';

      this.scoreData = {
        overallScore,
        totalColumns: this.columns?.length || 0,
        analyzedColumns: this.columns?.length || 0,
        excludedColumns: [],
        columnStats: [],
        qualityLevel
      };
      
      console.log(`=== MISSING DATA SCORE - Utilisation des vraies données ===`);
      console.log(`Pourcentage global réel: ${globalMissingPercentage}%`);
      console.log(`Score calculé: ${overallScore}/100`);
      return;
    }
    
    // Fallback si pas de données globales : calculer avec les colonnes
    if (!this.columns || this.columns.length === 0) {
      this.scoreData = {
        overallScore: 0,
        totalColumns: 0,
        analyzedColumns: 0,
        excludedColumns: [],
        columnStats: [],
        qualityLevel: 'critical'
      };
      this.error = 'Aucune donnée disponible pour calculer les statistiques';
      return;
    }

    // Calculer avec les vraies métadonnées des colonnes (pas de fake data)
    const columnStats: ColumnMissingStats[] = [];
    let totalMissingPercentage = 0;
    let columnsWithData = 0;
    
    this.columns.forEach(col => {
      // Utiliser seulement les vraies statistiques si disponibles
      let realMissingPercentage = 0;
      
      if (col.stats?.['missing_percentage'] !== undefined) {
        realMissingPercentage = col.stats['missing_percentage'];
        columnsWithData++;
      } else {
        // Si pas de stats, supposer 0% (conservateur, pas de fake data)
        realMissingPercentage = 0;
      }
      
      columnStats.push({
        columnName: col.column_name,
        missingCount: col.stats?.['missing_count'] || 0,
        totalCount: col.stats?.['total_count'] || 0,
        missingPercentage: realMissingPercentage,
        dataType: col.data_type_interpreted || col.data_type_original || 'unknown',
        suggestion: this.generateSuggestion(realMissingPercentage, col.data_type_interpreted || ''),
        severity: realMissingPercentage < 5 ? 'low' : realMissingPercentage < 15 ? 'medium' : realMissingPercentage < 30 ? 'high' : 'critical'
      });
      
      totalMissingPercentage += realMissingPercentage;
    });

    const averageMissingPercentage = this.columns.length > 0 ? totalMissingPercentage / this.columns.length : 0;
    const overallScore = Math.max(0, Math.round(100 - averageMissingPercentage));

    let qualityLevel: 'perfect' | 'good' | 'warning' | 'critical';
    if (averageMissingPercentage === 0) qualityLevel = 'perfect';
    else if (averageMissingPercentage < 5) qualityLevel = 'good';
    else if (averageMissingPercentage < 20) qualityLevel = 'warning';
    else qualityLevel = 'critical';

    this.scoreData = {
      overallScore,
      totalColumns: this.columns.length,
      analyzedColumns: this.columns.length,
      excludedColumns: [],
      columnStats,
      qualityLevel
    };
    
    console.log(`=== MISSING DATA SCORE - Fallback avec vraies métadonnées ===`);
    console.log(`Colonnes avec vraies stats: ${columnsWithData}/${this.columns.length}`);
    console.log(`Pourcentage moyen calculé: ${averageMissingPercentage}%`);
    console.log(`Score final: ${overallScore}/100`);
  }

  /**
   * Génère une suggestion de traitement pour une colonne
   */
  private generateSuggestion(missingPercentage: number, dataType: string): string {
    if (missingPercentage < 5) {
      return 'DATASET_DETAIL.MISSING_DATA.SUGGESTIONS.MINIMAL_CLEANING';
    } else if (missingPercentage < 15) {
      if (dataType.includes('numerical') || dataType.includes('float')) {
        return 'DATASET_DETAIL.MISSING_DATA.SUGGESTIONS.IMPUTE_MEAN';
      } else {
        return 'DATASET_DETAIL.MISSING_DATA.SUGGESTIONS.IMPUTE_MODE';
      }
    } else if (missingPercentage < 30) {
      return 'DATASET_DETAIL.MISSING_DATA.SUGGESTIONS.CAREFUL_ANALYSIS';
    } else {
      return 'DATASET_DETAIL.MISSING_DATA.SUGGESTIONS.CONSIDER_REMOVAL';
    }
  }

  /**
   * Retourne l'icône appropriée selon le niveau de qualité
   */
  getQualityIcon(): string {
    switch (this.scoreData.qualityLevel) {
      case 'perfect': return 'check_circle';
      case 'good': return 'verified';
      case 'warning': return 'warning';
      case 'critical': return 'error';
      default: return 'help';
    }
  }

  /**
   * Retourne le label de qualité
   */
  getQualityLabel(): string {
    return `DATASET_DETAIL.MISSING_DATA.QUALITY_LEVELS.${this.scoreData.qualityLevel.toUpperCase()}`;
  }

  /**
   * Ouvre la modale de détails
   */
  openDetailsModal(): void {
    this.dialog.open(MissingDataDetailsModalComponent, {
      width: '1200px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      data: this.scoreData
    });
  }
}