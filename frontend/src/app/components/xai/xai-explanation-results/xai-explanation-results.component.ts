import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { XAIChatInterfaceComponent } from '../xai-chat-interface/xai-chat-interface.component';

import {
  ExplanationResults
} from '../../../models/xai.models';
import { XAIService } from '../../../services/xai.service';

@Component({
  selector: 'app-xai-explanation-results',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    TranslateModule,
    XAIChatInterfaceComponent
  ],
  templateUrl: './xai-explanation-results.component.html',
  styleUrls: [
    './xai-explanation-results.component.scss',
    './xai-textual-explanations.scss'
  ]
})
export class XAIExplanationResultsComponent implements OnInit, OnDestroy, OnChanges {
  @Input() requestId!: string;
  @Input() showChatButton: boolean = true;
  @Input() compactMode: boolean = false;
  @Input() contextData?: any; // Contexte ML complet avec profil utilisateur

  @Output() newExplanationRequest = new EventEmitter<void>();
  @Output() backRequested = new EventEmitter<void>();

  // Données
  explanationResults?: ExplanationResults;
  explanation?: any; // Pour la compatibilité avec le template
  
  // États
  isLoading = true;
  hasError = false;
  errorMessage = '';
  
  // Configuration de l'affichage simplifiée
  
  // Subscriptions
  private subscriptions = new Subscription();

  constructor(
    private xaiService: XAIService,
    private translateService: TranslateService
  ) {}

  ngOnInit(): void {
    console.log('🏐 XAI Results initialisé avec contexte:', this.contextData);
    console.log('🐛 DEBUG XAI RESULTS - contextData type:', typeof this.contextData);
    console.log('🐛 DEBUG XAI RESULTS - contextData keys:', this.contextData ? Object.keys(this.contextData) : 'NO_CONTEXT');
    console.log('🐛 DEBUG XAI RESULTS - dataset_name:', this.contextData?.dataset_name);
    console.log('🐛 DEBUG XAI RESULTS - metrics:', this.contextData?.metrics);
    console.log('🐛 DEBUG XAI RESULTS - full context:', JSON.stringify(this.contextData, null, 2));
    this.loadExplanationResults();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['requestId'] && changes['requestId'].currentValue) {
      this.loadExplanationResults();
    }
    
    // 🐛 DEBUG: Vérifier les changements de contexte
    if (changes['contextData']) {
      console.log('🐛 DEBUG XAI RESULTS - contextData changed:');
      console.log('🐛 DEBUG XAI RESULTS - Previous value:', changes['contextData'].previousValue);
      console.log('🐛 DEBUG XAI RESULTS - Current value:', changes['contextData'].currentValue);
    }
  }

  // === CHARGEMENT DES DONNÉES ===

  private loadExplanationResults(): void {
    if (!this.requestId) return;
    
    this.isLoading = true;
    this.hasError = false;
    
    // ✅ CORRECTION: D'abord vérifier le statut, puis polling si nécessaire
    this.checkExplanationStatus();
  }

  private checkExplanationStatus(): void {
    const subscription = this.xaiService.getExplanationRequest(this.requestId).subscribe({
      next: (request: any) => {
        console.log('🔍 Statut de l\'explication:', request.status);
        
        if (request.status === 'completed') {
          // ✅ L'explication est terminée, récupérer les résultats
          this.loadCompletedResults();
        } else if (request.status === 'failed') {
          // ❌ L'explication a échoué
          this.hasError = true;
          this.errorMessage = 'L\'explication a échoué lors de la génération';
          this.isLoading = false;
        } else {
          // 🔄 L'explication est en cours, continuer le polling
          this.explanationResults = {
            id: request.id,
            status: request.status,
            progress: request.progress || 0,
            explanation_type: request.explanation_type,
            method_used: request.method_used,
            audience_level: request.audience_level
          } as any;
          
          // Continuer le polling dans 2 secondes
          setTimeout(() => {
            if (!this.hasError) {
              this.checkExplanationStatus();
            }
          }, 2000);
        }
      },
      error: (error: any) => {
        console.error('Erreur lors de la vérification du statut XAI:', error);
        this.hasError = true;
        this.errorMessage = error.message || 'Erreur lors de la vérification du statut';
        this.isLoading = false;
      }
    });

    this.subscriptions.add(subscription);
  }

  private loadCompletedResults(): void {
    const subscription = this.xaiService.getExplanationResults(this.requestId).subscribe({
      next: (results: any) => {
        console.log('✅ Résultats XAI récupérés:', results);
        this.explanationResults = results;
        this.explanation = this.processResults(results); // Traitement des résultats
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Erreur lors du chargement des résultats finaux:', error);
        this.hasError = true;
        this.errorMessage = error.message || 'Erreur lors du chargement des résultats';
        this.isLoading = false;
      }
    });

    this.subscriptions.add(subscription);
  }

  /**
   * Traite les résultats bruts du backend pour l'affichage
   */
  private processResults(results: ExplanationResults): any {
    const processed = {
      ...results,
      // Informations de méta-données pour le chat
      processing_info: {
        method_used: results.method_used,
        processing_time: results.processing_time_seconds,
        audience_level: results.audience_level,
        explanation_type: results.explanation_type
      }
    };

    console.log('🔄 Résultats traités (simplifiés):', processed);
    return processed;
  }

  private processExplanationData(): void {
    // Simplification : pas de traitement complexe
    return;
  }

  // === MÉTHODES POUR L'INTERFACE SIMPLIFIÉE ===

  /**
   * Actions principales
   */
  downloadResults(): void {
    // Logique de téléchargement des résultats complets
    console.log('Download results');
  }

  shareResults(): void {
    // Logique de partage
    console.log('Share results');
  }

  newExplanation(): void {
    this.newExplanationRequest.emit();
  }

  onBack(): void {
    this.backRequested.emit();
  }

  // === MÉTHODES D'AFFICHAGE ===

  retryLoading(): void {
    if (this.requestId) {
      this.loadExplanationResults();
    }
  }

  // === MÉTHODES POUR LA DESCRIPTION TEXTUELLE CONTEXTUALISÉE ===

  /**
   * Retourne la classe CSS selon le niveau d'audience
   */
  getAudienceLevelClass(): string {
    if (!this.explanation?.audience_level) return 'level-intermediate';
    
    switch (this.explanation.audience_level) {
      case 'novice': return 'level-novice';
      case 'expert': return 'level-expert';
      default: return 'level-intermediate';
    }
  }

  /**
   * Retourne l'icône appropriée selon le niveau d'audience
   */
  getAudienceLevelIcon(): string {
    if (!this.explanation?.audience_level) return 'school';
    
    switch (this.explanation.audience_level) {
      case 'novice': return 'school';
      case 'expert': return 'science';
      default: return 'analytics';
    }
  }

  /**
   * Retourne le label du niveau d'audience
   */
  getAudienceLevelLabel(): string {
    if (!this.explanation?.audience_level) {
      return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.LEVEL_BADGE');
    }
    
    switch (this.explanation.audience_level) {
      case 'novice': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.NOVICE.LEVEL_BADGE');
      case 'expert': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.EXPERT.LEVEL_BADGE');
      default: 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.LEVEL_BADGE');
    }
  }

  /**
   * Retourne le titre de la description selon le niveau
   */
  getDescriptionTitle(): string {
    if (!this.explanation?.audience_level) {
      return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.TITLE');
    }
    
    switch (this.explanation.audience_level) {
      case 'novice': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.NOVICE.TITLE');
      case 'expert': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.EXPERT.TITLE');
      default: 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.TITLE');
    }
  }

  /**
   * Retourne le sous-titre de la description selon le niveau
   */
  getDescriptionSubtitle(): string {
    if (!this.explanation?.audience_level) {
      return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.SUBTITLE');
    }
    
    switch (this.explanation.audience_level) {
      case 'novice': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.NOVICE.SUBTITLE');
      case 'expert': 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.EXPERT.SUBTITLE');
      default: 
        return this.translateService.instant('XAI.TEXTUAL_EXPLANATIONS.INTERMEDIATE.SUBTITLE');
    }
  }

  /**
   * Retourne la classe CSS pour le texte d'explication
   */
  getTextExplanationClass(): string {
    if (!this.explanation?.audience_level) return 'text-intermediate';
    
    switch (this.explanation.audience_level) {
      case 'novice': return 'text-novice';
      case 'expert': return 'text-expert';
      default: return 'text-intermediate';
    }
  }

  /**
   * Formate le texte d'explication en remplaçant les ** par des balises <strong>
   * et en ajoutant des sauts de ligne appropriés
   */
  formatTextExplanation(textExplanation: string): string {
    if (!textExplanation) return '';
    
    // Remplacer **texte** par <strong>texte</strong>
    let formatted = textExplanation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Ajouter des sauts de ligne pour les paragraphes
    formatted = formatted.replace(/\n\n/g, '<br><br>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Styliser les pourcentages et métriques
    formatted = formatted.replace(/(\d+(?:\.\d+)?%)/g, '<span class="metric-highlight">$1</span>');
    
    // Styliser les noms de variables importantes (entre parenthèses)
    formatted = formatted.replace(/\(([^)]+)\)/g, '<span class="feature-highlight">($1)</span>');
    
    return formatted;
  }

  /**
   * Vérifie si des visualisations sont disponibles
   */
  hasVisualizations(): boolean {
    return this.explanation?.visualizations && 
           Object.keys(this.explanation.visualizations).length > 0;
  }

  /**
   * Retourne la liste des visualisations pour l'affichage
   */
  getVisualizationsList(): Array<{title: string, url: string, type: string}> {
    if (!this.hasVisualizations()) return [];
    
    const visualizations = this.explanation.visualizations;
    const result = [];
    
    // Ajouter chaque visualisation avec un titre approprié
    for (const [key, value] of Object.entries(visualizations)) {
      if (typeof value === 'string') {
        result.push({
          title: this.getVisualizationTitle(key),
          url: value,
          type: key
        });
      }
    }
    
    return result;
  }

  /**
   * Retourne un titre approprié pour chaque type de visualisation
   */
  private getVisualizationTitle(vizType: string): string {
    switch (vizType) {
      case 'shap_feature_importance':
        return 'Importance des Variables (SHAP)';
      case 'lime_explanation':
        return 'Explication Locale (LIME)';
      case 'feature_importance':
        return 'Importance des Variables';
      case 'shap_waterfall':
        return 'Analyse SHAP Détaillée';
      default:
        return 'Visualisation';
    }
  }


}