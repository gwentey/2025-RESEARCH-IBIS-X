import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { XAIService } from '../../../services/xai.service';
import { AuthService } from '../../../services/auth.service';
import { MlPipelineService } from '../../../services/ml-pipeline.service';
import { DatasetService } from '../../../services/dataset.service';
import { UserRead } from '../../../models/auth.models';
import {
  ExplanationType,
  ExplanationMethod,
  AudienceLevel,
  ExplanationRequestCreate,
  ExplanationRequestResponse,
  XAILoadingState
} from '../../../models/xai.models';

@Component({
  selector: 'app-xai-explanation-request',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule,
    TranslateModule
  ],
  templateUrl: './xai-explanation-request.component.html',
  styleUrls: ['./xai-explanation-request.component.scss']
})
export class XAIExplanationRequestComponent implements OnInit, OnDestroy {
  @Input() experimentId!: string;
  @Input() datasetId!: string;
  @Input() modelAlgorithm?: string;
  @Input() taskType?: 'classification' | 'regression';
  @Input() autoStart: boolean = false;
  @Input() contextData?: any; // Contexte ML complet avec profil utilisateur
  @Input() suggestions?: Array<{question: string, context: string, audience_adapted: boolean}>; // Suggestions contextuelles
  
  @Output() explanationCreated = new EventEmitter<ExplanationRequestResponse>();
  @Output() explanationCompleted = new EventEmitter<string>(); // requestId
  @Output() explanationError = new EventEmitter<string>();

  // États simplifiés  
  loadingState: XAILoadingState = { isLoading: false, progress: 0, message: '' };
  currentRequestId?: string;
  currentUser?: UserRead;
  explanationForm!: FormGroup;
  
  // Enums pour les templates (gardés pour compatibilité)
  ExplanationType = ExplanationType;
  ExplanationMethod = ExplanationMethod;
  AudienceLevel = AudienceLevel;
  
  // Options de configuration
  explanationTypes = [
    { value: ExplanationType.GLOBAL, label: 'Explication Globale', description: 'Comprendre le comportement général du modèle', icon: 'public' },
    { value: ExplanationType.FEATURE_IMPORTANCE, label: 'Importance des Variables', description: 'Quelles variables influencent le plus les prédictions', icon: 'bar_chart' },
    { value: ExplanationType.LOCAL, label: 'Explication Locale', description: 'Expliquer une prédiction spécifique', icon: 'search' }
  ];
  
  explanationMethods = [
    { value: ExplanationMethod.AUTO, label: 'Automatique', description: 'Laisser IBIS-X choisir la meilleure méthode' },
    { value: ExplanationMethod.SHAP, label: 'SHAP', description: 'Méthode basée sur la théorie des jeux (rapide pour les arbres)' },
    { value: ExplanationMethod.LIME, label: 'LIME', description: 'Explications locales via approximation linéaire' }
  ];
  
  audienceLevels = [
    { value: AudienceLevel.NOVICE, label: 'Débutant', description: 'Explications simples avec analogies du quotidien', icon: 'school' },
    { value: AudienceLevel.INTERMEDIATE, label: 'Intermédiaire', description: 'Équilibre entre accessibilité et détails techniques', icon: 'trending_up' },
    { value: AudienceLevel.EXPERT, label: 'Expert', description: 'Explications techniques détaillées', icon: 'psychology' }
  ];
  
  private subscriptions: Subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private xaiService: XAIService,
    private authService: AuthService,
    private mlPipelineService: MlPipelineService,
    private datasetService: DatasetService
  ) {}

  ngOnInit(): void {
    this.explanationForm = this.createForm();
    
    // 🐛 DEBUG COMPLET: Vérifier le contexte reçu à l'initialisation
    console.log('🐛 XAI Component Init - contextData analysis:', {
      type: typeof this.contextData,
      isNull: this.contextData === null,
      isUndefined: this.contextData === undefined,
      keys: this.contextData ? Object.keys(this.contextData) : 'NO_CONTEXT',
      keys_count: this.contextData ? Object.keys(this.contextData).length : 0
    });
    
    if (this.contextData) {
      console.log('🐛 XAI Component - Context details:', {
        dataset_name: this.contextData.dataset_name,
        experiment_id: this.contextData.experiment_id,
        accuracy: this.contextData.metrics?.overall_score,
        algorithm: this.contextData.algorithm_display,
        user_profile: this.contextData.user_profile
      });
    } else {
      console.error('❌ XAI Component - NO CONTEXT DATA RECEIVED!');
    }
    
    console.log('💡 Suggestions reçues:', this.suggestions);
    
    // Adapter automatiquement le formulaire selon le contexte utilisateur
    if (this.contextData?.user_profile) {
      this.adaptFormToUserProfile();
    }
    this.loadUserProfile();
    this.subscribeToLoadingState();
    
    if (this.autoStart) {
      // Appel asynchrone maintenant
      this.requestExplanationSimple().catch(err => {
        console.error('❌ Erreur lors de la demande d\'explication automatique:', err);
      });
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.xaiService.hasActiveExplanation()) {
      this.xaiService.stopProgressTracking();
    }
  }

  private createForm(): FormGroup {
    return this.fb.group({
      explanationType: [ExplanationType.GLOBAL, Validators.required],
      explanationMethod: [ExplanationMethod.AUTO, Validators.required],
      audienceLevel: [AudienceLevel.INTERMEDIATE, Validators.required],
      language: ['fr', Validators.required],
      includeTextExplanation: [true],
      includeVisualizations: [true],
      instanceIndex: [undefined] // Pour les explications locales
    });
  }

  /**
   * Charge le profil utilisateur pour déterminer automatiquement ses préférences
   */
  private loadUserProfile(): void {
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUser = user;
        console.log('👤 Profil utilisateur chargé pour XAI:', {
          ai_familiarity: user.ai_familiarity,
          education_level: user.education_level
        });
      },
      error: (error) => {
        console.warn('⚠️ Impossible de charger le profil utilisateur pour XAI:', error);
        // Continuer avec des valeurs par défaut
      }
    });
  }

  private subscribeToLoadingState(): void {
    this.subscriptions.add(
      this.xaiService.loadingState$.subscribe(state => {
        this.loadingState = state;
        
        if (!state.isLoading && state.progress === 100 && this.currentRequestId) {
          // Explication terminée avec succès
          this.explanationCompleted.emit(this.currentRequestId);
        }
        
        if (state.error) {
          this.explanationError.emit(state.error);
        }
      })
    );
  }

  private onExplanationTypeChange(type: ExplanationType): void {
    const instanceIndexControl = this.explanationForm.get('instanceIndex');
    
    if (type === ExplanationType.LOCAL) {
      // Rendre le champ instanceIndex requis pour les explications locales
      instanceIndexControl?.setValidators([Validators.required, Validators.min(0)]);
      instanceIndexControl?.updateValueAndValidity();
    } else {
      // Retirer la validation pour les autres types
      instanceIndexControl?.clearValidators();
      instanceIndexControl?.setValue(null);
      instanceIndexControl?.updateValueAndValidity();
    }
  }

  requestExplanation(): void {
    if (this.explanationForm.invalid) {
      this.explanationForm.markAllAsTouched();
      return;
    }

    const formValue = this.explanationForm.value;
    
    const requestData: ExplanationRequestCreate = {
      experiment_id: this.experimentId,
      dataset_id: this.datasetId,
      explanation_type: formValue.explanationType,
      method_requested: formValue.explanationMethod === ExplanationMethod.AUTO ? undefined : formValue.explanationMethod,
      audience_level: formValue.audienceLevel,
      language: formValue.language,
      instance_index: formValue.instanceIndex
    };

    this.xaiService.createExplanationRequest(requestData).subscribe({
      next: (response) => {
        if (response.success) {
          this.currentRequestId = response.request_id;
          this.explanationCreated.emit(response);
        } else {
          this.explanationError.emit(response.message);
        }
      },
      error: (error) => {
        console.error('Erreur création demande XAI:', error);
        this.explanationError.emit('Erreur lors de la création de la demande d\'explication');
      }
    });
  }

  cancelExplanation(): void {
    if (this.xaiService.hasActiveExplanation()) {
      this.xaiService.stopProgressTracking();
      this.currentRequestId = undefined;
    }
  }

  // === MÉTHODES D'INTERFACE ===

  isFieldRequired(fieldName: string): boolean {
    const control = this.explanationForm.get(fieldName);
    return control?.hasValidator(Validators.required) || false;
  }

  getFieldError(fieldName: string): string | null {
    const control = this.explanationForm.get(fieldName);
    
    if (control?.errors && control.touched) {
      if (control.errors['required']) {
        return 'Ce champ est requis';
      }
      if (control.errors['min']) {
        return 'La valeur doit être positive';
      }
    }
    
    return null;
  }

  isFormValid(): boolean {
    return this.explanationForm.valid;
  }

  canRequestExplanation(): boolean {
    return this.isFormValid() && !this.loadingState.isLoading;
  }

  getProgressMessage(): string {
    if (this.loadingState.message) {
      return this.loadingState.message;
    }
    
    if (this.loadingState.progress > 0) {
      return `Progression: ${this.loadingState.progress}%`;
    }
    
    return '';
  }

  // === MÉTHODES UTILITAIRES ===

  getExplanationTypeDescription(type: ExplanationType): string {
    const typeInfo = this.explanationTypes.find(t => t.value === type);
    return typeInfo?.description || '';
  }

  getAudienceLevelDescription(level: AudienceLevel): string {
    const levelInfo = this.audienceLevels.find(l => l.value === level);
    return levelInfo?.description || '';
  }

  getMethodRecommendation(): string {
    if (!this.modelAlgorithm) return '';
    
    if (this.modelAlgorithm.includes('tree') || this.modelAlgorithm.includes('forest')) {
      return 'SHAP est recommandé pour les modèles basés sur les arbres (plus rapide)';
    }
    
    return 'Mode automatique recommandé - IBIS-X choisira la meilleure méthode';
  }

  // === ACTIONS RAPIDES ===

  quickExplainFeatureImportance(): void {
    this.explanationForm.patchValue({
      explanationType: ExplanationType.FEATURE_IMPORTANCE,
      explanationMethod: ExplanationMethod.AUTO
    });
    this.requestExplanation();
  }

  quickExplainGlobal(): void {
    this.explanationForm.patchValue({
      explanationType: ExplanationType.GLOBAL,
      explanationMethod: ExplanationMethod.AUTO
    });
    this.requestExplanation();
  }

  // === GESTION DES ERREURS ===

  hasError(): boolean {
    return !!this.loadingState.error;
  }

  getErrorMessage(): string {
    return this.loadingState.error || '';
  }

  clearError(): void {
    if (this.loadingState.error) {
      this.loadingState = { ...this.loadingState, error: undefined };
    }
  }

  // Nouvelles méthodes pour l'interface moderne
  selectExplanationType(type: string): void {
    this.explanationForm.patchValue({ explanationType: type });
    
    // Reset instance index si pas local
    if (type !== ExplanationType.LOCAL) {
      this.explanationForm.patchValue({ instanceIndex: undefined });
    }
  }

  selectAudienceLevel(level: string): void {
    this.explanationForm.patchValue({ audienceLevel: level });
  }

  // ===== NOUVELLES MÉTHODES SIMPLIFIÉES =====

  /**
   * Retourne le nom d'affichage du modèle
   */
  getModelDisplayName(): string {
    switch (this.modelAlgorithm) {
      case 'decision_tree': return 'Decision Tree';
      case 'random_forest': return 'Random Forest';
      default: return 'Modèle ML';
    }
  }

  /**
   * Retourne le nom de la méthode recommandée automatiquement
   */
  getRecommendedMethodName(): string {
    if (!this.modelAlgorithm) return 'Méthode Automatique';
    
    const method = this.xaiService.recommendExplanationMethod(this.modelAlgorithm);
    switch (method) {
      case ExplanationMethod.SHAP: return 'SHAP TreeExplainer';
      case ExplanationMethod.LIME: return 'LIME';
      default: return 'Méthode Automatique';
    }
  }

  /**
   * Détermine automatiquement le niveau d'audience basé sur le profil utilisateur
   */
  private getAutomaticAudienceLevel(): AudienceLevel {
    if (!this.currentUser || !this.currentUser.ai_familiarity) {
      return AudienceLevel.INTERMEDIATE; // Valeur par défaut
    }

    return this.xaiService.recommendAudienceLevel({
      ai_familiarity: this.currentUser.ai_familiarity,
      education_level: this.currentUser.education_level
    });
  }

  /**
   * Adapter le formulaire selon le profil utilisateur reçu
   */
  private adaptFormToUserProfile(): void {
    const userProfile = this.contextData.user_profile;
    console.log('👤 Adaptation formulaire pour profil:', userProfile);
    
    // Pré-sélectionner le niveau d'audience selon le profil utilisateur réel
    if (userProfile.audience_level && this.explanationForm) {
      this.explanationForm.patchValue({
        audienceLevel: userProfile.audience_level
      });
      console.log('📊 Niveau d\'audience pré-sélectionné:', userProfile.audience_level);
    }
    
    // Pré-sélectionner la méthode optimale selon l'algorithme
    if (this.contextData.algorithm && this.explanationForm) {
      const optimalMethod = this.getOptimalMethodForAlgorithm(this.contextData.algorithm);
      this.explanationForm.patchValue({
        method: optimalMethod
      });
      console.log('🔧 Méthode optimale pré-sélectionnée:', optimalMethod);
    }
  }
  
  /**
   * Détermine la méthode XAI optimale selon l'algorithme
   */
  private getOptimalMethodForAlgorithm(algorithm: string): ExplanationMethod {
    if (algorithm === 'decision_tree' || algorithm === 'random_forest') {
      return ExplanationMethod.SHAP; // SHAP TreeExplainer optimal pour les arbres
    }
    return ExplanationMethod.AUTO;
  }
  
  /**
   * Récupère une suggestion sélectionnée par l'utilisateur
   */
  selectSuggestion(suggestion: {question: string, context: string, audience_adapted: boolean}): void {
    console.log('💡 Suggestion sélectionnée:', suggestion);
    // TODO: Implémenter la logique de pré-remplissage selon la suggestion
  }
  
  /**
   * 🚨 SOLUTION DE CONTOURNEMENT : Récupérer directement les données ML
   */
  async fetchMLContextDirectly(): Promise<any> {
    console.log('🚨 RÉCUPÉRATION DIRECTE DU CONTEXTE ML...');
    
    try {
      // Récupérer les résultats de l'expérience (incluant le SHAP pré-calculé)
      const results = await this.mlPipelineService.getExperimentResults(this.experimentId).toPromise();
      console.log('✅ Résultats ML récupérés:', results);
      
      // 🎯 VÉRIFICATION CRITIQUE : S'assurer que feature_importance (SHAP) est présent
      if (results?.feature_importance) {
        console.log('📊 SHAP PRÉ-CALCULÉ TROUVÉ !');
        console.log('  - Nombre de features:', Object.keys(results.feature_importance).length);
        console.log('  - Top 5 features:', Object.entries(results.feature_importance)
          .sort(([,a]: any, [,b]: any) => b - a)
          .slice(0, 5)
          .map(([name, value]) => `${name}: ${value}`)
        );
      } else {
        console.warn('⚠️ ATTENTION: Pas de SHAP pré-calculé dans les résultats ML !');
      }
      
      // Récupérer les infos du dataset si disponible
      let dataset = null;
      if (this.datasetId) {
        try {
          dataset = await this.datasetService.getDataset(this.datasetId).toPromise();
          console.log('✅ Dataset récupéré:', dataset);
        } catch (err) {
          console.warn('⚠️ Impossible de récupérer le dataset:', err);
        }
      }
      
      // Récupérer le profil utilisateur
      const user = await this.authService.getCurrentUser().toPromise();
      
        // Déterminer le type de tâche
        const taskType = results?.preprocessing_config?.['task_type'] || 'classification';
        const isRegression = taskType === 'regression';
        
        console.log('🚨 DEBUG DIFFÉRENCIATION MÉTRIQUES:');
        console.log('  - Task Type:', taskType);
        console.log('  - Is Regression:', isRegression);
        console.log('  - Raw Metrics:', results?.metrics);
        
        // Construire les métriques selon le type de tâche
        let metricsData: any = {
          raw_metrics: results?.metrics || {},
        };
        
        if (isRegression) {
          // 🎯 MÉTRIQUES DE RÉGRESSION
          metricsData = {
            ...metricsData,
            task_type: 'regression',
            overall_score: results?.metrics?.r2 ? Math.round(results.metrics.r2 * 100) : 0,
            r2_score: results?.metrics?.r2 || 0,
            mae: results?.metrics?.mae || 0,
            mse: results?.metrics?.mse || 0,
            rmse: results?.metrics?.rmse || 0,
            // 🚫 PAS de métriques de classification pour la régression
            classification_metrics_not_applicable: true,
            explanation_for_missing_metrics: "Les métriques F1, précision et rappel ne sont pas applicables aux modèles de régression. Pour évaluer ce modèle de régression, utilisez le R² (variance expliquée), MAE (erreur absolue moyenne), RMSE (racine de l'erreur quadratique moyenne) et MSE (erreur quadratique moyenne)."
          };
        } else {
          // 🎯 MÉTRIQUES DE CLASSIFICATION
          metricsData = {
            ...metricsData,
            task_type: 'classification',
            overall_score: results?.metrics?.accuracy ? Math.round(results.metrics.accuracy * 100) : 0,
            accuracy: results?.metrics?.accuracy || 0,
            f1_score: results?.metrics?.f1_macro || results?.metrics?.f1_score || 0,
            precision: results?.metrics?.precision_macro || results?.metrics?.precision || 0,
            recall: results?.metrics?.recall_macro || results?.metrics?.recall || 0,
            // 🚫 PAS de métriques de régression pour la classification
            regression_metrics_not_applicable: true,
            explanation_for_missing_metrics: "Les métriques R², MAE, RMSE et MSE ne sont pas applicables aux modèles de classification. Pour évaluer ce modèle de classification, utilisez la précision (accuracy), le F1-score, la précision et le rappel."
          };
        }
        
        // Construire le contexte ML complet avec le SHAP pré-calculé
        const context = {
          experiment_id: this.experimentId,
          dataset_id: this.datasetId,
          dataset_name: dataset?.dataset_name || 'Dataset',
          dataset_size: dataset?.instances_number || 0,
          algorithm: results?.algorithm || 'unknown',
          algorithm_display: this.getAlgorithmDisplayName(results?.algorithm || 'unknown'),
          metrics: metricsData,
          // 🎯 CRITIQUE : Inclure le SHAP pré-calculé du ML Pipeline
          feature_importance: results?.feature_importance || {},
          shap_calculated: !!results?.feature_importance, // Flag pour indiquer si SHAP est disponible
          shap_features_count: results?.feature_importance ? Object.keys(results.feature_importance).length : 0,
          // Confusion matrix seulement pour classification
          confusion_matrix: isRegression ? null : (results?.metrics?.confusion_matrix || []),
          class_names: isRegression ? null : this.extractClassNames(results),
          // Informations sur le preprocessing utilisé pour comprendre le contexte
          preprocessing_config: results?.preprocessing_config || {},
          task_type: taskType,
          is_regression: isRegression,
          is_classification: !isRegression,
          user_profile: {
            ai_familiarity: user?.ai_familiarity || 3,
            education_level: user?.education_level || 'intermediate',
            user_id: user?.id,
            language: user?.locale || 'fr'
          }
        };
      
        console.log('✅ Contexte ML reconstruit avec SHAP pré-calculé:', {
          experiment_id: context.experiment_id,
          algorithm: context.algorithm,
          task_type: context.task_type,
          is_regression: context.is_regression,
          shap_available: context.shap_calculated,
          shap_features: context.shap_features_count,
          metrics_score: context.metrics.overall_score
        });
        
        console.log('🚨 DEBUG MÉTRIQUES FINALES DANS CONTEXTE:');
        console.log('  - Contexte metrics:', context.metrics);
        console.log('  - Classification applicable?', !context.metrics.classification_metrics_not_applicable);
        console.log('  - Regression applicable?', !context.metrics.regression_metrics_not_applicable);
        
        return context;
      
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du contexte:', error);
      return null;
    }
  }
  
  private getAlgorithmDisplayName(algorithm: string): string {
    const names: any = {
      'decision_tree': 'Decision Tree',
      'random_forest': 'Random Forest',
      'gradient_boosting': 'Gradient Boosting',
      'svm': 'Support Vector Machine',
      'logistic_regression': 'Logistic Regression',
      'neural_network': 'Neural Network'
    };
    return names[algorithm] || algorithm;
  }
  
  private extractClassNames(results: any): string[] {
    // Essayer d'extraire les noms de classes depuis la matrice de confusion ou les métriques
    if (results?.preprocessing_config?.class_names) {
      return results.preprocessing_config.class_names;
    }
    if (results?.metrics?.class_report) {
      return Object.keys(results.metrics.class_report).filter(k => k !== 'accuracy' && k !== 'macro avg' && k !== 'weighted avg');
    }
    return [];
  }

  /**
   * Version simplifiée de la demande d'explication qui utilise le SHAP pré-calculé du ML Pipeline
   * Ne recalcule PAS le SHAP car il est déjà disponible dans feature_importance
   */
  async requestExplanationSimple(): Promise<void> {
    if (!this.canRequestExplanation()) {
      return;
    }

    // Déterminer automatiquement le niveau d'audience
    const audienceLevel = this.getAutomaticAudienceLevel();
    
    // 🚫 SUPPRESSION : Plus de détermination automatique de méthode SHAP/LIME
    // Le SHAP est déjà calculé dans ML Pipeline, on utilise simplement les résultats existants
    
    // 🎯 TOUJOURS récupérer le contexte directement pour garantir la cohérence
    console.log('🚀 Récupération du contexte ML avec SHAP pré-calculé...');
    
    // Toujours utiliser fetchMLContextDirectly pour avoir le vrai contexte avec le SHAP
    const finalContextData = await this.fetchMLContextDirectly();
    
    if (!finalContextData) {
      console.error('❌ ERREUR CRITIQUE: Impossible de récupérer le contexte ML !');
      this.explanationError.emit('Impossible de récupérer les données du modèle');
      return;
    }
    
    console.log('✅ Contexte ML récupéré avec succès !');
    console.log('📊 Données disponibles:');
    console.log('  - Dataset:', finalContextData.dataset_name);
    console.log('  - Algorithme:', finalContextData.algorithm);
    console.log('  - Type de tâche:', finalContextData.task_type);
    console.log('  - Score:', finalContextData.metrics?.overall_score);
    console.log('  - SHAP pré-calculé:', Object.keys(finalContextData.feature_importance || {}).length, 'features');

    const requestData: ExplanationRequestCreate = {
      experiment_id: this.experimentId,
      dataset_id: this.datasetId,
      explanation_type: ExplanationType.FEATURE_IMPORTANCE, // Toujours l'importance des variables par défaut
      method_requested: undefined, // 🚫 PAS DE MÉTHODE : On utilise le SHAP déjà calculé
      audience_level: audienceLevel,
      language: 'fr', // Toujours français selon les règles
      instance_index: undefined, // Pas d'explication locale par défaut
      // 🎯 FORCER l'inclusion du contexte ML complet avec le SHAP pré-calculé
      ml_context: finalContextData,
      contextual_suggestions: this.suggestions || [],
      // 🆕 Flag pour indiquer d'utiliser le SHAP pré-calculé (pas de recalcul)
      use_precalculated_shap: true
    } as any;

    console.log('🚀 Demande d\'explication XAI avec SHAP pré-calculé:', {
      audience_level: audienceLevel,
      use_precalculated_shap: true,
      shap_features_count: finalContextData.feature_importance ? Object.keys(finalContextData.feature_importance).length : 0,
      user_ai_familiarity: this.currentUser?.ai_familiarity,
      ml_context_included: !!finalContextData,
      ml_context_keys: finalContextData ? Object.keys(finalContextData).length : 0
    });
    
    // 🚨 DEBUG CRITIQUE: Vérifier exactement ce qui est envoyé
    console.log('📤 PAYLOAD COMPLET ENVOYÉ AU BACKEND:');
    console.log('requestData:', JSON.stringify(requestData));
    console.log('ml_context dans le payload:', requestData.ml_context);
    console.log('feature_importance dans ml_context:', requestData.ml_context?.feature_importance);

    this.xaiService.createExplanationRequest(requestData).subscribe({
      next: (response) => {
        if (response.success) {
          this.currentRequestId = response.request_id;
          this.explanationCreated.emit(response);
        } else {
          this.explanationError.emit(response.message);
        }
      },
      error: (error) => {
        console.error('❌ Erreur création demande XAI simple:', error);
        this.explanationError.emit('Erreur lors de la création de la demande d\'explication');
      }
    });
  }
}
