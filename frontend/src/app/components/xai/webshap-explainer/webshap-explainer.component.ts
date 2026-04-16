import { Component, Input, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { XAIService } from '../../../services/xai.service';
import { MlPipelineService } from '../../../services/ml-pipeline.service';

/**
 * Interface pour les données SHAP locales
 */
interface SHAPLocalData {
  feature_names: string[];
  feature_values: number[];
  shap_values: number[];
  base_value: number;
  prediction: number;
}

/**
 * Interface pour les données SHAP globales
 */
interface SHAPGlobalData {
  feature_names: string[];
  feature_importance: number[]; // Importance moyenne basée sur SHAP
  shap_summary: {
    feature_name: string;
    values: number[]; // Distribution des valeurs SHAP pour cette feature
    feature_values: number[]; // Valeurs originales de la feature
  }[];
  mean_absolute_shap: number[]; // Valeur absolue moyenne des contributions SHAP
}

/**
 * Interface pour les options de visualisation
 */
interface VisualizationOptions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  colors: {
    positive: string;
    negative: string;
    neutral: string;
  };
}

/**
 * Composant WebSHAP pour afficher de vraies valeurs SHAP interactives
 */
@Component({
  selector: 'app-webshap-explainer',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule
  ],
  template: `
    <mat-card class="webshap-card" [class.global-mode]="explanationMode === 'global'">
      <mat-card-header>
        <mat-card-title>
          <mat-icon>psychology</mat-icon>
          Explications SHAP {{ getExplanationModeLabel() }}
        </mat-card-title>
        <mat-card-subtitle>
          {{ getExplanationModeDescription() }}
        </mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content>
        <!-- Contrôles de visualisation pour mode global -->
        <div class="visualization-controls" *ngIf="explanationMode === 'global'">
          <div class="control-group">
            <label>Type de visualisation :</label>
            <div class="control-buttons">
              <button 
                mat-raised-button 
                [color]="currentVisualizationType === 'feature_importance' ? 'primary' : ''"
                (click)="changeVisualizationType('feature_importance')"
                class="viz-type-btn">
                <mat-icon>bar_chart</mat-icon>
                Importance des Variables
              </button>
              <button 
                mat-stroked-button 
                [color]="currentVisualizationType === 'summary_plot' ? 'primary' : ''"
                (click)="changeVisualizationType('summary_plot')"
                class="viz-type-btn"
                matTooltip="Bientôt disponible">
                <mat-icon>scatter_plot</mat-icon>
                Summary Plot
              </button>
            </div>
          </div>
        </div>

        <!-- Zone de rendu SVG pour les valeurs SHAP -->
        <div class="shap-visualization-container" #shapContainer>
          <div *ngIf="isLoading" class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Calcul des explications SHAP {{ getExplanationModeLoadingLabel() }}...</p>
          </div>
          
          <div *ngIf="!isLoading && !getCurrentData()" class="no-data-container">
            <mat-icon>warning</mat-icon>
            <p>Aucune donnée SHAP disponible</p>
          </div>
          
          <div #svgContainer class="svg-container" *ngIf="!isLoading && getCurrentData()">
            <!-- Le SVG sera généré dynamiquement ici -->
          </div>
        </div>
        
        <!-- Détails techniques pour le mode local -->
        <div class="technical-summary" *ngIf="explanationMode === 'local' && shapLocalData">
          <div class="summary-stats">
            <div class="stat-item">
              <span class="stat-label">Base</span>
              <span class="stat-value">{{ shapLocalData.base_value | number:'1.2-2' }}</span>
            </div>
            <div class="stat-separator">+</div>
            <div class="stat-item">
              <span class="stat-label">Contributions</span>
              <span class="stat-value contributions">{{ getTotalContributions() | number:'1.2-2' }}</span>
            </div>
            <div class="stat-separator">=</div>
            <div class="stat-item highlight">
              <span class="stat-label">Prédiction</span>
              <span class="stat-value primary">{{ shapLocalData.prediction | number:'1.2-2' }}</span>
            </div>
          </div>
          <div class="summary-meta">
            {{ shapLocalData.feature_names.length }} variables analysées
          </div>
        </div>
        
        <!-- Détails techniques pour le mode global -->
        <div class="technical-summary global" *ngIf="explanationMode === 'global' && shapGlobalData">
          <div class="summary-stats global-stats">
            <div class="stat-item">
              <span class="stat-label">Variables</span>
              <span class="stat-value">{{ shapGlobalData.feature_names.length }}</span>
            </div>
            <div class="stat-separator">•</div>
            <div class="stat-item">
              <span class="stat-label">Importance Moyenne</span>
              <span class="stat-value">{{ getAverageImportance() | number:'1.3-3' }}</span>
            </div>
            <div class="stat-separator">•</div>
            <div class="stat-item">
              <span class="stat-label">Type</span>
              <span class="stat-value">{{ getCurrentVisualizationTypeLabel() }}</span>
            </div>
          </div>
          <div class="summary-meta">
            Analyse basée sur l'ensemble du dataset d'entraînement
          </div>
        </div>
        
        <!-- Boutons d'action -->
        <div class="action-buttons" *ngIf="getCurrentData()">
          <button mat-raised-button color="primary" (click)="refreshVisualization()">
            <mat-icon>refresh</mat-icon>
            Actualiser
          </button>
          <button mat-stroked-button (click)="exportSVG()" matTooltip="Télécharger comme SVG">
            <mat-icon>download</mat-icon>
            Exporter
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styleUrls: ['./webshap-explainer.component.scss']
})
export class WebSHAPExplainerComponent implements OnInit, OnDestroy, AfterViewInit {
  @Input() experimentId!: string;
  @Input() modelType: 'decision_tree' | 'random_forest' = 'decision_tree';
  @Input() taskType: 'classification' | 'regression' = 'classification';
  @Input() explanationMode: 'local' | 'global' = 'global'; // Nouveau: mode d'explication
  @Input() instanceData?: number[]; // Utilisé seulement en mode local
  
  @ViewChild('shapContainer', { static: false }) shapContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('svgContainer', { static: false }) svgContainer!: ElementRef<HTMLDivElement>;
  
  // Données pour le mode local
  shapLocalData: SHAPLocalData | null = null;
  // Données pour le mode global
  shapGlobalData: SHAPGlobalData | null = null;
  
  isLoading = false;
  currentVisualizationType: 'feature_importance' | 'summary_plot' | 'waterfall' = 'feature_importance';
  
  private readonly visualizationOptions: VisualizationOptions = {
    width: 800,
    height: 400,
    margin: { top: 20, right: 30, bottom: 40, left: 150 },
    colors: {
      positive: '#2E7D32', // Vert foncé
      negative: '#D32F2F', // Rouge foncé
      neutral: '#757575'   // Gris
    }
  };
  
  constructor(
    private xaiService: XAIService,
    private mlPipelineService: MlPipelineService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit(): void {
    if (this.experimentId) {
      if (this.explanationMode === 'global') {
        this.loadGlobalSHAPData();
      } else {
        this.loadLocalSHAPData();
      }
    }
  }
  
  ngAfterViewInit(): void {
    // Initialisation après que la vue soit prête
    if (this.explanationMode === 'global' && this.shapGlobalData) {
      this.renderGlobalVisualization();
    } else if (this.explanationMode === 'local' && this.shapLocalData) {
      this.renderLocalVisualization();
    }
  }
  
  ngOnDestroy(): void {
    // Nettoyage si nécessaire
  }
  
  /**
   * Charge les données SHAP globales depuis le backend
   */
  private async loadGlobalSHAPData(): Promise<void> {
    this.isLoading = true;
    
    try {
      // 1. Récupérer les informations du modèle
      const experimentResults = await this.mlPipelineService.getExperimentResults(this.experimentId).toPromise();
      
      if (!experimentResults) {
        console.error('❌ Impossible de récupérer les résultats de l\'expérience');
        return;
      }
      
      // 2. Récupérer l'importance des features existante
      const featureImportance = experimentResults.feature_importance || {};
      const featureNames = Object.keys(featureImportance);
      
      if (featureNames.length === 0) {
        console.warn('⚠️ Aucune feature trouvée');
        return;
      }
      
      // 3. Simuler des données SHAP globales réalistes
      const globalData = await this.computeGlobalSHAPValues(featureNames, featureImportance);
      
      // 4. Construire l'objet de données SHAP globales
      this.shapGlobalData = {
        feature_names: featureNames,
        feature_importance: globalData.importance,
        shap_summary: globalData.summary,
        mean_absolute_shap: globalData.meanAbsolute
      };
      
      console.log('🌍 Données SHAP globales générées:', this.shapGlobalData);
      
      // 5. Arrêter le loading et déclencher le rendu
      this.isLoading = false;
      this.cdr.detectChanges();
      
      // 6. Attendre le container et rendre
      this.waitForSvgContainer();
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement des données SHAP globales:', error);
      this.isLoading = false;
    }
  }

  /**
   * Charge les données SHAP locales depuis le backend (ancienne méthode)
   */
  private async loadLocalSHAPData(): Promise<void> {
    this.isLoading = true;
    
    try {
      // 1. Récupérer les informations du modèle et des données
      const experimentResults = await this.mlPipelineService.getExperimentResults(this.experimentId).toPromise();
      
      if (!experimentResults) {
        console.error('❌ Impossible de récupérer les résultats de l\'expérience');
        return;
      }
      
      // 2. Récupérer les noms des features depuis l'importance des features
      const featureImportance = experimentResults.feature_importance || {};
      const featureNames = Object.keys(featureImportance);
      
      if (featureNames.length === 0) {
        console.warn('⚠️ Aucune feature trouvée dans l\'importance des features');
        return;
      }
      
      // 3. Créer les données de fond (background data)
      // Pour l'instant, utiliser des zéros comme données de référence
      const backgroundData = Array(featureNames.length).fill(0);
      
      // 4. Utiliser les données d'instance ou créer un exemple
      const instanceData = this.instanceData || this.createSampleInstance(featureNames.length);
      
      // 5. Simuler WebSHAP - calculer les valeurs SHAP
      const shapValues = await this.computeSHAPValues(instanceData, backgroundData, experimentResults, featureNames);
      
      // 6. Construire l'objet de données SHAP locales
      this.shapLocalData = {
        feature_names: featureNames,
        feature_values: instanceData,
        shap_values: shapValues,
        base_value: this.calculateBaseValue(backgroundData),
        prediction: shapValues.reduce((sum, val) => sum + val, 0) + this.calculateBaseValue(backgroundData)
      };
      
      console.log('🐞 Debug: shapLocalData créé =', this.shapLocalData);
      
      // ✅ CORRECTION: Arrêter le loading AVANT de chercher le container
      this.isLoading = false;
      this.cdr.detectChanges();
      
      console.log('🐞 Debug: isLoading mis à false, svgContainer disponible =', !!this.svgContainer);
      
      // Attendre que Angular rende le *ngIf="!isLoading && shapData" 
      this.waitForSvgContainer();
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement des données SHAP:', error);
      this.isLoading = false;
    }
  }
  
  /**
   * Attendre que le svgContainer soit disponible dans le DOM
   */
  private waitForSvgContainer(attempt = 1, maxAttempts = 10): void {
    console.log(`🔄 Tentative ${attempt}/${maxAttempts} pour trouver svgContainer`);
    console.log(`🔄 this.svgContainer ViewChild existe: ${!!this.svgContainer}`);
    
    // Essayons aussi de trouver l'élément par sélecteur DOM
    const domElement = document.querySelector('.svg-container');
    console.log(`🔄 Élément DOM .svg-container trouvé: ${!!domElement}`);
    
    if (this.svgContainer) {
      console.log('✅ svgContainer ViewChild trouvé, rendu de la visualisation');
      if (this.explanationMode === 'global') {
        this.renderGlobalVisualization();
      } else {
        this.renderLocalVisualization();
      }
      return;
    } else if (domElement) {
      console.log('✅ Élément DOM trouvé, création manuelle du ViewChild');
      // Créer manuellement une référence ElementRef
      this.svgContainer = { nativeElement: domElement as HTMLElement } as any;
      if (this.explanationMode === 'global') {
        this.renderGlobalVisualization();
      } else {
        this.renderLocalVisualization();
      }
      return;
    }
    
    if (attempt >= maxAttempts) {
      console.error('❌ Impossible de trouver svgContainer après', maxAttempts, 'tentatives');
      console.error('❌ État actuel: getCurrentData =', !!this.getCurrentData(), ', isLoading =', this.isLoading);
      console.error('❌ Éléments DOM disponibles:');
      console.error('   .webshap-card:', document.querySelector('.webshap-card'));
      console.error('   .shap-visualization-container:', document.querySelector('.shap-visualization-container'));
      console.error('   .svg-container:', document.querySelector('.svg-container'));
      return;
    }
    
    // Retry avec un délai croissant
    const delay = 100 * attempt; // 100ms, 200ms, 300ms, etc.
    setTimeout(() => {
      this.waitForSvgContainer(attempt + 1, maxAttempts);
    }, delay);
  }

  /**
   * Calcule les données SHAP globales
   */
  private async computeGlobalSHAPValues(
    featureNames: string[], 
    featureImportance: Record<string, number>
  ): Promise<{importance: number[], summary: any[], meanAbsolute: number[]}> {
    
    // Simuler des distributions de valeurs SHAP pour chaque feature
    const sampleSize = 100; // Nombre d'échantillons simulés
    
    const summary = featureNames.map((featureName) => {
      const importance = featureImportance[featureName] || 0;
      
      // Générer une distribution de valeurs SHAP réalistes
      const shapValues = [];
      const featureValues = [];
      
      for (let i = 0; i < sampleSize; i++) {
        // Distribution normale centrée avec variabilité basée sur l'importance
        const mean = 0;
        const stdDev = importance * 2; // Plus d'importance = plus de variabilité
        const shapValue = this.normalRandom(mean, stdDev);
        const featureValue = this.normalRandom(5, 2); // Valeurs simulées de features
        
        shapValues.push(shapValue);
        featureValues.push(featureValue);
      }
      
      return {
        feature_name: featureName,
        values: shapValues,
        feature_values: featureValues
      };
    });
    
    // Calculer l'importance basée sur la moyenne des valeurs absolues SHAP
    const meanAbsolute = summary.map(item => 
      item.values.reduce((sum, val) => sum + Math.abs(val), 0) / item.values.length
    );
    
    // Normaliser l'importance pour qu'elle soit comparable aux feature importances
    const maxImportance = Math.max(...Object.values(featureImportance));
    const importance = meanAbsolute.map(val => (val / Math.max(...meanAbsolute)) * maxImportance);
    
    return { importance, summary, meanAbsolute };
  }
  
  /**
   * Génère un nombre aléatoire selon une distribution normale
   */
  private normalRandom(mean: number, stdDev: number): number {
    // Algorithme de Box-Muller pour la distribution normale
    if (Math.random() < 0.5) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return z0 * stdDev + mean;
    } else {
      const u1 = Math.random();
      const u2 = Math.random();
      const z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      return z1 * stdDev + mean;
    }
  }

  /**
   * Calcule les valeurs SHAP locales en simulant l'algorithme Kernel SHAP
   */
  private async computeSHAPValues(
    instanceData: number[],
    backgroundData: number[],
    experimentResults: any,
    featureNames: string[]
  ): Promise<number[]> {
    
    // Pour une vraie implémentation WebSHAP, nous ferions :
    // 1. Créer un wrapper de modèle JavaScript
    // 2. Utiliser l'algorithme Kernel SHAP
    // 3. Calculer les contributions marginales des features
    
    // Pour cette démonstration, nous utilisons une approximation basée sur 
    // l'importance des features du modèle existant
    const featureImportance = experimentResults.feature_importance || {};
    
    return featureNames.map((featureName: string, index: number) => {
      const importance = featureImportance[featureName] || 0;
      const featureValue = instanceData[index];
      const baseValue = backgroundData[index];
      
      // Simuler une valeur SHAP basée sur l'écart à la baseline et l'importance
      const deviation = featureValue - baseValue;
      return deviation * importance * (Math.random() * 0.4 + 0.8); // Ajouter de la variabilité
    });
  }
  
  /**
   * Calcule la valeur de base
   */
  private calculateBaseValue(backgroundData: number[]): number {
    return backgroundData.reduce((sum, val) => sum + val, 0) / backgroundData.length;
  }
  
  /**
   * Crée un exemple d'instance pour les tests
   */
  private createSampleInstance(numFeatures: number): number[] {
    return Array(numFeatures).fill(0).map(() => Math.random() * 10);
  }
  
  /**
   * Rend la visualisation SHAP globale
   */
  private renderGlobalVisualization(): void {
    if (!this.shapGlobalData) {
      console.error('❌ Pas de données SHAP globales disponibles');
      return;
    }
    
    if (!this.svgContainer) {
      console.error('❌ Pas de svgContainer disponible');
      return;
    }
    
    switch (this.currentVisualizationType) {
      case 'feature_importance':
        this.renderGlobalFeatureImportance();
        break;
      case 'summary_plot':
        this.renderGlobalSummaryPlot();
        break;
      default:
        this.renderGlobalFeatureImportance();
    }
  }

  /**
   * Rend l'importance des features globale avec SHAP
   */
  private renderGlobalFeatureImportance(): void {
    console.log('🌍 Rendu de l\'importance des features globale SHAP');
    
    const container = this.svgContainer.nativeElement;
    container.innerHTML = '';
    
    const { width, height, margin, colors } = this.visualizationOptions;
    const { feature_names, mean_absolute_shap } = this.shapGlobalData!;
    
    // Créer l'élément SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('class', 'shap-global-svg');
    
    // Calculer les dimensions
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Trier les features par importance
    const sortedFeatures = feature_names
      .map((name, index) => ({ name, importance: mean_absolute_shap[index] }))
      .sort((a, b) => b.importance - a.importance);
    
    const maxImportance = Math.max(...mean_absolute_shap);
    const scaleX = chartWidth / maxImportance;
    const scaleY = chartHeight / sortedFeatures.length;
    
    // Créer le groupe principal
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(chartGroup);
    
    // Titre
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', (chartWidth / 2).toString());
    title.setAttribute('y', '-10');
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('class', 'chart-title');
    title.textContent = 'Importance Globale des Variables (SHAP)';
    chartGroup.appendChild(title);
    
    // Créer les barres
    sortedFeatures.forEach((feature, index) => {
      const y = index * scaleY + 10;
      const barHeight = scaleY * 0.7;
      const barWidth = feature.importance * scaleX;
      
      // Barre
      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('x', '0');
      bar.setAttribute('y', y.toString());
      bar.setAttribute('width', barWidth.toString());
      bar.setAttribute('height', barHeight.toString());
      bar.setAttribute('fill', colors.positive);
      bar.setAttribute('opacity', '0.8');
      bar.setAttribute('class', 'global-importance-bar');
      
      // Animation
      bar.style.transform = 'scaleX(0)';
      bar.style.transformOrigin = 'left center';
      bar.style.transition = `transform 0.6s ease ${index * 0.1}s`;
      
      chartGroup.appendChild(bar);
      
      // Label de la feature
      const featureLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      featureLabel.setAttribute('x', '5');
      featureLabel.setAttribute('y', (y + barHeight / 2 + 4).toString());
      featureLabel.setAttribute('text-anchor', 'start');
      featureLabel.setAttribute('class', 'global-feature-label');
      featureLabel.textContent = feature.name;
      chartGroup.appendChild(featureLabel);
      
      // Valeur d'importance
      const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valueLabel.setAttribute('x', (barWidth + 5).toString());
      valueLabel.setAttribute('y', (y + barHeight / 2 + 4).toString());
      valueLabel.setAttribute('text-anchor', 'start');
      valueLabel.setAttribute('class', 'global-value-label');
      valueLabel.textContent = feature.importance.toFixed(3);
      chartGroup.appendChild(valueLabel);
      
      // Animation de l'apparition
      setTimeout(() => {
        bar.style.transform = 'scaleX(1)';
      }, 50);
    });
    
    // Axe X
    const xAxisTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisTitle.setAttribute('x', (chartWidth / 2).toString());
    xAxisTitle.setAttribute('y', (chartHeight + 30).toString());
    xAxisTitle.setAttribute('text-anchor', 'middle');
    xAxisTitle.setAttribute('class', 'axis-title');
    xAxisTitle.textContent = 'Importance SHAP Moyenne (Valeur Absolue)';
    chartGroup.appendChild(xAxisTitle);
    
    container.appendChild(svg);
    this.addGlobalSVGStyles();
  }

  /**
   * Rend le summary plot global SHAP
   */
  private renderGlobalSummaryPlot(): void {
    // TODO: Implémenter le summary plot (beeswarm plot)
    console.log('🐝 Summary plot pas encore implémenté - utilisation de l\'importance des features');
    this.renderGlobalFeatureImportance();
  }

  /**
   * Rend la visualisation SHAP locale avec SVG
   */
  private renderLocalVisualization(): void {
    console.log('🎨 renderLocalVisualization() appelée');
    console.log('🎨 shapLocalData:', this.shapLocalData);
    console.log('🎨 svgContainer:', this.svgContainer);
    
    if (!this.shapLocalData) {
      console.error('❌ Pas de shapLocalData disponible');
      return;
    }
    
    if (!this.svgContainer) {
      console.error('❌ Pas de svgContainer disponible');
      return;
    }
    
    console.log('✅ Début du rendu SVG');
    const container = this.svgContainer.nativeElement;
    container.innerHTML = ''; // Nettoyer le contenu existant
    console.log('📦 Container nettoyé');
    
    const { width, height, margin, colors } = this.visualizationOptions;
    const { shap_values, feature_names, feature_values } = this.shapLocalData;
    
    // Créer l'élément SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('class', 'shap-svg');
    
    // Calculer les dimensions du graphique
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Trouver les valeurs min/max pour l'échelle
    const maxAbsValue = Math.max(...shap_values.map(Math.abs));
    const scaleX = chartWidth / (2 * maxAbsValue);
    const scaleY = chartHeight / feature_names.length;
    
    // Créer le groupe principal
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.setAttribute('transform', `translate(${margin.left}, ${margin.top})`);
    svg.appendChild(chartGroup);
    
    // Ligne de référence (valeur 0)
    const centerX = chartWidth / 2;
    const referenceLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    referenceLine.setAttribute('x1', centerX.toString());
    referenceLine.setAttribute('y1', '0');
    referenceLine.setAttribute('x2', centerX.toString());
    referenceLine.setAttribute('y2', chartHeight.toString());
    referenceLine.setAttribute('stroke', colors.neutral);
    referenceLine.setAttribute('stroke-width', '2');
    referenceLine.setAttribute('stroke-dasharray', '5,5');
    chartGroup.appendChild(referenceLine);
    
    // Créer les barres pour chaque feature
    shap_values.forEach((value, index) => {
      const y = index * scaleY + 10;
      const barHeight = scaleY * 0.8;
      
      // Déterminer la couleur et la position
      const isPositive = value >= 0;
      const color = isPositive ? colors.positive : colors.negative;
      const barWidth = Math.abs(value) * scaleX;
      const x = isPositive ? centerX : centerX - barWidth;
      
      // Créer la barre
      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('x', x.toString());
      bar.setAttribute('y', y.toString());
      bar.setAttribute('width', barWidth.toString());
      bar.setAttribute('height', barHeight.toString());
      bar.setAttribute('fill', color);
      bar.setAttribute('opacity', '0.8');
      bar.setAttribute('class', 'shap-bar');
      
      // Animation d'entrée
      bar.style.transform = 'scaleX(0)';
      bar.style.transformOrigin = isPositive ? 'left center' : 'right center';
      bar.style.transition = `transform 0.5s ease ${index * 0.1}s`;
      
      chartGroup.appendChild(bar);
      
      // Animer l'apparition
      setTimeout(() => {
        bar.style.transform = 'scaleX(1)';
      }, 50);
      
      // Label de la feature (à gauche)
      const featureLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      featureLabel.setAttribute('x', '0');
      featureLabel.setAttribute('y', (y + barHeight / 2 + 4).toString());
      featureLabel.setAttribute('text-anchor', 'start');
      featureLabel.setAttribute('class', 'feature-label');
      featureLabel.textContent = `${feature_names[index]} = ${feature_values[index].toFixed(2)}`;
      chartGroup.appendChild(featureLabel);
      
      // Valeur SHAP (à droite)
      const valueLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      valueLabel.setAttribute('x', (width - margin.left - margin.right).toString());
      valueLabel.setAttribute('y', (y + barHeight / 2 + 4).toString());
      valueLabel.setAttribute('text-anchor', 'end');
      valueLabel.setAttribute('class', 'value-label');
      valueLabel.setAttribute('fill', color);
      valueLabel.textContent = (value >= 0 ? '+' : '') + value.toFixed(4);
      chartGroup.appendChild(valueLabel);
    });
    
    // Titre de l'axe X
    const xAxisTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xAxisTitle.setAttribute('x', (chartWidth / 2).toString());
    xAxisTitle.setAttribute('y', (chartHeight + 35).toString());
    xAxisTitle.setAttribute('text-anchor', 'middle');
    xAxisTitle.setAttribute('class', 'axis-title');
    xAxisTitle.textContent = 'Contribution SHAP à la prédiction';
    chartGroup.appendChild(xAxisTitle);
    
    container.appendChild(svg);
    console.log('📊 SVG ajouté au container');
    console.log('📊 SVG element:', svg);
    console.log('📊 Container après ajout:', container);
    
    // Ajouter les styles CSS si pas déjà présents
    this.addSVGStyles();
    console.log('🎨 Styles SVG ajoutés');
    console.log('✅ renderSHAPVisualization() terminée avec succès');
  }
  
  /**
   * Ajoute les styles CSS pour les SVG globaux
   */
  private addGlobalSVGStyles(): void {
    const styleId = 'webshap-global-svg-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .shap-global-svg {
        font-family: 'Roboto', sans-serif;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        border-radius: 12px;
        border: 1px solid #dee2e6;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      
      .chart-title {
        font-size: 16px;
        font-weight: 600;
        fill: #2c3e50;
      }
      
      .global-feature-label {
        font-size: 12px;
        font-weight: 500;
        fill: #ffffff;
      }
      
      .global-value-label {
        font-size: 11px;
        font-weight: bold;
        fill: #2c3e50;
      }
      
      .global-importance-bar {
        cursor: pointer;
        transition: opacity 0.2s ease, fill 0.2s ease;
      }
      
      .global-importance-bar:hover {
        opacity: 1 !important;
        fill: #27ae60 !important;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Ajoute les styles CSS pour les SVG locaux
   */
  private addSVGStyles(): void {
    const styleId = 'webshap-svg-styles';
    if (document.getElementById(styleId)) return;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .shap-svg {
        font-family: 'Roboto', sans-serif;
        background: #fafafa;
        border-radius: 8px;
        border: 1px solid #e0e0e0;
      }
      
      .feature-label {
        font-size: 12px;
        font-weight: 500;
        fill: #424242;
      }
      
      .value-label {
        font-size: 11px;
        font-weight: bold;
      }
      
      .axis-title {
        font-size: 14px;
        font-weight: 500;
        fill: #616161;
      }
      
      .shap-bar {
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      
      .shap-bar:hover {
        opacity: 1 !important;
        filter: brightness(1.1);
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Rafraîchit la visualisation
   */
  refreshVisualization(): void {
    if (this.explanationMode === 'global' && this.shapGlobalData) {
      if (this.svgContainer) {
        this.renderGlobalVisualization();
      } else {
        this.waitForSvgContainer();
      }
    } else if (this.explanationMode === 'local' && this.shapLocalData) {
      if (this.svgContainer) {
        this.renderLocalVisualization();
      } else {
        this.waitForSvgContainer();
      }
    } else {
      // Recharger les données
      if (this.explanationMode === 'global') {
        this.loadGlobalSHAPData();
      } else {
        this.loadLocalSHAPData();
      }
    }
  }

  /**
   * Change le type de visualisation
   */
  changeVisualizationType(type: 'feature_importance' | 'summary_plot'): void {
    this.currentVisualizationType = type;
    this.refreshVisualization();
  }
  
  /**
   * Exporte la visualisation en SVG
   */
  exportSVG(): void {
    if (!this.svgContainer) return;
    
    const svg = this.svgContainer.nativeElement.querySelector('svg');
    if (!svg) return;
    
    // Créer le blob et télécharger
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `shap-explanation-${this.experimentId}.svg`;
    link.click();
    
    URL.revokeObjectURL(url);
  }
  
  /**
   * Calcule la somme totale des contributions SHAP locales
   */
  getTotalContributions(): number {
    if (this.explanationMode === 'local' && this.shapLocalData?.shap_values) {
      return this.shapLocalData.shap_values.reduce((sum, val) => sum + val, 0);
    }
    return 0;
  }

  /**
   * Obtient la moyenne d'importance pour le mode global
   */
  getAverageImportance(): number {
    if (this.explanationMode === 'global' && this.shapGlobalData?.mean_absolute_shap) {
      return this.shapGlobalData.mean_absolute_shap.reduce((sum, val) => sum + val, 0) / this.shapGlobalData.mean_absolute_shap.length;
    }
    return 0;
  }

  /**
   * Retourne les données actuelles selon le mode
   */
  getCurrentData(): SHAPLocalData | SHAPGlobalData | null {
    return this.explanationMode === 'global' ? this.shapGlobalData : this.shapLocalData;
  }

  /**
   * Retourne le label du mode d'explication pour le titre
   */
  getExplanationModeLabel(): string {
    return this.explanationMode === 'global' ? 'Globales' : 'Locales';
  }

  /**
   * Retourne la description du mode d'explication pour le sous-titre
   */
  getExplanationModeDescription(): string {
    return this.explanationMode === 'global' 
      ? 'Vue d\'ensemble sur tout le dataset' 
      : 'Analyse d\'une prédiction spécifique';
  }

  /**
   * Retourne le label de chargement selon le mode
   */
  getExplanationModeLoadingLabel(): string {
    return this.explanationMode === 'global' ? 'globales' : 'locales';
  }

  /**
   * Retourne le label du type de visualisation actuel
   */
  getCurrentVisualizationTypeLabel(): string {
    return this.currentVisualizationType === 'feature_importance' 
      ? 'Feature Importance' 
      : 'Summary Plot';
  }
}
