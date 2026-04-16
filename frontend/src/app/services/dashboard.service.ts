import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map, catchError, of } from 'rxjs';
import { MlPipelineService } from './ml-pipeline.service';
import { ProjectService } from './project.service';
import { DatasetService } from './dataset.service';
import { XAIService } from './xai.service';
import { ExperimentRead, ExperimentStatus } from '../models/ml-pipeline.models';
import { Project } from '../models/project.models';
import { Dataset } from '../models/dataset.models';

export interface DashboardMetrics {
  totalExperiments: number;
  activeProjects: number;
  successRate: number;
  avgTrainingTime: number;
  totalDatasets: number;
  completedExperiments: number;
  failedExperiments: number;
  runningExperiments: number;
}

export interface DashboardActivity {
  id: string;
  type: 'experiment' | 'project' | 'dataset' | 'explanation';
  title: string;
  description: string;
  status: 'completed' | 'running' | 'failed' | 'pending';
  timestamp: string;
  icon: string;
  color: string;
  link?: string;
  metadata?: Record<string, any>;
}

export interface DashboardStats {
  experimentsThisWeek: number;
  experimentsLastWeek: number;
  projectsThisMonth: number;
  datasetsAdded: number;
  avgAccuracy: number;
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: 'primary' | 'warning' | 'success' | 'accent';
  route: string;
  enabled: boolean;
}

export interface TutorialVideo {
  id: string;
  title: string;
  description: string;
  youtubeUrl: string;
  thumbnailUrl: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  
  private readonly tutorialVideos: TutorialVideo[] = [
    {
      id: '1',
      title: 'DASHBOARD.TUTORIALS.VIDEO_1.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_1.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=bdW0e8LF9vI',
      thumbnailUrl: 'https://img.youtube.com/vi/bdW0e8LF9vI/maxresdefault.jpg',
      duration: '25:30',
      difficulty: 'intermediate'
    },
    {
      id: '2',
      title: 'DASHBOARD.TUTORIALS.VIDEO_2.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_2.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=MQ6fFDwjuco',
      thumbnailUrl: 'https://img.youtube.com/vi/MQ6fFDwjuco/maxresdefault.jpg',
      duration: '15:45',
      difficulty: 'beginner'
    },
    {
      id: '3',
      title: 'DASHBOARD.TUTORIALS.VIDEO_3.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_3.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=QQN5NjJtUcc',
      thumbnailUrl: 'https://img.youtube.com/vi/QQN5NjJtUcc/maxresdefault.jpg',
      duration: '22:15',
      difficulty: 'intermediate'
    },
    {
      id: '4',
      title: 'DASHBOARD.TUTORIALS.VIDEO_4.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_4.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=ZVR2Way4nwQ',
      thumbnailUrl: 'https://img.youtube.com/vi/ZVR2Way4nwQ/maxresdefault.jpg',
      duration: '18:45',
      difficulty: 'beginner'
    },
    {
      id: '5',
      title: 'DASHBOARD.TUTORIALS.VIDEO_5.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_5.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=gkXX4h3qYm4',
      thumbnailUrl: 'https://img.youtube.com/vi/gkXX4h3qYm4/maxresdefault.jpg',
      duration: '12:30',
      difficulty: 'intermediate'
    },
    {
      id: '6',
      title: 'DASHBOARD.TUTORIALS.VIDEO_6.TITLE',
      description: 'DASHBOARD.TUTORIALS.VIDEO_6.DESCRIPTION',
      youtubeUrl: 'https://www.youtube.com/watch?v=T-D1OfcDW1M',
      thumbnailUrl: 'https://img.youtube.com/vi/T-D1OfcDW1M/maxresdefault.jpg',
      duration: '16:20',
      difficulty: 'advanced'
    }
  ];

  private readonly quickActions: QuickAction[] = [
    {
      id: 'new-project',
      title: 'DASHBOARD.QUICK_ACTIONS.NEW_PROJECT.TITLE',
      description: 'DASHBOARD.QUICK_ACTIONS.NEW_PROJECT.DESCRIPTION',
      icon: 'plus',
      color: 'primary',
      route: '/app/projects/new',
      enabled: true
    },
    {
      id: 'browse-datasets',
      title: 'DASHBOARD.QUICK_ACTIONS.BROWSE_DATASETS.TITLE',
      description: 'DASHBOARD.QUICK_ACTIONS.BROWSE_DATASETS.DESCRIPTION',
      icon: 'database',
      color: 'success',
      route: '/app/datasets',
      enabled: true
    },
    {
      id: 'train-model',
      title: 'DASHBOARD.QUICK_ACTIONS.TRAIN_MODEL.TITLE',
      description: 'DASHBOARD.QUICK_ACTIONS.TRAIN_MODEL.DESCRIPTION',
      icon: 'brain',
      color: 'warning',
      route: '/app/ml-pipeline',
      enabled: true
    },
    {
      id: 'view-explanations',
      title: 'DASHBOARD.QUICK_ACTIONS.VIEW_EXPLANATIONS.TITLE',
      description: 'DASHBOARD.QUICK_ACTIONS.VIEW_EXPLANATIONS.DESCRIPTION',
      icon: 'bulb',
      color: 'accent',
      route: '/app/xai-explanation',
      enabled: true
    }
  ];

  constructor(
    private http: HttpClient,
    private mlPipelineService: MlPipelineService,
    private projectService: ProjectService,
    private datasetService: DatasetService,
    private xaiService: XAIService
  ) {}

  /**
   * Récupère les métriques principales du dashboard
   */
  getDashboardMetrics(): Observable<DashboardMetrics> {
    return forkJoin({
      experiments: this.mlPipelineService.getUserExperiments().pipe(catchError(() => of([]))),
      projects: this.projectService.getProjects().pipe(catchError(() => of([]))),
      datasets: this.datasetService.getDatasetStats().pipe(catchError(() => of({ total_datasets: 0 } as any)))
    }).pipe(
      map(({ experiments, projects, datasets }) => {
        const completedExperiments = experiments.filter(exp => exp.status === 'completed').length;
        const failedExperiments = experiments.filter(exp => exp.status === 'failed').length;
        const runningExperiments = experiments.filter(exp => exp.status === 'running').length;
        
        const successRate = experiments.length > 0 
          ? (completedExperiments / experiments.length) * 100 
          : 0;

        const avgTrainingTime = completedExperiments > 0 
          ? experiments
              .filter(exp => exp.status === 'completed' && exp.training_duration)
              .reduce((sum, exp) => sum + (exp.training_duration || 0), 0) / completedExperiments
          : 0;

        // Gérer les deux types possibles pour projects
        const projectsArray = Array.isArray(projects) ? projects : (projects as any).projects || [];
        const totalDatasets = (datasets as any).total_datasets || datasets.total_datasets || 0;

        return {
          totalExperiments: experiments.length,
          activeProjects: projectsArray.length,
          successRate: Math.round(successRate),
          avgTrainingTime: Math.round(avgTrainingTime),
          totalDatasets,
          completedExperiments,
          failedExperiments,
          runningExperiments
        };
      })
    );
  }

  /**
   * Récupère les activités récentes pour le dashboard
   */
  getRecentActivities(limit: number = 10): Observable<DashboardActivity[]> {
    return forkJoin({
      experiments: this.mlPipelineService.getUserExperiments().pipe(catchError(() => of([]))),
      projects: this.projectService.getProjects().pipe(catchError(() => of([])))
    }).pipe(
      map(({ experiments, projects }) => {
        const activities: DashboardActivity[] = [];

        // Ajouter les expériences récentes
        experiments.slice(0, limit).forEach(exp => {
          const activity: DashboardActivity = {
            id: `exp-${exp.id}`,
            type: 'experiment',
            title: `DASHBOARD.RECENT_ACTIVITIES.EXPERIMENT.${exp.status.toUpperCase()}`,
            description: `DASHBOARD.RECENT_ACTIVITIES.EXPERIMENT.DESCRIPTION`,
            status: exp.status as any,
            timestamp: exp.created_at,
            icon: this.getExperimentIcon(exp.status),
            color: this.getExperimentColor(exp.status),
            link: `/app/ml-pipeline/results/${exp.id}`,
            metadata: {
              algorithm: exp.algorithm,
              dataset_id: exp.dataset_id,
              accuracy: exp.metrics && exp.metrics['accuracy'] ? exp.metrics['accuracy'] : null
            }
          };
          activities.push(activity);
        });

        // Ajouter les projets récents
        const projectsArray = Array.isArray(projects) ? projects : (projects as any).projects || [];
        projectsArray.slice(0, 5).forEach((project: any) => {
          const activity: DashboardActivity = {
            id: `proj-${project.id}`,
            type: 'project',
            title: 'DASHBOARD.RECENT_ACTIVITIES.PROJECT.CREATED',
            description: project.name,
            status: 'completed',
            timestamp: project.created_at,
            icon: 'folder',
            color: 'primary',
            link: `/app/projects/${project.id}`,
            metadata: {
              name: project.name,
              datasets_count: project.domain_weights ? Object.keys(project.domain_weights).length : 0
            }
          };
          activities.push(activity);
        });

        // Trier par timestamp décroissant et limiter
        return activities
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);
      })
    );
  }

  /**
   * Récupère les statistiques détaillées
   */
  getDashboardStats(): Observable<DashboardStats> {
    return this.mlPipelineService.getUserExperiments().pipe(
      catchError(() => of([])),
      map(experiments => {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const experimentsThisWeek = experiments.filter(exp => 
          new Date(exp.created_at) >= weekAgo
        ).length;

        const experimentsLastWeek = experiments.filter(exp => {
          const date = new Date(exp.created_at);
          return date >= twoWeeksAgo && date < weekAgo;
        }).length;

        const completedExperiments = experiments.filter(exp => exp.status === 'completed');
        const avgAccuracy = completedExperiments.length > 0
          ? completedExperiments
              .filter(exp => exp.metrics && exp.metrics['accuracy'])
              .reduce((sum, exp) => sum + (exp.metrics ? exp.metrics['accuracy'] || 0 : 0), 0) / completedExperiments.length
          : 0;

        return {
          experimentsThisWeek,
          experimentsLastWeek,
          projectsThisMonth: 0, // À implémenter si l'API le permet
          datasetsAdded: 0, // À implémenter si l'API le permet
          avgAccuracy: Math.round(avgAccuracy * 100)
        };
      })
    );
  }

  /**
   * Récupère les projets récents
   */
  getRecentProjects(limit: number = 5): Observable<Project[]> {
    return this.projectService.getProjects().pipe(
      catchError(() => of([])),
      map(projects => {
        const projectsArray = Array.isArray(projects) ? projects : (projects as any).projects || [];
        return projectsArray
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);
      })
    );
  }

  /**
   * Récupère les vidéos tutoriels
   */
  getTutorialVideos(): Observable<TutorialVideo[]> {
    return of(this.tutorialVideos);
  }

  /**
   * Récupère les actions rapides
   */
  getQuickActions(): Observable<QuickAction[]> {
    return of(this.quickActions);
  }

  private getExperimentIcon(status: string): string {
    switch (status) {
      case 'completed': return 'check_circle';
      case 'running': return 'hourglass_empty';
      case 'failed': return 'error';
      case 'pending': return 'schedule';
      default: return 'psychology';
    }
  }

  private getExperimentColor(status: string): string {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'primary';
      case 'failed': return 'warning';
      case 'pending': return 'accent';
      default: return 'primary';
    }
  }
}
