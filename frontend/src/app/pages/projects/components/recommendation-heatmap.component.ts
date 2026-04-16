import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DatasetScored } from '../../../models/dataset.models';
import { CriterionWeight } from '../../../models/project.models';

// Déclaration globale pour ECharts
declare global {
  interface Window {
    echarts: any;
  }
}

@Component({
  selector: 'app-recommendation-heatmap',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule
  ],
  template: `
    <mat-card class="heatmap-card" *ngIf="datasets.length > 0 && activeCriteria.length > 0">
      <mat-card-header>
        <mat-card-title class="d-flex align-items-center">
          <mat-icon class="m-r-8">insights</mat-icon>
          {{ 'PROJECTS.HEATMAP.TITLE' | translate }}
        </mat-card-title>
        <mat-card-subtitle>
          {{ 'PROJECTS.HEATMAP.SUBTITLE' | translate:{ datasets: datasets.length, criteria: activeCriteria.length } }}
        </mat-card-subtitle>
      </mat-card-header>
      
      <mat-card-content class="heatmap-content">
        <!-- Légende explicative -->
        <div class="legend-info m-b-16">
          <div class="d-flex align-items-center gap-16">
            <div class="legend-item">
              <div class="legend-color" style="background: #f44336;"></div>
              <span class="mat-caption">{{ 'PROJECTS.HEATMAP.LEGEND.LOW' | translate }}</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #ff9800;"></div>
              <span class="mat-caption">{{ 'PROJECTS.HEATMAP.LEGEND.MEDIUM' | translate }}</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #4caf50;"></div>
              <span class="mat-caption">{{ 'PROJECTS.HEATMAP.LEGEND.GOOD' | translate }}</span>
            </div>
            <div class="legend-item">
              <div class="legend-color" style="background: #2196f3;"></div>
              <span class="mat-caption">{{ 'PROJECTS.HEATMAP.LEGEND.EXCELLENT' | translate }}</span>
            </div>
          </div>
        </div>

        <!-- Container ECharts -->
        <div #chartContainer 
             class="echarts-container"
             id="echarts-heatmap-{{ componentId }}"
             [style.height.px]="getChartHeight()"
             style="width: 100%; min-height: 400px; background: white; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        </div>

        <!-- Informations -->
        <div class="heatmap-info m-t-16">
          <div class="d-flex align-items-center gap-16">
            <div class="info-item">
              <mat-icon class="text-primary">analytics</mat-icon>
              <span class="mat-caption m-l-4">{{ 'PROJECTS.HEATMAP.INFO.CRITERIA_ANALYZED' | translate:{ count: activeCriteria.length } }}</span>
            </div>
            <div class="info-item">
              <mat-icon class="text-primary">storage</mat-icon>
              <span class="mat-caption m-l-4">{{ 'PROJECTS.HEATMAP.INFO.DATASETS_COMPARED' | translate:{ count: datasets.length } }}</span>
            </div>
            <div class="info-item">
              <mat-icon class="text-primary">mouse</mat-icon>
              <span class="mat-caption m-l-4">{{ 'PROJECTS.HEATMAP.INFO.CDN_POWERED' | translate }}</span>
            </div>
          </div>
        </div>

        <!-- Message de chargement -->
        <div *ngIf="isLoadingECharts" class="loading-echarts text-center p-20">
          <mat-icon class="icon-24 text-primary">hourglass_empty</mat-icon>
          <p class="mat-caption m-t-8">{{ 'PROJECTS.HEATMAP.LOADING' | translate }}</p>
        </div>

        <!-- Message si pas de données -->
        <div *ngIf="activeCriteria.length === 0" class="no-data text-center p-20">
          <mat-icon class="icon-48 text-muted">tune</mat-icon>
          <p class="mat-body-1 m-t-12">{{ 'PROJECTS.HEATMAP.NO_DATA' | translate }}</p>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .heatmap-card {
      margin-top: 20px;
      width: 100%;
    }

    .heatmap-content {
      overflow-x: auto;
      overflow-y: hidden;
      width: 100%;
    }

    .echarts-container {
      width: 100% !important;
      min-width: 100%;
      display: block;
    }

    .legend-info {
      .legend-item {
        display: flex;
        align-items: center;
        gap: 8px;

        .legend-color {
          width: 18px;
          height: 16px;
          border-radius: 3px;
          border: 1px solid #ddd;
        }
      }
    }

    .heatmap-info {
      border-top: 1px solid #e0e0e0;
      padding-top: 16px;

      .info-item {
        display: flex;
        align-items: center;
        color: #666;
      }
    }

    .no-data, .loading-echarts {
      .icon-48 {
        font-size: 48px !important;
        width: 48px !important;
        height: 48px !important;
      }
      .icon-24 {
        font-size: 24px !important;
        width: 24px !important;
        height: 24px !important;
      }
    }
  `]
})
export class RecommendationHeatmapComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() datasets: DatasetScored[] = [];
  @Input() weights: CriterionWeight[] = [];
  @ViewChild('chartContainer', { static: false }) chartContainer!: ElementRef;

  activeCriteria: CriterionWeight[] = [];
  private myChart: any = null;
  isLoadingECharts = true;
  componentId: string;

  // Gestion des timers et debouncing
  private updateTimer: any = null;
  private resizeTimer: any = null;
  private resizeObserver: ResizeObserver | null = null;

  // Cache pour éviter les recalculs inutiles
  private lastDatasetLength = 0;
  private lastCriteriaLength = 0;
  private lastDatasetHash = '';

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private translateService: TranslateService
  ) {
    this.componentId = Math.random().toString(36).substr(2, 9);
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Charger ECharts une seule fois au début
      this.loadECharts();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['weights'] || changes['datasets']) {
      this.activeCriteria = this.weights.filter(w => w.weight > 0);
      
      // Vérifier si les données ont réellement changé pour éviter les mises à jour inutiles
      const currentDatasetHash = this.datasets.map(d => d.display_name).sort().join('|');
      const hasDataChanged = 
        this.datasets.length !== this.lastDatasetLength ||
        this.activeCriteria.length !== this.lastCriteriaLength ||
        currentDatasetHash !== this.lastDatasetHash;

      if (hasDataChanged && !this.isLoadingECharts && this.myChart) {
        // Mettre en cache les nouvelles valeurs
        this.lastDatasetLength = this.datasets.length;
        this.lastCriteriaLength = this.activeCriteria.length;
        this.lastDatasetHash = currentDatasetHash;
        
        // Debouncer la mise à jour pour éviter les clignotements
        this.debouncedUpdate();
      }
    }
  }

  ngOnDestroy(): void {
    // Nettoyer tous les timers
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }

    // Nettoyer le ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Nettoyer ECharts
    if (this.myChart && !this.myChart.isDisposed()) {
      this.myChart.dispose();
    }
  }

  getChartHeight(): number {
    const baseHeight = 300;
    const heightPerDataset = 45;
    const maxHeight = 800;
    
    const calculatedHeight = baseHeight + (this.datasets.length * heightPerDataset);
    return Math.min(calculatedHeight, maxHeight);
  }

  /**
   * Debounce des mises à jour pour éviter les clignotements
   */
  private debouncedUpdate(): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    this.updateTimer = setTimeout(() => {
      this.updateChart();
    }, 200); // Délai plus long pour éviter les clignotements
  }

  /**
   * Redimensionnement debounced
   */
  private debouncedResize(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    
    this.resizeTimer = setTimeout(() => {
      if (this.myChart && !this.myChart.isDisposed()) {
        this.myChart.resize();
      }
    }, 100);
  }

  private loadECharts(): void {
    // Vérifier si ECharts est déjà chargé
    if (typeof window !== 'undefined' && window.echarts) {
      this.isLoadingECharts = false;
      this.initChart();
      return;
    }

    // Charger ECharts via CDN
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
    script.onload = () => {
      this.isLoadingECharts = false;
      this.initChart();
    };
    script.onerror = () => {
      console.error('Impossible de charger ECharts depuis le CDN');
      this.isLoadingECharts = false;
    };
    document.head.appendChild(script);
  }

  private initChart(): void {
    if (!this.chartContainer?.nativeElement || !window.echarts) {
      return;
    }

    // Initialiser le graphique seulement une fois
    this.myChart = window.echarts.init(this.chartContainer.nativeElement);
    
    // Configurer le ResizeObserver pour un redimensionnement optimal
    this.setupResizeObserver();

    // Première mise à jour du graphique
    if (this.datasets.length > 0 && this.activeCriteria.length > 0) {
      this.updateChart();
    }
  }

  private setupResizeObserver(): void {
    if (!this.chartContainer?.nativeElement) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.debouncedResize();
    });

    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  private updateChart(): void {
    if (!this.myChart || this.datasets.length === 0 || this.activeCriteria.length === 0) {
      return;
    }

    // Préparer les données pour ECharts heatmap
    const xAxisData = this.activeCriteria.map(c => this.getCriterionLabel(c.criterion_name));
    const yAxisData = this.datasets.map(d => d.display_name);

    // Données de la heatmap sous format [x, y, value]
    const data: (number | string)[][] = [];
    
    this.datasets.forEach((dataset, datasetIndex) => {
      this.activeCriteria.forEach((criterion, criterionIndex) => {
        const score = this.getCriterionScore(dataset, criterion.criterion_name);
        data.push([criterionIndex, datasetIndex, score]);
      });
    });

    // Configuration ECharts optimisée
    const option = {
      animation: false, // Désactiver les animations pour éviter les clignotements
      tooltip: {
        position: (point: number[], params: any, dom: any, rect: any, size: any) => {
          const datasetIndex = params.data[1];
          const totalDatasets = this.datasets.length;
          
          if (datasetIndex < totalDatasets / 3) {
            return [point[0] + 10, point[1] + 20];
          } else if (datasetIndex > (totalDatasets * 2) / 3) {
            return [point[0] + 10, point[1] - size.contentSize[1] - 20];
          } else {
            return [point[0] + 10, point[1] - size.contentSize[1] / 2];
          }
        },
        confine: true,
        backgroundColor: 'rgba(50, 50, 50, 0.95)',
        borderColor: '#4575b4',
        borderWidth: 2,
        borderRadius: 8,
        textStyle: {
          color: '#fff',
          fontSize: 12,
          lineHeight: 20
        },
        extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 240px; word-wrap: break-word; overflow-wrap: break-word;',
        formatter: (params: any) => {
          const criterionIndex = params.data[0];
          const datasetIndex = params.data[1];
          const score = params.data[2];
          
          const criterion = this.activeCriteria[criterionIndex];
          const dataset = this.datasets[datasetIndex];
          
          const scoreColor = score >= 0.85 ? '#4575b4' : 
                            score >= 0.60 ? '#66c2a5' : 
                            score >= 0.30 ? '#fdae61' : '#d73027';
          
          const truncateText = (text: string, maxLength: number) => {
            if (!text || text.length <= maxLength) return text;
            return text.substring(0, maxLength).trim() + '...';
          };

          return `
            <div style="padding: 8px; line-height: 1.3; max-width: 220px; word-wrap: break-word; overflow-wrap: break-word;">
              <div style="font-weight: bold; color: #4fc3f7; margin-bottom: 6px; font-size: 12px; word-wrap: break-word;">
                ${truncateText(dataset.display_name, 25)}
              </div>
              <div style="margin-bottom: 5px;">
                <strong style="color: #fff; font-size: 11px;">${this.getCriterionLabel(criterion.criterion_name)}</strong>
              </div>
              <div style="margin-bottom: 6px;">
                Score: <strong style="color: ${scoreColor}; font-size: 13px;">${(score * 100).toFixed(1)}%</strong>
                <span style="margin-left: 8px; color: #ccc; font-size: 10px;">
                  (${(criterion.weight * 100).toFixed(0)}%)
                </span>
              </div>
              <hr style="margin: 6px 0; border: none; border-top: 1px solid #666;">
              <div style="color: #ccc; font-size: 10px; word-wrap: break-word;">
                <div>📊 ${dataset.instances_number?.toLocaleString() || 'N/A'} inst.</div>
                ${dataset.features_number ? `<div>📋 ${dataset.features_number} var.</div>` : ''}
                ${dataset.objective ? `<div style="margin-top: 3px; font-style: italic; word-wrap: break-word; overflow-wrap: break-word;">🎯 ${truncateText(dataset.objective, 35)}</div>` : ''}
              </div>
            </div>
          `;
        }
      },
      grid: {
        height: '70%',
        top: '10%',
        left: '25%',
        right: '5%',
        bottom: '20%'
      },
      xAxis: {
        type: 'category',
        data: xAxisData,
        splitArea: {
          show: true
        },
        axisLabel: {
          rotate: 45,
          fontSize: 12,
          color: '#333',
          fontWeight: '500',
          margin: 8
        }
      },
      yAxis: {
        type: 'category',
        data: yAxisData,
        splitArea: {
          show: true
        },
        axisLabel: {
          fontSize: 12,
          color: '#333',
          width: 200,
          overflow: 'break',
          lineHeight: 14,
          fontWeight: '500'
        }
      },
      visualMap: {
        min: 0,
        max: 1,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: '5%',
        inRange: {
          color: [
            '#ffebee',
            '#ffcdd2',
            '#fff3e0',
            '#ffe0b2',
            '#e8f5e8',
            '#c8e6c9',
            '#e3f2fd',
            '#2196f3'
          ]
        },
        text: [
          this.translateService.instant('PROJECTS.HEATMAP.VISUAL_MAP_HIGH'),
          this.translateService.instant('PROJECTS.HEATMAP.VISUAL_MAP_LOW')
        ],
        textStyle: {
          color: '#333',
          fontSize: 12,
          fontWeight: '500'
        }
      },
      series: [
        {
          name: this.translateService.instant('PROJECTS.HEATMAP.SERIES_NAME'),
          type: 'heatmap',
          data: data,
          label: {
            show: true,
            formatter: (params: any) => `${(params.data[2] * 100).toFixed(0)}%`,
            fontSize: 11,
            color: '#333',
            fontWeight: 'bold'
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          },
          itemStyle: {
            borderWidth: 1,
            borderColor: '#fff'
          }
        }
      ]
    };

    // Appliquer la configuration à ECharts
    this.myChart.setOption(option, true);
  }

  getCriterionLabel(criterionName: string): string {
    const translationKey = `PROJECTS.HEATMAP.CRITERIA_LABELS.${criterionName.toUpperCase()}`;
    const translated = this.translateService.instant(translationKey);
    
    if (translated === translationKey) {
      return criterionName.replace('_', ' ').toUpperCase();
    }
    
    return translated;
  }

  getCriterionScore(dataset: DatasetScored, criterionName: string): number {
    // Vérifie d'abord si le dataset a des scores pré-calculés (DatasetScoredWithDetails)
    const datasetWithDetails = dataset as any;
    if (datasetWithDetails.criterion_scores && datasetWithDetails.criterion_scores[criterionName] !== undefined) {
      return datasetWithDetails.criterion_scores[criterionName];
    }

    // ✅ CORRECTION : Utiliser exactement les mêmes calculs que le backend
    // Voir service-selection/app/main.py ligne 2427-2442
    switch (criterionName) {
      case 'ethical_score':
        return this.calculateEthicalScore(dataset);
        
      case 'technical_score':
        return this.calculateTechnicalScore(dataset);
        
      case 'popularity_score':
        return this.calculatePopularityScore(dataset);
        
      case 'anonymization':
        return (dataset.anonymization_applied === true) ? 1.0 : 0.0;
        
      case 'transparency':
        return (dataset.transparency === true) ? 1.0 : 0.0;
        
      case 'informed_consent':
        return (dataset.informed_consent === true) ? 1.0 : 0.0;
        
      case 'documentation':
        // Backend: metadata_provided_with_dataset OR external_documentation_available
        return (dataset.metadata_provided_with_dataset || dataset.external_documentation_available) ? 1.0 : 0.0;
        
      case 'data_quality':
        return this.calculateDataQualityScore(dataset);
        
      case 'instances_count':
        // Backend: min(1.0, math.log10(max(1, dataset.instances_number or 1)) / 5)
        return dataset.instances_number ? 
          Math.min(1.0, Math.log10(Math.max(1, dataset.instances_number)) / 5) : 0.0;
          
      case 'features_count':
        // Backend: min(1.0, (dataset.features_number or 0) / 100)
        return dataset.features_number ? 
          Math.min(1.0, (dataset.features_number || 0) / 100) : 0.0;
          
      case 'citations':
        // Backend: calculate_popularity_score(dataset)
        return this.calculatePopularityScore(dataset);
        
      case 'year':
        // Backend: min(1.0, max(0.0, ((dataset.year or 2000) - 2000) / 24))
        return dataset.year ? 
          Math.min(1.0, Math.max(0.0, ((dataset.year || 2000) - 2000) / 24)) : 0.0;
          
      default:
        console.warn(`⚠️ Critère inconnu dans la heatmap: ${criterionName}`);
        return 0.0; // Plus de valeurs aléatoires, retourner 0 pour les critères inconnus
    }
  }

  private calculateEthicalScore(dataset: DatasetScored): number {
    // ✅ CORRECTION : Utiliser exactement les mêmes 10 critères que le backend
    // Voir service-selection/app/main.py ligne 1636-1647
    const ethicalCriteria = [
      dataset.informed_consent,                    // Consentement éclairé
      dataset.transparency,                        // Transparence
      dataset.user_control,                        // Contrôle utilisateur
      dataset.equity_non_discrimination,           // Non-discrimination
      dataset.security_measures_in_place,          // Mesures de sécurité
      dataset.data_quality_documented,             // Qualité documentée
      dataset.anonymization_applied,               // Anonymisation appliquée
      dataset.record_keeping_policy_exists,        // Politique de conservation
      dataset.purpose_limitation_respected,        // Limitation de finalité
      dataset.accountability_defined               // Responsabilité définie
    ];
    
    // Compter les critères respectés (True) - même logique que le backend
    let positiveCount = 0;
    let totalCriteria = 0;
    
    ethicalCriteria.forEach(criterion => {
      if (criterion !== undefined && criterion !== null) {
        totalCriteria++;
        if (criterion === true) {
          positiveCount++;
        }
      }
    });
    
    // Retourner le pourcentage (0.0 à 1.0) comme le backend
    return totalCriteria > 0 ? (positiveCount / totalCriteria) : 0.0;
  }

  private calculateTechnicalScore(dataset: DatasetScored): number {
    // ✅ CORRECTION : Utiliser exactement le même calcul que le backend
    // Voir service-selection/app/main.py ligne 1656-1720
    let score = 0.0;
    let maxScore = 0.0;
    
    // Documentation (poids: 0.3)
    if (dataset.metadata_provided_with_dataset !== null && dataset.metadata_provided_with_dataset !== undefined) {
      maxScore += 0.15;
      if (dataset.metadata_provided_with_dataset) {
        score += 0.15;
      }
    }
    
    if (dataset.external_documentation_available !== null && dataset.external_documentation_available !== undefined) {
      maxScore += 0.15;
      if (dataset.external_documentation_available) {
        score += 0.15;
      }
    }
    
    // Qualité des données (poids: 0.4)
    if (dataset.has_missing_values !== null && dataset.has_missing_values !== undefined) {
      maxScore += 0.2;
      if (!dataset.has_missing_values) {
        score += 0.2;
      } else if (dataset.global_missing_percentage !== null && dataset.global_missing_percentage !== undefined) {
        // Score dégressif selon le pourcentage de valeurs manquantes
        const missingScore = Math.max(0, (100 - dataset.global_missing_percentage) / 100);
        score += 0.2 * missingScore;
      }
    }
    
    if (dataset.split !== null && dataset.split !== undefined) {
      maxScore += 0.2;
      if (dataset.split) {
        score += 0.2;
      }
    }
    
    // Taille et richesse (poids: 0.3)
    if (dataset.instances_number !== null && dataset.instances_number !== undefined) {
      maxScore += 0.15;
      if (dataset.instances_number > 0) {
        // Score logarithmique pour le nombre d'instances
        const logInstances = Math.log10(Math.max(1, dataset.instances_number));
        const normalizedScore = Math.min(1.0, Math.max(0.0, (logInstances - 2) / 3)); // log10(100) = 2, log10(100000) = 5
        score += 0.15 * normalizedScore;
      }
    }
    
    if (dataset.features_number !== null && dataset.features_number !== undefined) {
      maxScore += 0.15;
      if (dataset.features_number > 0) {
        // Score logarithmique pour le nombre de features
        const logFeatures = Math.log10(Math.max(1, dataset.features_number));
        const normalizedScore = Math.min(1.0, Math.max(0.0, (logFeatures - 1) / 2)); // log10(10) = 1, log10(1000) = 3
        score += 0.15 * normalizedScore;
      }
    }
    
    return maxScore > 0 ? (score / maxScore) : 0.0;
  }

  private calculatePopularityScore(dataset: DatasetScored): number {
    // ✅ CORRECTION : Utiliser exactement le même calcul que le backend
    // Voir service-selection/app/main.py ligne 1723-1741
    if (!dataset.num_citations || dataset.num_citations <= 0) {
      return 0.0;
    }
    
    // Score logarithmique pour les citations
    // Score max pour 1000+ citations, score min pour 1 citation
    const logCitations = Math.log10(dataset.num_citations);
    const normalizedScore = Math.min(1.0, Math.max(0.0, logCitations / 3)); // log10(1000) = 3
    
    return normalizedScore;
  }

  private calculateDataQualityScore(dataset: DatasetScored): number {
    // ✅ CORRECTION : Utiliser exactement le même calcul que le backend
    // Voir service-selection/app/main.py ligne 2435-2437
    if (!dataset.has_missing_values) {
      return 1.0;
    } else if (dataset.global_missing_percentage !== null && dataset.global_missing_percentage !== undefined) {
      return (100 - (dataset.global_missing_percentage || 0)) / 100;
    } else {
      return 0.5;
    }
  }
} 
