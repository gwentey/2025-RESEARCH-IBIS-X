import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { DatasetDetailView } from '../../../models/dataset.models';
import { DatasetAIService, DatasetAIRequest, DatasetAIResponse } from '../../../services/dataset-ai.service';

interface AIAnalysis {
  summary: string;
  recommended_task: 'classification' | 'regression';
  recommended_algorithm: 'decision_tree' | 'random_forest';
  reasoning: string;
  expected_results: string;
  key_insights: string[];
  potential_challenges: string[];
}

@Component({
  selector: 'app-dataset-ai-guide',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    TranslateModule
  ],
  template: `
    <div class="ai-guide-container">
      <!-- En-tête avec call-to-action -->
      <div class="guide-hero" *ngIf="!analysis && !isAnalyzing">
        <div class="hero-content">
          <div class="hero-icon">
            <mat-icon>psychology</mat-icon>
          </div>
          <div class="hero-text">
            <h2>{{ 'DATASET_DETAIL.AI_GUIDE.TITLE' | translate }}</h2>
            <p>{{ 'DATASET_DETAIL.AI_GUIDE.SUBTITLE' | translate }}</p>
          </div>
        </div>
        <button mat-flat-button color="primary" class="analyze-button" (click)="analyzeDataset()">
          <mat-icon>auto_awesome</mat-icon>
          {{ 'DATASET_DETAIL.AI_GUIDE.ANALYZE_BUTTON' | translate }}
        </button>
      </div>

      <!-- État de chargement -->
      <div class="analyzing-state" *ngIf="isAnalyzing">
        <mat-card class="analyzing-card">
          <mat-card-content>
            <div class="analyzing-content">
              <mat-spinner diameter="60"></mat-spinner>
              <h3>{{ 'DATASET_DETAIL.AI_GUIDE.ANALYZING_TITLE' | translate }}</h3>
              <p>{{ 'DATASET_DETAIL.AI_GUIDE.ANALYZING_SUBTITLE' | translate }}</p>
              <div class="analyzing-steps">
                <div class="step" [class.active]="analyzeStep >= 1">
                  <mat-icon>visibility</mat-icon>
                  <span>{{ 'DATASET_DETAIL.AI_GUIDE.STEP_METADATA' | translate }}</span>
                </div>
                <div class="step" [class.active]="analyzeStep >= 2">
                  <mat-icon>analytics</mat-icon>
                  <span>{{ 'DATASET_DETAIL.AI_GUIDE.STEP_PATTERNS' | translate }}</span>
                </div>
                <div class="step" [class.active]="analyzeStep >= 3">
                  <mat-icon>lightbulb</mat-icon>
                  <span>{{ 'DATASET_DETAIL.AI_GUIDE.STEP_RECOMMENDATIONS' | translate }}</span>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Résultats de l'analyse -->
      <div class="analysis-results" *ngIf="analysis && !isAnalyzing">
        <!-- Résumé du dataset -->
        <mat-card class="summary-card ai-card">
          <div class="ai-badge-corner">
            <span class="ai-badge-small">IA</span>
          </div>
          <mat-card-header>
            <mat-icon mat-card-avatar class="summary-icon">auto_awesome</mat-icon>
            <mat-card-title>{{ 'DATASET_DETAIL.AI_GUIDE.DATASET_ANALYSIS_TITLE' | translate }}</mat-card-title>
            <mat-card-subtitle>{{ 'DATASET_DETAIL.AI_GUIDE.DATASET_ANALYSIS_SUBTITLE' | translate }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="ai-analysis-content">
              <p class="analysis-summary">{{ analysis.summary }}</p>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Recommandations ML -->
        <mat-card class="recommendations-card ai-card">
          <div class="ai-badge-corner">
            <span class="ai-badge-small">IA</span>
          </div>
          <mat-card-header>
            <mat-icon mat-card-avatar class="rec-icon">psychology</mat-icon>
            <mat-card-title>
              <span class="title-with-sparkles">
                {{ 'DATASET_DETAIL.AI_GUIDE.ML_RECOMMENDATIONS_TITLE' | translate }}
                <mat-icon class="sparkle-icon">auto_awesome</mat-icon>
              </span>
            </mat-card-title>
            <mat-card-subtitle>{{ 'DATASET_DETAIL.AI_GUIDE.ML_RECOMMENDATIONS_SUBTITLE' | translate }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="recommendation-content">
              <!-- Tâche recommandée -->
              <div class="rec-section">
                <h4 class="rec-title">
                  <mat-icon>psychology</mat-icon>
                  {{ 'DATASET_DETAIL.AI_GUIDE.RECOMMENDED_TASK' | translate }}
                </h4>
                <div class="rec-choice">
                  <mat-chip class="task-chip" [class]="analysis.recommended_task">
                    <mat-icon matChipAvatar>{{ getTaskIcon(analysis.recommended_task) }}</mat-icon>
                    {{ 'DATASET_DETAIL.AI_GUIDE.' + (analysis.recommended_task === 'classification' ? 'CLASSIFICATION' : 'REGRESSION') | translate }}
                  </mat-chip>
                  <p class="rec-explanation">{{ analysis.reasoning }}</p>
                </div>
              </div>

              <mat-divider></mat-divider>

              <!-- Algorithme recommandé -->
              <div class="rec-section">
                <h4 class="rec-title">
                  <mat-icon>settings</mat-icon>
                  {{ 'DATASET_DETAIL.AI_GUIDE.RECOMMENDED_ALGORITHM' | translate }}
                </h4>
                <div class="rec-choice">
                  <mat-chip class="algo-chip" [class]="analysis.recommended_algorithm">
                    <mat-icon matChipAvatar>{{ getAlgorithmIcon(analysis.recommended_algorithm) }}</mat-icon>
                    {{ 'DATASET_DETAIL.AI_GUIDE.' + (analysis.recommended_algorithm === 'decision_tree' ? 'DECISION_TREE' : 'RANDOM_FOREST') | translate }}
                  </mat-chip>
                  <p class="rec-explanation">{{ analysis.expected_results }}</p>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Insights clés -->
        <mat-card class="insights-card" *ngIf="analysis.key_insights.length > 0">
          <mat-card-header>
            <mat-icon mat-card-avatar class="insights-icon">insights</mat-icon>
            <mat-card-title>{{ 'DATASET_DETAIL.AI_GUIDE.KEY_INSIGHTS_TITLE' | translate }}</mat-card-title>
            <mat-card-subtitle>{{ 'DATASET_DETAIL.AI_GUIDE.KEY_INSIGHTS_SUBTITLE' | translate }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="insights-list">
              <div class="insight-item" *ngFor="let insight of analysis.key_insights">
                <mat-icon class="insight-icon">arrow_forward</mat-icon>
                <span>{{ insight }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Défis potentiels -->
        <mat-card class="challenges-card" *ngIf="analysis.potential_challenges.length > 0">
          <mat-card-header>
            <mat-icon mat-card-avatar class="challenges-icon">warning</mat-icon>
            <mat-card-title>{{ 'DATASET_DETAIL.AI_GUIDE.CHALLENGES_TITLE' | translate }}</mat-card-title>
            <mat-card-subtitle>{{ 'DATASET_DETAIL.AI_GUIDE.CHALLENGES_SUBTITLE' | translate }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="challenges-list">
              <div class="challenge-item" *ngFor="let challenge of analysis.potential_challenges">
                <mat-icon class="challenge-icon">info</mat-icon>
                <span>{{ challenge }}</span>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Actions -->
        <div class="guide-actions">
          <button mat-flat-button color="primary" class="start-pipeline-btn" (click)="startPipelineWithDataset()">
            <mat-icon>play_arrow</mat-icon>
            {{ 'DATASET_DETAIL.AI_GUIDE.START_PIPELINE' | translate }}
          </button>
          <button mat-stroked-button (click)="analyzeDataset()" class="refresh-btn">
            <mat-icon>refresh</mat-icon>
            {{ 'DATASET_DETAIL.AI_GUIDE.NEW_ANALYSIS' | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ai-guide-container {
      padding: 1.5rem 0;
      position: relative;
      
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: 
          radial-gradient(circle at 20% 30%, rgba(102, 126, 234, 0.03) 0%, transparent 40%),
          radial-gradient(circle at 80% 70%, rgba(118, 75, 162, 0.03) 0%, transparent 40%);
        pointer-events: none;
        z-index: 0;
      }
      
      > * {
        position: relative;
        z-index: 1;
      }
    }

    /* Hero Section */
    .guide-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 2rem;
      padding: 3rem 2rem;
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
      border-radius: 16px;
      border: 1px solid rgba(102, 126, 234, 0.1);
    }

    .hero-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      max-width: 500px;
    }

    .hero-icon {
      width: 80px;
      height: 80px;
      border-radius: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
      
      mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        color: white;
      }
    }

    .hero-text {
      h2 {
        font-size: 1.75rem;
        font-weight: 700;
        color: #2c3e50;
        margin: 0 0 0.5rem 0;
        line-height: 1.3;
      }
      
      p {
        font-size: 1.125rem;
        color: #6c757d;
        margin: 0;
        line-height: 1.5;
      }
    }

    .analyze-button {
      font-size: 1rem;
      font-weight: 600;
      height: 48px;
      padding: 0 2rem;
      border-radius: 24px;
      
      mat-icon {
        margin-right: 0.5rem;
      }
    }

    /* État d'analyse */
    .analyzing-card {
      border-radius: 16px;
      overflow: hidden;
    }

    .analyzing-content {
      text-align: center;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      
      mat-spinner {
        margin: 0 auto;
      }
      
      h3 {
        margin: 0;
        color: #2c3e50;
        font-weight: 600;
      }
      
      p {
        color: #6c757d;
        margin: 0;
      }
    }

    .analyzing-steps {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-width: 300px;
      margin: 1rem auto 0 auto;
      
      .step {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: 8px;
        background: #f8f9fa;
        opacity: 0.5;
        transition: all 0.3s ease;
        
        &.active {
          opacity: 1;
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          
          mat-icon {
            color: #667eea;
          }
        }
        
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: #9e9e9e;
        }
        
        span {
          font-weight: 500;
          font-size: 0.9rem;
        }
      }
    }

    /* Résultats */
    .analysis-results {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    /* Cards communes */
    .summary-card,
    .recommendations-card,
    .insights-card,
    .challenges-card {
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: all 0.3s ease;
      
      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      }
      
      .mat-mdc-card-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        
        .mat-mdc-card-avatar {
          background: rgba(255, 255, 255, 0.15) !important;
          color: white !important;
          border-radius: 12px !important;
        }
      }
    }
    
    /* Effets IA subtils */
    .ai-card {
      background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
      border: 1px solid rgba(102, 126, 234, 0.1);
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.08);
      position: relative;
      
      &:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 30px rgba(102, 126, 234, 0.15);
      }
      
      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, #667eea, #764ba2, #667eea);
        background-size: 200% 100%;
        animation: shimmer 3s infinite;
      }
    }
    
    /* Badge IA dans le coin */
    .ai-badge-corner {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      
      .ai-badge-small {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 0.65rem;
        font-weight: 700;
        padding: 0.2rem 0.4rem;
        border-radius: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        animation: pulse-glow 2s infinite;
      }
    }
    
    /* Titre avec sparkles */
    .title-with-sparkles {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      
      .sparkle-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #ffd700;
        animation: sparkle 2s infinite;
      }
    }
    
    /* Points de réflexion IA */
    .ai-thinking-dots {
      display: flex;
      gap: 4px;
      margin-bottom: 1rem;
      justify-content: center;
      
      span {
        width: 6px;
        height: 6px;
        background: linear-gradient(45deg, #667eea, #764ba2);
        border-radius: 50%;
        animation: thinking-pulse 1.4s infinite ease-in-out;
        
        &:nth-child(1) { animation-delay: 0s; }
        &:nth-child(2) { animation-delay: 0.2s; }
        &:nth-child(3) { animation-delay: 0.4s; }
      }
    }
    
    /* Contenu d'analyse IA */
    .ai-analysis-content {
      padding: 0.5rem 0;
    }
    
    /* Animations subtiles */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    
    @keyframes pulse-glow {
      0%, 100% { 
        transform: scale(1);
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      }
      50% { 
        transform: scale(1.05);
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.5);
      }
    }
    
    @keyframes sparkle {
      0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
      25% { opacity: 0.7; transform: scale(1.1) rotate(90deg); }
      50% { opacity: 1; transform: scale(1) rotate(180deg); }
      75% { opacity: 0.7; transform: scale(1.1) rotate(270deg); }
    }
    
    @keyframes thinking-pulse {
      0%, 80%, 100% {
        transform: scale(1);
        opacity: 0.5;
      }
      40% {
        transform: scale(1.2);
        opacity: 1;
      }
    }

    .analysis-summary {
      font-size: 1.1rem;
      line-height: 1.6;
      color: #495057;
      margin: 0;
    }

    /* Recommandations */
    .recommendation-content {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .rec-section {
      .rec-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 1rem;
        font-weight: 600;
        color: #495057;
        margin: 0 0 1.25rem 0;
        
        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: #667eea;
        }
      }
      
      .rec-choice {
        .task-chip,
        .algo-chip {
          margin-bottom: 1rem;
          font-weight: 600 !important;
          font-size: 0.95rem !important;
          height: 36px !important;
          border: none !important;
          transition: all 0.3s ease;
          
          &:hover {
            transform: translateY(-1px);
          }
          
          &.classification {
            background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%) !important;
            color: white !important;
            box-shadow: 0 3px 12px rgba(76, 175, 80, 0.4);
            
            &:hover {
              box-shadow: 0 4px 16px rgba(76, 175, 80, 0.5);
            }
            
            .mat-mdc-chip-avatar,
            .mat-mdc-chip-avatar .mat-icon {
              color: white !important;
            }
          }
          
          &.regression {
            background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%) !important;
            color: white !important;
            box-shadow: 0 3px 12px rgba(33, 150, 243, 0.4);
            
            &:hover {
              box-shadow: 0 4px 16px rgba(33, 150, 243, 0.5);
            }
            
            .mat-mdc-chip-avatar,
            .mat-mdc-chip-avatar .mat-icon {
              color: white !important;
            }
          }
          
          &.decision_tree {
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%) !important;
            color: white !important;
            box-shadow: 0 3px 12px rgba(255, 152, 0, 0.4);
            
            &:hover {
              box-shadow: 0 4px 16px rgba(255, 152, 0, 0.5);
            }
            
            .mat-mdc-chip-avatar,
            .mat-mdc-chip-avatar .mat-icon {
              color: white !important;
            }
          }
          
          &.random_forest {
            background: linear-gradient(135deg, #388e3c 0%, #2e7d32 100%) !important;
            color: white !important;
            box-shadow: 0 3px 12px rgba(56, 142, 60, 0.4);
            
            &:hover {
              box-shadow: 0 4px 16px rgba(56, 142, 60, 0.5);
            }
            
            .mat-mdc-chip-avatar,
            .mat-mdc-chip-avatar .mat-icon {
              color: white !important;
            }
          }
        }
        
        .rec-explanation {
          font-size: 0.95rem;
          line-height: 1.6;
          color: #495057;
          margin: 0;
          padding: 0.75rem 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #e9ecef;
        }
      }
    }

    /* Insights et challenges */
    .insights-list,
    .challenges-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .insight-item,
    .challenge-item {
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 8px;
      background: #f8f9fa;
      
      .insight-icon,
      .challenge-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #667eea;
        flex-shrink: 0;
        margin-top: 0.125rem;
      }
      
      span {
        font-size: 0.9rem;
        line-height: 1.4;
        color: #495057;
      }
    }

    .challenge-item {
      background: rgba(245, 158, 11, 0.05);
      border-left: 3px solid #f59e0b;
      
      .challenge-icon {
        color: #f59e0b;
      }
    }

    /* Actions */
    .guide-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
      padding: 1rem 0;
      
      .start-pipeline-btn {
        font-weight: 600;
        height: 48px;
        padding: 0 2rem;
        border-radius: 24px;
      }
      
      .refresh-btn {
        height: 48px;
        padding: 0 1.5rem;
        border-radius: 24px;
      }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .guide-hero {
        padding: 2rem 1rem;
        gap: 1.5rem;
      }
      
      .hero-content {
        gap: 0.75rem;
      }
      
      .hero-icon {
        width: 60px;
        height: 60px;
        
        mat-icon {
          font-size: 30px;
          width: 30px;
          height: 30px;
        }
      }
      
      .hero-text h2 {
        font-size: 1.5rem;
      }
      
      .hero-text p {
        font-size: 1rem;
      }
      
      .analyze-button {
        height: 44px;
        padding: 0 1.5rem;
        font-size: 0.9rem;
      }
      
      .guide-actions {
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        
        button {
          width: 100%;
          max-width: 300px;
        }
      }
    }
    
    /* Responsive - réduire les animations sur mobile */
    @media (max-width: 768px) {
      .ai-badge-corner .ai-badge-small {
        font-size: 0.6rem;
        padding: 0.15rem 0.3rem;
        animation: none;
      }
      
      .title-with-sparkles .sparkle-icon {
        animation-duration: 4s;
      }
      
      .ai-thinking-dots span {
        width: 5px;
        height: 5px;
      }
    }
    
    /* Désactiver animations si préféré */
    @media (prefers-reduced-motion: reduce) {
      .ai-badge-small,
      .sparkle-icon,
      .ai-thinking-dots span,
      .ai-card::before {
        animation: none !important;
      }
    }
  `]
})
export class DatasetAIGuideComponent implements OnInit {
  @Input() dataset: DatasetDetailView | null = null;
  
  private snackBar = inject(MatSnackBar);
  private aiService = inject(DatasetAIService);
  private translateService = inject(TranslateService);
  private router = inject(Router);
  
  // État du composant
  isAnalyzing = false;
  analyzeStep = 0;
  analysis: AIAnalysis | null = null;
  
  ngOnInit() {
    // Initialisation si nécessaire
  }
  
  analyzeDataset() {
    if (!this.dataset) {
      this.showError('Dataset non disponible pour l\'analyse');
      return;
    }
    
    this.isAnalyzing = true;
    this.analyzeStep = 0;
    this.analysis = null;
    
    // Simulation de l'analyse avec étapes
    this.simulateAnalysisSteps();
  }
  
  private simulateAnalysisSteps() {
    // Étape 1 : Lecture métadonnées
    setTimeout(() => {
      this.analyzeStep = 1;
    }, 500);
    
    // Étape 2 : Analyse patterns  
    setTimeout(() => {
      this.analyzeStep = 2;
    }, 1200);
    
    // Étape 3 : Recommandations
    setTimeout(() => {
      this.analyzeStep = 3;
      this.performAIAnalysis();
    }, 2000);
  }
  
  private performAIAnalysis() {
    if (!this.dataset) {
      this.isAnalyzing = false;
      return;
    }
    
    // Préparer les données pour l'IA
    const aiRequest: DatasetAIRequest = {
      dataset_id: this.dataset.id,
      dataset_metadata: {
        name: this.dataset.display_name,
        objective: this.dataset.objective,
        domain: this.dataset.domain || [],
        task: this.dataset.task || [],
        instances_number: this.dataset.instances_number || 0,
        features_number: this.dataset.features_number || 0,
        global_missing_percentage: this.dataset.global_missing_percentage,
        availability: this.dataset.availability,
        anonymization_applied: this.dataset.anonymization_applied,
        year: this.dataset.year
      },
      analysis_type: 'dataset_analysis'
    };
    
    // Utiliser le service IA (mock pour l'instant)
    this.aiService.generateMockAnalysis(this.dataset).subscribe({
      next: (response: DatasetAIResponse) => {
        this.analysis = response.analysis;
        this.isAnalyzing = false;
      },
      error: (error: any) => {
        console.error('Erreur analyse IA:', error);
        this.isAnalyzing = false;
        this.showError('Erreur lors de l\'analyse IA');
      }
    });
  }
  
  
  
  getTaskIcon(task: string): string {
    return task === 'classification' ? 'category' : 'trending_up';
  }
  
  getAlgorithmIcon(algorithm: string): string {
    return algorithm === 'decision_tree' ? 'account_tree' : 'forest';
  }
  
  startPipelineWithDataset(): void {
    if (!this.dataset) {
      this.showError('Aucun dataset sélectionné pour démarrer le pipeline');
      return;
    }

    // Naviguer vers le wizard de pipeline ML avec le dataset pré-sélectionné
    this.router.navigate(['/ml-pipeline-wizard'], {
      queryParams: { 
        datasetId: this.dataset.id,
        datasetName: this.dataset.display_name,
        source: 'ai-guide'
      }
    });
  }

  private showError(message: string) {
    this.snackBar.open(message, 'Fermer', {
      duration: 3000,
      horizontalPosition: 'end',
      verticalPosition: 'top'
    });
  }
  
}
