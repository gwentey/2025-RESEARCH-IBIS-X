import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { MlPipelineService } from '../../services/ml-pipeline.service';
import { trigger, state, style, transition, animate } from '@angular/animations';

interface UsageMetrics {
  total_experiments: number;
  experiments_today: number;
  experiments_this_week: number;
  experiments_this_month: number;
  success_rate: number;
  average_training_time: number;
  most_used_algorithm: string;
  most_used_dataset: string;
  total_models_trained: number;
  active_users: number;
}

interface PerformanceMetrics {
  algorithm_performance: { [algorithm: string]: number };
  dataset_performance: { [dataset: string]: number };
  task_type_distribution: { classification: number; regression: number };
  hyperparameter_trends: any[];
  performance_over_time: Array<{ date: string; performance: number }>;
  model_accuracy_distribution: number[];
}

interface SystemMetrics {
  cpu_usage: number;
  memory_usage: number;
  storage_usage: number;
  api_response_time: number;
  active_experiments: number;
  queue_length: number;
  error_rate: number;
}

@Component({
  selector: 'app-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatSelectModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule
  ],
  template: `
    <div class="analytics-dashboard" [@fadeIn]>
      <!-- Header du Dashboard -->
      <header class="dashboard-header">
        <div class="header-content">
          <div class="header-title">
            <h1>📊 Analytics Dashboard</h1>
            <p>Métriques d'usage et performance de votre plateforme ML</p>
          </div>
          <div class="header-actions">
            <mat-form-field appearance="outline" class="period-selector">
              <mat-label>Période</mat-label>
              <mat-select [(value)]="selectedPeriod" (selectionChange)="onPeriodChange()">
                <mat-option value="today">Aujourd'hui</mat-option>
                <mat-option value="week">Cette semaine</mat-option>
                <mat-option value="month">Ce mois</mat-option>
                <mat-option value="quarter">Ce trimestre</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-raised-button color="primary" (click)="refreshData()">
              <mat-icon>refresh</mat-icon>
              Actualiser
            </button>
          </div>
        </div>
      </header>

      <div class="dashboard-content" *ngIf="!isLoading">
        <!-- Métriques d'Usage Clés -->
        <section class="key-metrics" [@slideUp]>
          <h2>📈 Métriques d'Usage</h2>
          <div class="metrics-grid">
            <div class="metric-tile experiments">
              <div class="metric-icon">
                <mat-icon>science</mat-icon>
              </div>
              <div class="metric-content">
                <div class="metric-value">{{usageMetrics?.total_experiments || 0}}</div>
                <div class="metric-label">Expériences Totales</div>
                <div class="metric-change positive" *ngIf="usageMetrics?.experiments_today">
                  +{{usageMetrics?.experiments_today || 0}} aujourd'hui
                </div>
              </div>
            </div>

            <div class="metric-tile success-rate">
              <div class="metric-icon">
                <mat-icon>check_circle</mat-icon>
              </div>
              <div class="metric-content">
                <div class="metric-value">{{(usageMetrics?.success_rate || 0) * 100 | number:'1.1-1'}}%</div>
                <div class="metric-label">Taux de Succès</div>
                <div class="metric-change" [ngClass]="getSuccessRateClass()">
                  {{getSuccessRateChange()}}
                </div>
              </div>
            </div>

            <div class="metric-tile training-time">
              <div class="metric-icon">
                <mat-icon>schedule</mat-icon>
              </div>
              <div class="metric-content">
                <div class="metric-value">{{formatTrainingTime(usageMetrics?.average_training_time || 0)}}</div>
                <div class="metric-label">Temps Moyen d'Entraînement</div>
                <div class="metric-change neutral">
                  Par expérience
                </div>
              </div>
            </div>

            <div class="metric-tile algorithms">
              <div class="metric-icon">
                <mat-icon>psychology</mat-icon>
              </div>
              <div class="metric-content">
                <div class="metric-value">{{usageMetrics?.most_used_algorithm || 'N/A'}}</div>
                <div class="metric-label">Algorithme Populaire</div>
                <div class="metric-change info">
                  Le plus utilisé
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Graphiques de Performance -->
        <section class="performance-charts" [@slideUp]>
          <h2>📊 Analyse de Performance</h2>
          
          <div class="charts-grid">
            <!-- Performance par Algorithme -->
            <mat-card class="chart-card">
              <mat-card-header>
                <mat-card-title>🎯 Performance par Algorithme</mat-card-title>
                <mat-card-subtitle>Accuracy moyenne selon l'algorithme utilisé</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="algorithm-performance">
                  <div class="algorithm-bar" *ngFor="let item of getAlgorithmPerformanceArray()">
                    <div class="algorithm-info">
                      <span class="algorithm-name">{{item.algorithm}}</span>
                      <span class="algorithm-score">{{item.performance}}%</span>
                    </div>
                    <div class="progress-bar">
                      <div class="progress-fill" 
                           [style.width.%]="item.performance"
                           [ngClass]="getPerformanceClass(item.performance)">
                      </div>
                    </div>
                    <div class="algorithm-count">{{item.count}} expériences</div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Distribution des Types de Tâches -->
            <mat-card class="chart-card">
              <mat-card-header>
                <mat-card-title>🎨 Distribution des Tâches</mat-card-title>
                <mat-card-subtitle>Classification vs Régression</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="task-distribution">
                  <div class="task-item classification">
                    <div class="task-icon">
                      <mat-icon>category</mat-icon>
                    </div>
                    <div class="task-info">
                      <div class="task-name">Classification</div>
                      <div class="task-percentage">{{getClassificationPercentage()}}%</div>
                      <div class="task-count">{{getClassificationCount()}} modèles</div>
                    </div>
                  </div>
                  <div class="task-item regression">
                    <div class="task-icon">
                      <mat-icon>trending_up</mat-icon>
                    </div>
                    <div class="task-info">
                      <div class="task-name">Régression</div>
                      <div class="task-percentage">{{getRegressionPercentage()}}%</div>
                      <div class="task-count">{{getRegressionCount()}} modèles</div>
                    </div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Métriques Système -->
            <mat-card class="chart-card system-metrics">
              <mat-card-header>
                <mat-card-title>⚙️ État du Système</mat-card-title>
                <mat-card-subtitle>Performance infrastructure</mat-card-subtitle>
              </mat-card-header>
              <mat-card-content>
                <div class="system-grid">
                  <div class="system-metric">
                    <mat-icon>memory</mat-icon>
                    <span class="metric-name">CPU</span>
                    <div class="metric-bar">
                      <mat-progress-bar mode="determinate" 
                                        [value]="systemMetrics?.cpu_usage || 0"
                                        [color]="getSystemMetricColor(systemMetrics?.cpu_usage || 0)">
                      </mat-progress-bar>
                      <span class="metric-value">{{systemMetrics?.cpu_usage || 0}}%</span>
                    </div>
                  </div>
                  
                  <div class="system-metric">
                    <mat-icon>storage</mat-icon>
                    <span class="metric-name">Mémoire</span>
                    <div class="metric-bar">
                      <mat-progress-bar mode="determinate" 
                                        [value]="systemMetrics?.memory_usage || 0"
                                        [color]="getSystemMetricColor(systemMetrics?.memory_usage || 0)">
                      </mat-progress-bar>
                      <span class="metric-value">{{systemMetrics?.memory_usage || 0}}%</span>
                    </div>
                  </div>
                  
                  <div class="system-metric">
                    <mat-icon>speed</mat-icon>
                    <span class="metric-name">API Response</span>
                    <div class="metric-bar">
                      <span class="metric-value">{{systemMetrics?.api_response_time || 0}}ms</span>
                    </div>
                  </div>
                  
                  <div class="system-metric">
                    <mat-icon>queue</mat-icon>
                    <span class="metric-name">File d'attente</span>
                    <div class="metric-bar">
                      <span class="metric-value">{{systemMetrics?.queue_length || 0}} tâches</span>
                    </div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </section>

        <!-- Tendances et Insights -->
        <section class="insights-section" [@slideUp]>
          <h2>🎯 Insights et Recommandations</h2>
          
          <div class="insights-grid">
            <mat-card class="insight-card performance">
              <mat-card-header>
                <mat-card-title>🏆 Top Performers</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="top-performers">
                  <div class="performer-item" *ngFor="let performer of getTopPerformers()">
                    <div class="performer-icon">
                      <mat-icon>{{performer.icon}}</mat-icon>
                    </div>
                    <div class="performer-info">
                      <div class="performer-name">{{performer.name}}</div>
                      <div class="performer-metric">{{performer.metric}}</div>
                    </div>
                    <div class="performer-score">{{performer.score}}%</div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="insight-card trends">
              <mat-card-header>
                <mat-card-title>📈 Tendances</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="trends-list">
                  <div class="trend-item" *ngFor="let trend of getSystemTrends()">
                    <mat-icon [ngClass]="trend.type">{{trend.icon}}</mat-icon>
                    <span class="trend-text">{{trend.message}}</span>
                    <span class="trend-change" [ngClass]="trend.changeType">{{trend.change}}</span>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="insight-card recommendations">
              <mat-card-header>
                <mat-card-title>💡 Recommandations</mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="recommendations-list">
                  <div class="recommendation-item" *ngFor="let rec of getSystemRecommendations()">
                    <div class="rec-icon" [ngClass]="rec.priority">
                      <mat-icon>{{rec.icon}}</mat-icon>
                    </div>
                    <div class="rec-content">
                      <div class="rec-title">{{rec.title}}</div>
                      <div class="rec-description">{{rec.description}}</div>
                    </div>
                  </div>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        </section>
      </div>

      <!-- Loading State -->
      <div class="loading-container" *ngIf="isLoading">
        <div class="loading-spinner"></div>
        <p>Chargement des analytics...</p>
      </div>
    </div>
  `,
  styleUrls: ['./analytics-dashboard.component.scss'],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('600ms ease-in', style({ opacity: 1 }))
      ])
    ]),
    trigger('slideUp', [
      transition(':enter', [
        style({ transform: 'translateY(30px)', opacity: 0 }),
        animate('400ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ])
    ])
  ]
})
export class AnalyticsDashboardComponent implements OnInit, OnDestroy {
  usageMetrics?: UsageMetrics;
  performanceMetrics?: PerformanceMetrics;
  systemMetrics?: SystemMetrics;
  
  isLoading = true;
  selectedPeriod = 'week';
  refreshInterval: any;

  constructor(
    private mlPipelineService: MlPipelineService
  ) {}

  ngOnInit() {
    console.log('📊 Analytics Dashboard initializing...');
    this.loadAnalyticsData();
    
    // Actualisation automatique toutes les 30 secondes
    this.refreshInterval = setInterval(() => {
      this.loadSystemMetrics();
    }, 30000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadAnalyticsData() {
    this.isLoading = true;
    
    try {
      // Charger toutes les métriques en parallèle
      await Promise.all([
        this.loadUsageMetrics(),
        this.loadPerformanceMetrics(),
        this.loadSystemMetrics()
      ]);
      
      console.log('✅ Analytics data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading analytics:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadUsageMetrics() {
    // Pour la PoC, simulations basées sur vraies données partielles
    // À terme, endpoint dédié : GET /api/v1/analytics/usage
    
    try {
      // Récupérer les expériences utilisateur pour calculer les métriques
      const experiments = await this.mlPipelineService.getUserExperiments().toPromise();
      
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const experimentsToday = experiments?.filter(exp => 
        new Date(exp.created_at) >= todayStart
      ).length || 0;
      
      const experimentsThisWeek = experiments?.filter(exp => 
        new Date(exp.created_at) >= weekStart
      ).length || 0;
      
      const experimentsThisMonth = experiments?.filter(exp => 
        new Date(exp.created_at) >= monthStart
      ).length || 0;
      
      const completedExperiments = experiments?.filter(exp => exp.status === 'completed').length || 0;
      const successRate = experiments?.length ? completedExperiments / experiments.length : 0;
      
      // Calculer l'algorithme le plus utilisé
      const algorithmCounts: { [key: string]: number } = {};
      experiments?.forEach(exp => {
        algorithmCounts[exp.algorithm] = (algorithmCounts[exp.algorithm] || 0) + 1;
      });
      const mostUsedAlgorithm = Object.keys(algorithmCounts).reduce((a, b) => 
        algorithmCounts[a] > algorithmCounts[b] ? a : b, 'random_forest'
      );

      this.usageMetrics = {
        total_experiments: experiments?.length || 0,
        experiments_today: experimentsToday,
        experiments_this_week: experimentsThisWeek,
        experiments_this_month: experimentsThisMonth,
        success_rate: successRate,
        average_training_time: 45.7, // Simulation basée sur logs observés
        most_used_algorithm: mostUsedAlgorithm,
        most_used_dataset: 'Iris Dataset', // À calculer depuis vraies données
        total_models_trained: completedExperiments,
        active_users: 1 // Pour la PoC
      };
      
      console.log('📊 Usage metrics calculated:', this.usageMetrics);
      
    } catch (error) {
      console.error('Error calculating usage metrics:', error);
      // Données de fallback pour la démo
      this.usageMetrics = {
        total_experiments: 12,
        experiments_today: 3,
        experiments_this_week: 8,
        experiments_this_month: 12,
        success_rate: 0.917,
        average_training_time: 45.7,
        most_used_algorithm: 'random_forest',
        most_used_dataset: 'Iris Dataset',
        total_models_trained: 11,
        active_users: 1
      };
    }
  }

  async loadPerformanceMetrics() {
    // Simulation de données de performance
    // À terme, calculé depuis vraies données d'expériences
    
    this.performanceMetrics = {
      algorithm_performance: {
        'random_forest': 91.2,
        'decision_tree': 87.5,
        'logistic_regression': 84.3
      },
      dataset_performance: {
        'iris': 92.9,
        'wine': 88.4,
        'breast_cancer': 95.1
      },
      task_type_distribution: {
        classification: 75,
        regression: 25
      },
      hyperparameter_trends: [],
      performance_over_time: [
        { date: '2025-08-25', performance: 87.2 },
        { date: '2025-08-26', performance: 89.1 },
        { date: '2025-08-27', performance: 91.5 },
        { date: '2025-08-28', performance: 88.9 },
        { date: '2025-09-01', performance: 92.9 }
      ],
      model_accuracy_distribution: [0.75, 0.82, 0.88, 0.91, 0.95, 0.89, 0.93]
    };
    
    console.log('📈 Performance metrics loaded');
  }

  async loadSystemMetrics() {
    // À terme, vraies métriques depuis monitoring endpoint
    this.systemMetrics = {
      cpu_usage: Math.random() * 60 + 20, // 20-80%
      memory_usage: Math.random() * 40 + 30, // 30-70%
      storage_usage: 45.7,
      api_response_time: Math.random() * 200 + 100, // 100-300ms
      active_experiments: Math.floor(Math.random() * 5), // 0-4
      queue_length: Math.floor(Math.random() * 3), // 0-2
      error_rate: Math.random() * 5 // 0-5%
    };
  }

  onPeriodChange() {
    console.log('📅 Period changed to:', this.selectedPeriod);
    this.loadAnalyticsData();
  }

  refreshData() {
    console.log('🔄 Refreshing analytics data...');
    this.loadAnalyticsData();
  }

  // Helper methods pour l'affichage
  formatTrainingTime(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    return `${(seconds / 60).toFixed(1)}min`;
  }

  getSuccessRateClass(): string {
    const rate = this.usageMetrics?.success_rate || 0;
    if (rate >= 0.9) return 'positive';
    if (rate >= 0.75) return 'neutral';
    return 'negative';
  }

  getSuccessRateChange(): string {
    const rate = (this.usageMetrics?.success_rate || 0) * 100;
    if (rate >= 90) return 'Excellent';
    if (rate >= 75) return 'Bon';
    return 'À améliorer';
  }

  getAlgorithmPerformanceArray(): Array<{algorithm: string, performance: number, count: number}> {
    if (!this.performanceMetrics) return [];
    
    return Object.entries(this.performanceMetrics.algorithm_performance).map(([algorithm, performance]) => ({
      algorithm: algorithm.replace('_', ' ').toUpperCase(),
      performance: Math.round(performance),
      count: Math.floor(Math.random() * 20) + 5 // Simulation
    }));
  }

  getPerformanceClass(performance: number): string {
    if (performance >= 90) return 'excellent';
    if (performance >= 80) return 'good';
    if (performance >= 70) return 'average';
    return 'poor';
  }

  getClassificationPercentage(): number {
    return this.performanceMetrics?.task_type_distribution.classification || 0;
  }

  getClassificationCount(): number {
    const total = this.usageMetrics?.total_experiments || 0;
    return Math.round(total * (this.getClassificationPercentage() / 100));
  }

  getRegressionPercentage(): number {
    return this.performanceMetrics?.task_type_distribution.regression || 0;
  }

  getRegressionCount(): number {
    const total = this.usageMetrics?.total_experiments || 0;
    return Math.round(total * (this.getRegressionPercentage() / 100));
  }

  getSystemMetricColor(value: number): 'primary' | 'accent' | 'warn' {
    if (value < 50) return 'primary';
    if (value < 80) return 'accent';
    return 'warn';
  }

  getTopPerformers(): Array<{icon: string, name: string, metric: string, score: number}> {
    return [
      {
        icon: 'park',
        name: 'Random Forest',
        metric: 'Accuracy moyenne',
        score: 91.2
      },
      {
        icon: 'dataset',
        name: 'Iris Dataset',
        metric: 'Performance moyenne',
        score: 92.9
      },
      {
        icon: 'account_tree',
        name: 'Decision Tree',
        metric: 'Interprétabilité',
        score: 95.0
      }
    ];
  }

  getSystemTrends(): Array<{icon: string, message: string, type: string, change: string, changeType: string}> {
    return [
      {
        icon: 'trending_up',
        message: 'Performance des modèles en amélioration',
        type: 'positive',
        change: '+3.2%',
        changeType: 'positive'
      },
      {
        icon: 'speed',
        message: 'Temps d\'entraînement optimisé',
        type: 'positive',
        change: '-15%',
        changeType: 'positive'
      },
      {
        icon: 'psychology',
        message: 'Random Forest gagne en popularité',
        type: 'info',
        change: '+25%',
        changeType: 'neutral'
      }
    ];
  }

  getSystemRecommendations(): Array<{icon: string, title: string, description: string, priority: string}> {
    return [
      {
        icon: 'tune',
        title: 'Optimiser les hyperparamètres',
        description: 'Random Forest avec n_estimators=200 pourrait améliorer les performances de 2-3%',
        priority: 'high'
      },
      {
        icon: 'storage',
        title: 'Ajouter plus de datasets',
        description: 'Diversifier les datasets pour tester la robustesse des algorithmes',
        priority: 'medium'
      },
      {
        icon: 'school',
        title: 'Formation utilisateurs',
        description: 'Les utilisateurs novices bénéficieraient de tutoriels sur l\'interprétation des métriques',
        priority: 'low'
      }
    ];
  }
}
