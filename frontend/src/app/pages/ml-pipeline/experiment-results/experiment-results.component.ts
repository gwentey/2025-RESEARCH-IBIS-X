import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslateModule } from '@ngx-translate/core';

import { MlPipelineService } from '../../../services/ml-pipeline.service';
import { DatasetService } from '../../../services/dataset.service';
import { XAIService } from '../../../services/xai.service';
import { AuthService } from '../../../services/auth.service';
import { UserRead } from '../../../models/auth.models';
import { AudienceLevel } from '../../../models/xai.models';
import { RealTreeVisualizationComponent } from '../../../components/shared/real-tree-visualization/real-tree-visualization.component';
import { XAIExplanationRequestComponent } from '../../../components/xai/xai-explanation-request/xai-explanation-request.component';
import { XAIExplanationResultsComponent } from '../../../components/xai/xai-explanation-results/xai-explanation-results.component';
import { XAIChatInterfaceComponent } from '../../../components/xai/xai-chat-interface/xai-chat-interface.component';
import { WebSHAPExplainerComponent } from '../../../components/xai/webshap-explainer/webshap-explainer.component';
import { ExperimentStatus, ExperimentResults } from '../../../models/ml-pipeline.models';
import { ExplanationRequestResponse } from '../../../models/xai.models';

@Component({
  selector: 'app-experiment-results',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTabsModule,
    TranslateModule,
    RealTreeVisualizationComponent,
    XAIExplanationRequestComponent,
    XAIExplanationResultsComponent,
    XAIChatInterfaceComponent,
    WebSHAPExplainerComponent
  ],
  templateUrl: './experiment-results.component.html',
  styleUrls: ['./experiment-results.component.scss']
})
export class ExperimentResultsComponent implements OnInit, OnDestroy {
  experimentId: string = '';
  projectId: string = '';
  experiment: ExperimentStatus | null = null;
  results: ExperimentResults | null = null;
  isLoading = true;
  datasetColumns: any[] = [];
  dataset: any = null; // Stocker le dataset complet pour accéder aux infos
  fullMLContext: any = null; // 🎯 Contexte ML stable pour XAI
  isContextReady = false; // 🎯 Flag pour savoir si le contexte est prêt
  
  // États XAI
  activeXAIRequestId?: string;
  hasActiveXAIExplanation = false;
  showXAIChat = false;
  
  // État de l'interface pour les onglets
  selectedTabIndex = 0;
  
  // 🚀 CACHE: Pour éviter les appels répétés des méthodes du template
  private templateMethodCache: Map<string, any> = new Map();
  private cacheInvalidated = false;
  
  // 🎯 CACHE UTILISATEUR pour éviter les Observables répétés
  cachedUser: UserRead | null = null;
  userLoadingError = false;
  userLoading = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private mlPipelineService: MlPipelineService,
    private datasetService: DatasetService,
    private xaiService: XAIService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.experimentId = this.route.snapshot.params['id'];
    console.log('🚀 INIT - Experiment ID:', this.experimentId);
    this.extractProjectId();
    
    // 🎯 CHARGER LE PROFIL UTILISATEUR UNE SEULE FOIS
    this.loadUserProfile();
    
    this.loadExperimentData();
    
    // 🎯 SOLUTION FINALE: Préparer le système fullscreen
    setTimeout(() => this.initializeFullscreenSystem(), 1000);
    
    // 🚀 FIX IMMÉDIAT: Empêcher la propagation excessive des clics
    this.applyImmediateFix();
  }
    
  ngOnDestroy() {
    // Nettoyer le mode plein écran si actif
    if (this.isTreeFullscreen) {
      this.closeFullscreenPopup();
    }
    
    // Supprimer le bouton fullscreen
    const fullscreenBtn = document.getElementById('tree-fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.remove();
    }
  }

  private extractProjectId(): void {
    this.projectId = this.route.snapshot.parent?.parent?.params['id'] ||
                     this.route.snapshot.queryParams['projectId'] || '';

    if (!this.projectId) {
      const urlParts = this.router.url.split('/');
      const projectIndex = urlParts.indexOf('projects');
      if (projectIndex !== -1 && urlParts[projectIndex + 1]) {
        this.projectId = urlParts[projectIndex + 1];
      }
    }
  }

    private loadExperimentData(): void {
    this.mlPipelineService.getExperimentStatus(this.experimentId).subscribe({
      next: (status: any) => {
        console.log('🔍 EXPERIMENT STATUS RECEIVED:', status);
        console.log('🔍 STATUS KEYS:', Object.keys(status));
        this.experiment = status;
        
        // Vérifier TOUTES les sources possibles de dataset_id
        const datasetId = status.dataset_id || 
                         (status as any).datasetId || 
                         (status as any).dataset || 
                         (status as any).datasetID;
        
        if (datasetId) {
          console.log('✅ Dataset ID trouvé:', datasetId);
          console.log('🔍 DATASET DEBUG - À propos du chargement des colonnes...');
          this.loadDatasetColumns(datasetId);
        } else {
          console.error('❌ Pas de dataset_id dans le status. Propriétés disponibles:', Object.keys(status));
          // ESSAYER de récupérer depuis l'expérience complète
          this.tryLoadExperimentWithDatasetId();
        }

        if (status.status === 'completed') {
          this.loadResults();
        } else {
          this.isLoading = false;
        }
      },
      error: (err: any) => {
        console.error('❌ Erreur chargement experiment:', err);
        this.isLoading = false;
      }
    });
  }

  private tryLoadExperimentWithDatasetId(): void {
    console.log('🔄 Tentative de récupération de l\'expérience complète...');
    // Si le service a une méthode pour récupérer l'expérience complète
    if ((this.mlPipelineService as any).getExperiment) {
      (this.mlPipelineService as any).getExperiment(this.experimentId).subscribe({
        next: (fullExperiment: any) => {
          console.log('📋 FULL EXPERIMENT:', fullExperiment);
          const datasetId = fullExperiment.dataset_id || fullExperiment.datasetId;
          if (datasetId) {
            console.log('✅ Dataset ID trouvé dans expérience complète:', datasetId);
            this.loadDatasetColumns(datasetId);
          }
        },
        error: (err: any) => console.warn('⚠️ Impossible de récupérer l\'expérience complète:', err)
      });
    }
  }

  private loadResults(): void {
    this.mlPipelineService.getExperimentResults(this.experimentId).subscribe({
      next: async (results: any) => {
        console.log('🔍 EXPERIMENT RESULTS RECEIVED:', results);
        this.results = results;
        
        // 🔍 AMÉLIORÉ: Debug des visualisations et métriques après chargement
        console.log('🚀 DÉBUT DEBUG ANALYSIS...');
        
        // 🚨 FORCER DEBUG VISUALIZATION IMMÉDIATEMENT
        try {
          console.log('🚨 FORCE DEBUG - Visualizations object:', results.visualizations);
          console.log('🚨 FORCE DEBUG - Visualizations keys:', Object.keys(results.visualizations || {}));
          console.log('🚨 FORCE DEBUG - Has confusion_matrix:', !!(results.visualizations?.confusion_matrix));
          console.log('🚨 FORCE DEBUG - Has roc_curve:', !!(results.visualizations?.roc_curve));
          console.log('🚨 FORCE DEBUG - Has pr_curve:', !!(results.visualizations?.pr_curve));
          
          // Vérifier chaque visualisation individuellement
          if (results.visualizations) {
            Object.entries(results.visualizations).forEach(([key, value]) => {
              console.log(`🚨 FORCE DEBUG - ${key}:`, typeof value, value);
            });
          }
          
          this.debugVisualizationData();
          this.debugNewMetrics();
        } catch (debugError) {
          console.error('❌ ERREUR dans debug visualizations:', debugError);
        }
        console.log('🏁 FIN DEBUG ANALYSIS.');
        
        // FALLBACK: Si les colonnes ne sont pas encore chargées, essayer avec l'experiment complet
        if (this.datasetColumns.length === 0 && results.preprocessing_config) {
          console.log('🔄 FALLBACK: Tentative de récupération du dataset_id depuis les résultats');
          this.tryLoadColumnsFromResults(results);
        }
        
        // 🎯 CALCULER LE CONTEXTE ML COMPLET UNE FOIS QUE LES DONNÉES SONT DISPONIBLES
        await this.calculateFullMLContext();
        
        this.isLoading = false;
      },
      error: () => this.isLoading = false
    });
  }

    private tryLoadColumnsFromResults(results: ExperimentResults): void {
    // Essayer de trouver le dataset_id dans différentes sources
    const datasetId = 
      (results as any).dataset_id || 
      (results.preprocessing_config as any)?.dataset_id ||
      (results.preprocessing_config as any)?.dataset ||
      this.experiment?.dataset_id;
      
    if (datasetId) {
      console.log('✅ FALLBACK: Dataset ID trouvé dans les résultats:', datasetId);
      console.log('🔍 FALLBACK DEBUG - À propos du chargement des colonnes...');
      this.loadDatasetColumns(datasetId);
      } else {
      console.error('❌ FALLBACK FAILED: Impossible de trouver le dataset_id');
      console.log('🔍 Results keys:', Object.keys(results));
      console.log('🔍 Preprocessing config:', results.preprocessing_config);
      
      // DERNIER RECOURS: Essayer d'extraire depuis l'URL ou l'ID
      this.tryExtractDatasetFromContext();
    }
  }

  private tryExtractDatasetFromContext(): void {
    console.log('🔄 DERNIER RECOURS: Tentative d\'extraction depuis le contexte...');
    
    // Essayer d'extraire depuis l'URL du navigateur (si elle contient des infos)
    const url = window.location.href;
    console.log('🌐 Current URL:', url);
    
    // Ou essayer de récupérer tous les datasets et prendre le premier/dernier utilisé
    this.datasetService.getDatasets({ page: 1, page_size: 10 }).subscribe({
        next: (datasetsResponse: any) => {
          console.log('📊 Available datasets:', datasetsResponse);
          if (datasetsResponse.datasets && datasetsResponse.datasets.length > 0) {
            // Prendre le premier dataset comme fallback temporaire
            const firstDataset = datasetsResponse.datasets[0];
            console.log('⚠️ USING FIRST AVAILABLE DATASET AS FALLBACK:', firstDataset.id);
            this.loadDatasetColumns(firstDataset.id);
          }
        },
        error: (err: any) => console.error('❌ Impossible de récupérer la liste des datasets:', err)
    });
  }

  private loadDatasetColumns(datasetId: string): void {
    console.log('🚀 DÉBUT loadDatasetColumns - datasetId:', datasetId);
    if (!datasetId) {
      console.warn('⚠️ Pas de dataset_id fourni');
      return;
    }
    
    console.log('📂 Chargement des colonnes pour dataset:', datasetId);
    console.log('🔍 DatasetService URL sera:', `${(this.datasetService as any).baseUrl || 'UNKNOWN'}/datasets/${datasetId}`);
    
    this.datasetService.getDataset(datasetId).subscribe({
      next: async (dataset: any) => {
        console.log('📊 Dataset récupéré:', dataset);
        console.log('📊 STRUCTURE DEBUG - Dataset keys:', Object.keys(dataset));
        console.log('📊 STRUCTURE DEBUG - dataset.files:', dataset.files);
        console.log('📊 STRUCTURE DEBUG - files type:', typeof dataset.files);
        console.log('📊 STRUCTURE DEBUG - files length:', dataset.files?.length);
        
        if (dataset.files && dataset.files.length > 0) {
          console.log('📊 STRUCTURE DEBUG - First file:', dataset.files[0]);
          console.log('📊 STRUCTURE DEBUG - First file keys:', Object.keys(dataset.files[0]));
          console.log('📊 STRUCTURE DEBUG - First file columns:', dataset.files[0].columns);
        }
        
        // Stocker le dataset complet
        this.dataset = dataset;
        
        // Récupérer les colonnes du premier fichier
        if (dataset.files && dataset.files.length > 0 && dataset.files[0].columns) {
          this.datasetColumns = dataset.files[0].columns;
          console.log('✅ Colonnes chargées:', this.datasetColumns.length, this.datasetColumns.map(c => c.name));
        } else {
          console.warn('⚠️ Pas de colonnes trouvées dans le dataset');
          console.warn('⚠️ DEBUG - dataset.files exists:', !!dataset.files);
          console.warn('⚠️ DEBUG - files length:', dataset.files?.length);
          console.warn('⚠️ DEBUG - first file exists:', !!dataset.files?.[0]);
          console.warn('⚠️ DEBUG - first file columns exists:', !!dataset.files?.[0]?.columns);
        }
        
        // 🎯 RECALCULER LE CONTEXTE ML APRÈS LE CHARGEMENT DU DATASET
        if (this.results && this.experiment) {
          console.log('🔄 Recalcul du contexte ML après chargement du dataset');
          await this.calculateFullMLContext();
        }
      },
      error: (error: any) => {
        console.error('❌ Erreur lors de la récupération des colonnes du dataset:', error);
        console.error('❌ ERROR DETAILS - Status:', error.status);
        console.error('❌ ERROR DETAILS - Message:', error.message);
        console.error('❌ ERROR DETAILS - URL:', error.url);
        console.error('❌ ERROR DETAILS - Full error object:', error);
      }
    });
  }

  /**
   * 👤 Charge et cache le profil utilisateur une seule fois
   */
  private loadUserProfile(): void {
    console.log('🔄 Début chargement profil utilisateur...');
    this.userLoading = true;
    
    this.authService.getCurrentUser().subscribe({
      next: (user) => {
        this.cachedUser = user;
        this.userLoading = false;
        this.userLoadingError = false;
        console.log('✅ Profil utilisateur chargé et mis en cache:', user);
        console.log('📊 Niveau IA utilisateur:', user.ai_familiarity);
        
        // Déclencher une mise à jour du template après chargement utilisateur
        this.cacheInvalidated = true;
        this.templateMethodCache.clear();
      },
      error: (error) => {
        console.error('❌ Erreur chargement profil utilisateur:', error);
        this.cachedUser = null;
        this.userLoading = false;
        this.userLoadingError = true;
        
        // Utiliser un profil par défaut pour permettre l'affichage
        console.log('🔄 Utilisation profil par défaut pour continuer l\'affichage');
      }
    });
  }

  /**
   * 👤 Récupère le profil utilisateur depuis le cache (synchrone)
   */
  private getCachedUser(): UserRead | null {
    return this.cachedUser;
  }

  // ===== CONTEXTE COMPLET POUR XAI AVEC PROFIL UTILISATEUR =====

  /**
   * 🎯 MÉTHODE PRINCIPALE - Contexte ML complet + profil utilisateur réel
   * Récupère TOUTES les données nécessaires pour des explications personnalisées
   */
  /**
   * 🎯 NOUVELLE MÉTHODE: Calculer et stocker le contexte ML une fois les données disponibles
   */
  async calculateFullMLContext(): Promise<void> {
    console.log('🎯 SOLUTION SIMPLE: Le backend récupère les données depuis la DB');
    
    // Vérifier que nous avons toutes les données nécessaires
    if (!this.results || !this.experiment) {
      console.warn('⚠️ Impossible de démarrer XAI - données manquantes');
      this.fullMLContext = null;
      this.isContextReady = false;
      return;
    }
    
    // 🎯 CORRECTION: Construire le contexte ML COMPLET pour le chat XAI
    this.fullMLContext = await this.buildFullMLContextForChat();
    
    if (this.fullMLContext) {
      this.isContextReady = true;
      console.log('✅ XAI prêt avec contexte complet:', this.fullMLContext);
      console.log('🚀 Activation du composant XAI avec données complètes');
    } else {
      console.warn('⚠️ Impossible de construire le contexte ML complet');
      this.isContextReady = false;
    }
  }
  
  /**
   * 🎯 CONSTRUIRE LE CONTEXTE ML COMPLET pour le chat XAI
   */
  async buildFullMLContextForChat(): Promise<any> {
    console.log('🚨 CONSTRUCTION CONTEXTE ML COMPLET POUR CHAT...');
    
    try {
      // Récupérer le profil utilisateur
      const user = await this.authService.getCurrentUser().toPromise();
      
      // 🚨 FIX: Déterminer le type de tâche et différencier les métriques
      const taskType = this.getTaskType() || 'classification';
      const isRegression = taskType === 'regression';
      
      console.log('🚨 DEBUG buildFullMLContextForChat:');
      console.log('  - Task Type:', taskType);
      console.log('  - Is Regression:', isRegression);
      console.log('  - Raw Metrics:', this.results?.metrics);
      
      // Construire les métriques selon le type de tâche (IDENTIQUE à fetchMLContextDirectly)
      let metricsData: any = {
        raw_metrics: this.results?.metrics || {},
      };
      
      if (isRegression) {
        // 🎯 MÉTRIQUES DE RÉGRESSION
        metricsData = {
          ...metricsData,
          task_type: 'regression',
          overall_score: this.results?.metrics?.r2 ? Math.round(this.results.metrics.r2 * 100) : 0,
          r2_score: this.results?.metrics?.r2 || 0,
          mae: this.results?.metrics?.mae || 0,
          mse: this.results?.metrics?.mse || 0,
          rmse: this.results?.metrics?.rmse || 0,
          // 🚫 PAS de métriques de classification pour la régression
          classification_metrics_not_applicable: true,
          explanation_for_missing_metrics: "Les métriques F1, précision et rappel ne sont pas applicables aux modèles de régression. Pour évaluer ce modèle de régression, utilisez le R² (variance expliquée), MAE (erreur absolue moyenne), RMSE (racine de l'erreur quadratique moyenne) et MSE (erreur quadratique moyenne)."
        };
      } else {
        // 🎯 MÉTRIQUES DE CLASSIFICATION
        metricsData = {
          ...metricsData,
          task_type: 'classification',
          overall_score: this.results?.metrics?.accuracy ? Math.round(this.results.metrics.accuracy * 100) : 0,
          accuracy: this.results?.metrics?.accuracy || 0,
          f1_score: this.results?.metrics?.f1_macro || this.results?.metrics?.f1_score || 0,
          precision: this.results?.metrics?.precision_macro || this.results?.metrics?.precision || 0,
          recall: this.results?.metrics?.recall_macro || this.results?.metrics?.recall || 0,
          // 🚫 PAS de métriques de régression pour la classification
          regression_metrics_not_applicable: true,
          explanation_for_missing_metrics: "Les métriques R², MAE, RMSE et MSE ne sont pas applicables aux modèles de classification. Pour évaluer ce modèle de classification, utilisez la précision (accuracy), le F1-score, la précision et le rappel."
        };
      }

      // Construire le contexte ML complet à partir des données déjà disponibles
      const context = {
        experiment_id: this.experimentId,
        dataset_id: this.experiment?.dataset_id || '',
        dataset_name: this.dataset?.dataset_name || 'Dataset',
        dataset_size: this.dataset?.instances_number || 0,
        algorithm: this.results?.algorithm || 'unknown',
        algorithm_display: this.getAlgorithmDisplayFromAlgo(this.results?.algorithm || 'unknown'),
        metrics: metricsData,
        feature_importance: this.results?.feature_importance || {},
        // Confusion matrix et class names seulement pour classification
        confusion_matrix: isRegression ? null : (this.results?.metrics?.confusion_matrix || []),
        class_names: isRegression ? null : this.extractClassNames(),
        // 🎯 NOUVEAUX FLAGS pour cohérence avec fetchMLContextDirectly
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
      
      console.log('✅ buildFullMLContextForChat - Contexte final:', {
        task_type: context.task_type,
        is_regression: context.is_regression,
        metrics_keys: Object.keys(context.metrics),
        classification_not_applicable: context.metrics.classification_metrics_not_applicable,
        regression_not_applicable: context.metrics.regression_metrics_not_applicable
      });
      
      console.log('✅ Contexte ML CHAT reconstruit:', context);
      return context;
      
    } catch (error) {
      console.error('❌ Erreur lors de la construction du contexte CHAT:', error);
      return null;
    }
  }


  private getAlgorithmDisplayFromAlgo(algorithm: string): string {
    const names: any = {
      'decision_tree': 'Decision Tree',
      'random_forest': 'Random Forest',
      'logistic_regression': 'Logistic Regression',
      'svm': 'Support Vector Machine',
      'naive_bayes': 'Naive Bayes',
      'knn': 'K-Nearest Neighbors',
      'xgboost': 'XGBoost',
      'lightgbm': 'LightGBM'
    };
    return names[algorithm] || algorithm;
  }

  private extractClassNames(): string[] {
    try {
      const visualizations = this.results?.visualizations;
      if (visualizations && typeof visualizations === 'object') {
        const confusion = visualizations['confusion_matrix'];
        if (confusion && typeof confusion === 'object' && 'metadata' in confusion) {
          const metadata = (confusion as any).metadata;
          if (metadata && metadata.class_names) {
            return metadata.class_names;
          }
        }
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  getFullContextForAI(): any {
    console.log('🎯 Génération du contexte complet pour XAI...');
    
    // Récupérer le profil utilisateur depuis le cache
    const currentUser = this.getCachedUser();
    console.log('👤 Utilisateur actuel:', currentUser);
    
    // Déterminer le niveau d'audience basé sur le vrai profil utilisateur
    let audienceLevel: AudienceLevel;
    let userAIFamiliarity = 3; // Défaut
    
    if (currentUser?.ai_familiarity) {
      userAIFamiliarity = currentUser.ai_familiarity;
      audienceLevel = this.xaiService.recommendAudienceLevel({
        ai_familiarity: currentUser.ai_familiarity,
        education_level: currentUser.education_level
      });
      console.log(`📊 Niveau IA utilisateur: ${userAIFamiliarity} → ${audienceLevel}`);
    } else {
      audienceLevel = AudienceLevel.INTERMEDIATE;
      console.warn('⚠️ Pas de niveau IA défini, utilisation niveau intermédiaire');
    }
    
    const context = {
      // === INFORMATIONS EXPÉRIENCE ===
      experiment_id: this.experimentId,
      project_id: this.projectId,
      created_at: this.experiment?.created_at,
      processing_time: (this.experiment as any)?.processing_time || null,
      
      // === PROFIL UTILISATEUR RÉEL ===
      user_profile: {
        ai_familiarity: userAIFamiliarity,
        education_level: currentUser?.education_level || 'intermediate',
        audience_level: audienceLevel,
        user_id: currentUser?.id,
        language: currentUser?.locale || 'fr'
      },
      
      // === INFORMATIONS DATASET ===
      dataset_name: this.getDatasetNameContextual(),
      dataset_size: this.getDatasetSize(),
      feature_count: this.getFeatureCount(),
      dataset_info: {
        columns: this.datasetColumns,
        dataset_object: this.dataset
      },
      
      // === INFORMATIONS MODÈLE ===
      algorithm: this.getAlgorithm(),
      algorithm_display: this.getAlgorithmDisplayName(),
      algorithm_description: this.getAlgorithmDescription(),
      
      // === MÉTRIQUES DE PERFORMANCE RÉELLES ===
      metrics: {
        overall_score: this.getOverallScore(),
        raw_metrics: this.results?.metrics || {},
        primary_kpi: this.getPrimaryKPI(),
        all_metrics: this.getMetrics(),
        primary_metrics: this.getPrimaryMetrics()
      },
      
      // === TYPE DE TÂCHE ET CLASSIFICATION ===
      task_type: this.getTaskType(),
      classification_type: this.getClassificationType(),
      class_names: this.getClassNamesContextual(),
      number_of_classes: this.getNumberOfClassesContextual(),
      
      // === ANALYSE DES ERREURS (DONNÉES RÉELLES) ===
      confusion_matrix: this.getConfusionMatrixData(),
      confusion_errors: this.getRealConfusionErrors(),
      confusion_description: this.getConfusionMatrixDescription(),
      
      // === VISUALISATIONS DISPONIBLES ===
      visualizations_available: {
        has_confusion_matrix: this.hasConfusionMatrix(),
        has_roc_curve: this.hasRocCurve(),
        has_pr_curve: this.hasPRCurve(),
        has_feature_importance: this.hasFeatureImportance(),
        has_tree_structure: this.hasTreeData()
      },
      
      // === STRUCTURE DU MODÈLE (DECISION TREE/RANDOM FOREST) ===
      tree_structure: this.getTreeData(),
      tree_count: this.getTreeCount(),
      feature_importance: this.results?.feature_importance || {},
      
      // === INSIGHTS CONTEXTUELS ===
      performance_class: this.getOverallPerformanceClass(),
      performance_label: this.getOverallPerformanceLabel(),
      performance_message: this.getPerformanceMessage(),
      quick_insights: this.getQuickInsightsContextual(),
      
      // === RECOMMANDATIONS ET CONSEILS ===
      top_recommendations: this.getTopRecommendations(),
      pedagogical_explanation: this.getPedagogicalExplanation(),
      visualization_tips: this.getVisualizationTips()
    };
    
    console.log('✅ Contexte XAI généré:', context);
    console.log('👤 Profil utilisateur intégré - Niveau IA:', userAIFamiliarity, 'Audience:', audienceLevel);
    
    return context;
  }

  /**
   * 💡 Génère des suggestions de questions contextuelles basées sur les VRAIS résultats
   * ET adaptées au niveau d'IA de l'utilisateur
   */
  getContextualSuggestions(): Array<{question: string, context: string, audience_adapted: boolean}> {
    const suggestions = [];
    const accuracy = this.getOverallScore();
    const confusionErrors = this.getConfusionErrorsFromMatrix();
    const algorithm = this.getAlgorithm();
    const algorithmDisplay = this.getAlgorithmDisplayName();
    const datasetName = this.getDatasetNameContextual();
    
    // Récupérer le profil utilisateur depuis le cache avec fallback sécurisé
    const currentUser = this.getCachedUser();
    const userAILevel = currentUser?.ai_familiarity || 3;
    
    console.log('💡 Génération suggestions pour niveau IA:', userAILevel);
    
    // === SUGGESTIONS BASÉES SUR LA PERFORMANCE ===
    if (accuracy < 85) {
      if (userAILevel <= 2) {
        // Niveau NOVICE - Question simple
        suggestions.push({
          question: `Pourquoi mon modèle n'est qu'à ${accuracy}% ? Comment faire mieux ?`,
          context: 'performance_analysis_novice',
          audience_adapted: true
        });
      } else if (userAILevel >= 4) {
        // Niveau EXPERT - Question technique
        suggestions.push({
          question: `Analyse des métriques : pourquoi ${algorithmDisplay} n'atteint que ${accuracy}% sur ${datasetName} ? Quels hyperparamètres optimiser ?`,
          context: 'performance_analysis_expert',
          audience_adapted: true
        });
      } else {
        // Niveau INTERMÉDIAIRE
        suggestions.push({
          question: `Pourquoi mon modèle ${algorithmDisplay} n'atteint que ${accuracy}% sur ${datasetName} ?`,
          context: 'performance_analysis_intermediate',
          audience_adapted: true
        });
      }
    } else if (accuracy >= 90) {
      if (userAILevel <= 2) {
        suggestions.push({
          question: `Mon modèle marche très bien (${accuracy}%) ! Pourquoi est-il si performant ?`,
          context: 'success_analysis_novice',
          audience_adapted: true
        });
      } else {
        suggestions.push({
          question: `Excellente performance (${accuracy}%) ! Quels facteurs expliquent cette réussite sur ${datasetName} ?`,
          context: 'success_analysis_advanced',
          audience_adapted: true
        });
      }
    }
    
    // === SUGGESTIONS BASÉES SUR LES ERREURS DE CONFUSION ===
    if (confusionErrors.length > 0 && confusionErrors[0].count > 0) {
      const mainError = confusionErrors[0];
      if (userAILevel <= 2) {
        suggestions.push({
          question: `Pourquoi le modèle se trompe entre ${mainError.true_class} et ${mainError.predicted_class} ?`,
          context: 'confusion_analysis_novice',
          audience_adapted: true
        });
      } else {
        suggestions.push({
          question: `Analyse des ${mainError.count} confusions ${mainError.true_class}→${mainError.predicted_class} : quelles features discriminantes manquent ?`,
          context: 'confusion_analysis_expert',
          audience_adapted: true
        });
      }
    }
    
    // === SUGGESTIONS SPÉCIFIQUES À L'ALGORITHME ===
    if (algorithm === 'decision_tree') {
      if (userAILevel <= 2) {
        suggestions.push({
          question: `Comment l'arbre de décision choisit-il les bonnes réponses ?`,
          context: 'tree_logic_novice',
          audience_adapted: true
        });
      } else {
        const classNames = this.getClassNamesContextual();
        suggestions.push({
          question: `Comment l'arbre de décision prend-il ses décisions pour classer les ${classNames.join(', ')} ?`,
          context: 'tree_logic_expert',
          audience_adapted: true
        });
      }
    } else if (algorithm === 'random_forest') {
      if (userAILevel <= 2) {
        suggestions.push({
          question: `Comment ${this.getTreeCount()} arbres arrivent-ils à mieux prédire qu'un seul ?`,
          context: 'forest_logic_novice',
          audience_adapted: true
        });
      } else {
        suggestions.push({
          question: `Analyse de l'agrégation : comment ${this.getTreeCount()} estimateurs améliorent-ils la généralisation ?`,
          context: 'forest_logic_expert',
          audience_adapted: true
        });
      }
    }
    
    // === SUGGESTION D'AMÉLIORATION ADAPTÉE AU NIVEAU ===
    if (userAILevel <= 2) {
      suggestions.push({
        question: `Comment améliorer mon modèle pour qu'il marche encore mieux ?`,
        context: 'improvement_tips_novice',
        audience_adapted: true
      });
    } else {
      suggestions.push({
        question: `Quelles optimisations recommandez-vous pour améliorer les performances de mon ${algorithmDisplay} ?`,
        context: 'improvement_tips_expert',
        audience_adapted: true
      });
    }
    
    console.log('💡 Suggestions générées:', suggestions.length, 'pour niveau', userAILevel);
    return suggestions.slice(0, 4); // Max 4 suggestions
  }

  /**
   * 📊 Récupère les insights rapides adaptés au profil utilisateur
   */
  getQuickInsightsContextual(): Array<{icon: string, title: string, description: string, type: string}> {
    const insights = [];
    const accuracy = this.getOverallScore();
    const algorithm = this.getAlgorithm();
    const confusionErrors = this.getConfusionErrorsFromMatrix();
    
    // Récupérer le profil utilisateur depuis le cache avec fallback sécurisé
    const currentUser = this.getCachedUser();
    const userAILevel = currentUser?.ai_familiarity || 3;
    
    console.log('📊 Quick insights pour niveau IA:', userAILevel, 'Accuracy:', accuracy);
    
    // Adapter les insights selon le niveau utilisateur
    if (accuracy >= 90) {
      if (userAILevel <= 2) {
        insights.push({
          icon: 'emoji_events',
          title: 'Super Performance !',
          description: `Votre modèle réussit ${accuracy}% du temps - c'est excellent !`,
          type: 'success'
        });
      } else {
        insights.push({
          icon: 'emoji_events',
          title: 'Excellente Performance',
          description: `Votre ${this.getAlgorithmDisplayName()} atteint ${accuracy}% d'accuracy avec des métriques robustes`,
          type: 'success'
        });
      }
    } else if (accuracy >= 75) {
      if (userAILevel <= 2) {
        insights.push({
          icon: 'trending_up',
          title: 'Bonne Performance',
          description: `${accuracy}% de réussite - c'est bien, on peut faire encore mieux !`,
          type: 'info'
        });
      } else {
        insights.push({
          icon: 'trending_up',
          title: 'Performance Satisfaisante',
          description: `${accuracy}% d'accuracy avec des opportunités d'optimisation identifiées`,
          type: 'info'
        });
      }
    } else {
      if (userAILevel <= 2) {
        insights.push({
          icon: 'warning',
          title: 'À Améliorer',
          description: `${accuracy}% - Le modèle peut être amélioré avec quelques ajustements`,
          type: 'warning'
        });
      } else {
        insights.push({
          icon: 'warning',
          title: 'Performance Sous-optimale',
          description: `${accuracy}% d'accuracy - Optimisation des hyperparamètres et features engineering recommandés`,
          type: 'warning'
        });
      }
    }
    
    // Insight sur les erreurs principales (adapté au niveau)
    if (confusionErrors.length > 0 && confusionErrors[0].count > 0) {
      const mainError = confusionErrors[0];
      if (userAILevel <= 2) {
        insights.push({
          icon: 'error_outline',
          title: 'Confusion Détectée',
          description: `${mainError.count} erreurs entre ${mainError.true_class} et ${mainError.predicted_class}`,
          type: 'error'
        });
      } else {
        insights.push({
          icon: 'error_outline',
          title: 'Analyse des Confusions',
          description: `${mainError.count} misclassifications ${mainError.true_class}→${mainError.predicted_class} - Investigation des features discriminantes nécessaire`,
          type: 'error'
        });
      }
    }
    
    // Insight spécifique à l'algorithme (adapté au niveau)
    if (algorithm === 'decision_tree') {
      if (userAILevel <= 2) {
        insights.push({
          icon: 'account_tree',
          title: 'Modèle Simple',
          description: 'Votre arbre de décision est facile à comprendre et expliquer',
          type: 'primary'
        });
      } else {
        insights.push({
          icon: 'account_tree',
          title: 'Interprétabilité Maximale',
          description: 'Decision Tree offre une logique de décision transparente avec règles explicites',
          type: 'primary'
        });
      }
    } else if (algorithm === 'random_forest') {
      if (userAILevel <= 2) {
        insights.push({
          icon: 'park',
          title: 'Modèle Robuste',
          description: `${this.getTreeCount()} arbres travaillent ensemble pour de meilleures prédictions`,
          type: 'primary'
        });
      } else {
        insights.push({
          icon: 'park',
          title: 'Ensemble Learning',
          description: `Random Forest (${this.getTreeCount()} estimateurs) avec réduction du sur-ajustement par bagging`,
          type: 'primary'
        });
      }
    }
    
    return insights.slice(0, 3);
  }

  /**
   * 🏷️ Récupère les noms de classes réels (amélioration de la méthode existante)
   */
  getClassNamesContextual(): string[] {
    // 🚨 FIX: Vérifier d'abord si c'est de la régression
    if (this.getTaskType() === 'regression') {
      console.log('ℹ️ Régression détectée - pas de classes');
      return [];
    }
    
    // Priorité 1: Depuis confusion matrix metadata
    const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
    if (confusionData?.metadata?.class_names) {
      console.log('✅ Class names depuis confusion matrix:', confusionData.metadata.class_names);
      return confusionData.metadata.class_names;
    }
    
    // Priorité 2: Depuis ROC curve metadata
    const rocData = this.results?.visualizations?.['roc_curve'] as any;
    if (rocData?.metadata?.class_names) {
      console.log('✅ Class names depuis ROC curve:', rocData.metadata.class_names);
      return rocData.metadata.class_names;
    }
    
    // Priorité 3: Depuis preprocessing info si disponible
    const preprocessingConfig = this.results?.preprocessing_config as any;
    if (preprocessingConfig?.class_labels) {
      console.log('✅ Class names depuis preprocessing:', preprocessingConfig.class_labels);
      return preprocessingConfig.class_labels;
    }
    
    // Fallback : génération adaptée au contexte
    const classificationType = this.getClassificationType();
    if (classificationType === 'binary') {
      console.log('⚠️ Fallback class names binaire');
      return ['Classe Négative', 'Classe Positive'];
    } else {
      // 🚨 FIX: Éviter la récursion - utiliser directement la logique interne
      const nClasses = this.getNumberOfClassesInternal();
      console.log('⚠️ Fallback class names multiclasse:', nClasses);
      return Array.from({length: nClasses > 0 ? nClasses : 3}, (_, i) => `Classe ${i + 1}`);
    }
  }

  /**
   * 📊 Méthode interne pour obtenir le nombre de classes sans récursion
   */
  private getNumberOfClassesInternal(): number {
    // Depuis confusion matrix metadata
    const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
    if (confusionData?.metadata?.n_classes) {
      return confusionData.metadata.n_classes;
    }
    
    // Depuis la taille de la matrice de confusion
    const confusionMatrix = this.results?.confusion_matrix;
    if (confusionMatrix && Array.isArray(confusionMatrix)) {
      return confusionMatrix.length;
    }
    
    // Fallback : 3 (défaut multiclasse)
    return 3;
  }

  /**
   * 📊 Amélioration du nombre de classes (public)
   */
  getNumberOfClassesContextual(): number {
    // 🚨 FIX: Vérifier d'abord si c'est de la régression
    if (this.getTaskType() === 'regression') {
      console.log('ℹ️ Régression détectée - pas de classes');
      return 0;
    }
    
    // Utiliser la méthode interne sans récursion
    return this.getNumberOfClassesInternal();
  }

  /**
   * 🏷️ Récupère le nom du dataset de manière intelligente
   */
  getDatasetNameContextual(): string {
    // Priorité 1: Depuis l'objet dataset
    if (this.dataset?.display_name) {
      return this.dataset.display_name;
    }
    if (this.dataset?.dataset_name) {
      return this.dataset.dataset_name;
    }
    
    // Priorité 2: Depuis les résultats
    const preprocessingConfig = this.results?.preprocessing_config as any;
    if (preprocessingConfig?.dataset_name) {
      return preprocessingConfig.dataset_name;
    }
    
    // Priorité 3: Essayer de déduire depuis l'ID dataset
    if (this.experiment?.dataset_id) {
      return `Dataset ${this.experiment.dataset_id.slice(0, 8)}`;
    }
    
    // Fallback
    return 'Dataset ML';
  }

  /**
   * 👤 Récupère l'icône du niveau utilisateur
   */
  getUserLevelIcon(): string {
    const currentUser = this.getCachedUser();
    const userAILevel = currentUser?.ai_familiarity || 3;
    
    
    if (userAILevel <= 2) return 'school';
    if (userAILevel >= 4) return 'psychology';
    return 'trending_up';
  }

  /**
   * 👤 Récupère le label du niveau utilisateur
   */
  getUserLevelLabel(): string {
    const currentUser = this.getCachedUser();
    const userAILevel = currentUser?.ai_familiarity || 3;
    
    
    if (userAILevel <= 2) return 'Débutant';
    if (userAILevel >= 4) return 'Expert';
    return 'Intermédiaire';
  }

  /**
   * 💱 Récupère les top features pour la prévisualisation
   */
  getTopFeaturesPreview(): Array<{name: string, importance: number}> {
    const featureImportance = this.results?.feature_importance || {};
    
    if (!featureImportance || Object.keys(featureImportance).length === 0) {
      return [];
    }
    
    return Object.entries(featureImportance)
      .sort(([, a], [, b]) => Math.abs(b as number) - Math.abs(a as number))
      .slice(0, 3)
      .map(([name, importance]) => ({ name, importance: importance as number }));
  }

  /**
   * 🔍 Récupère l'erreur de confusion principale
   */
  getMainConfusionError(): string {
    const errors = this.getConfusionErrorsFromMatrix();
    
    if (errors.length === 0) {
      return 'Aucune erreur majeure';
    }
    
    const mainError = errors[0];
    return `${mainError.true_class} → ${mainError.predicted_class} (${mainError.count})`;
  }

  /**
   * 💡 SUGGESTIONS CONTEXTUELLES SIMPLIFIÉES - VERSION STABLE
   */
  getSimplifiedSuggestions(): Array<{question: string, context: string, audience_adapted: boolean}> {
    console.log('💡 Génération suggestions simplifiées...');
    
    try {
      // Vérifications de sécurité
      if (!this.results || !this.experiment) {
        console.log('⚠️ Pas de données expérience disponibles pour suggestions');
        return [];
      }
      
      const accuracy = this.getOverallScore() || 0;
      const algorithm = this.getAlgorithmDisplayName() || 'Modèle ML';
      const datasetName = this.getDatasetNameContextual() || 'Dataset';
      const taskType = this.getTaskType() || 'classification';
      
      console.log(`💡 Données pour suggestions: ${algorithm} sur ${datasetName}, ${accuracy}%, ${taskType}`);
      
      const suggestions = [];
      
      // Suggestion basée sur la performance
      if (accuracy > 0) {
        if (accuracy >= 90) {
          suggestions.push({
            question: `Mon modèle ${algorithm} marche très bien (${accuracy}%) ! Pourquoi est-il si performant ?`,
            context: 'success_analysis',
            audience_adapted: true
          });
        } else if (accuracy < 75) {
          suggestions.push({
            question: `Pourquoi mon modèle ${algorithm} n'atteint que ${accuracy}% ? Comment l'améliorer ?`,
            context: 'performance_improvement',
            audience_adapted: true
          });
        } else {
          suggestions.push({
            question: `Comment interpréter les ${accuracy}% de performance de mon ${algorithm} ?`,
            context: 'performance_analysis',
            audience_adapted: true
          });
        }
      }
      
      // Suggestion générale amélioration
      suggestions.push({
        question: `Quels sont les points d'amélioration pour mon ${algorithm} ?`,
        context: 'improvement_tips',
        audience_adapted: true
      });
      
      // Suggestion spécifique à l'algorithme
      if (algorithm.toLowerCase().includes('forest')) {
        suggestions.push({
          question: `Comment Random Forest prend-il ses décisions pour ce type de ${taskType} ?`,
          context: 'algorithm_explanation',
          audience_adapted: true
        });
      } else if (algorithm.toLowerCase().includes('tree')) {
        suggestions.push({
          question: `Comment l'arbre de décision classe-t-il ces données ?`,
          context: 'tree_logic',
          audience_adapted: true
        });
      } else {
        suggestions.push({
          question: `Comment fonctionne ${algorithm} sur ce dataset ?`,
          context: 'algorithm_explanation',
          audience_adapted: true
        });
      }
      
      console.log(`✅ ${suggestions.length} suggestions générées avec succès`);
      return suggestions.slice(0, 3); // Max 3 pour éviter la surcharge
      
    } catch (error) {
      console.error('❌ Erreur génération suggestions:', error);
      return [
        {
          question: 'Comment interpréter les résultats de mon modèle ?',
          context: 'general_interpretation',
          audience_adapted: false
        }
      ];
    }
  }

  /**
   * 🧪 DEBUG - Méthodes temporaires pour diagnostiquer les problèmes
   */
  debugXAIContext(): void {
    console.log('🧪 === DEBUG XAI CONTEXT ===');
    console.log('👤 Cached User:', this.cachedUser);
    console.log('⏳ User Loading:', this.userLoading);
    console.log('❌ User Error:', this.userLoadingError);
    console.log('📊 Experiment:', this.experiment);
    console.log('📈 Results:', this.results);
    console.log('🎯 Full Context:', this.getFullContextForAI());
    console.log('💡 Suggestions:', this.getSimplifiedSuggestions());
    console.log('📊 Quick Insights:', this.getQuickInsightsContextual());
    console.log('🧪 === END DEBUG ===');
  }

  forceRefreshContext(): void {
    console.log('🔄 Force refresh context...');
    this.loadUserProfile();
    this.cacheInvalidated = true;
    this.templateMethodCache.clear();
  }

  // ===== GESTION SUGGESTIONS CONTEXTUELLES =====

  selectedSuggestion?: {question: string, context: string, audience_adapted: boolean};

  /**
   * 💡 Sélectionne une suggestion et démarre automatiquement l'explication
   */
  selectSuggestionAndStart(suggestion: {question: string, context: string, audience_adapted: boolean}): void {
    this.selectedSuggestion = suggestion;
    console.log('💡 Suggestion sélectionnée et démarrage auto:', suggestion);
    
    // Démarrer automatiquement l'explication avec cette suggestion comme contexte
    this.startXAIWithSuggestion(suggestion);
  }

  /**
   * 🚀 Démarre une explication XAI avec une suggestion pré-sélectionnée
   */
  private startXAIWithSuggestion(suggestion: {question: string, context: string}): void {
    // Enrichir le contexte avec la suggestion sélectionnée
    const enrichedContext = {
      ...this.getFullContextForAI(),
      selected_suggestion: suggestion,
      auto_start_question: suggestion.question
    };
    
    // Mettre à jour le contexte pour qu'il soit transmis au composant XAI
    // Le composant XAI Request pourra alors démarrer automatiquement avec cette suggestion
    console.log('🚀 Démarrage XAI avec suggestion enrichie:', enrichedContext.selected_suggestion);
  }

  /**
   * 🎨 Récupère l'icône d'une suggestion selon son contexte
   */
  getSuggestionIcon(context: string): string {
    const icons: Record<string, string> = {
      'performance_analysis': 'analytics',
      'performance_improvement': 'trending_up',
      'success_analysis': 'emoji_events',
      'improvement_tips': 'tips_and_updates',
      'algorithm_explanation': 'psychology',
      'tree_logic': 'account_tree',
      'general_interpretation': 'help_outline',
      // Anciens contextes pour compatibilité
      'performance_analysis_novice': 'analytics',
      'performance_analysis_intermediate': 'analytics',
      'performance_analysis_expert': 'psychology',
      'success_analysis_novice': 'emoji_events',
      'success_analysis_advanced': 'celebration',
      'confusion_analysis_novice': 'help_outline',
      'confusion_analysis_expert': 'error_outline',
      'tree_logic_novice': 'account_tree',
      'tree_logic_expert': 'account_tree',
      'forest_logic_novice': 'park',
      'forest_logic_expert': 'park',
      'improvement_tips_novice': 'tips_and_updates',
      'improvement_tips_expert': 'tune'
    };
    return icons[context] || 'help_outline';
  }

  /**
   * 🏷️ Récupère le label d'un contexte de suggestion
   */
  getSuggestionContextLabel(context: string): string {
    const labels: Record<string, string> = {
      'performance_analysis': 'Analyse Performance',
      'performance_improvement': 'Amélioration',
      'success_analysis': 'Facteurs de Succès',
      'improvement_tips': 'Conseils',
      'algorithm_explanation': 'Fonctionnement',
      'tree_logic': 'Logique Arbre',
      'general_interpretation': 'Interprétation',
      // Anciens contextes pour compatibilité
      'performance_analysis_novice': 'Analyse Simple',
      'performance_analysis_intermediate': 'Analyse de Performance',
      'performance_analysis_expert': 'Analyse Technique',
      'success_analysis_novice': 'Pourquoi ça marche',
      'success_analysis_advanced': 'Facteurs de Succès',
      'confusion_analysis_novice': 'Erreurs Simples',
      'confusion_analysis_expert': 'Analyse des Erreurs',
      'tree_logic_novice': 'Logique Simple',
      'tree_logic_expert': 'Logique de Décision',
      'forest_logic_novice': 'Fonctionnement Forêt',
      'forest_logic_expert': 'Ensemble Learning',
      'improvement_tips_novice': 'Conseils Simples',
      'improvement_tips_expert': 'Optimisations'
    };
    return labels[context] || 'Question Contextuelle';
  }

  /**
   * 📊 Récupère les données de la matrice de confusion (alias pour compatibilité)
   */
  getConfusionMatrixData(): any {
    const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
    return confusionData?.metadata || confusionData || {};
  }

  /**
   * 📊 Récupère les erreurs de confusion réelles (alias pour compatibilité)
   */
  getRealConfusionErrors(): Array<{true_class: string, predicted_class: string, count: number, explanation: string}> {
    return this.getConfusionErrorsFromMatrix();
  }

  /**
   * 📊 Analyse les erreurs depuis la matrice de confusion
   */
  getConfusionErrorsFromMatrix(): Array<{true_class: string, predicted_class: string, count: number, explanation: string}> {
    const errors: Array<{true_class: string, predicted_class: string, count: number, explanation: string}> = [];
    
    // Récupérer les données de la matrice de confusion
    const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
    if (!confusionData?.metadata) {
      console.warn('⚠️ Pas de données de matrice de confusion disponibles');
      return errors;
    }
    
    const classNames = confusionData.metadata.class_names || [];
    const matrix = confusionData.metadata.matrix || confusionData.matrix || [];
    
    if (!Array.isArray(matrix) || matrix.length === 0) {
      console.warn('⚠️ Matrice de confusion vide');
      return errors;
    }
    
    // Analyser la matrice pour identifier les erreurs (hors diagonale)
    matrix.forEach((row: number[], trueClassIndex: number) => {
      if (!Array.isArray(row)) return;
      
      row.forEach((count: number, predictedClassIndex: number) => {
        // Si ce n'est pas sur la diagonale et qu'il y a des erreurs
        if (trueClassIndex !== predictedClassIndex && count > 0) {
          const trueClassName = classNames[trueClassIndex] || `Classe ${trueClassIndex + 1}`;
          const predictedClassName = classNames[predictedClassIndex] || `Classe ${predictedClassIndex + 1}`;
          
          errors.push({
            true_class: trueClassName,
            predicted_class: predictedClassName,
            count: count,
            explanation: this.generateErrorExplanationFromContext(trueClassName, predictedClassName, count)
          });
        }
      });
    });
    
    // Trier par nombre d'erreurs décroissant
    errors.sort((a, b) => b.count - a.count);
    
    console.log('📊 Erreurs de confusion identifiées:', errors);
    return errors;
  }

  /**
   * 📝 Génère une explication contextuelle pour une erreur de confusion
   */
  private generateErrorExplanationFromContext(trueClass: string, predictedClass: string, count: number): string {
    const algorithm = this.getAlgorithm();
    const datasetName = this.getDatasetNameContextual();
    
    // Explications contextuelles selon l'algorithme
    if (algorithm === 'decision_tree') {
      return `Decision Tree confond ces classes car elles partagent des caractéristiques similaires dans l'arbre de décision.`;
    } else if (algorithm === 'random_forest') {
      return `Malgré l'agrégation de ${this.getTreeCount()} arbres, ces classes restent difficiles à distinguer.`;
    } else {
      return `Ces ${count} erreurs suggèrent une similarité entre les caractéristiques de ces classes dans ${datasetName}.`;
    }
  }

  // ===== GETTERS DE BASE =====
  
  /**
   * 🚀 HELPER: Cache pour éviter les recalculs répétés
   */
  private getCached<T>(key: string, fn: () => T): T {
    if (this.templateMethodCache.has(key)) {
      return this.templateMethodCache.get(key) as T;
    }
    
    const result = fn();
    this.templateMethodCache.set(key, result);
    return result;
  }

  getAlgorithm(): string {
    return this.getCached('algorithm', () => 
      this.results?.algorithm || this.experiment?.algorithm || 'unknown'
    );
  }

  getTaskType(): 'classification' | 'regression' {
    return this.getCached('taskType', () => {
    const preprocessingConfig = this.results?.preprocessing_config as any;
    if (preprocessingConfig?.task_type) {
      return preprocessingConfig.task_type;
    }
    
    // Fallback: détecter via métriques
    const metrics = this.results?.metrics || {};
    
    const hasClassificationMetrics = ['accuracy', 'precision', 'recall', 'f1_score'].some(m => m in metrics);
    return hasClassificationMetrics ? 'classification' : 'regression';
    });
  }

  /**
   * Détecte si la classification est binaire ou multi-classes
   * Important pour afficher ROC/PR curves appropriées
   */
  getClassificationType(): 'binary' | 'multiclass' | 'unknown' {
    if (this.getTaskType() !== 'classification') return 'unknown';
    
    // Vérifier d'abord dans les métadonnées de résultats
    const metadata = (this.results as any)?.metadata;
    if (metadata?.n_classes !== undefined) {
      return metadata.n_classes === 2 ? 'binary' : 'multiclass';
    }
    
    // Vérifier dans les visualisations (matrice de confusion) - PRIORITAIRE
    if (this.hasConfusionMatrix()) {
      const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
      if (confusionData?.metadata?.n_classes) {
        const nClasses = confusionData.metadata.n_classes;
        console.log(`🔍 Détection via matrice de confusion: ${nClasses} classes`);
        return nClasses === 2 ? 'binary' : 'multiclass';
      }
    }
    
    // Vérifier dans les métadonnées des courbes ROC
    if (this.results?.visualizations?.['roc_curve']) {
      const rocData = this.results.visualizations['roc_curve'] as any;
      if (rocData?.metadata?.n_classes) {
        const nClasses = rocData.metadata.n_classes;
        console.log(`🔍 Détection via courbe ROC: ${nClasses} classes`);
        return nClasses === 2 ? 'binary' : 'multiclass';
      }
    }
    
    // Fallback final : si on ne peut pas détecter précisément, 
    // assumer multiclasse par défaut (plus sûr que binaire)
    console.warn('⚠️ Classification type detection fallback - assumant multiclasse');
    return 'multiclass';
  }

  /**
   * Génère une description adaptée pour la matrice de confusion
   */
  getConfusionMatrixDescription(): string {
    const confusionData = this.results?.visualizations?.['confusion_matrix'] as any;
    
    if (confusionData?.metadata) {
      const nClasses = confusionData.metadata.n_classes;
      const classNames = confusionData.metadata.class_names || [];
      
      if (nClasses === 2) {
        return `🎯 SPÉC: La matrice de confusion montre où le modèle se trompe (diagonale = bonnes prédictions). Format 2×2 binaire avec 2 classes.`;
      } else if (nClasses > 2) {
        const classInfo = classNames.length > 0 ? 
          ` Classes détectées: ${classNames.join(', ')}.` : 
          ` ${nClasses} classes détectées.`;
        return `🎯 SPÉC: La matrice de confusion montre où le modèle se trompe (diagonale = bonnes prédictions). Format ${nClasses}×${nClasses} multiclasse.${classInfo}`;
      }
    }
    
    // Fallback si pas de métadonnées
    const classificationType = this.getClassificationType();
    return `🎯 SPÉC: La matrice de confusion montre où le modèle se trompe (diagonale = bonnes prédictions). ${classificationType === 'multiclass' ? 'Format multi-classes.' : 'Format binaire.'}`;
  }

  /**
   * Génère un titre adapté pour la courbe ROC
   */
  getROCCurveTitle(): string {
    const rocData = this.results?.visualizations?.['roc_curve'] as any;
    
    if (rocData?.metadata?.n_classes) {
      const nClasses = rocData.metadata.n_classes;
      if (nClasses === 2) {
        return 'Courbe ROC (Binaire)';
      } else {
        return `Courbes ROC (${nClasses} classes)`;
      }
    }
    
    // Fallback
    const classificationType = this.getClassificationType();
    return `Courbe ROC ${classificationType === 'multiclass' ? '(Multi-classes)' : '(Binaire)'}`;
  }

  /**
   * Génère une description adaptée pour la courbe ROC
   */
  getROCCurveDescription(): string {
    const rocData = this.results?.visualizations?.['roc_curve'] as any;
    
    if (rocData?.metadata) {
      const nClasses = rocData.metadata.n_classes;
      const classNames = rocData.metadata.class_names || [];
      
      if (nClasses === 2) {
        return 'Courbe ROC : mesure la capacité du modèle à distinguer entre les 2 classes. Plus la courbe est proche du coin supérieur gauche, meilleur est le modèle.';
      } else {
        const classInfo = classNames.length > 0 ? 
          ` Classe ${classNames.join(', classe ')}.` : 
          ` ${nClasses} classes.`;
        return `Courbes ROC multi-classes (One-vs-Rest) : une courbe par classe.${classInfo} Chaque courbe montre la capacité à distinguer cette classe des autres.`;
      }
    }
    
    // Fallback
    const classificationType = this.getClassificationType();
    return classificationType === 'binary' ? 
      'Courbe ROC : mesure la capacité du modèle à distinguer entre les classes. Plus la courbe est proche du coin supérieur gauche, meilleur est le modèle.' :
      'Courbes ROC multi-classes : une courbe par classe (One-vs-Rest). Chaque courbe montre la capacité à distinguer une classe des autres.';
  }

  getMetrics(): Array<{key: string, value: number}> {
    if (!this.results?.metrics) return [];
    
    // RETOUR AUX VRAIES DONNÉES UNIQUEMENT - Aucune simulation
    return Object.entries(this.results.metrics)
      .filter(([_, value]) => typeof value === 'number')
      .map(([key, value]) => ({ key, value: value as number }));
  }

  // SUPPRIMÉ: Méthode de simulation de métriques - TOUTES les données doivent être authentiques

  // ===== HERO SECTION =====

  public getAlgorithmDisplayName(): string {
    const algorithm = this.getAlgorithm();
    switch (algorithm) {
      case 'decision_tree': return 'Decision Tree';
      case 'random_forest': return 'Random Forest';
      default: return 'Modèle ML';
    }
  }

  getAlgorithmIcon(): string {
    const algorithm = this.getAlgorithm();
    switch (algorithm) {
      case 'decision_tree': return 'account_tree';
      case 'random_forest': return 'park';
      default: return 'psychology';
    }
  }

  getAlgorithmDescription(): string {
    const algorithm = this.getAlgorithm();
    const taskType = this.getTaskType();
    
    if (algorithm === 'random_forest') {
      const treeCount = this.getTreeCount();
      return `Random Forest combine ${treeCount} arbres pour ${taskType === 'classification' ? 'classifier vos données par vote majoritaire' : 'prédire des valeurs par moyenne des arbres'}.`;
    } else if (algorithm === 'decision_tree') {
      return `Decision Tree utilise une série de questions simples pour ${taskType === 'classification' ? 'classer vos données de manière logique' : 'prédire des valeurs numériques'}.`;
    }
    
    return `Modèle d'apprentissage automatique pour ${taskType === 'classification' ? 'classification' : 'régression'}.`;
  }

  getOverallScore(): number {
    const metrics = this.getMetrics();
    if (metrics.length === 0) return 0;
    
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    
    if (taskType === 'classification') {
      const classificationMetrics = metrics.filter(m => 
        ['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc'].includes(m.key)
      );
      if (classificationMetrics.length === 0) return 0;
      
      const avg = classificationMetrics.reduce((sum, m) => sum + m.value, 0) / classificationMetrics.length;
      return Math.round(avg * 100);
    } else {
      // Pour régression, utiliser R² comme score principal pour l'affichage visuel
      // (MAE est la métrique PRINCIPALE selon les spécifications, mais R² est plus intuitif en pourcentage)
      const r2Metric = metrics.find(m => m.key === 'r2');
      if (r2Metric) {
        return Math.max(0, Math.round(r2Metric.value * 100));
      }
      return 50; // Score neutre si pas de R²
    }
  }

  /**
   * NOUVEAU: Explication détaillée de comment le score global est calculé
   */
  getScoreCalculationExplanation(): {title: string, method: string, metrics: string[], detail: string} {
    const taskType = this.getTaskType();
    const metrics = this.getMetrics();
    
    if (taskType === 'classification') {
      const usedMetrics = ['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc'];
      const availableMetrics = metrics
        .filter(m => usedMetrics.includes(m.key))
        .map(m => `${this.getMetricDisplayName(m.key)}: ${this.formatMetricValue(m.key, m.value)}`);
      
      return {
        title: 'Score Global - Classification',
        method: 'Moyenne des métriques de classification',
        metrics: availableMetrics,
        detail: `Ce score est la moyenne de ${availableMetrics.length} métriques principales de classification, convertie en pourcentage. Il donne une vue d'ensemble rapide des performances.`
      };
    } else {
      const algorithm = this.getAlgorithm();
      const r2Metric = metrics.find(m => m.key === 'r2');
      const maeMetric = metrics.find(m => m.key === 'mae');
      
      if (algorithm === 'random_forest') {
        return {
          title: 'Score Global - Régression Random Forest', 
          method: r2Metric ? 'Coefficient de détermination (R²) pour affichage' : 'Score neutre par défaut',
          metrics: r2Metric ? [`R²: ${this.formatMetricValue('r2', r2Metric.value)}`] : [],
          detail: r2Metric ? 
            `Ce score (${Math.round(r2Metric.value * 100)}%) représente la variance expliquée par Random Forest. IMPORTANT: La métrique principale d'évaluation est MAE (${maeMetric ? this.formatMetricValue('mae', maeMetric.value) : 'N/A'}), mais R² est affiché pour intuition visuelle.` :
            'Score neutre car aucune métrique R² disponible.'
        };
      } else {
        return {
          title: 'Score Global - Régression', 
          method: r2Metric ? 'Coefficient de détermination (R²)' : 'Score neutre par défaut',
          metrics: r2Metric ? [`R²: ${this.formatMetricValue('r2', r2Metric.value)}`] : [],
          detail: r2Metric ? 
            'Ce score représente le pourcentage de variance expliquée par le modèle (R²). Plus il est proche de 100%, meilleur est le modèle.' :
            'Score neutre de 50% car aucune métrique R² n\'est disponible pour calculer les performances de régression.'
        };
      }
    }
  }

  getTaskTypeIcon(): string {
    return this.getTaskType() === 'classification' ? 'category' : 'trending_up';
  }

  getTaskTypeLabel(): string {
    return this.getTaskType() === 'classification' ? 'Classification' : 'Régression';
  }

  getMetricsCount(): number {
    return this.getMetrics().length;
  }

  getTimeAgo(): string {
    if (!this.experiment?.created_at) return 'Inconnu';
    
    const now = new Date();
    const created = new Date(this.experiment.created_at);
    const diffMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    
    if (diffMinutes < 60) return `il y a ${diffMinutes}min`;
    if (diffMinutes < 1440) return `il y a ${Math.floor(diffMinutes / 60)}h`;
    return `il y a ${Math.floor(diffMinutes / 1440)}j`;
  }

  // ===== NOUVELLES MÉTHODES POUR L'UX AMÉLIORÉE =====

  getPerformanceLevelIcon(): string {
    const perfClass = this.getOverallPerformanceClass();
    switch (perfClass) {
      case 'excellent': return 'emoji_events';
      case 'good': return 'thumb_up';
      case 'average': return 'trending_up';
      case 'poor': return 'warning';
      default: return 'analytics';
    }
  }

  getScoreExplanation(): string {
    const score = this.getOverallScore();
    const taskType = this.getTaskType();
    const primaryKPI = this.getPrimaryKPI();
    
    if (!primaryKPI) return 'Score basé sur les métriques disponibles.';
    
    if (taskType === 'classification') {
      if (score >= 85) {
        return `Excellent ! Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} indique un modèle très performant.`;
      } else if (score >= 70) {
        return `Bon résultat. Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} montre une performance solide.`;
      } else {
        return `Performances à améliorer. Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} suggère des optimisations possibles.`;
      }
    } else {
      if (score >= 85) {
        return `Excellent ! Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} indique des prédictions très précises.`;
      } else if (score >= 70) {
        return `Bon résultat. Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} montre une bonne capacité prédictive.`;
      } else {
        return `Performances à améliorer. Votre ${primaryKPI.displayName} de ${this.formatMetricValue(primaryKPI.key, primaryKPI.value)} suggère des optimisations possibles.`;
      }
    }
  }

  getTaskDescription(): string {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    
    if (taskType === 'classification') {
      return algorithm === 'random_forest' ? 
        'Classe vos données en catégories avec une forêt d\'arbres' :
        'Classe vos données en catégories avec un arbre de décision';
    } else {
      return algorithm === 'random_forest' ?
        'Prédit des valeurs numériques avec une forêt d\'arbres' :
        'Prédit des valeurs numériques avec un arbre de décision';
    }
  }

  getDatasetInfo(): {name: string, description: string} | null {
    // Simplification pour le moment - récupérer depuis les colonnes ou résultats
    if (this.datasetColumns.length > 0) {
      return {
        name: `Dataset ${this.datasetColumns.length} Variables`,
        description: `Dataset avec ${this.datasetColumns.length} variables analysées`
      };
    }
    
    return {
      name: 'Dataset Analysé',
      description: 'Dataset utilisé pour l\'entraînement du modèle'
    };
  }

  getTrainingDuration(): string {
    // Estimation basée sur l'algorithme et la taille
    const algorithm = this.getAlgorithm();
    const size = this.getDatasetSize();
    
    if (algorithm === 'random_forest') {
      return size > 1000 ? '< 2min' : '< 30s';
    } else {
      return size > 1000 ? '< 1min' : '< 15s';
    }
  }

  getDatasetSize(): number {
    // Récupérer depuis les résultats si disponible
    const preprocessingConfig = this.results?.preprocessing_config as any;
    console.log('🔍 DATASET SIZE DEBUG - preprocessing_config:', preprocessingConfig);
    console.log('🔍 DATASET SIZE DEBUG - preprocessing_config KEYS:', Object.keys(preprocessingConfig || {}));
    console.log('🔍 DATASET SIZE DEBUG - dataset_size key:', preprocessingConfig?.dataset_size);
    
    // 🔍 CHERCHER dans d'autres endroits
    const allResults = this.results as any;
    console.log('🔍 DATASET SIZE DEBUG - ALL results keys:', Object.keys(allResults || {}));
    console.log('🔍 DATASET SIZE DEBUG - experiment object:', this.experiment);
    console.log('🔍 DATASET SIZE DEBUG - dataset object:', this.dataset);
    
    if (preprocessingConfig?.dataset_size) {
      console.log('✅ VRAIE taille dataset trouvée:', preprocessingConfig.dataset_size);
      return preprocessingConfig.dataset_size;
    }
    
    // 🚨 AUCUNE FAKE DATA - retourner 0 si pas de vraie taille dataset
    console.warn('🚫 INTÉGRITÉ SCIENTIFIQUE: Pas de taille dataset disponible, retour 0');
    return 0;
  }

  getFeatureCount(): number {
    // 🎯 PRIORITÉ 1: Utiliser feature_count depuis preprocessing_config (vraies données backend)
    const preprocessingConfig = this.results?.preprocessing_config as any;
    console.log('🔍 FEATURE COUNT DEBUG - preprocessing_config keys:', Object.keys(preprocessingConfig || {}));
    if (preprocessingConfig?.feature_count) {
      console.log('✅ VRAIE feature count trouvée:', preprocessingConfig.feature_count);
      return preprocessingConfig.feature_count;
    }
    
    // PRIORITÉ 2: Utiliser les colonnes du dataset
    if (this.datasetColumns.length > 0) {
      console.log('✅ Feature count depuis colonnes dataset:', this.datasetColumns.length);
      return this.datasetColumns.length;
    }
    
    // 🚨 AUCUNE FAKE DATA - retourner 0 si pas de vraies colonnes 
    console.warn('🚫 INTÉGRITÉ SCIENTIFIQUE: Pas de feature count disponible, retour 0');
    return 0;
  }

  // ===== KPI METRICS - ADAPTATIFS SELON TÂCHE ET MODÈLE =====

  getPrimaryMetrics(): Array<{key: string, value: number, isPrimary?: boolean}> {
    const allMetrics = this.getMetrics();
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    
    if (taskType === 'classification') {
      if (algorithm === 'decision_tree') {
        // Classification + Decision Tree : Accuracy principal, F1-Score, Precision, Recall (SANS les macros et ROC-AUC)
        const priority = ['accuracy', 'f1_score', 'precision', 'recall', 'pr_auc'];
        return this.buildMetricsWithPrimary(allMetrics, priority);
      } else if (algorithm === 'random_forest') {
        // 🆕 Classification + Random Forest : F1-Macro principal (plus représentatif multiclasse), puis OOB, PR-AUC
        const priority = ['f1_macro', 'oob_score', 'pr_auc', 'f1_score', 'accuracy', 'precision', 'recall'];
        return this.buildMetricsWithPrimary(allMetrics, priority);
      }
    } else if (taskType === 'regression') {
      if (algorithm === 'decision_tree') {
        // Régression + Decision Tree : MAE principal, puis RMSE, R²
        const priority = ['mae', 'rmse', 'r2', 'mse'];
        return this.buildMetricsWithPrimary(allMetrics, priority);
      } else if (algorithm === 'random_forest') {
        // Régression + Random Forest : MAE principal, puis RMSE, R²
        const priority = ['mae', 'rmse', 'r2', 'mse'];
        return this.buildMetricsWithPrimary(allMetrics, priority);
      }
    }
    
    // Fallback pour algorithmes non reconnus
    return this.buildMetricsWithPrimary(allMetrics, ['accuracy', 'f1_score', 'mae', 'rmse', 'r2']);
  }

  private buildMetricsWithPrimary(allMetrics: Array<{key: string, value: number}>, priority: string[]): Array<{key: string, value: number, isPrimary?: boolean}> {
    const result: Array<{key: string, value: number, isPrimary?: boolean}> = [];
    
    priority.forEach((key, index) => {
      const metric = allMetrics.find(m => m.key === key);
      if (metric) {
        result.push({
          ...metric,
          isPrimary: index === 0 // Le premier de la liste est le principal
        });
      }
    });
    
    return result;
  }

  /**
   * Retourne le KPI principal selon la combinaison tâche/modèle
   * AMÉLIORÉ: F1-macro prioritaire pour Classification + Decision Tree
   */
  getPrimaryKPI(): {key: string, value: number, displayName: string, description: string, isImproved?: boolean} | null {
    const metrics = this.getPrimaryMetrics();
    const primaryMetric = metrics.find(m => m.isPrimary);
    
    if (!primaryMetric) return null;
    
    // Marquer si c'est une amélioration spécifique à l'algorithme
    const isImproved = (this.getTaskType() === 'classification' && 
                       this.getAlgorithm() === 'decision_tree' && 
                       primaryMetric.key === 'accuracy') ||
                      (this.getTaskType() === 'classification' && 
                       this.getAlgorithm() === 'random_forest' && 
                       primaryMetric.key === 'f1_macro');
    
    return {
      key: primaryMetric.key,
      value: primaryMetric.value,
      displayName: this.getMetricDisplayName(primaryMetric.key),
      description: this.getPrimaryKPIDescription(primaryMetric.key),
      isImproved
    };
  }

  private getPrimaryKPIDescription(key: string): string {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    const classificationType = this.getClassificationType();
    
    const descriptions: Record<string, string> = {
      // Classification - AMÉLIORÉ avec contexte spécifique selon algorithme
      
      'f1_score': algorithm === 'random_forest' ? 
        `F1-Score de Random Forest : équilibre optimal entre précision et rappel par vote de ${this.getTreeCount()} arbres. ${classificationType === 'binary' ? 'Très fiable en classification binaire avec les forêts.' : 'Indicateur robuste pour classification multi-classes.'}` :
        `F1-Score : équilibre optimal entre précision et rappel. ${classificationType === 'binary' ? 'Métrique de référence en classification binaire.' : 'Bon indicateur général en classification.'}`,
      
      
      // NOUVEAU: PR-AUC spécifique Random Forest  
      'pr_auc': algorithm === 'random_forest' ? 
        `PR-AUC de Random Forest : performance sur classes déséquilibrées par agrégation de ${this.getTreeCount()} arbres. Les forêts aléatoires sont particulièrement efficaces pour gérer le déséquilibre de classes grâce à la diversité des arbres.` :
        'PR-AUC : performance sur les classes déséquilibrées.',
      
      // NOUVEAU: OOB spécifique Random Forest
      'oob_score': algorithm === 'random_forest' ? 
        `Score OOB (Out-Of-Bag) : validation interne exclusive à Random Forest. Chaque arbre teste sur ~33% des données non utilisées pour son entraînement. Métrique très fiable sans besoin de jeu de validation séparé. Score OOB proche de la validation croisée.` :
        'Score OOB : validation interne de Random Forest.',
      
      // Régression  
      'mae': `Erreur Absolue Moyenne : mesure l'écart moyen entre prédictions et valeurs réelles, exprimée dans l'unité de votre variable cible. Idéale pour ${algorithm === 'decision_tree' ? 'les arbres de décision' : 'Random Forest'} en régression.`,
      'rmse': 'Racine de l\'Erreur Quadratique Moyenne : pénalise plus fortement les grandes erreurs, utile si les outliers sont critiques.',
      'r2': 'Coefficient de Détermination : pourcentage de variance expliquée par le modèle (plus proche de 100% = meilleur).'
    };
    
    return descriptions[key] || this.getMetricDescription(key);
  }

  getMetricDisplayName(key: string): string {
    const names: Record<string, string> = {
      // Classification
      'accuracy': 'Accuracy',
      'precision': 'Précision',
      'recall': 'Rappel',
      'f1_score': 'F1-Score',
      'f1_macro': 'F1-Macro',
      'pr_auc': 'PR-AUC',
      'oob_score': 'Score OOB',
      
      // Régression
      'r2': 'R²',
      'mae': 'MAE',
      'mse': 'MSE',
      'rmse': 'RMSE'
    };
    return names[key] || key.toUpperCase();
  }

  getMetricIcon(key: string): string {
    const icons: Record<string, string> = {
      // Classification
      'accuracy': 'check_circle',
      'precision': 'gps_fixed', 
      'recall': 'radar',
      'f1_score': 'balance',
      'f1_macro': 'balance',
      'pr_auc': 'trending_up',
      'oob_score': 'forest',
      
      // Régression
      'r2': 'functions',
      'mae': 'analytics',
      'mse': 'analytics',
      'rmse': 'analytics'
    };
    return icons[key] || 'analytics';
  }

  getMetricDescription(key: string): string {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    const classificationType = this.getClassificationType();
    
    const descriptions: Record<string, string> = {
      // Classification - Descriptions adaptées selon le contexte ET algorithme
      'accuracy': algorithm === 'random_forest' ? 
        'Pourcentage de prédictions correctes de la forêt (vote majoritaire des arbres)' : 
        'Pourcentage de prédictions correctes sur l\'ensemble des données',
      
      'precision': taskType === 'classification' ? 'Fiabilité : parmi les prédictions positives, combien sont vraies' : 'Fiabilité des prédictions positives',
      'recall': taskType === 'classification' ? 'Couverture : parmi les vrais positifs, combien sont détectés' : 'Capacité à détecter les vrais positifs',
      
      'f1_score': algorithm === 'random_forest' ? 
        'Équilibre optimal entre précision et rappel de la forêt d\'arbres' : 
        'Équilibre optimal entre précision et rappel',
      
      'f1_macro': algorithm === 'random_forest' ? 
        'F1-Macro de Random Forest : moyenne non pondérée entre classes, plus représentative pour classification multiclasse avec vote de forêt' : 
        'F1-Score macro : moyenne non pondérée entre toutes les classes',
      
      
      
      // NOUVEAU: PR-AUC spécifique Random Forest  
      'pr_auc': algorithm === 'random_forest' ? 
        `PR-AUC de Random Forest : performance sur classes déséquilibrées par vote de ${this.getTreeCount()} arbres. Particulièrement fiable avec les forêts aléatoires.` :
        'Performance sur les classes déséquilibrées (Precision-Recall AUC)',
      
      // AMÉLIORÉ: OOB spécifique Random Forest
      'oob_score': algorithm === 'random_forest' ? 
        `Score OOB (Out-Of-Bag) : validation interne unique de Random Forest. Utilise les ${this.getTreeCount()} arbres pour tester sur données non vues pendant l'entraînement, sans besoin de jeu de test séparé.` :
        'Score "Out-Of-Bag" : validation interne de Random Forest sans données test',
      
      // Régression - Descriptions adaptées selon le contexte
      'r2': algorithm === 'random_forest' ? 'Pourcentage de variance expliquée par la forêt (plus proche de 100% = meilleur)' : 'Variance expliquée par le modèle',
      'mae': 'Erreur absolue moyenne : écart moyen entre prédiction et réalité (dans l\'unité de la cible)',
      'mse': 'Erreur quadratique moyenne : pénalise plus les grandes erreurs',
      'rmse': 'Racine de l\'erreur quadratique : plus intuitive que MSE (même unité que la cible)'
    };
    
    return descriptions[key] || 'Métrique de performance';
  }

  formatMetricValue(key: string, value: number): string {
    // Classification metrics (0-1) -> percentage
    if (['accuracy', 'precision', 'recall', 'f1_score', 'f1_macro', 'pr_auc', 'oob_score'].includes(key)) {
      return (value * 100).toFixed(1) + '%';
    }
    
    // R² -> percentage (can be negative)
    if (key === 'r2') {
      return (value * 100).toFixed(1) + '%';
    }
    
    // Error metrics -> formatted number
    if (['mae', 'mse', 'rmse'].includes(key)) {
      return value >= 1000 ? 
        new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) : 
        value.toFixed(3);
    }
    
    return value.toFixed(3);
  }

  getPerformanceClass(value: number, key: string): string {
    const taskType = this.getTaskType();
    
    if (taskType === 'regression' && ['mae', 'mse', 'rmse'].includes(key)) {
      return 'error-metric'; // Special class for error metrics
    }
    
    if (key === 'r2') {
      if (value >= 0.8) return 'excellent';
      if (value >= 0.6) return 'good';
      if (value >= 0.3) return 'average';
      return 'poor';
    }
    
    // Classification metrics
    if (value >= 0.9) return 'excellent';
    if (value >= 0.75) return 'good';
    if (value >= 0.6) return 'average';
    return 'poor';
  }

  getPerformanceLabel(value: number, key: string): string {
    const perfClass = this.getPerformanceClass(value, key);
    
    switch (perfClass) {
      case 'excellent': return 'Excellent';
      case 'good': return 'Bon';
      case 'average': return 'Moyen';
      case 'poor': return 'Faible';
      case 'error-metric': return 'Erreur';
      default: return 'N/A';
    }
  }



  trackMetric(index: number, metric: {key: string, value: number}): string {
    return metric.key;
  }

  trackByRecommendation(index: number, rec: any): string {
    return rec.title || rec.icon || index.toString();
  }

  // ===== NOUVELLES MÉTHODES POUR RANDOM FOREST =====

  /**
   * NOUVEAU: Identifie si une métrique est exclusive à Random Forest
   */
  isRandomForestExclusiveMetric(metricKey: string): boolean {
    if (this.getAlgorithm() !== 'random_forest') return false;
    
    const exclusiveMetrics = ['oob_score']; // OOB est unique à Random Forest
    return exclusiveMetrics.includes(metricKey);
  }

  /**
   * NOUVEAU: Identifie si une métrique est particulièrement améliorée/optimisée par Random Forest
   */
  isEnhancedRandomForestMetric(metricKey: string): boolean {
    if (this.getAlgorithm() !== 'random_forest') return false;
    
    const enhancedMetrics = ['pr_auc', 'f1_score']; // Métriques où Random Forest excelle généralement
    return enhancedMetrics.includes(metricKey);
  }

  // ===== EXPLICATIONS PÉDAGOGIQUES CONTEXTUELLES =====

  /**
   * Retourne une explication pédagogique adaptée à la combinaison tâche/modèle
   */
  getPedagogicalExplanation(): {title: string, description: string, keyPoints: string[]} {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    const score = this.getOverallScore();
    
    if (taskType === 'classification') {
      if (algorithm === 'decision_tree') {
        return {
          title: 'Classification par Arbre de Décision',
          description: 'Votre modèle utilise une série de questions simples pour classer les données, comme un questionnaire logique.',
          keyPoints: [
            'Accuracy : pourcentage global de bonnes prédictions',
            'Matrice de confusion : montre où le modèle se trompe (diagonale = bonnes prédictions)',
            score >= 85 ? 'Performance excellente pour un arbre simple !' : 'Random Forest pourrait améliorer vos performances'
          ]
        };
      } else if (algorithm === 'random_forest') {
        return {
          title: 'Classification par Random Forest',
          description: `Votre modèle combine ${this.getTreeCount()} arbres qui "votent" ensemble pour une prédiction plus robuste et stable.`,
          keyPoints: [
            'F1-Score : métrique principale, équilibre robuste précision/rappel grâce au vote de la forêt',
            `PR-AUC : performance sur classes déséquilibrées, particulièrement fiable avec Random Forest`,
            `Score OOB : validation interne unique (~33% données par arbre), équivaut à validation croisée gratuite`,
            'Random Forest réduit drastiquement le sur-ajustement et améliore la généralisation'
          ]
        };
      }
    } else if (taskType === 'regression') {
      if (algorithm === 'decision_tree') {
        return {
          title: 'Régression par Arbre de Décision',
          description: 'Votre modèle prédit des valeurs numériques en divisant l\'espace des données en zones homogènes via des questions logiques.',
          keyPoints: [
            '🎯 MAE : erreur moyenne absolue, exprimée dans l\'unité de votre variable cible (métrique principale)',
            '📊 R² : pourcentage de variance expliquée (plus proche de 100% = meilleur)',
            '📈 RMSE : pénalise davantage les grandes erreurs que MAE',
            '🎯 SPÉC: Scatter plot : vérifiez si les points suivent la diagonale idéale',
            '🎯 SPÉC: Résidus vs prédictions : détectent patterns et hétéroscédasticité (dispersion non-constante)',
            '🎯 SPÉC: Histogramme résidus : vérifie normalité (distribution symétrique centrée sur 0)',
            '🌳 Arbre de décision : logique étape par étape pour comprendre les prédictions'
          ]
        };
      } else if (algorithm === 'random_forest') {
        return {
          title: 'Régression par Random Forest',
          description: `Votre modèle fait la moyenne des prédictions de ${this.getTreeCount()} arbres pour une estimation plus stable.`,
          keyPoints: [
            'MAE : erreur absolue moyenne, plus robuste aux outliers que RMSE',
            'RMSE : pénalise davantage les grandes erreurs',
            'R² : variance expliquée par la forêt d\'arbres',
            'Importances des features : variables les plus déterminantes'
          ]
        };
      }
    }
    
    // Fallback
    return {
      title: 'Analyse de Performance',
      description: `Votre modèle ${this.getAlgorithmDisplayName()} pour ${this.getTaskTypeLabel().toLowerCase()}`,
      keyPoints: [
        'Analysez les métriques principales selon votre cas d\'usage',
        'Comparez avec des modèles de référence (baseline)',
        'Vérifiez les visualisations pour comprendre le comportement'
      ]
    };
  }

  /**
   * Retourne des conseils d'interprétation pour les visualisations selon le contexte
   * AMÉLIORÉ: Conseils spécifiques pour Classification + Decision Tree
   */
  getVisualizationTips(): {confusion?: string, roc?: string, pr?: string, regression?: string, residual_vs_predicted?: string, residuals_histogram?: string, tree?: string, local?: string} {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    const classificationType = this.getClassificationType();
    
    const tips: {confusion?: string, roc?: string, pr?: string, regression?: string, residual_vs_predicted?: string, residuals_histogram?: string, tree?: string, local?: string} = {};
    
    if (taskType === 'classification') {
      if (classificationType === 'binary') {
        tips.confusion = '🎯 SPÉC: La matrice de confusion montre où le modèle se trompe (diagonale = bonnes prédictions). Format 2×2 pour classification binaire.';
        tips.roc = '🎯 SPÉC: Courbes ROC évaluent la capacité de discrimination - plus la courbe s\'éloigne de la diagonale, meilleur est le modèle.';
        tips.pr = '🎯 SPÉC: Courbes PR montrent le compromis précision/rappel, particulièrement utiles pour classes déséquilibrées.';
      } else {
        tips.confusion = 'Matrice de confusion multi-classes : la diagonale représente les bonnes prédictions. Les confusions fréquentes entre certaines classes indiquent des difficultés de discrimination.';
        tips.roc = 'Courbe ROC multi-classes (one-vs-rest) : chaque classe est évaluée contre toutes les autres. Utile pour identifier les classes les mieux discriminées.';
      }
    } else {
      // 🎯 AMÉLIORÉ: Conseils spécifiques pour toutes les visualisations de régression
      tips.regression = '🎯 SPÉC: Le scatter plot compare prédictions vs réalité. Les points doivent suivre la diagonale idéale pour un modèle parfait.';
      tips.residual_vs_predicted = '🎯 SPÉC: Les résidus vs prédictions détectent l\'hétéroscédasticité (variance non-constante). Les points doivent être distribués aléatoirement autour de la ligne horizontale à 0 sans pattern visible.';
      tips.residuals_histogram = '🎯 SPÉC: L\'histogramme des résidus vérifie l\'hypothèse de normalité. La distribution doit être symétrique, centrée sur 0 et approximativement normale (courbe en cloche).';
    }
    
    if (algorithm === 'decision_tree') {
      tips.tree = 'L\'arbre montre la logique de décision étape par étape. Suivez les branches pour comprendre comment une prédiction est faite. Chaque noeud contient une condition, chaque feuille une prédiction.';
      
    } else if (algorithm === 'random_forest') {
      tips.tree = `Visualisation d'un arbre représentatif de la forêt aléatoire. La logique complète combine ${this.getTreeCount()} arbres via vote majoritaire.`;
    }
    
    return tips;
  }

  // ===== MÉTHODES BASELINE SUPPRIMÉES =====
  // Les méthodes de comparaison baseline ont été supprimées selon la demande utilisateur
  // pour simplifier l'interface et éviter de justifier un modèle de référence.

  // ===== VISUALIZATIONS =====

  hasTreeData(): boolean {
    return !!this.getTreeData();
  }

  getTreeData(): any {
    return this.getCached('treeData', () => {
    console.log('🌲 Recherche des données d\'arbre...');
    console.log('📦 results:', this.results);
    console.log('📦 visualizations:', this.results?.visualizations);
    
    const treeStructure = this.results?.visualizations?.['tree_structure'];
    console.log('📦 tree_structure:', treeStructure);
    
    if (treeStructure && typeof treeStructure === 'object' && 'tree_data' in treeStructure) {
      console.log('✅ Données d\'arbre trouvées:', (treeStructure as any).tree_data);
      return (treeStructure as any).tree_data;
    }
    
    // Vérifier si tree_structure contient directement les données
    if (treeStructure && typeof treeStructure === 'object' && 'name' in treeStructure) {
      console.log('✅ Données d\'arbre trouvées directement dans tree_structure:', treeStructure);
      return treeStructure;
    }
    
    console.log('❌ Aucune donnée d\'arbre trouvée');
    return null;
    });
  }

  isRealTreeData(): boolean {
    const treeData = this.getTreeData();
    return treeData && !treeData.is_explanation;
  }

  getTreeVisualizationTitle(): string {
    const algorithm = this.getAlgorithm();
    if (algorithm === 'random_forest') {
      return 'Échantillon d\'Arbre (Random Forest)';
    }
    return 'Structure de l\'Arbre de Décision';
  }

  getTreeCount(): number {
    const metadata = this.results?.visualizations?.['tree_structure'] as any;
    if (metadata?.metadata?.n_estimators) {
      return metadata.metadata.n_estimators;
    }
    
    // 🚨 AUCUNE FAKE DATA - retourner valeur par défaut mais avec warning
    console.warn('🚫 INTÉGRITÉ SCIENTIFIQUE: Pas de nombre d\'arbres dans metadata, utilisation valeur par défaut sklearn');
    return 100; // Valeur par défaut officielle de sklearn RandomForestClassifier
  }


  hasTaskSpecificVisualizations(): boolean {
    const taskType = this.getTaskType();
    if (taskType === 'classification') {
      return this.hasConfusionMatrix() || this.hasRocCurve() || this.hasFeatureImportance();
    } else {
      return this.hasRegressionPlot() || this.hasResidualPlots() || this.hasFeatureImportance();
    }
  }

  /**
   * Retourne les visualisations appropriées selon la combinaison tâche/modèle
   * AMÉLIORÉ: Gestion spécifique Classification + Decision Tree avec ROC/PR binaires
   */
  getRecommendedVisualizations(): Array<{type: string, title: string, description: string, available: boolean, priority?: number, error?: boolean}> {
    const taskType = this.getTaskType();
    const algorithm = this.getAlgorithm();
    const classificationType = this.getClassificationType();
    
    const visualizations: Array<{type: string, title: string, description: string, available: boolean, priority?: number, error?: boolean}> = [];
    
    // Arbre de décision (priorité 1 - toujours en premier)
    if (this.hasTreeData()) {
      const treeTitle = algorithm === 'random_forest' ? 
        'Arbre de la Forêt' : 
        'Structure de l\'Arbre de Décision';
      const treeDescription = algorithm === 'random_forest' ?
        `Visualisation d'un arbre individuel de votre Random Forest (${this.getTreeCount()} arbres au total)` :
        'Logique de décision étape par étape - suivez les branches pour comprendre chaque décision';
        
      visualizations.push({
        type: 'tree_structure',
        title: treeTitle,
        description: treeDescription,
        available: true,
        priority: 1
      });
    }

    // Visualisations spécifiques par tâche
    if (taskType === 'classification') {
      // Matrice de confusion (priorité 2) - 🎯 FORCÉE pour toutes classifications
      const confusionAvailable = this.hasConfusionMatrix();
      console.log('🚨 FORCE CHECK - hasConfusionMatrix():', confusionAvailable);
      console.log('🚨 FORCE CHECK - visualizations keys:', Object.keys(this.results?.visualizations || {}));
      
      visualizations.push({
        type: 'confusion_matrix',
        title: 'Matrice de Confusion',
        description: this.getConfusionMatrixDescription(),
        available: confusionAvailable,
        priority: 2
      });
      
      if (!confusionAvailable) {
        console.error('🚨 CONFUSION MATRIX MANQUANTE - Devrait être générée automatiquement !');
        // Ajouter un message d'erreur visible pour l'utilisateur
        visualizations.unshift({  // unshift pour mettre en premier
          type: 'confusion_matrix',
          title: '⚠️ Matrice de Confusion - ERREUR',
          description: '🚨 La matrice de confusion n\'a pas pu être générée. Cette visualisation est critique pour analyser les erreurs de classification. Vérifiez les logs du serveur pour plus de détails.',
          available: false,
          priority: 0,  // Haute priorité pour être visible
          error: true
        });
      }
      
      // 🎯 AMÉLIORÉ: ROC curve FORCÉE pour classification (multiclass/binaire)
      const rocAvailable = this.hasRocCurve();
      console.log('🚨 FORCE CHECK - hasRocCurve():', rocAvailable);
      
      const rocDescription = classificationType === 'binary' ? 
        '🎯 SPÉC: Courbes ROC évaluent la capacité de discrimination - plus la courbe s\'éloigne de la diagonale, meilleur est le modèle' :
        '🎯 SPÉC: Courbes ROC multi-classes (one-vs-rest) - évaluent la discrimination pour chaque classe vs les autres';
      
      visualizations.push({
        type: 'roc_curve',
        title: `Courbe ROC ${classificationType === 'multiclass' ? '(Multi-classes)' : '(Binaire)'}`,
        description: rocDescription,
        available: rocAvailable,
        priority: 3
      });
      
      if (!rocAvailable && algorithm === 'decision_tree') {
        console.warn('🚨 ROC CURVE MANQUANTE pour Decision Tree - Devrait être générée !');
      }
      
      // NOUVEAU: Courbe PR spécifiquement pour binaire (priorité 4)
      if (this.hasPRCurve() && classificationType === 'binary') {
        visualizations.push({
          type: 'pr_curve',
          title: 'Courbe Precision-Recall',
          description: 'Particulièrement utile pour les classes déséquilibrées - montre le compromis précision/rappel',
          available: true,
          priority: 4
        });
      }
      
      // AMÉLIORÉ: Importance des variables (priorité 5)
      if (this.hasFeatureImportance()) {
        const importanceTitle = algorithm === 'decision_tree' ? 
          'Importance des Variables (Arbre)' : 
          'Importance des Variables (Forêt)';
        const importanceDescription = algorithm === 'decision_tree' ? 
          'Variables les plus utilisées dans les divisions de l\'arbre de décision' :
          'Variables les plus influentes dans les décisions de la forêt';
        
        visualizations.push({
          type: 'feature_importance',
          title: importanceTitle,
          description: importanceDescription,
          available: true,
          priority: 5
        });
      }
      
      // NOUVEAU: Messages informatifs pour visualisations manquantes mais attendues
      if (algorithm === 'decision_tree' && classificationType === 'binary') {
        if (!this.hasRocCurve()) {
          visualizations.push({
            type: 'missing_roc',
            title: 'Courbe ROC (Manquante)',
            description: 'Cette visualisation devrait être disponible pour la classification binaire avec Decision Tree',
            available: false,
            priority: 10
          });
        }
        
        if (!this.hasPRCurve()) {
          visualizations.push({
            type: 'missing_pr',
            title: 'Courbe Precision-Recall (Manquante)',
            description: 'Visualisation recommandée pour évaluer les performances sur classes déséquilibrées',
            available: false,
            priority: 11
          });
        }
      }
      
    } else if (taskType === 'regression') {
      // Code régression inchangé
      if (this.hasRegressionPlot()) {
        visualizations.push({
          type: 'regression_plot',
          title: 'Prédictions vs Réalité',
          description: '🎯 SPÉC: Les points doivent suivre la diagonale idéale pour un modèle parfait. Écarts = erreurs du modèle.',
          available: true,
          priority: 2
        });
      }
      
      // 🎯 NOUVEAU: Résidus vs Prédictions (obligatoire pour régression)
      if (this.hasResidualVsPredicted()) {
        visualizations.push({
          type: 'residual_vs_predicted',
          title: 'Résidus vs Prédictions',
          description: '🎯 SPÉC: Détecte l\'hétéroscédasticité et patterns dans les erreurs. Points doivent être distribués aléatoirement autour de 0.',
          available: true,
          priority: 3
        });
      }
      
      // 🎯 NOUVEAU: Histogramme des Résidus (obligatoire pour régression)
      if (this.hasResidualsHistogram()) {
        visualizations.push({
          type: 'residuals_histogram',
          title: 'Histogramme des Résidus',
          description: '🎯 SPÉC: Vérifie l\'hypothèse de normalité des erreurs. Distribution doit être centrée sur 0 et symétrique.',
          available: true,
          priority: 4
        });
      }
      
      if (this.hasResidualPlots()) {
        visualizations.push({
          type: 'residual_plot',
          title: 'Analyse des Résidus (Ancien)',
          description: 'Distribution des erreurs - doit être centrée sur zéro',
          available: true,
          priority: 5
        });
      }
      
      if (algorithm === 'random_forest' && this.hasFeatureImportance()) {
        visualizations.push({
          type: 'feature_importance',
          title: 'Importance des Variables',
          description: 'Variables les plus déterminantes dans les prédictions',
          available: true,
          priority: 4
        });
      }
    }

    // Trier par priorité
    visualizations.sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Si aucune visualisation n'est disponible, afficher un message informatif
    if (visualizations.filter(v => v.available).length === 0) {
      visualizations.push({
        type: 'no_visualizations',
        title: 'Aucune Visualisation Disponible',
        description: 'Les visualisations n\'ont pas été générées pour cette expérience. Cela peut arriver avec certains types de données.',
        available: false,
        priority: 999
      });
    }
    
    return visualizations;
  }

  hasConfusionMatrix(): boolean {
    if (!this.results?.visualizations) return false;
    
    const confusionViz = this.results.visualizations['confusion_matrix'];
    // Vérifier que la visualisation existe ET a du contenu
    return !!(confusionViz && ((confusionViz as any)?.image || typeof confusionViz === 'string'));
  }

  getConfusionMatrixImage(): string {
    const confusionViz = this.results?.visualizations?.['confusion_matrix'];
    
    // Si c'est un objet avec une propriété image (format attendu)
    if ((confusionViz as any)?.image) {
      return `data:image/png;base64,${(confusionViz as any).image}`;
    }
    
    // Si c'est directement une string base64 (ancien format)
    if (typeof confusionViz === 'string' && confusionViz.length > 100) {
      return `data:image/png;base64,${confusionViz}`;
    }
    
    // Sinon, utiliser l'URL de fallback
    // 🔧 CORRIGÉ: Utiliser l'API Gateway (port 9000) avec le bon préfixe API
    return `http://localhost:9000/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/confusion_matrix`;
  }

  hasRocCurve(): boolean {
    if (!this.results?.visualizations) return false;
    
    const rocViz = this.results.visualizations['roc_curve'];
    // Vérifier que la visualisation existe ET a du contenu
    return !!(rocViz && ((rocViz as any)?.image || typeof rocViz === 'string'));
  }

  /**
   * NOUVEAU: Vérifier si on devrait avoir des courbes ROC/PR
   * Spécifiquement pour Classification + Decision Tree binaire
   */
  shouldShowROCPRCurves(): boolean {
    return this.getTaskType() === 'classification' && 
           this.getClassificationType() === 'binary';
  }

  /**
   * NOUVEAU: Vérifier présence courbe PR
   */
  hasPRCurve(): boolean {
    if (!this.results?.visualizations) return false;
    
    const prViz = this.results.visualizations['pr_curve'] || this.results.visualizations['precision_recall_curve'];
    return !!(prViz && ((prViz as any)?.image || typeof prViz === 'string'));
  }

  /**
   * NOUVEAU: Obtenir URL de la courbe PR
   */
  getPRCurveImage(): string {
    const prViz = this.results?.visualizations?.['pr_curve'] || this.results?.visualizations?.['precision_recall_curve'];
    if ((prViz as any)?.image) {
      return `data:image/png;base64,${(prViz as any).image}`;
    }
    // 🔧 CORRIGÉ: Utiliser l'API Gateway (port 9000) avec le bon préfixe API
    return `http://localhost:9000/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/pr_curve`;
  }

  getRocCurveImage(): string {
    const rocViz = this.results?.visualizations?.['roc_curve'];
    
    // Si c'est un objet avec une propriété image (format attendu)
    if ((rocViz as any)?.image) {
      return `data:image/png;base64,${(rocViz as any).image}`;
    }
    
    // Si c'est directement une string base64 (ancien format)
    if (typeof rocViz === 'string' && rocViz.length > 100) {
      return `data:image/png;base64,${rocViz}`;
    }
    
    // Sinon, utiliser l'URL de fallback
    // 🔧 CORRIGÉ: Utiliser l'API Gateway (port 9000) avec le bon préfixe API
    return `http://localhost:9000/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/roc_curve`;
  }

  hasRegressionPlot(): boolean {
    if (!this.results?.visualizations) return false;
    
    const regressionViz = this.results.visualizations['regression_plot'];
    return !!(regressionViz && ((regressionViz as any)?.image || typeof regressionViz === 'string'));
  }

  getRegressionPlotImage(): string {
    const regressionViz = this.results?.visualizations?.['regression_plot'];
    if ((regressionViz as any)?.image) {
      return `data:image/png;base64,${(regressionViz as any).image}`;
    }
    return `/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/regression_plot`;
  }

  hasFeatureImportance(): boolean {
    if (!this.results?.visualizations) return false;
    
    const featureViz = this.results.visualizations['feature_importance'];
    return !!(featureViz && ((featureViz as any)?.image || typeof featureViz === 'string'));
  }

  getFeatureImportanceImage(): string {
    const featureViz = this.results?.visualizations?.['feature_importance'];
    if ((featureViz as any)?.image) {
      return `data:image/png;base64,${(featureViz as any).image}`;
    }
    return `/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/feature_importance`;
  }

  // 🎯 NOUVEAU: Résidus vs Prédictions (obligatoire régression)
  hasResidualVsPredicted(): boolean {
    if (!this.results?.visualizations) return false;
    
    const residualVsPredViz = this.results.visualizations['residual_vs_predicted'];
    return !!(residualVsPredViz && ((residualVsPredViz as any)?.image || typeof residualVsPredViz === 'string'));
  }

  getResidualVsPredictedImage(): string {
    const residualVsPredViz = this.results?.visualizations?.['residual_vs_predicted'];
    if ((residualVsPredViz as any)?.image) {
      return `data:image/png;base64,${(residualVsPredViz as any).image}`;
    }
    return `http://localhost:9000/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/residual_vs_predicted`;
  }

  // 🎯 NOUVEAU: Histogramme des Résidus (obligatoire régression)
  hasResidualsHistogram(): boolean {
    if (!this.results?.visualizations) return false;
    
    const residualsHistViz = this.results.visualizations['residuals_histogram'];
    return !!(residualsHistViz && ((residualsHistViz as any)?.image || typeof residualsHistViz === 'string'));
  }

  getResidualsHistogramImage(): string {
    const residualsHistViz = this.results?.visualizations?.['residuals_histogram'];
    if ((residualsHistViz as any)?.image) {
      return `data:image/png;base64,${(residualsHistViz as any).image}`;
    }
    return `http://localhost:9000/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/residuals_histogram`;
  }

  hasResidualPlots(): boolean {
    if (!this.results?.visualizations) return false;
    
    const residualViz = this.results.visualizations['residual_plot'];
    return !!(residualViz && ((residualViz as any)?.image || typeof residualViz === 'string'));
  }

  getResidualPlotImage(): string {
    const residualViz = this.results?.visualizations?.['residual_plot'];
    if ((residualViz as any)?.image) {
      return `data:image/png;base64,${(residualViz as any).image}`;
    }
    return `/api/v1/ml-pipeline/experiments/${this.experimentId}/visualizations/residual_plot`;
  }

  // ===== INSIGHTS & RECOMMENDATIONS =====

  getOverallPerformanceClass(): string {
    const score = this.getOverallScore();
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'average';
    return 'poor';
  }

  getOverallPerformanceLabel(): string {
    const perfClass = this.getOverallPerformanceClass();
    const labels: Record<string, string> = {
      'excellent': 'Performance Excellente',
      'good': 'Bonne Performance',
      'average': 'Performance Moyenne',
      'poor': 'À Améliorer'
    };
    return labels[perfClass] || 'Non évalué';
  }

  getPerformanceMessage(): string {
    const score = this.getOverallScore();
    const algorithm = this.getAlgorithmDisplayName();
    
    if (score >= 90) {
      return `🎉 Excellent travail ! Votre ${algorithm} atteint des performances exceptionnelles.`;
    } else if (score >= 75) {
      return `📈 Bonne performance ! Votre ${algorithm} fonctionne bien avec quelques optimisations possibles.`;
    } else if (score >= 60) {
      return `🎯 Performance correcte. Votre ${algorithm} peut être amélioré avec de l'optimisation.`;
    } else {
      return `💪 Performance à améliorer. Considérez l'ajustement des hyperparamètres ou l'essai d'autres algorithmes.`;
    }
  }

  getDetailedAnalysis(): string {
    const algorithm = this.getAlgorithm();
    const taskType = this.getTaskType();
    const score = this.getOverallScore();
    
    if (algorithm === 'random_forest') {
      if (score >= 85) {
        return `Random Forest offre une excellente robustesse grâce à l'agrégation de ${this.getTreeCount()} arbres, réduisant efficacement le sur-ajustement.`;
      } else {
        return `Random Forest devrait normalement bien performer. Vérifiez la qualité des données ou augmentez le nombre d'arbres.`;
      }
    } else if (algorithm === 'decision_tree') {
      if (score >= 85) {
        return `Excellent résultat pour un arbre simple ! La logique de décision est claire et facilement interprétable.`;
    } else {
        return `Random Forest pourrait améliorer significativement vos performances en réduisant le sur-ajustement typique des arbres simples.`;
      }
    }
    
    return `Votre modèle de ${taskType} ${algorithm} offre une performance ${this.getOverallPerformanceLabel().toLowerCase()}.`;
  }

  getTopRecommendations(): Array<{icon: string, title: string, description: string, priority: string, priorityLabel: string}> {
    const algorithm = this.getAlgorithm();
    const score = this.getOverallScore();
    const recommendations = [];
    
    // Recommandation algorithme alternatif
    if (algorithm === 'decision_tree' && score < 85) {
      recommendations.push({
        icon: 'park',
        title: 'Essayer Random Forest',
        description: `Random Forest pourrait améliorer vos performances de ~10-15% grâce à l'agrégation d'arbres.`,
        priority: 'high',
        priorityLabel: 'Priorité Haute'
      });
    } else if (algorithm === 'random_forest' && score >= 90) {
      recommendations.push({
        icon: 'account_tree',
        title: 'Comparer avec Decision Tree',
        description: 'Performance excellente ! Comparez avec Decision Tree pour évaluer le gain de complexité.',
        priority: 'medium',
        priorityLabel: 'Priorité Moyenne'
      });
    }
    
    // Recommandation hyperparamètres spécifique Random Forest
    if (score < 80) {
      if (algorithm === 'random_forest') {
      recommendations.push({
        icon: 'tune',
        title: 'Optimiser Random Forest',
          description: `Avec ${this.getTreeCount()} arbres actuels, essayez d'augmenter n_estimators (200-500) ou ajuster max_features pour améliorer ROC-AUC et Score OOB.`,
        priority: 'high',
          priorityLabel: 'Priorité Haute'
        });
      } else {
        recommendations.push({
          icon: 'tune',
          title: 'Ajuster les paramètres',
          description: 'Réduire max_depth ou augmenter min_samples_split peut réduire le sur-ajustement.',
          priority: 'medium',
          priorityLabel: 'Priorité Moyenne'
        });
      }
    }
    
    // NOUVEAU: Recommandations spécifiques aux métriques Random Forest
    if (algorithm === 'random_forest') {
      const metrics = this.getMetrics();
      const oobScore = metrics.find(m => m.key === 'oob_score');
      
      // Recommandation si OOB score disponible
      if (oobScore && oobScore.value > 0.8) {
        recommendations.push({
          icon: 'verified',
          title: 'Score OOB Validé',
          description: `Score OOB de ${this.formatMetricValue('oob_score', oobScore.value)} confirme la robustesse. Random Forest performe de manière cohérente - vous pouvez avoir confiance en ce modèle.`,
          priority: 'low',
          priorityLabel: 'Validation'
        });
      }
    }
    
    // Recommandation données
    if (score < 70) {
      recommendations.push({
        icon: 'storage',
        title: 'Améliorer les données',
        description: 'Performance faible détectée. Vérifiez la qualité des données, outliers, et features pertinentes.',
        priority: 'high',
        priorityLabel: 'Priorité Haute'
      });
    }
    
    // Message positif si tout va bien
    if (recommendations.length === 0) {
      recommendations.push({
        icon: 'celebration',
        title: 'Excellent travail !',
        description: 'Votre modèle performe très bien et est prêt pour la mise en production.',
        priority: 'low',
        priorityLabel: 'Félicitations'
      });
    }
    
    return recommendations.slice(0, 3); // Maximum 3 recommandations
  }

  // ===== SYSTÈME FULLSCREEN FINAL =====

  /**
   * 🎯 INITIALISATION: Système fullscreen avec JavaScript pur
   */
  initializeFullscreenSystem(): void {
    console.log('🎯 Initialisation système fullscreen...');
    
    // Attendre que Angular ait rendu les éléments
    setTimeout(() => {
      this.setupPureJavaScriptListeners();
    }, 500);
  }

  /**
   * 🎯 SOLUTION FINALE: Setup du bouton fullscreen
   */
  private setupPureJavaScriptListeners(): void {
    console.log('🎯 Setup du bouton fullscreen...');
    
    // Attendre que le DOM soit prêt
    setTimeout(() => {
      this.createFullscreenButton();
    }, 1000);
  }

  /**
   * 🎯 CRÉATION: Bouton fullscreen sur la carte d'arbre
   */
  private createFullscreenButton(): void {
    // Chercher la carte qui contient l'arbre
    const treeCard = document.querySelector('.visualization-card.tree-card');
    if (!treeCard) {
      // Réessayer dans 1 seconde si la carte n'est pas encore rendue
      setTimeout(() => this.createFullscreenButton(), 1000);
      return;
    }
    
    // Supprimer tout bouton existant
    const existingBtn = document.getElementById('tree-fullscreen-btn');
    if (existingBtn) existingBtn.remove();
    
    // Créer le bouton fullscreen
    const fullscreenBtn = document.createElement('div');
    fullscreenBtn.id = 'tree-fullscreen-btn';
    fullscreenBtn.innerHTML = `
      <button class="tree-fullscreen-fab">
        <span class="material-icons">fullscreen</span>
        <span class="fab-text">Arbre Plein Écran</span>
      </button>
    `;
    
    // Styles inline pour garantir le bon positionnement (centre + légèrement décalé à droite)
    fullscreenBtn.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      left: 55% !important;
      transform: translateX(-50%) !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
    `;
    
    const buttonElement = fullscreenBtn.querySelector('.tree-fullscreen-fab') as HTMLElement;
    buttonElement.style.cssText = `
      min-width: 200px !important;
      height: 60px !important;
      border-radius: 30px !important;
      background: linear-gradient(135deg, #6366f1, #10b981) !important;
      border: 3px solid #fff !important;
      color: white !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      box-shadow: 0 6px 20px rgba(0,0,0,0.4) !important;
      transition: all 0.2s ease !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 10px !important;
      padding: 0 20px !important;
      pointer-events: auto !important;
      position: relative !important;
      z-index: 2147483647 !important;
    `;
    
    // Styles pour l'icône
    const iconElement = buttonElement.querySelector('.material-icons') as HTMLElement;
    if (iconElement) {
      iconElement.style.cssText = `
        font-size: 24px !important;
        margin-right: 8px !important;
      `;
    }
    
    // Styles pour le texte
    const textElement = buttonElement.querySelector('.fab-text') as HTMLElement;
    if (textElement) {
      textElement.style.cssText = `
        font-size: 14px !important;
        font-weight: 600 !important;
        letter-spacing: 0.5px !important;
      `;
    }
    
    // Capturer le contexte
    const self = this;
    
    // Event listener pour ouvrir la popup
    buttonElement.addEventListener('click', (event) => {
      console.log('🎯 Bouton fullscreen cliqué !');
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      
      // Ouvrir la popup avec le z-index maximum
      self.openTreeFullscreenPopup();
    });
    
    // Hover effect
    buttonElement.addEventListener('mouseenter', () => {
      buttonElement.style.transform = 'translateY(-2px) scale(1.05)';
      buttonElement.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
    });
    
    buttonElement.addEventListener('mouseleave', () => {
      buttonElement.style.transform = 'translateY(0) scale(1)';
      buttonElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    });
    
    // Ajouter au body pour garantir la visibilité maximale
    document.body.appendChild(fullscreenBtn);
    console.log('✅ Bouton fullscreen de l\'arbre créé - Prêt à utiliser !');
  }

  /**
   * 🚀 FIX IMMÉDIAT: Résoudre le problème de clics
   */
  private applyImmediateFix(): void {
    console.log('🚀 APPLICATION DU FIX IMMÉDIAT...');
    
    // 1. Empêcher la propagation des clics sur les images
    setTimeout(() => {
      const images = document.querySelectorAll('.viz-image, img[alt*="visualisation"], img[alt*="Matrice"], img[alt*="Courbe"]');
      images.forEach(img => {
        (img as HTMLElement).style.pointerEvents = 'none';
        img.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
        }, true);
      });
      console.log(`✅ ${images.length} images désactivées pour les clics`);
    }, 1000);
    
    // 2. S'assurer que les boutons ont la priorité
    setTimeout(() => {
      const buttons = document.querySelectorAll('button, .mat-button, .mat-fab, .mat-flat-button, .mat-stroked-button');
      buttons.forEach(btn => {
        (btn as HTMLElement).style.pointerEvents = 'auto';
        (btn as HTMLElement).style.position = 'relative';
        (btn as HTMLElement).style.zIndex = '1000';
      });
      console.log(`✅ ${buttons.length} boutons priorisés`);
    }, 1500);
    
    // 3. Bloquer la propagation sur les conteneurs de visualisation
    setTimeout(() => {
      const vizContainers = document.querySelectorAll('.visualization-card, .image-container, .viz-content');
      vizContainers.forEach(container => {
        container.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          // Ne bloquer que si ce n'est pas un bouton
          if (!target.closest('button')) {
            e.stopPropagation();
          }
        }, true);
      });
      console.log(`✅ ${vizContainers.length} conteneurs de visualisation protégés`);
    }, 1500);
  }

  
  
  
  

  /**
   * 🌳 FULLSCREEN: Ouvrir l'arbre en plein écran avec TABLEAU BLANC INTERACTIF
   */
  private openTreeFullscreenPopup(): void {
    console.log('🎨 Ouverture du TABLEAU BLANC INTERACTIF pour l\'arbre...');
    
    // Supprimer toute popup existante
    const existingPopup = document.getElementById('tree-fullscreen-popup');
    if (existingPopup) existingPopup.remove();
    
    // Créer la popup fullscreen avec contrôles avancés
    const popup = document.createElement('div');
    popup.id = 'tree-fullscreen-popup';
    popup.innerHTML = `
      <div class="fullscreen-header">
        <h2>🎨 Tableau Blanc Interactif - Arbre de Décision</h2>
        <div class="header-controls">
          <!-- Indicateurs -->
          <span id="zoom-indicator" class="zoom-indicator">100%</span>
          <span id="position-indicator" class="position-indicator">X:0 Y:0</span>
          
          <!-- Contrôles de zoom -->
          <div class="zoom-controls">
            <button id="zoom-out-btn" class="zoom-btn" title="Zoom arrière (Molette ↓)">
              <span class="material-icons">zoom_out</span>
            </button>
            <input type="range" id="zoom-slider" min="10" max="500" value="100" step="5" title="Niveau de zoom">
            <button id="zoom-in-btn" class="zoom-btn" title="Zoom avant (Molette ↑)">
              <span class="material-icons">zoom_in</span>
            </button>
          </div>
          
          <!-- Contrôles d'espacement -->
          <div class="spacing-controls">
            <label>Espacement:</label>
            <button id="spacing-h-minus" class="spacing-btn" title="Réduire espacement horizontal">
              <span class="material-icons">compress</span>
            </button>
            <span id="spacing-indicator">100%</span>
            <button id="spacing-h-plus" class="spacing-btn" title="Augmenter espacement horizontal">
              <span class="material-icons">expand</span>
            </button>
          </div>
          
          <!-- Actions -->
          <div class="action-controls">
            <button id="toggle-theme-btn" class="action-btn" title="Basculer thème clair/sombre">
              <span class="material-icons">brightness_4</span>
            </button>
            <button id="reset-view-btn" class="action-btn" title="Réinitialiser la vue">
              <span class="material-icons">center_focus_strong</span>
            </button>
            <button id="reorganize-tree-btn" class="action-btn" title="Réorganiser l'arbre">
              <span class="material-icons">account_tree</span>
            </button>
            <button id="fit-to-screen-btn" class="action-btn" title="Ajuster à l'écran">
              <span class="material-icons">fit_screen</span>
            </button>
            <button id="export-btn" class="action-btn" title="Exporter l'arbre">
              <span class="material-icons">download</span>
            </button>
          </div>
          
          <button id="close-fullscreen-btn" class="close-fullscreen-btn" title="Fermer (Échap)">
            <span class="material-icons">close</span>
          </button>
        </div>
      </div>
      
        <div class="fullscreen-content dark-theme" id="fullscreen-tree-container">
          <!-- Canvas pour le tableau blanc -->
          <div id="tree-whiteboard-canvas" class="whiteboard-canvas">
            <div class="loading-tree">
              <p>🎨 Initialisation du tableau blanc...</p>
            </div>
          </div>
        
        <!-- Minimap -->
        <div id="tree-minimap" class="tree-minimap">
          <div class="minimap-viewport"></div>
        </div>
      </div>
      
      <div class="fullscreen-footer">
        <div class="footer-instructions">
          <span><strong>🖱️ Souris:</strong> Glisser pour déplacer | Molette pour zoomer</span>
          <span><strong>⌨️ Clavier:</strong> WASD/Flèches pour naviguer | +/- pour zoomer | R pour réinitialiser</span>
          <span><strong>📱 Tactile:</strong> Glisser pour déplacer | Pincer pour zoomer</span>
        </div>
      </div>
    `;
    
    // Styles CSS directement dans le JS pour garantir l'application
    popup.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: rgba(0, 0, 0, 0.98) !important;
      z-index: 2147483647 !important;
      display: flex !important;
      flex-direction: column !important;
      pointer-events: auto !important;
    `;
    
    // Ajouter les styles avancés pour le tableau blanc
    const styles = document.createElement('style');
    styles.id = 'tree-fullscreen-global-styles';  // ID UNIQUE pour pouvoir le supprimer
    styles.innerHTML = `
      #tree-fullscreen-popup .fullscreen-header {
        background: linear-gradient(to right, #1a1a1a, #2a2a2a);
        color: white;
        padding: 12px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 3px solid #4CAF50;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      }
      
      #tree-fullscreen-popup .header-controls {
        display: flex;
        gap: 20px;
        align-items: center;
        flex: 1;
        justify-content: flex-end;
      }
      
      #tree-fullscreen-popup .fullscreen-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      /* Indicateurs */
      .zoom-indicator, .position-indicator, #spacing-indicator {
        background: rgba(76, 175, 80, 0.2);
        color: #4CAF50;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 13px;
        font-weight: 600;
        min-width: 60px;
        text-align: center;
        border: 1px solid rgba(76, 175, 80, 0.4);
        font-family: monospace;
      }
      
      /* Contrôles de zoom */
      .zoom-controls {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      #zoom-slider {
        width: 120px;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255,255,255,0.1);
        border-radius: 3px;
        outline: none;
      }
      
      #zoom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        background: #4CAF50;
        border-radius: 50%;
        cursor: pointer;
      }
      
      /* Contrôles d'espacement */
      .spacing-controls {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .spacing-controls label {
        color: #888;
        font-size: 13px;
      }
      
      .spacing-btn {
        background: rgba(255,255,255,0.05);
        color: white;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 4px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .spacing-btn:hover {
        background: rgba(76, 175, 80, 0.3);
        border-color: #4CAF50;
      }
      
      /* Boutons d'action */
      .action-controls {
        display: flex;
        gap: 8px;
      }
      
      .zoom-btn, .action-btn {
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 6px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .zoom-btn:hover, .action-btn:hover {
        background: rgba(76, 175, 80, 0.3);
        border-color: #4CAF50;
        transform: scale(1.1);
      }
      
      #tree-fullscreen-popup .close-fullscreen-btn {
        background: #dc3545;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        transition: all 0.2s ease;
      }
      
      #tree-fullscreen-popup .close-fullscreen-btn:hover {
        background: #c82333;
        transform: scale(1.05);
      }
      
      /* Contenu principal */
      #tree-fullscreen-popup .fullscreen-content {
        flex: 1;
        overflow: hidden;
        position: relative;
        background: #0a0a0a;
        background-image: 
          /* Grille de fond optionnelle */
          linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px),
          /* Gradients décoratifs */
          radial-gradient(circle at 20% 50%, rgba(76, 175, 80, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(33, 150, 243, 0.1) 0%, transparent 50%);
        background-size: 50px 50px, 50px 50px, 100% 100%, 100% 100%;
        background-position: 0 0, 0 0, 0 0, 0 0;
        min-height: 600px;
      }
      
      /* Canvas du tableau blanc */
      .whiteboard-canvas {
        width: 100%;
        height: 100%;
        min-height: 500px;
        position: relative;
        cursor: grab;
        overflow: hidden;
        background: transparent !important;
      }
      
      .whiteboard-canvas.dragging {
        cursor: grabbing;
      }
      
      /* Style pour les nœuds interactifs */
      .interactive-tree-node {
        background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      .interactive-tree-node:hover {
        filter: brightness(1.1);
      }
      
      .interactive-tree-node.leaf-node {
        background: linear-gradient(135deg, #10b981, #059669) !important;
      }
      
      .interactive-tree-node.dragging {
        opacity: 0.8;
        cursor: grabbing !important;
      }
      
      /* SVG des liens */
      #tree-links-svg {
        overflow: visible;
      }
      
      #tree-links-svg path {
        stroke: rgba(255,255,255,0.6);
        stroke-width: 2px;
        transition: stroke 0.2s ease, stroke-width 0.2s ease;
        pointer-events: stroke;
      }
      
      #tree-links-svg path:hover {
        stroke: rgba(76, 175, 80, 0.9);
        stroke-width: 3px;
      }
      
      /* Courbes pour les liens */
      .tree-link {
        stroke-linecap: round;
        opacity: 0.8;
      }
      
      /* Container des nœuds */
      #tree-nodes-container {
        pointer-events: auto;
      }
      
      /* Mode thème clair */
      .light-theme #tree-links-svg path {
        stroke: rgba(0,0,0,0.3);
      }
      
      .light-theme #tree-links-svg path:hover {
        stroke: rgba(16, 185, 129, 0.8);
      }
      
      .light-theme .interactive-tree-node {
        box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      }
      
      /* Minimap */
      .tree-minimap {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 200px;
        height: 150px;
        background: rgba(0,0,0,0.8);
        border: 2px solid #4CAF50;
        border-radius: 8px;
        overflow: hidden;
        cursor: pointer;
        transition: opacity 0.3s ease;
      }
      
      .tree-minimap:hover {
        opacity: 0.9;
      }
      
      .minimap-viewport {
        position: absolute;
        border: 2px solid #4CAF50;
        background: rgba(76, 175, 80, 0.2);
        pointer-events: none;
      }
      
      /* Footer */
      #tree-fullscreen-popup .fullscreen-footer {
        background: #1a1a1a;
        padding: 8px 20px;
        border-top: 1px solid #333;
      }
      
      .footer-instructions {
        display: flex;
        justify-content: center;
        gap: 30px;
        color: #666;
        font-size: 12px;
      }
      
      .footer-instructions span {
        display: flex;
        align-items: center;
        gap: 5px;
      }
      
      .footer-instructions strong {
        color: #888;
      }
      
      /* Animation de chargement */
      .loading-tree {
        color: #4CAF50;
        font-size: 16px;
        animation: pulse 1.5s ease-in-out infinite;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
      
      #tree-fullscreen-popup .loading-tree p {
        margin-top: 20px;
        font-size: 16px;
      }
      
      /* Optimisations pour l'arbre en fullscreen */
      #fullscreen-tree-wrapper svg {
        background: transparent !important;
      }
      
      #fullscreen-tree-wrapper .node {
        cursor: pointer;
      }
      
      #fullscreen-tree-wrapper .node rect {
        stroke-width: 2px;
      }
      
      #fullscreen-tree-wrapper .node text {
        font-size: 12px;
        font-weight: 500;
      }
      
      #fullscreen-tree-wrapper .link {
        stroke-width: 2px;
      }
    `;
    document.head.appendChild(styles);
    
    // Ajouter au body
    document.body.appendChild(popup);
    console.log('📌 Popup ajoutée au body');
    
    // Injecter des styles CSS pour forcer les liens en blanc
    const linkStyles = document.createElement('style');
    linkStyles.id = 'tree-links-custom-styles';
    linkStyles.textContent = `
      /* IMPORTANT: Limiter les styles au contexte du fullscreen uniquement */
      #tree-fullscreen-popup #tree-links-svg line,
      #tree-fullscreen-popup #tree-links-svg path {
        stroke: white !important;
        stroke-width: 3px !important;
        opacity: 1 !important;
        filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.8)) !important;
      }
      #tree-fullscreen-popup .light-theme #tree-links-svg line,
      #tree-fullscreen-popup .light-theme #tree-links-svg path {
        stroke: #333333 !important;
        filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.3)) !important;
      }
      #tree-fullscreen-popup #tree-links-svg {
        z-index: 10 !important;
      }
      /* Forcer la couleur blanche par défaut - SEULEMENT dans le fullscreen */
      #tree-fullscreen-popup #tree-links-svg * {
        stroke: white !important;
      }
    `;
    document.head.appendChild(linkStyles);
    
    // Vérifier que la popup est visible
    const addedPopup = document.getElementById('tree-fullscreen-popup');
    if (addedPopup) {
      console.log('✅ Popup trouvée dans le DOM:', {
        width: addedPopup.offsetWidth,
        height: addedPopup.offsetHeight,
        visible: addedPopup.offsetWidth > 0
      });
    } else {
      console.error('❌ Popup non trouvée après ajout!');
    }
    
    // Initialiser l'état du whiteboard
    const whiteboardState = {
      zoom: 1,
      panX: 0,
      panY: 0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      lastMouseX: 0,
      lastMouseY: 0,
      horizontalSpacing: 80,
      verticalSpacing: 80,
      originalTreeData: null as any
    };
    
    // Stocker l'état dans la propriété de classe
    this.whiteboardState = whiteboardState;
    
    // Event listener pour fermer avec le bouton
    const closeBtn = document.getElementById('close-fullscreen-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeTreeFullscreenPopup();
      });
    }
    
    // Event listener pour fermer avec Escape
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeTreeFullscreenPopup();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // ========== GESTION DU PAN (DÉPLACEMENT) ==========
    const canvas = document.getElementById('tree-whiteboard-canvas');
    if (canvas) {
      // Mouse down - début du drag
      canvas.addEventListener('mousedown', (e: MouseEvent) => {
        whiteboardState.isDragging = true;
        whiteboardState.dragStartX = e.clientX - whiteboardState.panX;
        whiteboardState.dragStartY = e.clientY - whiteboardState.panY;
        canvas.classList.add('dragging');
      });
      
      // Mouse move - déplacement
      canvas.addEventListener('mousemove', (e: MouseEvent) => {
        whiteboardState.lastMouseX = e.clientX;
        whiteboardState.lastMouseY = e.clientY;
        
        if (whiteboardState.isDragging) {
          whiteboardState.panX = e.clientX - whiteboardState.dragStartX;
          whiteboardState.panY = e.clientY - whiteboardState.dragStartY;
          this.updateTreeTransform(whiteboardState);
          this.updatePositionIndicator(whiteboardState.panX, whiteboardState.panY);
        }
      });
      
      // Mouse up - fin du drag
      canvas.addEventListener('mouseup', () => {
        whiteboardState.isDragging = false;
        canvas.classList.remove('dragging');
      });
      
      // Mouse leave - arrêter le drag si on sort
      canvas.addEventListener('mouseleave', () => {
        whiteboardState.isDragging = false;
        canvas.classList.remove('dragging');
      });
      
      // Wheel - zoom avec molette
      canvas.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(5, whiteboardState.zoom * delta));
        
        // Zoom centré sur la position de la souris
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Ajuster le pan pour garder le point sous la souris fixe
        const scaleDiff = newZoom - whiteboardState.zoom;
        whiteboardState.panX -= mouseX * scaleDiff;
        whiteboardState.panY -= mouseY * scaleDiff;
        
        whiteboardState.zoom = newZoom;
        this.updateTreeTransform(whiteboardState);
        this.updateZoomIndicator(newZoom);
        this.updateZoomSlider(newZoom);
      });
    }
    
    // ========== CONTRÔLES DE ZOOM ==========
    const zoomSlider = document.getElementById('zoom-slider') as HTMLInputElement;
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    
    if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
        const newZoom = parseInt((e.target as HTMLInputElement).value) / 100;
        whiteboardState.zoom = newZoom;
        this.updateTreeTransform(whiteboardState);
        this.updateZoomIndicator(newZoom);
      });
    }
    
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        const newZoom = Math.max(0.1, whiteboardState.zoom * 0.9);
        whiteboardState.zoom = newZoom;
        this.updateTreeTransform(whiteboardState);
        this.updateZoomIndicator(newZoom);
        this.updateZoomSlider(newZoom);
      });
    }
    
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        whiteboardState.zoom = 1;
        whiteboardState.panX = 0;
        whiteboardState.panY = 0;
        this.updateTreeTransform(whiteboardState);
        this.updateZoomIndicator(1);
        this.updateZoomSlider(1);
        this.updatePositionIndicator(0, 0);
      });
    }
    
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        const newZoom = Math.min(5, whiteboardState.zoom * 1.1);
        whiteboardState.zoom = newZoom;
        this.updateTreeTransform(whiteboardState);
        this.updateZoomIndicator(newZoom);
        this.updateZoomSlider(newZoom);
      });
    }
    
    // ========== CONTRÔLES D'ESPACEMENT ==========
    const spacingHMinus = document.getElementById('spacing-h-minus');
    const spacingHPlus = document.getElementById('spacing-h-plus');
    const spacingIndicator = document.getElementById('spacing-indicator');
    
    if (spacingHMinus) {
      spacingHMinus.addEventListener('click', () => {
        whiteboardState.horizontalSpacing = Math.max(40, whiteboardState.horizontalSpacing - 10);
        this.updateSpacingIndicator(whiteboardState.horizontalSpacing);
        this.updateTreeSpacing(whiteboardState);
      });
    }
    
    if (spacingHPlus) {
      spacingHPlus.addEventListener('click', () => {
        whiteboardState.horizontalSpacing = Math.min(200, whiteboardState.horizontalSpacing + 10);
        this.updateSpacingIndicator(whiteboardState.horizontalSpacing);
        this.updateTreeSpacing(whiteboardState);
      });
    }
    
    // ========== ACTIONS ==========
    const toggleThemeBtn = document.getElementById('toggle-theme-btn');
    const reorganizeBtn = document.getElementById('reorganize-tree-btn');
    const fitToScreenBtn = document.getElementById('fit-to-screen-btn');
    const exportBtn = document.getElementById('export-btn');
    
    if (toggleThemeBtn) {
      toggleThemeBtn.addEventListener('click', () => {
        this.toggleWhiteboardTheme();
      });
    }
    
    if (reorganizeBtn) {
      reorganizeBtn.addEventListener('click', () => {
        this.reorganizeTree();
      });
    }
    
    if (fitToScreenBtn) {
      fitToScreenBtn.addEventListener('click', () => {
        this.fitTreeToScreen(whiteboardState);
      });
    }
    
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportTree();
      });
    }
    
    // ========== RACCOURCIS CLAVIER ==========
    const handleKeyboard = (event: KeyboardEvent) => {
      switch(event.key) {
        case 'r':
        case 'R':
          // Reset
          whiteboardState.zoom = 1;
          whiteboardState.panX = 0;
          whiteboardState.panY = 0;
          this.updateTreeTransform(whiteboardState);
          this.updateZoomIndicator(1);
          this.updateZoomSlider(1);
          this.updatePositionIndicator(0, 0);
          break;
        case '+':
        case '=':
          // Zoom in
          whiteboardState.zoom = Math.min(5, whiteboardState.zoom * 1.1);
          this.updateTreeTransform(whiteboardState);
          this.updateZoomIndicator(whiteboardState.zoom);
          this.updateZoomSlider(whiteboardState.zoom);
          break;
        case '-':
        case '_':
          // Zoom out
          whiteboardState.zoom = Math.max(0.1, whiteboardState.zoom * 0.9);
          this.updateTreeTransform(whiteboardState);
          this.updateZoomIndicator(whiteboardState.zoom);
          this.updateZoomSlider(whiteboardState.zoom);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          whiteboardState.panY += 50;
          this.updateTreeTransform(whiteboardState);
          this.updatePositionIndicator(whiteboardState.panX, whiteboardState.panY);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          whiteboardState.panY -= 50;
          this.updateTreeTransform(whiteboardState);
          this.updatePositionIndicator(whiteboardState.panX, whiteboardState.panY);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          whiteboardState.panX += 50;
          this.updateTreeTransform(whiteboardState);
          this.updatePositionIndicator(whiteboardState.panX, whiteboardState.panY);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          whiteboardState.panX -= 50;
          this.updateTreeTransform(whiteboardState);
          this.updatePositionIndicator(whiteboardState.panX, whiteboardState.panY);
          break;
      }
    };
    document.addEventListener('keydown', handleKeyboard);
    
    // Ajouter la classe au body pour désactiver le scroll
      document.body.classList.add('tree-fullscreen-active');
    
    // Charger l'arbre après un court délai
    setTimeout(() => {
      console.log('⏰ Tentative de chargement de l\'arbre dans le whiteboard...');
      this.loadTreeInWhiteboard(whiteboardState);
    }, 100);
    
    console.log('✅ Popup fullscreen ouverte');
  }
  
  /**
   * 🌳 CHARGEMENT: Charger l'arbre dans la popup avec optimisations
   */
  private loadTreeInFullscreen(): void {
    const container = document.getElementById('fullscreen-tree-container');
    if (!container) return;
    
    // Trouver le composant d'arbre original
    const originalTree = document.querySelector('app-real-tree-visualization');
    if (!originalTree) {
      container.innerHTML = '<p style="color: red; font-size: 18px;">Erreur : Arbre non trouvé</p>';
      return;
    }
    
    // Créer un wrapper optimisé pour l'arbre
    const treeWrapper = document.createElement('div');
    treeWrapper.id = 'fullscreen-tree-wrapper';
    treeWrapper.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: auto;
      padding: 20px;
      box-sizing: border-box;
    `;
    
    // Cloner l'arbre et l'optimiser
    const treeClone = originalTree.cloneNode(true) as HTMLElement;
    treeClone.style.cssText = `
      width: 100% !important;
      height: auto !important;
      min-height: 80vh !important;
      max-width: none !important;
    `;
    
    // Optimiser le SVG de l'arbre pour le fullscreen
    setTimeout(() => {
      const svg = treeClone.querySelector('svg');
      if (svg) {
        // Supprimer les restrictions de taille
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        
        // Appliquer des styles optimisés pour fullscreen
        svg.style.cssText = `
          width: 100% !important;
          height: auto !important;
          min-height: 70vh !important;
          max-width: none !important;
        `;
        
        // Ajuster l'espacement des nœuds si possible
        const nodes = svg.querySelectorAll('g.node');
        nodes.forEach(node => {
          const nodeElement = node as HTMLElement;
          nodeElement.style.cursor = 'pointer';
        });
        
        // 🌲 SOLUTION CORRECTE : Ajuster juste l'espacement sans casser la structure
        this.adjustTreeSpacingForFullscreen(svg);
        
        console.log('✅ SVG optimisé pour fullscreen avec espacement étendu');
      }
    }, 100);
    
    // Assembler et insérer dans le container
    treeWrapper.appendChild(treeClone);
    container.innerHTML = '';
    container.appendChild(treeWrapper);
    
    console.log('✅ Arbre chargé dans la popup avec optimisations fullscreen');
  }
  
  /**
   * 🌲 CONFIGURATION INITIALE : Setup de l'arbre avec espacement amélioré
   */
  private adjustTreeSpacingForFullscreen(svg: SVGElement): void {
    console.log('🌲 Configuration initiale de l\'arbre...');
    
    // Container responsive
    const treeContainer = svg.parentElement;
    if (treeContainer) {
      treeContainer.style.cssText = `
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: auto !important;
        padding: 20px !important;
      `;
    }
    
    // 🎯 SOLUTION NATIVE : Modifier directement les positions SVG pour plus d'espacement
    this.expandTreeSpacingNatively(svg);
    
    console.log('✅ Arbre configuré avec espacement natif étendu');
  }
  
  /**
   * 🎯 EXPANSION NATIVE : Modifier les positions SVG pour plus d'espace
   */
  private expandTreeSpacingNatively(svg: SVGElement): void {
    console.log('🎯 Expansion native de l\'espacement...');
    
    // 1. Collecter tous les nœuds et leurs positions
    const nodeGroups = svg.querySelectorAll('g.tree-node');
    const nodePositions: any[] = [];
    
    nodeGroups.forEach((group, index) => {
      const transform = group.getAttribute('transform') || '';
      const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
      const x = match ? parseFloat(match[1]) : 0;
      const y = match ? parseFloat(match[2]) : 0;
      
      nodePositions.push({
        element: group,
        originalX: x,
        originalY: y,
        depth: Math.round(y / 150) // Estimer la profondeur
      });
    });
    
    // 2. Multiplier les positions horizontales par 1.5 pour plus d'espacement
    const centerX = nodePositions.length > 0 ? 
      nodePositions.reduce((sum, n) => sum + n.originalX, 0) / nodePositions.length : 600;
    
    nodePositions.forEach(nodePos => {
      // Calculer la nouvelle position X avec plus d'espacement par rapport au centre
      const offsetFromCenter = nodePos.originalX - centerX;
      const newX = centerX + (offsetFromCenter * 1.4); // 40% plus d'espacement horizontal
      const newY = nodePos.originalY * 1.2; // 20% plus d'espacement vertical
      
      // Appliquer la nouvelle position
      const newTransform = `translate(${newX}, ${newY})`;
      nodePos.element.setAttribute('transform', newTransform);
    });
    
    // 3. Ajuster les liens pour suivre les nouvelles positions
    const links = svg.querySelectorAll('line');
    links.forEach((link, index) => {
      const x1 = parseFloat(link.getAttribute('x1') || '0');
      const y1 = parseFloat(link.getAttribute('y1') || '0');
      const x2 = parseFloat(link.getAttribute('x2') || '0');
      const y2 = parseFloat(link.getAttribute('y2') || '0');
      
      // Appliquer le même facteur d'expansion
      const offsetX1 = x1 - centerX;
      const offsetX2 = x2 - centerX;
      
      const newX1 = centerX + (offsetX1 * 1.4);
      const newY1 = y1 * 1.2;
      const newX2 = centerX + (offsetX2 * 1.4);
      const newY2 = y2 * 1.2;
      
      link.setAttribute('x1', newX1.toString());
      link.setAttribute('y1', newY1.toString());
      link.setAttribute('x2', newX2.toString());
      link.setAttribute('y2', newY2.toString());
    });
    
    // 4. Ajuster le viewBox pour contenir l'arbre étendu
    const allX = nodePositions.map(n => {
      const offsetFromCenter = n.originalX - centerX;
      return centerX + (offsetFromCenter * 1.4);
    });
    const allY = nodePositions.map(n => n.originalY * 1.2);
    
    const minX = Math.min(...allX) - 100;
    const maxX = Math.max(...allX) + 100;
    const minY = Math.min(...allY) - 50;
    const maxY = Math.max(...allY) + 50;
    
    svg.setAttribute('viewBox', `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    svg.style.width = '100%';
    svg.style.height = '100%';
    
    console.log(`✅ Espacement natif étendu: ${nodePositions.length} nœuds repositionnés`);
  }
  
  /**
   * 🔍 ZOOM DYNAMIQUE : Ajuster le niveau de zoom de l'arbre
   */
  private adjustTreeZoom(zoomLevel: number): void {
    const svg = document.querySelector('#fullscreen-tree-wrapper svg') as SVGElement;
    if (!svg) return;
    
    console.log(`🔍 Zoom ajusté à: ${zoomLevel}x`);
    
    // Appliquer le zoom avec transition fluide
    svg.style.cssText = `
      transform: scale(${zoomLevel}) !important;
      transform-origin: center center !important;
      width: auto !important;
      height: auto !important;
      max-width: none !important;
      max-height: none !important;
      transition: transform 0.3s ease !important;
    `;
    
    // Afficher le niveau de zoom actuel dans l'interface
    const zoomIndicator = document.querySelector('#zoom-indicator');
    if (zoomIndicator) {
      zoomIndicator.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
  }
  
  /**
   * 🚪 FERMETURE: Fermer la popup fullscreen
   */
  private closeTreeFullscreenPopup(): void {
    const popup = document.getElementById('tree-fullscreen-popup');
    if (popup) {
      popup.remove();
    }
    
    // Retirer TOUS les styles ajoutés
    const customStyles = document.getElementById('tree-links-custom-styles');
    if (customStyles) {
      customStyles.remove();
    }
    
    // IMPORTANT: Retirer les styles globaux
    const globalStyles = document.getElementById('tree-fullscreen-global-styles');
    if (globalStyles) {
      globalStyles.remove();
      console.log('🧹 Styles globaux supprimés');
    }
    
    // Retirer tout autre style qui pourrait avoir été ajouté par addFullscreenPopupStyles
    const allFullscreenStyles = document.querySelectorAll('style[id*="fullscreen"], style[id*="tree"]');
    allFullscreenStyles.forEach(style => {
      if (style.id && (style.id.includes('fullscreen') || style.id.includes('tree'))) {
        style.remove();
        console.log(`🧹 Style supprimé: ${style.id}`);
      }
    });
    
    // Retirer la classe du body
    document.body.classList.remove('tree-fullscreen-active');
    
    // Réinitialiser l'état du whiteboard
    this.whiteboardState = null;
    
    console.log('✅ Popup fullscreen fermée et tous les styles nettoyés');
  }










  /**
   * 🎨 STYLES: Ajouter les styles CSS à la popup
   */
  private addFullscreenPopupStyles(popup: HTMLElement): void {
    const style = document.createElement('style');
    style.id = 'tree-fullscreen-popup-styles';  // ID UNIQUE pour pouvoir le supprimer
    style.textContent = `
      #tree-fullscreen-popup {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        background: rgba(0, 0, 0, 0.95) !important;
        backdrop-filter: blur(10px) !important;
        display: flex !important;
        flex-direction: column !important;
        opacity: 0 !important;
        animation: fadeInPopup 0.3s ease forwards !important;
      }
      
      .fullscreen-overlay {
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        background: white !important;
        margin: 20px !important;
        border-radius: 15px !important;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3) !important;
        overflow: hidden !important;
      }
      
      .fullscreen-header {
        background: linear-gradient(135deg, var(--primary-purple, #6366f1), #10b981) !important;
        color: white !important;
        padding: 20px 30px !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
      }
      
      .header-content h2 {
        margin: 0 !important;
        font-size: 1.8rem !important;
        font-weight: bold !important;
      }
      
      .header-content p {
        margin: 5px 0 0 0 !important;
        opacity: 0.9 !important;
        font-size: 1rem !important;
      }
      
      .close-btn {
        background: rgba(255,255,255,0.2) !important;
        border: 2px solid rgba(255,255,255,0.3) !important;
        color: white !important;
        width: 48px !important;
        height: 48px !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 24px !important;
        font-weight: bold !important;
        transition: all 0.2s ease !important;
      }
      
      .close-btn:hover {
        background: rgba(255,255,255,0.3) !important;
        transform: scale(1.1) !important;
      }
      
      .fullscreen-content {
        flex: 1 !important;
        overflow: auto !important;
        padding: 30px !important;
        background: #fafafa !important;
      }
      
      #tree-fullscreen-container {
        width: 100% !important;
        height: 100% !important;
        background: white !important;
        border-radius: 10px !important;
        padding: 20px !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important;
      }
      
      .fullscreen-footer {
        background: #f8f9fa !important;
        padding: 15px 30px !important;
        border-top: 1px solid #e9ecef !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
      }
      
      .instruction {
        color: #6c757d !important;
        font-size: 0.9rem !important;
      }
      
      .instruction kbd {
        background: #e9ecef !important;
        color: #495057 !important;
        padding: 2px 6px !important;
        border-radius: 3px !important;
        font-family: monospace !important;
        font-size: 0.8rem !important;
      }
      
      @keyframes fadeInPopup {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 📋 COPIE: Copier le contenu de l'arbre dans la popup
   */
  private copyTreeToPopup(): void {
    const originalTree = document.querySelector('app-real-tree-visualization');
    const popupContainer = document.getElementById('tree-fullscreen-container');
    
    if (originalTree && popupContainer) {
      // Cloner le contenu de l'arbre
      const treeClone = originalTree.cloneNode(true) as HTMLElement;
      
      // Ajuster la taille pour le fullscreen
      treeClone.style.width = '100%';
      treeClone.style.height = '100%';
      treeClone.style.minHeight = 'calc(100vh - 300px)';
      
      // Ajouter à la popup
      popupContainer.appendChild(treeClone);
      
      console.log('✅ Arbre copié dans la popup');
    } else {
      console.warn('⚠️ Impossible de copier l\'arbre dans la popup');
    }
  }

  /**
   * ⚡ EVENT LISTENERS: Configuration des événements JavaScript pur
   */
  private setupFullscreenEventListeners(popup: HTMLElement): void {
    // Bouton de fermeture
    const closeBtn = popup.querySelector('#fullscreen-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        console.log('🔴 Fermeture popup via bouton');
        this.closeFullscreenPopup();
      });
    }
    
    // Clic sur l'overlay pour fermer
    popup.addEventListener('click', (event) => {
      if (event.target === popup || (event.target as HTMLElement).classList.contains('fullscreen-overlay')) {
        console.log('🔴 Fermeture popup via overlay');
        this.closeFullscreenPopup();
      }
    });
    
    // Touche Échap
    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        console.log('🔴 Fermeture popup via Échap');
        this.closeFullscreenPopup();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    
    document.addEventListener('keydown', escapeHandler);
    
    console.log('✅ Event listeners configurés');
  }

  /**
   * 🔴 FERMETURE: Fermer la popup fullscreen
   */
  closeFullscreenPopup(): void {
    this.isTreeFullscreen = false;
      document.body.classList.remove('tree-fullscreen-active');
    this.removeFullscreenPopup();
    console.log('✅ Popup fullscreen fermée');
  }

  /**
   * 🧹 NETTOYAGE: Supprimer la popup et ses styles
   */
  removeFullscreenPopup(): void {
    const popup = document.getElementById('tree-fullscreen-popup');
    if (popup) {
      popup.remove();
    }
    
    // Supprimer les styles associés
    const style = document.querySelector('style[data-popup-styles]');
    if (style) {
      style.remove();
    }
  }


  // ===== GESTION AFFICHAGE ARBRE =====

  isTreeFullscreen = false;


  /**
   * 🎯 Toggle mode plein écran pour l'arbre
   */
  toggleTreeFullscreen(): void {
    console.log('🌳 Toggle fullscreen');
    // Note: Cette méthode n'est plus utilisée car le bouton appelle directement openTreeFullscreenPopup()
    this.openTreeFullscreenPopup();
  }

  // Méthodes de compatibility nettoyées - Utilisation de la popup moderne

  // ===== NAVIGATION & ACTIONS =====

  goBack(): void {
    const queryParams: any = {};
    if (this.projectId) {
      queryParams.projectId = this.projectId;
    }
    
    this.router.navigate(['/ml-pipeline-wizard'], { queryParams });
  }

  runNewExperiment(): void {
    const queryParams: any = {
      copyFrom: this.experimentId
    };
    
    // Ajouter les informations du dataset si disponibles
    if (this.dataset) {
      queryParams.datasetId = this.dataset.id;
      queryParams.datasetName = this.dataset.display_name || this.dataset.dataset_name || 'Dataset';
    }
    
    if (this.projectId) {
      queryParams.projectId = this.projectId;
    }
    
    this.router.navigate(['/ml-pipeline-wizard'], { queryParams });
  }

  downloadModel(): void {
    console.log('🔽 DOWNLOAD MODEL CLICKED - Starting download process');
    console.log('🔍 Experiment ID:', this.experimentId);
    console.log('🔍 Results:', this.results);
    console.log('🔍 Model URI:', this.results?.model_uri);
    
    if (!this.results?.model_uri) {
      console.error('❌ Aucun modèle disponible pour le téléchargement');
      console.error('❌ Results object:', this.results);
      return;
    }

    console.log('🔽 Début du téléchargement du modèle:', this.results.model_uri);
    
    console.log('🔄 Calling mlPipelineService.downloadModel()...');
    
    this.mlPipelineService.downloadModel(this.experimentId).subscribe({
      next: (blob: Blob) => {
        console.log('✅ Blob reçu:', blob);
        console.log('🔍 Blob size:', blob.size);
        console.log('🔍 Blob type:', blob.type);
        
        // Créer une URL temporaire pour le blob
        const url = window.URL.createObjectURL(blob);
        console.log('🔗 URL créée:', url);
        
        // Créer un élément <a> temporaire pour déclencher le téléchargement
        const link = document.createElement('a');
        link.href = url;
        
        // Extraire le nom du fichier depuis l'URI (utiliser model_uri qui est mappé depuis artifact_uri)
        const filename = this.results!.model_uri!.split('/').pop() || `model_${this.experimentId}.joblib`;
        link.download = filename;
        
        console.log('📁 Nom du fichier:', filename);
        
        // Ajouter au DOM, cliquer, puis supprimer
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Nettoyer l'URL temporaire
        window.URL.revokeObjectURL(url);
        
        console.log('✅ Modèle téléchargé avec succès:', filename);
      },
      error: (error) => {
        console.error('❌ Erreur lors du téléchargement du modèle:', error);
        console.error('❌ Error details:', error.error);
        console.error('❌ Error status:', error.status);
        console.error('❌ Error message:', error.message);
        // Optionnel : Afficher une notification d'erreur à l'utilisateur
      }
    });
  }

  exportResults(): void {
    // Implementer l'exportation PDF
    console.log('Exporter les résultats en PDF');
  }

  // === MÉTHODES XAI ===


  onExplanationCreated(response: ExplanationRequestResponse): void {
    console.log('📝 Demande d\'explication créée:', response);
    if (response.success && response.request_id) {
      this.activeXAIRequestId = response.request_id;
      this.hasActiveXAIExplanation = true;
    }
  }

  onExplanationCompleted(requestId: string): void {
    console.log('✅ Explication terminée:', requestId);
    this.hasActiveXAIExplanation = false;
    this.activeXAIRequestId = requestId;
    
    // Optionnel: Afficher automatiquement le chat
    this.showXAIChat = true;
  }

  onExplanationError(error: string): void {
    console.error('❌ Erreur explication XAI:', error);
    this.hasActiveXAIExplanation = false;
    this.activeXAIRequestId = undefined;
    
    // TODO: Afficher une notification d'erreur à l'utilisateur
  }

  toggleXAIChat(): void {
    this.showXAIChat = !this.showXAIChat;
  }

  /**
   * Change l'onglet sélectionné
   */
  onTabChange(index: number): void {
    this.selectedTabIndex = index;
  }

  hasXAIResults(): boolean {
    return !!this.activeXAIRequestId;
  }

  canRequestXAIExplanation(): boolean {
    return !!(this.experiment && 
             this.experiment.status === 'completed' && 
             !this.hasActiveXAIExplanation);
  }


  // ===== MÉTHODES UTILITAIRES POUR LE TEMPLATE =====
  // Méthodes mathMin et mathAbs supprimées car plus utilisées après suppression de la baseline

  /**
   * Récupère l'URL d'une visualisation selon son type
   * AMÉLIORÉ: Ajout support courbe PR
   */
  getVisualizationImage(vizType: string): string {
    // 🚀 OPTIMISATION: Utiliser le cache pour éviter les appels répétés
    const cacheKey = `viz_image_${vizType}`;
    
    if (this.templateMethodCache.has(cacheKey)) {
      return this.templateMethodCache.get(cacheKey) as string;
    }
    
    let result = '';
    switch (vizType) {
      case 'confusion_matrix':
        result = this.getConfusionMatrixImage();
        break;
      case 'roc_curve':
        result = this.getRocCurveImage();
        break;
      case 'pr_curve':
      case 'precision_recall_curve':
        result = this.getPRCurveImage();
        break;
      case 'regression_plot':
        result = this.getRegressionPlotImage();
        break;
      case 'residual_vs_predicted':
        result = this.getResidualVsPredictedImage();
        break;
      case 'residuals_histogram':
        result = this.getResidualsHistogramImage();
        break;
      case 'residual_plot':
        result = this.getResidualPlotImage();
        break;
      case 'feature_importance':
        result = this.getFeatureImportanceImage();
        break;
      default:
        result = '';
    }
    
    this.templateMethodCache.set(cacheKey, result);
    return result;
  }

  /**
   * Gère les erreurs de chargement d'image
   */
  onImageError(event: any): void {
    // Éviter les logs répétés
    if (event.target.dataset.errorHandled) return;
    event.target.dataset.errorHandled = 'true';
    
    console.warn('⚠️ Visualization image not available, using placeholder');
    
    // Remplacer par une image placeholder
    event.target.src = '/assets/images/placeholder-chart.svg';
    event.target.alt = 'Visualisation non disponible';
  }

  /**
   * 🔍 NOUVEAU: Debug des nouvelles métriques macro et PR-AUC
   */
  debugNewMetrics(): void {
    console.log('🔍 === DEBUG NOUVELLES MÉTRIQUES ===');
    console.log('🔍 Métriques reçues:', this.results?.metrics);
    console.log('🔍 Has f1_score:', 'f1_score' in (this.results?.metrics || {}));
    console.log('🔍 Has precision:', 'precision' in (this.results?.metrics || {}));
    console.log('🔍 Has recall:', 'recall' in (this.results?.metrics || {}));
    console.log('🔍 Has pr_auc:', 'pr_auc' in (this.results?.metrics || {}));
    
    // Vérifier les valeurs
    const metrics = this.results?.metrics || {};
    if (metrics.f1_score) console.log('🎯 f1_score value:', metrics.f1_score);
    if (metrics.precision) console.log('🎯 precision value:', metrics.precision);
    if (metrics.recall) console.log('🎯 recall value:', metrics.recall);
    if (metrics.pr_auc) console.log('🎯 pr_auc value:', metrics.pr_auc);
    
    console.log('🔍 Task type:', this.getTaskType());
    console.log('🔍 Algorithm:', this.getAlgorithm());
    console.log('🔍 Classification type:', this.getClassificationType());
    console.log('🔍 Primary KPI:', this.getPrimaryKPI());
    console.log('🔍 === END DEBUG MÉTRIQUES ===');
  }

  /**
   * Méthode de debug pour comprendre les visualisations disponibles
   */
  debugVisualizationData(): void {
    console.log('🚀 === DÉBUT DEBUG VISUALIZATIONS ===');
    
    if (!this.results) {
      console.log('🔍 DEBUG: Pas de résultats disponibles');
      return;
    }

    console.log('🔍 DEBUG: Résultats complets:', this.results);
    console.log('🔍 DEBUG: Visualisations disponibles:', this.results.visualizations);
    console.log('🔍 DEBUG: Type de visualizations:', typeof this.results.visualizations);
    
    if (this.results.visualizations) {
      console.log('🔍 DEBUG: Clés de visualisation:', Object.keys(this.results.visualizations));
      
      // 🔍 AMÉLIORÉ: Vérifier chaque visualisation spécifiquement
      console.log('🔍 Has confusion_matrix:', this.hasConfusionMatrix());
      console.log('🔍 Has roc_curve:', this.hasRocCurve());
      console.log('🔍 Has pr_curve:', this.hasPRCurve());
      console.log('🔍 Should show ROC/PR curves:', this.shouldShowROCPRCurves());
      console.log('🔍 Recommended visualizations:', this.getRecommendedVisualizations());
      
      // 🔍 NOUVEAU: Debug des URLs d'images
      console.log('🔍 IMAGES DEBUG - Confusion matrix URL:', this.getConfusionMatrixImage());
      console.log('🔍 IMAGES DEBUG - ROC curve URL:', this.getRocCurveImage());
      console.log('🔍 IMAGES DEBUG - PR curve URL:', this.getPRCurveImage());
      
      // 🔍 NOUVEAU: Debug du KPI principal 
      console.log('🔍 PRIMARY KPI DEBUG - Current primary KPI:', this.getPrimaryKPI());
      console.log('🔍 PRIMARY KPI DEBUG - Primary metrics:', this.getPrimaryMetrics());
      console.log('🔍 PRIMARY KPI DEBUG - All metrics:', this.getMetrics());
      Object.entries(this.results.visualizations).forEach(([key, value]) => {
        console.log(`🔍 DEBUG: ${key}:`, value);
        if (typeof value === 'object' && value !== null) {
          console.log(`🔍 DEBUG: ${key} keys:`, Object.keys(value));
          if ((value as any).image) {
            console.log(`🔍 DEBUG: ${key} has base64 image:`, (value as any).image.substring(0, 50) + '...');
          }
        }
      });
      
      // 🔍 DIAGNOSTIC CRITIQUE
      console.log('🚨 DIAGNOSTIC - Cette expérience contient-elle les nouvelles visualisations ?');
      console.log('🚨 DIAGNOSTIC - confusion_matrix exists:', 'confusion_matrix' in this.results.visualizations);
      console.log('🚨 DIAGNOSTIC - roc_curve exists:', 'roc_curve' in this.results.visualizations);
      console.log('🚨 DIAGNOSTIC - pr_curve exists:', 'pr_curve' in this.results.visualizations);
      
    } else {
      console.log('🔍 DEBUG: results.visualizations is null/undefined');
    }
    
    console.log('🏁 === FIN DEBUG VISUALIZATIONS ===');
    
    console.log('🔍 DEBUG: Type de tâche:', this.getTaskType());
    console.log('🔍 DEBUG: Algorithme:', this.getAlgorithm());
    
    // NOUVEAU: Debug spécifique pour les métriques Random Forest
    this.debugRandomForestMetrics();
  }

  /**
   * CORRIGÉ: Debug spécifique pour les métriques Random Forest - VRAIES DONNÉES UNIQUEMENT
   */
  debugRandomForestMetrics(): void {
    if (this.getAlgorithm() !== 'random_forest' || this.getTaskType() !== 'classification') {
      return;
    }

    console.log('🎯 DEBUG RANDOM FOREST CLASSIFICATION (VRAIES DONNÉES UNIQUEMENT):');
    console.log('📊 Métriques disponibles dans le backend:', this.results?.metrics);
    
    const idealMetrics = ['f1_score', 'pr_auc', 'oob_score'];
    const actualMetrics = this.getMetrics();
    const actualMetricKeys = actualMetrics.map(m => m.key);
    
    console.log('✅ Métriques RÉELLEMENT calculées par le backend:');
    actualMetrics.forEach(metric => {
      const isIdeal = idealMetrics.includes(metric.key);
      console.log(`  ${isIdeal ? '🎯' : '📊'} ${metric.key}: ${this.formatMetricValue(metric.key, metric.value)} ${isIdeal ? '(IDÉAL pour Random Forest)' : ''}`);
    });

    console.log('❌ Métriques IDÉALES manquantes (non calculées par le backend):');
    idealMetrics.forEach(idealMetric => {
      if (!actualMetricKeys.includes(idealMetric)) {
        console.log(`  ⚠️ ${idealMetric}: ABSENT - ${this.getMissingMetricAdvice(idealMetric)}`);
      }
    });

    // Vérifications générales
    console.log('🔍 Interface - Priorité des métriques affichées:', this.getPrimaryMetrics().map(m => `${m.key}${m.isPrimary ? ' (PRINCIPAL)' : ''}`));
    console.log('🎯 Interface - KPI principal sélectionné:', this.getPrimaryKPI()?.key || 'AUCUN');
    console.log('🏗️ Interface - Type de classification détecté:', this.getClassificationType());
  }

  /**
   * NOUVEAU: Conseils pour métriques manquantes
   */
  private getMissingMetricAdvice(metricKey: string): string {
    const advice: Record<string, string> = {
      'pr_auc': 'Assurez-vous que le backend inclut Precision-Recall AUC',
      'oob_score': 'Vérifiez que oob_score=True dans les paramètres Random Forest',
    };
    return advice[metricKey] || 'Métrique recommandée pour Random Forest';
  }
  
  // ========== MÉTHODES DU TABLEAU BLANC INTERACTIF ==========
  
  /**
   * 🎨 Charger l'arbre dans le tableau blanc interactif
   */
  private loadTreeInWhiteboard(whiteboardState: any): void {
    console.log('🎨 Construction de l\'arbre interactif dans le tableau blanc...');
    
    const container = document.getElementById('tree-whiteboard-canvas');
    console.log('📦 Container trouvé:', container);
    
    if (!container) {
      console.error('❌ Container tree-whiteboard-canvas non trouvé !');
      return;
    }
    
    // Nettoyer le container
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.background = 'transparent';
    container.style.border = 'none';
    container.style.minHeight = '100%';
    
    // Charger les vraies données
    this.loadRealTreeData(container, whiteboardState);
  }
  
  /**
   * 🌲 Charger les vraies données de l'arbre
   */
  private loadRealTreeData(container: HTMLElement, whiteboardState: any): void {
    console.log('🌲 Chargement des vraies données de l\'arbre...');
    
    // Récupérer les données de l'arbre depuis le backend
    let treeDataFromBackend = this.getTreeData();
    console.log('🔍 Données récupérées:', treeDataFromBackend);
    
    // Si pas de données, utiliser un arbre de démonstration
    if (!treeDataFromBackend) {
      console.warn('⚠️ Aucune donnée d\'arbre depuis le backend, utilisation de données de démonstration');
      
      const taskType = this.getTaskType();
      if (taskType === 'regression') {
        treeDataFromBackend = {
          name: "num__Apps_Used_Daily",
          condition: "≤ 4.5",
          samples: 2400,
          is_leaf: false,
          feature: "num__Apps_Used_Daily",
          threshold: 4.5,
          children: [
            {
              name: "num__Daily_Usage_Hours",
              condition: "≤ 3.2",
              samples: 1200,
              is_leaf: false,
              feature: "num__Daily_Usage_Hours",
              threshold: 3.2,
              children: [
                {
                  name: "Valeur: 2.133",
                  condition: "n=800",
                  samples: 800,
                  is_leaf: true,
                  value: 2.133
                },
                {
                  name: "Valeur: 3.845",
                  condition: "n=400",
                  samples: 400,
                  is_leaf: true,
                  value: 3.845
                }
              ]
            },
            {
              name: "num__Time_on_Social_Media",
              condition: "≤ 5.5",
              samples: 1200,
              is_leaf: false,
              feature: "num__Time_on_Social_Media",
              threshold: 5.5,
              children: [
                {
                  name: "Valeur: 4.567",
                  condition: "n=700",
                  samples: 700,
                  is_leaf: true,
                  value: 4.567
                },
                {
                  name: "Valeur: 6.234",
                  condition: "n=500",
                  samples: 500,
                  is_leaf: true,
                  value: 6.234
                }
              ]
            }
          ]
        };
      } else {
        // Classification
        treeDataFromBackend = {
          name: "feature_2",
          condition: "≤ 0.5",
          samples: 150,
          is_leaf: false,
          feature: "feature_2",
          threshold: 0.5,
          children: [
            {
              name: "feature_1",
              condition: "≤ 0.3",
              samples: 75,
              is_leaf: false,
              feature: "feature_1",
              threshold: 0.3,
              children: [
                {
                  name: "Classe A",
                  condition: "n=50",
                  samples: 50,
                  is_leaf: true,
                  value: 0,
                  class_name: "Classe A"
                },
                {
                  name: "Classe B",
                  condition: "n=25",
                  samples: 25,
                  is_leaf: true,
                  value: 1,
                  class_name: "Classe B"
                }
              ]
            },
            {
              name: "Classe B",
              condition: "n=75",
              samples: 75,
              is_leaf: true,
              value: 1,
              class_name: "Classe B"
            }
          ]
        };
      }
      
      // Ajouter un message d'avertissement
      const warningDiv = document.createElement('div');
      warningDiv.style.cssText = `
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(255, 152, 0, 0.2);
        color: #ff9800;
        padding: 8px 16px;
        border-radius: 4px;
        border: 1px solid #ff9800;
        font-size: 12px;
        z-index: 1000;
      `;
      warningDiv.innerHTML = `
        <mat-icon style="font-size: 16px; vertical-align: middle;">warning</mat-icon>
        Données de démonstration - Réentraînez le modèle pour voir la vraie structure
      `;
      container.appendChild(warningDiv);
    }
    
    // Convertir les données en format tableau blanc
    console.log('🔄 Conversion des données...');
    const treeDataExtracted = this.convertBackendTreeToWhiteboard(treeDataFromBackend);
    console.log('📦 Données converties:', treeDataExtracted);
    
    if (!treeDataExtracted || !treeDataExtracted.nodes || treeDataExtracted.nodes.length === 0) {
      console.error('❌ Impossible de convertir les données de l\'arbre');
      return;
    }
    
    // Créer le wrapper principal
    const treeWrapper = document.createElement('div');
    treeWrapper.id = 'whiteboard-tree-wrapper';
    treeWrapper.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform-origin: center center;
      width: 100%;
      height: 100%;
    `;
    
    // Créer un SVG pour les liens
    const linksSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    linksSvg.id = 'tree-links-svg';
    linksSvg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;
    
    // Créer le container des nœuds
    const nodesContainer = document.createElement('div');
    nodesContainer.id = 'tree-nodes-container';
    nodesContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
    `;
    
    // Ajouter les éléments au wrapper (liens d'abord, puis nœuds au-dessus)
    treeWrapper.appendChild(linksSvg);
    treeWrapper.appendChild(nodesContainer);
    container.appendChild(treeWrapper);
    
    // Créer les nœuds interactifs
    console.log(`🔨 Création de ${treeDataExtracted.nodes.length} nœuds...`);
    treeDataExtracted.nodes.forEach((nodeData: any, index: number) => {
      const node = this.createInteractiveNode(nodeData, index, whiteboardState);
      nodesContainer.appendChild(node);
    });
    
    // Dessiner les liens initiaux
    console.log('🔗 Dessin des liens...');
    setTimeout(() => {
      this.updateTreeLinks();
    }, 500);
    
    // Deuxième tentative au cas où
    setTimeout(() => {
      console.log('🔗 Mise à jour des liens (2e tentative)...');
      this.updateTreeLinks();
    }, 1000);
    
    
    // Appliquer la transformation initiale
    console.log('🔄 Application de la transformation...');
    this.updateTreeTransform(whiteboardState);
    
    console.log('✅ Arbre interactif créé avec succès');
  }
  
  private loadTreeInWhiteboardOLD(whiteboardState: any): void {
    // Code original déplacé ici temporairement
    const container = document.getElementById('tree-whiteboard-canvas');
    if (!container) return;
    
    // Récupérer les données de l'arbre depuis le backend
    let treeDataFromBackend = this.getTreeData();
    
    // Si pas de données, utiliser un arbre de démonstration
    if (!treeDataFromBackend) {
      console.warn('⚠️ Aucune donnée d\'arbre depuis le backend, utilisation de données de démonstration');
      
      // Données de démonstration basées sur le type d'algorithme et de tâche
      const algorithm = this.getAlgorithm();
      const taskType = this.getTaskType();
      
      if (taskType === 'regression') {
        treeDataFromBackend = {
          name: "num__Apps_Used_Daily",
          condition: "≤ 4.5",
          samples: 2400,
          is_leaf: false,
          feature: "num__Apps_Used_Daily",
          threshold: 4.5,
          children: [
            {
              name: "num__Daily_Usage_Hours",
              condition: "≤ 3.2",
              samples: 1200,
              is_leaf: false,
              feature: "num__Daily_Usage_Hours",
              threshold: 3.2,
              children: [
                {
                  name: "Valeur: 2.133",
                  condition: "n=800",
                  samples: 800,
                  is_leaf: true,
                  value: 2.133
                },
                {
                  name: "Valeur: 3.845",
                  condition: "n=400",
                  samples: 400,
                  is_leaf: true,
                  value: 3.845
                }
              ]
            },
            {
              name: "num__Time_on_Social_Media",
              condition: "≤ 5.5",
              samples: 1200,
              is_leaf: false,
              feature: "num__Time_on_Social_Media",
              threshold: 5.5,
              children: [
                {
                  name: "Valeur: 4.567",
                  condition: "n=700",
                  samples: 700,
                  is_leaf: true,
                  value: 4.567
                },
                {
                  name: "Valeur: 6.234",
                  condition: "n=500",
                  samples: 500,
                  is_leaf: true,
                  value: 6.234
                }
              ]
            }
          ]
        };
      } else {
        // Classification
        treeDataFromBackend = {
          name: "feature_2",
          condition: "≤ 0.5",
          samples: 150,
          is_leaf: false,
          feature: "feature_2",
          threshold: 0.5,
          children: [
            {
              name: "feature_1",
              condition: "≤ 0.3",
              samples: 75,
              is_leaf: false,
              feature: "feature_1",
              threshold: 0.3,
              children: [
                {
                  name: "Classe A",
                  condition: "n=50",
                  samples: 50,
                  is_leaf: true,
                  value: 0,
                  class_name: "Classe A"
                },
                {
                  name: "Classe B",
                  condition: "n=25",
                  samples: 25,
                  is_leaf: true,
                  value: 1,
                  class_name: "Classe B"
                }
              ]
            },
            {
              name: "Classe B",
              condition: "n=75",
              samples: 75,
              is_leaf: true,
              value: 1,
              class_name: "Classe B"
            }
          ]
        };
      }
      
      // Ajouter un message d'avertissement
      if (container) {
        const warningDiv = document.createElement('div');
        warningDiv.style.cssText = `
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          background: rgba(255, 152, 0, 0.2);
          color: #ff9800;
          padding: 8px 16px;
          border-radius: 4px;
          border: 1px solid #ff9800;
          font-size: 12px;
          z-index: 1000;
        `;
        warningDiv.innerHTML = `
          <mat-icon style="font-size: 16px; vertical-align: middle;">warning</mat-icon>
          Données de démonstration - Réentraînez le modèle pour voir la vraie structure
        `;
        container.appendChild(warningDiv);
      }
    }
    
    // Convertir les données backend en format pour le tableau blanc
    console.log('🔄 Conversion des données en cours...');
    const treeDataExtracted = this.convertBackendTreeToWhiteboard(treeDataFromBackend);
    console.log('📦 Données converties:', treeDataExtracted);
    
    if (!treeDataExtracted) {
      console.error('❌ Impossible de convertir les données de l\'arbre');
      return;
    }
    
    // Créer le wrapper principal
    const treeWrapper = document.createElement('div');
    treeWrapper.id = 'whiteboard-tree-wrapper';
    treeWrapper.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform-origin: center center;
      width: 100%;
      height: 100%;
    `;
    
    // Créer un SVG pour les liens (ils seront mis à jour dynamiquement)
    const linksSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    linksSvg.id = 'tree-links-svg';
    linksSvg.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    `;
    
    // Créer les nœuds comme éléments HTML draggables
    const nodesContainer = document.createElement('div');
    nodesContainer.id = 'tree-nodes-container';
    nodesContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2;
    `;
    
    // Ajouter les éléments au wrapper
    treeWrapper.appendChild(linksSvg);
    treeWrapper.appendChild(nodesContainer);
    
    // TEST: Ajouter un nœud de test visible
    const testNode = document.createElement('div');
    testNode.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100px;
      height: 50px;
      background: lime;
      border: 2px solid green;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      z-index: 10000;
    `;
    testNode.textContent = 'TEST NODE';
    nodesContainer.appendChild(testNode);
    
    // Vider le container et ajouter le wrapper
    if (container) {
      container.innerHTML = '';
      container.appendChild(treeWrapper);
      console.log('📦 Wrapper ajouté au container');
    }
    
    // Créer les nœuds interactifs
    console.log(`🔨 Création de ${treeDataExtracted.nodes.length} nœuds...`);
    treeDataExtracted.nodes.forEach((nodeData: any, index: number) => {
      const node = this.createInteractiveNode(nodeData, index, whiteboardState);
      nodesContainer.appendChild(node);
      console.log(`✅ Nœud ${index} créé:`, nodeData.name);
    });
    
    // Dessiner les liens initiaux
    console.log('🔗 Dessin des liens...');
    this.updateTreeLinks();
    
    // Appliquer la transformation initiale
    console.log('🔄 Application de la transformation...');
    this.updateTreeTransform(whiteboardState);
    
    console.log('✅ Arbre interactif créé avec succès');
    console.log('📊 Vérification finale - Nœuds dans le DOM:', document.querySelectorAll('.interactive-tree-node').length);
    
    // Test visuel - Ajouter un élément de test simple
    const testDiv = document.createElement('div');
    testDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 200px;
      height: 100px;
      background: rgba(255, 0, 0, 0.8);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: bold;
      z-index: 9999;
    `;
    testDiv.innerHTML = 'TEST - ARBRE ICI';
    if (container) {
      container.appendChild(testDiv);
      
      // Test visuel - Ajouter une bordure rouge au container pour voir s'il existe
      container.style.border = '3px solid red';
      container.style.minHeight = '100px';
    }
    
    // Vérifier la visibilité du wrapper
    const wrapperCheck = document.getElementById('whiteboard-tree-wrapper');
    if (wrapperCheck) {
      console.log('🔍 Wrapper dimensions:', {
        width: wrapperCheck.offsetWidth,
        height: wrapperCheck.offsetHeight,
        children: wrapperCheck.children.length,
        style: {
          position: wrapperCheck.style.position,
          top: wrapperCheck.style.top,
          left: wrapperCheck.style.left,
          transform: wrapperCheck.style.transform
        }
      });
      
      // Forcer temporairement le wrapper à être visible
      wrapperCheck.style.background = 'rgba(255, 255, 0, 0.3)';
      wrapperCheck.style.minWidth = '200px';
      wrapperCheck.style.minHeight = '200px';
    }
    
    // Vérifier si les nœuds sont visibles
    const firstNode = document.querySelector('.interactive-tree-node') as HTMLElement;
    if (firstNode) {
      console.log('🔍 Premier nœud:', {
        position: firstNode.style.position,
        left: firstNode.style.left,
        top: firstNode.style.top,
        width: firstNode.offsetWidth,
        height: firstNode.offsetHeight,
        visible: firstNode.offsetWidth > 0 && firstNode.offsetHeight > 0
      });
      
      // Forcer le premier nœud à être plus visible pour le test
      firstNode.style.background = 'red !important';
      firstNode.style.zIndex = '9999';
    } else {
      console.error('❌ Aucun nœud trouvé dans le DOM !');
    }
    
    // Diagnostic final
    console.log('🔍 DIAGNOSTIC FINAL:');
    if (container) {
      console.log('Container dimensions:', {
        width: container.offsetWidth,
        height: container.offsetHeight,
        visible: container.offsetWidth > 0 && container.offsetHeight > 0
      });
      
      const finalNodes = container.querySelectorAll('.interactive-tree-node');
      console.log('Total nodes in container:', finalNodes.length);
      
      const testElements = container.querySelectorAll('[style*="background"]');
      console.log('Test elements with background:', testElements.length);
    } else {
      console.error('❌ Container null lors du diagnostic final');
    }
  }
  
  /**
   * 🔄 Convertir les données de l'arbre du backend en format tableau blanc
   */
  private convertBackendTreeToWhiteboard(treeData: any): any {
    console.log('🔄 Conversion des données backend:', treeData);
    
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeConnections: Map<number, number[]> = new Map();
    
    let nodeIndex = 0;
    const nodeWidth = 140;
    const nodeHeight = 60;
    const minHorizontalSpacing = 180; // Espacement minimum entre nœuds (réduit de 250 à 180)
    const verticalSpacing = 90; // Espacement vertical (réduit de 120 à 90)
    
    // Calculer la largeur d'un sous-arbre
    const calculateSubtreeWidth = (node: any): number => {
      if (!node.children || node.children.length === 0) {
        return nodeWidth + minHorizontalSpacing;
      }
      
      let totalWidth = 0;
      node.children.forEach((child: any) => {
        totalWidth += calculateSubtreeWidth(child);
      });
      
      return Math.max(totalWidth, nodeWidth + minHorizontalSpacing);
    };
    
    // Fonction récursive pour parcourir l'arbre et créer les nœuds
    const processNode = (node: any, x: number, y: number, parentIndex: number = -1): number => {
      const currentIndex = nodeIndex++;
      
      // Ajouter un petit décalage aléatoire pour éviter la superposition parfaite
      const randomOffsetX = (Math.random() - 0.5) * 10; // ±5px
      const randomOffsetY = (Math.random() - 0.5) * 10; // ±5px
      
      // Créer le nœud
      const nodeData = {
        id: `node-${currentIndex}`,
        index: currentIndex,
        x: x + randomOffsetX,
        y: y + randomOffsetY,
        width: nodeWidth,
        height: nodeHeight,
        isLeaf: node.is_leaf || false,
        name: node.name || '',
        condition: node.condition || '',
        samples: `n=${node.samples || 0}`,
        feature: node.feature,
        threshold: node.threshold,
        value: node.value,
        class_name: node.class_name
      };
      
      nodes.push(nodeData);
      
      // Ajouter la connexion parent-enfant
      if (parentIndex >= 0) {
        if (!nodeConnections.has(parentIndex)) {
          nodeConnections.set(parentIndex, []);
        }
        nodeConnections.get(parentIndex)!.push(currentIndex);
      }
      
      // Traiter les enfants s'ils existent
      if (node.children && node.children.length > 0) {
        const childWidths: number[] = [];
        let totalChildrenWidth = 0;
        
        // Calculer la largeur de chaque enfant
        node.children.forEach((child: any) => {
          const width = calculateSubtreeWidth(child);
          childWidths.push(width);
          totalChildrenWidth += width;
        });
        
        // Positionner les enfants en évitant la superposition
        let currentX = x - totalChildrenWidth / 2;
        
        node.children.forEach((child: any, i: number) => {
          const childX = currentX + childWidths[i] / 2;
          const childY = y + verticalSpacing;
          processNode(child, childX, childY, currentIndex);
          currentX += childWidths[i];
        });
      }
      
      return currentIndex;
    };
    
    // Commencer par la racine au centre (0, 0 car le wrapper est centré)
    processNode(treeData, 0, -200);
    
    // Créer les liens basés sur les connexions
    nodeConnections.forEach((children, parentIndex) => {
      const parentNode = nodes[parentIndex];
      children.forEach(childIndex => {
        const childNode = nodes[childIndex];
        links.push({
          id: `link-${parentIndex}-${childIndex}`,
          parentIndex,
          childIndex,
          x1: parentNode.x,
          y1: parentNode.y,
          x2: childNode.x,
          y2: childNode.y
        });
      });
    });
    
    // Stocker les connexions
    this.nodeConnections = nodeConnections;
    
    console.log('✅ Conversion terminée:', { nodes, links, connections: nodeConnections });
    
    return { nodes, links };
  }
  
  /**
   * 📊 Extraire les données de l'arbre depuis le SVG (MÉTHODE OBSOLÈTE)
   */
  private extractTreeDataFromSVG(): any {
    // Cette méthode n'est plus utilisée car on récupère les données directement du backend
    console.warn('⚠️ extractTreeDataFromSVG est obsolète, utilisez convertBackendTreeToWhiteboard');
    return null;
  }
  
  // Propriété pour stocker les connexions
  private nodeConnections: Map<number, number[]> = new Map();
  
  // Propriété pour stocker l'état du whiteboard
  private whiteboardState: any = null;
  
  /**
   * 🎯 Créer un nœud interactif draggable
   */
  private createInteractiveNode(nodeData: any, index: number, whiteboardState: any): HTMLElement {
    const node = document.createElement('div');
    node.id = nodeData.id;
    node.className = `interactive-tree-node ${nodeData.isLeaf ? 'leaf-node' : 'internal-node'}`;
    node.dataset['nodeIndex'] = index.toString();
    node.dataset['x'] = nodeData.x.toString();
    node.dataset['y'] = nodeData.y.toString();
    
    // Styles de base (z-index plus élevé pour les feuilles)
    node.style.cssText = `
      position: absolute;
      left: ${nodeData.x - nodeData.width/2}px;
      top: ${nodeData.y - nodeData.height/2}px;
      width: ${nodeData.width}px;
      height: ${nodeData.height}px;
      background: ${nodeData.isLeaf ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'};
      border: 2px solid ${nodeData.isLeaf ? '#047857' : '#1e40af'};
      border-radius: 6px;
      cursor: move;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      padding: 4px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      transition: transform 0.1s ease, box-shadow 0.1s ease;
      user-select: none;
      z-index: ${nodeData.isLeaf ? 20 : 10};
    `;
    
    // Contenu du nœud
    node.innerHTML = `
      <div style="font-weight: bold; text-align: center;">${nodeData.name}</div>
      <div style="font-size: 10px; text-align: center;">${nodeData.condition}</div>
      <div style="font-size: 9px; opacity: 0.8;">${nodeData.samples}</div>
    `;
    
    // Effet de hover
    node.addEventListener('mouseenter', () => {
      if (!isDragging) {
        node.style.transform = 'scale(1.05)';
        node.style.boxShadow = '0 6px 12px rgba(0,0,0,0.25)';
      }
    });
    
    node.addEventListener('mouseleave', () => {
      if (!isDragging) {
        node.style.transform = 'scale(1)';
        node.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      }
    });
    
    // Rendre le nœud draggable
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let nodeStartX = 0;
    let nodeStartY = 0;
    
    node.addEventListener('mousedown', (e: MouseEvent) => {
      e.stopPropagation(); // Empêcher le pan du canvas
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = node.getBoundingClientRect();
      const wrapper = node.parentElement!.parentElement!;
      const wrapperRect = wrapper.getBoundingClientRect();
      
      nodeStartX = rect.left - wrapperRect.left;
      nodeStartY = rect.top - wrapperRect.top;
      
      node.classList.add('dragging');
      node.style.zIndex = '1000'; // Très haut pour être au-dessus de tout
      node.style.transform = 'scale(1.1)';
      node.style.boxShadow = '0 8px 16px rgba(0,0,0,0.3)';
    });
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newLeft = nodeStartX + deltaX;
      const newTop = nodeStartY + deltaY;
      
      node.style.left = `${newLeft}px`;
      node.style.top = `${newTop}px`;
      
      // Mettre à jour les liens en temps réel
      requestAnimationFrame(() => {
        this.updateTreeLinks();
      });
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      
      node.classList.remove('dragging');
      // Retour au z-index approprié selon le type
      node.style.zIndex = nodeData.isLeaf ? '20' : '10';
      node.style.transform = 'scale(1)';
      node.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    };
    
    // Attacher les événements au document pour capturer même hors du nœud
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Hover effect
    node.addEventListener('mouseenter', () => {
      if (!isDragging) {
        node.style.transform = 'scale(1.05)';
        node.style.boxShadow = '0 6px 12px rgba(0,0,0,0.25)';
      }
    });
    
    node.addEventListener('mouseleave', () => {
      if (!isDragging) {
        node.style.transform = 'scale(1)';
        node.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      }
    });
    
    return node;
  }
  
  /**
   * 🔗 Mettre à jour les liens entre les nœuds
   */
  private updateTreeLinks(): void {
    console.log('🔗 Mise à jour des liens...');
    const svg = document.getElementById('tree-links-svg') as unknown as SVGSVGElement;
    if (!svg) {
      console.error('❌ SVG non trouvé');
      return;
    }
    
    // Vider TOUS les éléments du SVG (liens et éléments de test)
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    
    const nodes = document.querySelectorAll('.interactive-tree-node');
    console.log(`📊 Nombre de nœuds trouvés: ${nodes.length}`);
    console.log(`📊 Nombre de connexions: ${this.nodeConnections.size}`);
    
    // Vérifier qu'il y a bien des connexions à dessiner
    if (this.nodeConnections.size === 0) {
      console.warn('⚠️ Aucune connexion à dessiner');
      return;
    }
    
    // Obtenir la position du SVG pour calculer les coordonnées relatives
    const svgRect = svg.getBoundingClientRect();
    
    // Vérifier si le SVG a une taille
    if (svgRect.width === 0 || svgRect.height === 0) {
      console.warn('⚠️ SVG a une taille de 0, réessai dans 500ms...');
      setTimeout(() => this.updateTreeLinks(), 500);
      return;
    }
    
    // Définir le viewBox pour correspondre aux dimensions
    svg.setAttribute('viewBox', `0 0 ${svgRect.width} ${svgRect.height}`);
    
    // Calculer l'épaisseur des liens en fonction du zoom
    const currentZoom = this.whiteboardState?.zoom || 1;
    const baseStrokeWidth = 3;
    const adjustedStrokeWidth = baseStrokeWidth / currentZoom;
    
    // Dessiner les liens en utilisant getBoundingClientRect pour les positions absolues
    this.nodeConnections.forEach((children, parentIndex) => {
      // Vérifier que l'index est valide
      if (parentIndex < 0 || parentIndex >= nodes.length) {
        console.error(`❌ Index parent invalide: ${parentIndex} (max: ${nodes.length - 1})`);
        return;
      }
      
      const parentNode = nodes[parentIndex] as HTMLElement;
      if (!parentNode) {
        console.warn(`⚠️ Parent node ${parentIndex} non trouvé`);
        return;
      }
      
      const parentRect = parentNode.getBoundingClientRect();
      
      children.forEach(childIndex => {
        // Vérifier que l'index enfant est valide
        if (childIndex < 0 || childIndex >= nodes.length) {
          console.error(`❌ Index enfant invalide: ${childIndex} (max: ${nodes.length - 1})`);
          return;
        }
        
        const childNode = nodes[childIndex] as HTMLElement;
        if (!childNode) {
          console.warn(`⚠️ Child node ${childIndex} non trouvé`);
          return;
        }
        
        const childRect = childNode.getBoundingClientRect();
        
        // Créer une ligne simple au lieu d'un path pour tester
        const svgNS = 'http://www.w3.org/2000/svg';
        const line = document.createElementNS(svgNS, 'line');
        
        // Calculer les points relatifs au SVG
        const x1 = parentRect.left + parentRect.width/2 - svgRect.left;
        const y1 = parentRect.bottom - svgRect.top;
        const x2 = childRect.left + childRect.width/2 - svgRect.left;
        const y2 = childRect.top - svgRect.top;
        
        // Vérifier que les coordonnées sont valides
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
          console.warn(`⚠️ Coordonnées invalides pour le lien ${parentIndex} -> ${childIndex}`);
          return;
        }
        
        // Vérifier que les points ne sont pas identiques (évite les lignes de longueur 0)
        if (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) < 1) {
          console.warn(`⚠️ Lien de longueur 0 ignoré: ${parentIndex} -> ${childIndex}`);
          return;
        }
        
        // Déterminer la couleur selon le thème
        const content = document.getElementById('tree-fullscreen-popup')?.querySelector('.fullscreen-content') as HTMLElement;
        const isLightTheme = content?.classList.contains('light-theme');
        
        // Créer la ligne
        line.setAttribute('x1', x1.toString());
        line.setAttribute('y1', y1.toString());
        line.setAttribute('x2', x2.toString());
        line.setAttribute('y2', y2.toString());
        line.setAttribute('stroke', isLightTheme ? '#333333' : 'white');
        line.setAttribute('stroke-width', adjustedStrokeWidth.toString());
        line.setAttribute('opacity', '1');
        line.setAttribute('data-parent', parentIndex.toString());
        line.setAttribute('data-child', childIndex.toString());
        
        // Style CSS inline
        line.style.stroke = isLightTheme ? '#333333' : 'white';
        line.style.strokeWidth = `${adjustedStrokeWidth}px`;
        line.style.opacity = '1';
        
        svg.appendChild(line);
      });
    });
    
    const totalLinks = svg.querySelectorAll('line').length;
    console.log(`✅ ${totalLinks} liens créés`);
    
    // Vérification finale : supprimer les lignes orphelines ou invalides
    const allLines = svg.querySelectorAll('line');
    console.log(`🔍 Vérification de ${allLines.length} lignes...`);
    
    allLines.forEach((l: SVGLineElement, index: number) => {
      const x1 = parseFloat(l.getAttribute('x1') || '0');
      const y1 = parseFloat(l.getAttribute('y1') || '0');
      const x2 = parseFloat(l.getAttribute('x2') || '0');
      const y2 = parseFloat(l.getAttribute('y2') || '0');
      const parent = l.getAttribute('data-parent');
      const child = l.getAttribute('data-child');
      
      // Vérifier si c'est une ligne sans attributs parent/child (potentiellement le trait isolé)
      if (!parent || !child) {
        console.error(`❌ Ligne ${index} sans parent/child ! Coordonnées: (${x1.toFixed(1)},${y1.toFixed(1)}) -> (${x2.toFixed(1)},${y2.toFixed(1)})`);
        l.remove();
        return;
      }
      
      // Supprimer les lignes de longueur 0 ou avec coordonnées invalides
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2) ||
          (Math.abs(x1 - x2) < 1 && Math.abs(y1 - y2) < 1)) {
        console.warn(`🗑️ Suppression d'une ligne invalide: ${parent} -> ${child}`);
        l.remove();
      }
    });
    
  }
  
  // Propriété pour stocker les positions des nœuds
  private nodePositions: Map<number, {x: number, y: number}> = new Map();
  
  /**
   * 🔄 Mettre à jour la transformation de l'arbre
   */
  private updateTreeTransform(state: any): void {
    const wrapper = document.getElementById('whiteboard-tree-wrapper');
    if (!wrapper) return;
    
    const transform = `
      translate(-50%, -50%)
      translate(${state.panX}px, ${state.panY}px)
      scale(${state.zoom})
    `;
    
    wrapper.style.transform = transform;
    
    // Mettre à jour les liens pour ajuster leur épaisseur selon le zoom
    this.updateTreeLinks();
  }
  
  /**
   * 📏 Mettre à jour l'espacement de l'arbre
   */
  private updateTreeSpacing(state: any): void {
    console.log('📏 Mise à jour de l\'espacement:', state.horizontalSpacing + '%');
    
    const svg = document.querySelector('#whiteboard-tree-wrapper svg');
    if (!svg) return;
    
    // Collecter tous les nœuds
    const nodes = svg.querySelectorAll('g.tree-node');
    const links = svg.querySelectorAll('line');
    
    // Appliquer le facteur d'espacement
    const spacingFactor = state.horizontalSpacing / 100;
    
    nodes.forEach((node: any) => {
      const transform = node.getAttribute('transform');
      const match = transform?.match(/translate\(([^,]+),([^)]+)\)/);
      if (match) {
        const originalX = parseFloat(match[1]);
        const y = parseFloat(match[2]);
        const centerX = parseFloat(svg.getAttribute('width') || '800') / 2;
        const newX = centerX + (originalX - centerX) * spacingFactor;
        node.setAttribute('transform', `translate(${newX}, ${y})`);
      }
    });
    
    // Mettre à jour les liens
    links.forEach((link: any) => {
      const x1 = parseFloat(link.getAttribute('x1') || '0');
      const x2 = parseFloat(link.getAttribute('x2') || '0');
      const centerX = parseFloat(svg.getAttribute('width') || '800') / 2;
      
      const newX1 = centerX + (x1 - centerX) * spacingFactor;
      const newX2 = centerX + (x2 - centerX) * spacingFactor;
      
      link.setAttribute('x1', newX1.toString());
      link.setAttribute('x2', newX2.toString());
    });
  }
  
  /**
   * 🎯 Ajuster l'arbre pour qu'il tienne dans l'écran
   */
  private fitTreeToScreen(state: any): void {
    const container = document.getElementById('tree-whiteboard-canvas');
    const svg = document.querySelector('#whiteboard-tree-wrapper svg');
    
    if (!container || !svg) return;
    
    const containerRect = container.getBoundingClientRect();
    const svgWidth = parseFloat(svg.getAttribute('width') || '800');
    const svgHeight = parseFloat(svg.getAttribute('height') || '600');
    
    // Calculer le zoom nécessaire pour adapter l'arbre
    const scaleX = (containerRect.width * 0.8) / svgWidth;
    const scaleY = (containerRect.height * 0.8) / svgHeight;
    const optimalZoom = Math.min(scaleX, scaleY, 2); // Max zoom 2x
    
    // Reset position et appliquer le zoom optimal
    state.zoom = optimalZoom;
    state.panX = 0;
    state.panY = 0;
    
    this.updateTreeTransform(state);
    this.updateZoomIndicator(optimalZoom);
    this.updateZoomSlider(optimalZoom);
    this.updatePositionIndicator(0, 0);
    
    console.log('🎯 Arbre ajusté à l\'écran avec zoom:', optimalZoom);
  }
  
  /**
   * 💾 Exporter l'arbre
   */
  private exportTree(): void {
    console.log('💾 Export de l\'arbre...');
    
    const svg = document.querySelector('#whiteboard-tree-wrapper svg') as SVGElement;
    if (!svg) return;
    
    // Cloner le SVG pour l'export
    const svgClone = svg.cloneNode(true) as SVGElement;
    
    // Nettoyer les styles pour l'export
    svgClone.style.transform = '';
    svgClone.style.width = svg.getAttribute('width') || '800px';
    svgClone.style.height = svg.getAttribute('height') || '600px';
    
    // Convertir en string
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    
    // Créer le lien de téléchargement
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arbre-decision-${new Date().toISOString().split('T')[0]}.svg`;
    
    // Déclencher le téléchargement
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Libérer l'URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
    
    console.log('✅ Arbre exporté avec succès');
  }
  
  /**
   * 🗺️ Initialiser la minimap
   */
  private initializeMinimap(state: any): void {
    // TODO: Implémenter la minimap
    console.log('🗺️ Minimap à implémenter');
  }
  
  /**
   * 📊 Mettre à jour l'indicateur de zoom
   */
  private updateZoomIndicator(zoom: number): void {
    const indicator = document.getElementById('zoom-indicator');
    if (indicator) {
      indicator.textContent = `${Math.round(zoom * 100)}%`;
    }
  }
  
  /**
   * 🎚️ Mettre à jour le slider de zoom
   */
  private updateZoomSlider(zoom: number): void {
    const slider = document.getElementById('zoom-slider') as HTMLInputElement;
    if (slider) {
      slider.value = Math.round(zoom * 100).toString();
    }
  }
  
  /**
   * 📍 Mettre à jour l'indicateur de position
   */
  private updatePositionIndicator(x: number, y: number): void {
    const indicator = document.getElementById('position-indicator');
    if (indicator) {
      indicator.textContent = `X:${Math.round(x)} Y:${Math.round(y)}`;
    }
  }
  
  /**
   * 📏 Mettre à jour l'indicateur d'espacement
   */
  private updateSpacingIndicator(spacing: number): void {
    const indicator = document.getElementById('spacing-indicator');
    if (indicator) {
      indicator.textContent = `${spacing}%`;
    }
  }
  
  /**
   * 🔄 Réorganiser l'arbre dans sa disposition originale
   */
  private reorganizeTree(): void {
    console.log('🔄 Réorganisation de l\'arbre...');
    
    const nodes = document.querySelectorAll('.interactive-tree-node');
    const treeDataFromBackend = this.getTreeData();
    
    if (!treeDataFromBackend) {
      console.error('❌ Pas de données pour réorganiser');
      return;
    }
    
    const treeData = this.convertBackendTreeToWhiteboard(treeDataFromBackend);
    if (!treeData) return;
    
    // Animation de réorganisation
    nodes.forEach((node, index) => {
      const nodeData = treeData.nodes[index];
      if (!nodeData) return;
      
      const element = node as HTMLElement;
      
      // Ajouter une transition pour l'animation
      element.style.transition = 'left 0.8s ease, top 0.8s ease';
      
      // Repositionner à la position originale
      setTimeout(() => {
        element.style.left = `${nodeData.x - nodeData.width/2}px`;
        element.style.top = `${nodeData.y - nodeData.height/2}px`;
      }, 50);
      
      // Retirer la transition après l'animation
      setTimeout(() => {
        element.style.transition = 'transform 0.1s ease, box-shadow 0.1s ease';
      }, 850);
    });
    
    // Mettre à jour les liens après un délai
    setTimeout(() => {
      this.updateTreeLinks();
    }, 400);
    
    console.log('✅ Arbre réorganisé');
  }
  
  /**
   * 🧪 Créer un arbre de test minimal pour diagnostic
   */
  private createMinimalTestTree(container: HTMLElement): void {
    console.log('🧪 Création arbre de test minimal...');
    
    // Nettoyer et styliser le container
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.background = 'rgba(0, 255, 0, 0.1)'; // Fond vert clair pour voir le container
    container.style.border = '3px solid red';
    container.style.minHeight = '100px';
    
    // Créer un simple div centré
    const testDiv = document.createElement('div');
    testDiv.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 200px;
      background: white;
      border: 3px solid #4CAF50;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      font-size: 18px;
      color: black;
      z-index: 1000;
    `;
    testDiv.innerHTML = `
      <h3 style="margin: 0; color: #4CAF50;">🌲 ARBRE DE TEST</h3>
      <p style="margin: 10px 0;">Container visible !</p>
      <small>Dimensions: ${container.offsetWidth}x${container.offsetHeight}</small>
    `;
    container.appendChild(testDiv);
    
    // Créer 3 nœuds simples
    const nodes = [
      { id: 'root', x: 50, y: 50, text: 'Root' },
      { id: 'left', x: -100, y: 150, text: 'Left' },
      { id: 'right', x: 200, y: 150, text: 'Right' }
    ];
    
    nodes.forEach(node => {
      const nodeDiv = document.createElement('div');
      nodeDiv.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(${node.x - 50}px, ${node.y - 25}px);
        width: 100px;
        height: 50px;
        background: ${node.id === 'root' ? '#3b82f6' : '#10b981'};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        font-weight: bold;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        cursor: move;
        z-index: 1001;
      `;
      nodeDiv.textContent = node.text;
      container.appendChild(nodeDiv);
    });
    
    console.log('✅ Arbre de test créé');
    console.log('📊 Éléments dans le container:', container.children.length);
    
    // Vérification finale
    const allElements = container.querySelectorAll('*');
    console.log('🔍 Total éléments créés:', allElements.length);
    
    // Forcer la visibilité du container parent
    const parentContainer = container.parentElement;
    if (parentContainer) {
      parentContainer.style.border = '5px solid red';
      console.log('📦 Container parent dimensions:', {
        width: parentContainer.offsetWidth,
        height: parentContainer.offsetHeight
      });
    }
    
    // Diagnostic final
    console.log('🔍 DIAGNOSTIC FINAL:');
    console.log('Container dimensions:', {
      width: container.offsetWidth,
      height: container.offsetHeight,
      visible: container.offsetWidth > 0 && container.offsetHeight > 0
    });
    
    const finalNodes = container.querySelectorAll('[style*="background"]');
    console.log('Test elements with background:', finalNodes.length);
  }
  
  /**
   * 🎨 Basculer entre thème clair et sombre
   */
  private toggleWhiteboardTheme(): void {
    const content = document.getElementById('tree-fullscreen-popup')?.querySelector('.fullscreen-content') as HTMLElement;
    const wrapper = document.getElementById('whiteboard-tree-wrapper');
    
    if (!content || !wrapper) return;
    
    // Vérifier l'état actuel
    const isDark = content.classList.contains('dark-theme') || !content.classList.contains('light-theme');
    
    if (isDark) {
      // Passer en mode clair
      content.classList.remove('dark-theme');
      content.classList.add('light-theme');
      content.style.background = '#f5f5f5';
      
      // Mettre à jour les liens après le changement de thème
      this.updateTreeLinks();
      
      // Ajuster les styles des nœuds pour le fond clair
      const nodes = wrapper.querySelectorAll('.tree-node rect');
      const texts = wrapper.querySelectorAll('.tree-node text');
      const links = wrapper.querySelectorAll('.tree-links line');
      
      nodes.forEach((node: any) => {
        node.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))';
      });
      
      texts.forEach((text: any) => {
        text.style.fill = 'white';
        text.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
      });
      
      links.forEach((link: any) => {
        link.style.stroke = '#666';
      });
      
    } else {
      // Passer en mode sombre
      content.classList.remove('light-theme');
      content.classList.add('dark-theme');
      content.style.background = '#0a0a0a';
      content.style.backgroundImage = `
        linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px),
        radial-gradient(circle at 20% 50%, rgba(76, 175, 80, 0.1) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, rgba(33, 150, 243, 0.1) 0%, transparent 50%)
      `;
      content.style.backgroundSize = '50px 50px, 50px 50px, 100% 100%, 100% 100%';
      
      // Mettre à jour les liens après le changement de thème
      this.updateTreeLinks();
      
      // Ajuster les styles des nœuds pour le fond sombre
      const nodes = wrapper.querySelectorAll('.tree-node rect');
      const texts = wrapper.querySelectorAll('.tree-node text');
      const links = wrapper.querySelectorAll('.tree-links line');
      
      nodes.forEach((node: any) => {
        node.style.filter = 'drop-shadow(0 0 10px rgba(255,255,255,0.3))';
      });
      
      texts.forEach((text: any) => {
        text.style.fill = 'white';
        text.style.textShadow = '1px 1px 2px rgba(0,0,0,0.8)';
      });
      
      links.forEach((link: any) => {
        link.style.stroke = 'rgba(255,255,255,0.8)';
      });
    }
    
    console.log(`🎨 Thème basculé en mode ${isDark ? 'clair' : 'sombre'}`);
  }
}
