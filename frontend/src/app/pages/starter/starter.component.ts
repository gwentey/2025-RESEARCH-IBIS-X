import { Component, ViewEncapsulation, OnInit } from '@angular/core';
import { MaterialModule } from 'src/app/material.module';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { TablerIconsModule } from 'angular-tabler-icons';
import { DashboardService, DashboardMetrics, DashboardActivity, DashboardStats, QuickAction, TutorialVideo } from '../../services/dashboard.service';
import { Project } from '../../models/project.models';
import { Observable, forkJoin, map } from 'rxjs';

interface DashboardData {
  metrics: DashboardMetrics;
  recentActivities: DashboardActivity[];
  recentProjects: Project[];
  stats: DashboardStats;
  quickActions: QuickAction[];
  tutorialVideos: TutorialVideo[];
}

/**
 * Composant starter - Dashboard principal d'IBIS-X
 */
@Component({
  selector: 'app-starter',
  templateUrl: './starter.component.html',
  imports: [MaterialModule, CommonModule, RouterModule, TranslateModule, TablerIconsModule],
  styleUrls: ['./starter.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class StarterComponent implements OnInit {
  
  dashboardData$: Observable<DashboardData>;
  currentTime = new Date();

  constructor(
    private dashboardService: DashboardService
  ) {
    // Charger toutes les données du dashboard en parallèle
    this.dashboardData$ = forkJoin({
      metrics: this.dashboardService.getDashboardMetrics(),
      recentActivities: this.dashboardService.getRecentActivities(8),
      recentProjects: this.dashboardService.getRecentProjects(4),
      stats: this.dashboardService.getDashboardStats(),
      quickActions: this.dashboardService.getQuickActions(),
      tutorialVideos: this.dashboardService.getTutorialVideos()
    });
  }

  ngOnInit(): void {
    // Mettre à jour l'heure toutes les minutes
    setInterval(() => {
      this.currentTime = new Date();
    }, 60000);
  }

  /**
   * Obtient l'URL de la miniature YouTube
   */
  getYoutubeThumbnail(youtubeUrl: string): string {
    const videoId = this.extractYoutubeVideoId(youtubeUrl);
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }

  /**
   * Extrait l'ID de la vidéo YouTube depuis l'URL
   */
  private extractYoutubeVideoId(url: string): string {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : '';
  }

  /**
   * Ouvre une vidéo YouTube
   */
  openYoutubeVideo(youtubeUrl: string): void {
    window.open(youtubeUrl, '_blank');
  }

  /**
   * Formatte la durée relative (ex: "il y a 2 heures")
   */
  getRelativeTime(timestamp: string): string {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now.getTime() - past.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
    } else if (diffHours > 0) {
      return `${diffHours}h`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}min`;
    }
  }

  /**
   * Formate un nombre avec des k/M pour les grands nombres
   */
  formatNumber(value: number): string {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'k';
    }
    return value.toString();
  }

}