import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject, timer, switchMap, takeWhile, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ExplanationRequestCreate,
  ExplanationRequest,
  ExplanationResults,
  ExplanationSummary,
  ExplanationRequestResponse,
  ChatSessionCreate,
  ChatSession,
  ChatMessage,
  UserQuestionRequest,
  AIResponse,
  ExplanationArtifact,
  ExplanationMetrics,
  ExplanationStatus,
  AudienceLevel,
  ExplanationType,
  ExplanationMethod,
  XAILoadingState
} from '../models/xai.models';

@Injectable({
  providedIn: 'root'
})
export class XAIService {
  private readonly baseUrl = `${environment.apiUrl}/api/v1/xai`;
  
  // États de chargement et de progression
  private loadingStateSubject = new BehaviorSubject<XAILoadingState>({
    isLoading: false,
    progress: 0,
    message: ''
  });
  
  // Cache des explications récentes
  private explanationsCache = new Map<string, ExplanationResults>();
  
  constructor(private http: HttpClient) {}

  // === OBSERVABLES PUBLICS ===
  
  get loadingState$(): Observable<XAILoadingState> {
    return this.loadingStateSubject.asObservable();
  }

  // === MÉTHODES POUR LES DEMANDES D'EXPLICATION ===

  /**
   * Créer une nouvelle demande d'explication XAI
   */
  createExplanationRequest(requestData: ExplanationRequestCreate): Observable<ExplanationRequestResponse> {
    this.updateLoadingState(true, 0, 'Création de la demande d\'explication...');
    
    return this.http.post<ExplanationRequestResponse>(`${this.baseUrl}/explanations`, requestData)
      .pipe(
        tap(response => {
          if (response.success && response.request_id) {
            // Commencer le suivi automatique
            this.startProgressTracking(response.request_id);
          } else {
            this.updateLoadingState(false, 0, '', 'Erreur lors de la création de la demande');
          }
        })
      );
  }

  /**
   * Récupérer les détails d'une demande d'explication
   */
  getExplanationRequest(requestId: string): Observable<ExplanationRequest> {
    return this.http.get<ExplanationRequest>(`${this.baseUrl}/explanations/${requestId}`);
  }

  /**
   * Récupérer les résultats d'une explication terminée
   */
  getExplanationResults(requestId: string): Observable<ExplanationResults> {
    // Vérifier le cache en premier
    if (this.explanationsCache.has(requestId)) {
      const cached = this.explanationsCache.get(requestId)!;
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }
    
    return this.http.get<ExplanationResults>(`${this.baseUrl}/explanations/${requestId}/results`)
      .pipe(
        tap(results => {
          // Mettre en cache les résultats
          this.explanationsCache.set(requestId, results);
        })
      );
  }

  /**
   * Lister les demandes d'explication de l'utilisateur
   */
  getUserExplanations(options: {
    skip?: number;
    limit?: number;
    status?: ExplanationStatus;
  } = {}): Observable<ExplanationSummary[]> {
    let params = new HttpParams();
    
    if (options.skip !== undefined) {
      params = params.set('skip', options.skip.toString());
    }
    if (options.limit !== undefined) {
      params = params.set('limit', options.limit.toString());
    }
    if (options.status) {
      params = params.set('status', options.status);
    }
    
    return this.http.get<ExplanationSummary[]>(`${this.baseUrl}/explanations`, { params });
  }

  /**
   * Démarrer le suivi de progression automatique
   */
  private startProgressTracking(requestId: string): void {
    this.updateLoadingState(true, 10, 'Traitement en cours...');
    
    // Polling toutes les 2 secondes
    timer(0, 2000).pipe(
      switchMap(() => this.getExplanationRequest(requestId)),
      takeWhile(request => request.status === ExplanationStatus.RUNNING || request.status === ExplanationStatus.PENDING, true),
      tap(request => {
        if (request.status === ExplanationStatus.RUNNING) {
          this.updateLoadingState(true, request.progress, this.getProgressMessage(request.progress));
        } else if (request.status === ExplanationStatus.COMPLETED) {
          this.updateLoadingState(false, 100, 'Explication terminée avec succès !');
        } else if (request.status === ExplanationStatus.FAILED) {
          this.updateLoadingState(false, 0, '', request.error_message || 'Erreur inconnue');
        }
      })
    ).subscribe();
  }

  private getProgressMessage(progress: number): string {
    if (progress < 25) return 'Chargement du modèle...';
    if (progress < 50) return 'Analyse des données...';
    if (progress < 70) return 'Génération des explications...';
    if (progress < 85) return 'Création des visualisations...';
    if (progress < 95) return 'Génération de l\'explication textuelle...';
    return 'Finalisation...';
  }

  private updateLoadingState(isLoading: boolean, progress: number, message: string, error?: string): void {
    this.loadingStateSubject.next({
      isLoading,
      progress,
      message,
      error
    });
  }

  // === MÉTHODES POUR LE CHAT ===

  /**
   * Créer une session de chat pour une explication
   */
  createChatSession(requestId: string, chatData: ChatSessionCreate): Observable<ChatSession> {
    return this.http.post<ChatSession>(`${this.baseUrl}/explanations/${requestId}/chat`, chatData);
  }

  /**
   * Poser une question dans une session de chat
   */
  askQuestion(sessionId: string, questionData: UserQuestionRequest): Observable<AIResponse> {
    return this.http.post<AIResponse>(`${this.baseUrl}/explanations/chat/${sessionId}/ask`, questionData);
  }

  /**
   * Récupérer l'historique des messages d'une session
   */
  getChatMessages(sessionId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.baseUrl}/explanations/chat/${sessionId}/messages`);
  }

  // === MÉTHODES POUR LES ARTEFACTS ===

  /**
   * Récupérer la liste des artefacts d'une explication
   */
  getExplanationArtifacts(requestId: string): Observable<ExplanationArtifact[]> {
    return this.http.get<ExplanationArtifact[]>(`${this.baseUrl}/explanations/${requestId}/artifacts`);
  }

  /**
   * Obtenir l'URL de téléchargement d'un artefact (endpoint public)
   */
  getArtifactDownloadUrl(artifactId: string): string {
    return `${environment.apiUrl}/public/xai/artifacts/${artifactId}/download`;
  }

  // === MÉTHODES POUR LES MÉTRIQUES ===

  /**
   * Récupérer les métriques d'utilisation XAI de l'utilisateur
   */
  getUserMetrics(): Observable<ExplanationMetrics> {
    return this.http.get<ExplanationMetrics>(`${this.baseUrl}/explanations/metrics/user`);
  }

  // === MÉTHODES UTILITAIRES ===

  /**
   * Recommander le niveau d'audience selon les préférences utilisateur
   */
  recommendAudienceLevel(userPreferences: {
    ai_familiarity?: number;
    education_level?: string;
  }): AudienceLevel {
    const familiarity = userPreferences.ai_familiarity || 3;
    
    if (familiarity <= 2) {
      return AudienceLevel.NOVICE;
    } else if (familiarity >= 4) {
      return AudienceLevel.EXPERT;
    } else {
      return AudienceLevel.INTERMEDIATE;
    }
  }

  /**
   * Recommander la méthode d'explication selon le type d'algorithme
   */
  recommendExplanationMethod(algorithm: string): ExplanationMethod {
    if (algorithm.includes('tree') || algorithm.includes('forest')) {
      return ExplanationMethod.SHAP; // SHAP est optimisé pour les arbres
    } else {
      return ExplanationMethod.AUTO; // Laisser le service choisir
    }
  }

  /**
   * Obtenir les options par défaut pour une demande d'explication
   */
  getDefaultExplanationOptions(
    experimentId: string,
    datasetId: string,
    userPreferences?: any
  ): ExplanationRequestCreate {
    return {
      experiment_id: experimentId,
      dataset_id: datasetId,
      explanation_type: ExplanationType.GLOBAL,
      method_requested: ExplanationMethod.AUTO,
      audience_level: this.recommendAudienceLevel(userPreferences || {}),
      language: 'fr'
    };
  }

  /**
   * Nettoyer le cache des explications
   */
  clearCache(): void {
    this.explanationsCache.clear();
  }

  /**
   * Vérifier si une explication est en cours
   */
  hasActiveExplanation(): boolean {
    return this.loadingStateSubject.value.isLoading;
  }

  /**
   * Arrêter le suivi de progression
   */
  stopProgressTracking(): void {
    this.updateLoadingState(false, 0, '');
  }

  // === MÉTHODES POUR LES TYPES D'EXPLICATION RAPIDES ===

  /**
   * Créer une demande d'explication rapide pour les features importantes
   */
  explainFeatureImportance(
    experimentId: string,
    datasetId: string,
    audienceLevel: AudienceLevel = AudienceLevel.INTERMEDIATE
  ): Observable<ExplanationRequestResponse> {
    return this.createExplanationRequest({
      experiment_id: experimentId,
      dataset_id: datasetId,
      explanation_type: ExplanationType.FEATURE_IMPORTANCE,
      audience_level: audienceLevel,
      method_requested: ExplanationMethod.AUTO,
      language: 'fr'
    });
  }

  /**
   * Créer une demande d'explication globale du modèle
   */
  explainModelGlobally(
    experimentId: string,
    datasetId: string,
    audienceLevel: AudienceLevel = AudienceLevel.INTERMEDIATE
  ): Observable<ExplanationRequestResponse> {
    return this.createExplanationRequest({
      experiment_id: experimentId,
      dataset_id: datasetId,
      explanation_type: ExplanationType.GLOBAL,
      audience_level: audienceLevel,
      method_requested: ExplanationMethod.AUTO,
      language: 'fr'
    });
  }

  /**
   * Créer une demande d'explication locale pour une instance
   */
  explainInstance(
    experimentId: string,
    datasetId: string,
    instanceData: Record<string, any>,
    audienceLevel: AudienceLevel = AudienceLevel.INTERMEDIATE
  ): Observable<ExplanationRequestResponse> {
    return this.createExplanationRequest({
      experiment_id: experimentId,
      dataset_id: datasetId,
      explanation_type: ExplanationType.LOCAL,
      audience_level: audienceLevel,
      instance_data: instanceData,
      method_requested: ExplanationMethod.AUTO,
      language: 'fr'
    });
  }
}
