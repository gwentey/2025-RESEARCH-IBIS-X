import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { FileDropZoneComponent } from '../../../components/file-drop-zone/file-drop-zone.component';
import { DatasetUploadService, ValidationResult, PreviewResponse, UploadProgress } from '../../../services/dataset-upload.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-dataset-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatDialogModule,
    FileDropZoneComponent,
    TranslateModule
  ],
  template: `
    <div class="upload-container">
      <!-- Header -->
      <div class="header-section">
        <button mat-icon-button (click)="goBack()" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="title-area">
          <h1>{{ 'UPLOAD.TITLE' | translate }}</h1>
          <p class="subtitle">{{ 'UPLOAD.SUBTITLE' | translate }}</p>
        </div>
      </div>

      <!-- Progress Indicator -->
      <div *ngIf="uploadProgress" class="progress-section">
        <mat-card>
          <mat-card-content>
            <div class="progress-header">
              <h3>{{ getProgressTitle() }}</h3>
              <mat-icon [class]="getProgressIconClass()">{{ getProgressIcon() }}</mat-icon>
            </div>
            <p>{{ uploadProgress.message || 'En cours...' }}</p>
            <mat-progress-bar 
              mode="determinate" 
              [value]="uploadProgress.progress">
            </mat-progress-bar>
            <div class="progress-percentage">{{ uploadProgress.progress }}%</div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Main Upload Area -->
      <mat-card class="upload-card">
        <mat-card-content>
          <app-file-drop-zone
            [maxFiles]="10"
            [maxFileSize]="104857600"
            [acceptedFormats]="['csv', 'xlsx', 'xls', 'json', 'xml', 'parquet']"
            (filesSelected)="onFilesSelected($event)"
            (validationChanged)="onValidationChanged($event)">
          </app-file-drop-zone>
        </mat-card-content>
      </mat-card>

      <!-- Restaurer brouillon -->
      <div *ngIf="hasDraft" class="draft-section-standalone">
        <mat-card>
          <mat-card-content>
            <div class="draft-info">
              <mat-icon>draft</mat-icon>
              <span>{{ 'UPLOAD.DRAFT.FOUND' | translate }}</span>
            </div>
            <div class="draft-actions">
              <button mat-button (click)="loadDraft()">
                {{ 'UPLOAD.DRAFT.LOAD' | translate }}
              </button>
              <button mat-button color="warn" (click)="clearDraft()">
                {{ 'UPLOAD.DRAFT.CLEAR' | translate }}
              </button>
            </div>
          </mat-card-content>
        </mat-card>
      </div>


    </div>
  `,
  styles: [`
    .upload-container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 24px;
    }

    .header-section {
      display: flex;
      align-items: center;
      margin-bottom: 32px;
      gap: 16px;
    }

    .back-button {
      flex-shrink: 0;
    }

    .title-area h1 {
      margin: 0;
      font-size: 2rem;
      font-weight: 400;
      color: #1976d2;
    }

    .subtitle {
      margin: 4px 0 0 0;
      color: #666;
      font-size: 1.1rem;
    }

    .progress-section {
      margin-bottom: 24px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .progress-header h3 {
      margin: 0;
    }

    .progress-percentage {
      text-align: right;
      margin-top: 8px;
      font-weight: 500;
      color: #1976d2;
    }

    .progress-icon-success {
      color: #4caf50;
    }

    .progress-icon-error {
      color: #f44336;
    }

    .progress-icon-loading {
      color: #1976d2;
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }

    .upload-card {
      margin-bottom: 24px;
    }



    .draft-section-standalone {
      margin-bottom: 24px;
    }

    .draft-section-standalone .mat-card-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .draft-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #666;
    }

    .draft-actions {
      display: flex;
      gap: 8px;
    }



          /* Responsive */
      @media (max-width: 768px) {
        .upload-container {
          padding: 16px;
        }


      }
  `]
})
export class DatasetUploadComponent implements OnInit, OnDestroy {
  selectedFiles: File[] = [];
  validationResult: ValidationResult | null = null;
  analysisResults: PreviewResponse | null = null;
  uploadProgress: UploadProgress | null = null;
  isLoading = false;
  hasDraft = false;

  private destroy$ = new Subject<void>();

  constructor(
    private uploadService: DatasetUploadService,
    private router: Router,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    // Vérifier s'il y a un brouillon
    this.hasDraft = this.uploadService.hasDraft();

    // Écouter la progression de l'upload
    this.uploadService.uploadProgress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        this.uploadProgress = progress;
        if (progress?.stage === 'preview_completed' && progress.result) {
          this.onPreviewCompleted(progress.result);
        } else if (progress?.stage === 'error') {
          this.onUploadError(progress.error || 'Erreur inconnue');
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles = files;
    // Réinitialiser l'analyse précédente
    this.analysisResults = null;
    this.uploadService.resetProgress();
  }

  onValidationChanged(result: ValidationResult) {
    this.validationResult = result;
    
    // Rediriger automatiquement vers l'assistant guidé si la validation est réussie
    if (result.isValid && this.selectedFiles.length > 0) {
      this.openWizardDirectly();
    }
  }

  /**
   * Ouvre l'assistant guidé directement sans étape de choix
   */
  public openWizardDirectly() {
    // Rediriger vers le wizard avec les fichiers dans l'état de navigation
    this.router.navigate(['/app/datasets/upload/wizard'], {
      state: { 
        selectedFiles: this.selectedFiles,
        analysisResults: this.analysisResults
      }
    });
  }





  loadDraft() {
    const draft = this.uploadService.loadDraft();
    if (draft) {
      // Rediriger vers le wizard avec le brouillon
      this.router.navigate(['/app/datasets/upload/wizard'], {
        state: { draftData: draft }
      });
    }
  }

  clearDraft() {
    this.uploadService.clearDraft();
    this.hasDraft = false;
    this.snackBar.open('Brouillon supprimé', 'Fermer', { duration: 3000 });
  }



  goBack() {
    this.router.navigate(['/app/datasets']);
  }

  getProgressTitle(): string {
    if (!this.uploadProgress) return '';
    
    switch (this.uploadProgress.stage) {
      case 'uploading': return 'Upload en cours...';
      case 'analyzing': return 'Analyse en cours...';
      case 'converting': return 'Conversion en cours...';
      case 'saving': return 'Sauvegarde en cours...';
      case 'completed': return 'Upload terminé !';
      case 'error': return 'Erreur d\'upload';
      default: return 'Traitement...';
    }
  }

  getProgressIcon(): string {
    if (!this.uploadProgress) return 'info';
    
    switch (this.uploadProgress.stage) {
      case 'completed': return 'check_circle';
      case 'error': return 'error';
      default: return 'upload';
    }
  }

  getProgressIconClass(): string {
    if (!this.uploadProgress) return '';
    
    switch (this.uploadProgress.stage) {
      case 'completed': return 'progress-icon-success';
      case 'error': return 'progress-icon-error';
      default: return 'progress-icon-loading';
    }
  }



  private saveCurrentState() {
    // Sauvegarder l'état actuel dans sessionStorage pour le wizard
    const state = {
      selectedFiles: this.selectedFiles.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type
      })),
      analysisResults: this.analysisResults
    };
    sessionStorage.setItem('dataset-upload-state', JSON.stringify(state));
  }

  private onPreviewCompleted(result: any) {
    this.isLoading = false;
    this.analysisResults = result;
    
    // Sauvegarder l'état pour le wizard
    this.saveCurrentState();
    
    // Naviguer vers le wizard pour continuer avec les métadonnées
    this.router.navigate(['/app/datasets/upload/wizard'], {
      state: {
        files: this.selectedFiles,
        analysisResults: this.analysisResults
      }
    });
  }

  private onUploadError(error: string) {
    this.isLoading = false;
    this.snackBar.open(`Erreur: ${error}`, 'Fermer', { duration: 8000 });
  }
}