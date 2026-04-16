// Modèles TypeScript pour le service XAI Engine

export enum ExplanationType {
  GLOBAL = 'global',
  LOCAL = 'local',
  FEATURE_IMPORTANCE = 'feature_importance'
}

export enum ExplanationMethod {
  SHAP = 'shap',
  LIME = 'lime',
  AUTO = 'auto'
}

export enum AudienceLevel {
  NOVICE = 'novice',
  INTERMEDIATE = 'intermediate',
  EXPERT = 'expert'
}

export enum ExplanationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum MessageType {
  USER_QUESTION = 'user_question',
  AI_RESPONSE = 'ai_response',
  SYSTEM = 'system'
}

// === INTERFACES POUR LES DEMANDES D'EXPLICATION ===

export interface ExplanationRequestCreate {
  experiment_id: string;
  dataset_id: string;
  explanation_type: ExplanationType;
  method_requested?: ExplanationMethod;
  audience_level: AudienceLevel;
  language?: string;
  instance_data?: Record<string, any>;
  instance_index?: number;
  // 🎯 NOUVEAUX CHAMPS POUR LE CONTEXTE
  ml_context?: any; // Contexte ML complet avec profil utilisateur
  contextual_suggestions?: Array<{question: string, context: string, audience_adapted: boolean}>;
  // 🆕 FLAG POUR UTILISER LE SHAP PRÉ-CALCULÉ
  use_precalculated_shap?: boolean;
}

export interface ExplanationRequest {
  id: string;
  user_id: string;
  experiment_id: string;
  dataset_id: string;
  explanation_type: ExplanationType;
  method_requested?: ExplanationMethod;
  method_used?: ExplanationMethod;
  audience_level: AudienceLevel;
  language: string;
  instance_data?: Record<string, any>;
  instance_index?: number;
  user_preferences?: Record<string, any>;
  status: ExplanationStatus;
  progress: number;
  task_id?: string;
  error_message?: string;
  model_algorithm?: string;
  processing_time_seconds?: number;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface ExplanationResults {
  id: string;
  status: ExplanationStatus;
  explanation_type: ExplanationType;
  method_used?: ExplanationMethod;
  audience_level: AudienceLevel;
  shap_values?: Record<string, any>;
  lime_explanation?: Record<string, any>;
  visualizations?: Record<string, string>;
  text_explanation?: string;
  processing_time_seconds?: number;
  completed_at?: Date;
}

export interface ExplanationSummary {
  id: string;
  explanation_type: ExplanationType;
  method_used?: ExplanationMethod;
  audience_level: AudienceLevel;
  status: ExplanationStatus;
  progress: number;
  created_at: Date;
  has_text_explanation: boolean;
  has_visualizations: boolean;
  can_chat: boolean;
}

// === INTERFACES POUR LE CHAT ===

export interface ChatSessionCreate {
  explanation_request_id: string;
  language?: string;
  max_questions?: number;
}

export interface ChatSession {
  id: string;
  user_id: string;
  explanation_request_id: string;
  language: string;
  max_questions: number;
  questions_count: number;
  is_active: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  last_activity: Date;
}

export interface ChatMessage {
  id: string;
  chat_session_id: string;
  message_type: MessageType;
  content: string;
  message_order: number;
  tokens_used?: number;
  response_time_seconds?: number;
  model_used?: string;
  context_data?: Record<string, any>;
  created_at: Date;
}

export interface UserQuestionRequest {
  question: string;
  context_data?: any; // 🎯 NOUVEAU: Contexte ML complet pour des réponses personnalisées
}

export interface AIResponse {
  response: string;
  tokens_used: number;
  response_time_seconds: number;
  model_used: string;
  can_ask_more: boolean;
  remaining_questions: number;
}

// === INTERFACES POUR LES ARTEFACTS ===

export interface ExplanationArtifact {
  id: string;
  explanation_request_id: string;
  artifact_type: string;
  file_name: string;
  file_path: string;
  file_size_bytes?: number;
  mime_type: string;
  description?: string;
  is_primary: boolean;
  display_order: number;
  created_at: Date;
}

// === INTERFACES POUR LES PRÉFÉRENCES ===

export interface UserExplanationPreferences {
  ai_familiarity: number; // 1-5
  education_level?: string;
  preferred_language: string;
  explanation_detail_level: string;
  prefer_visual: boolean;
  prefer_technical_terms: boolean;
}

// === INTERFACES POUR LES MÉTRIQUES ===

export interface ExplanationMetrics {
  total_requests: number;
  completed_requests: number;
  failed_requests: number;
  average_processing_time: number;
  most_used_method: string;
  success_rate: number;
}

// === INTERFACES POUR LES RÉPONSES D'API ===

export interface ExplanationRequestResponse {
  success: boolean;
  message: string;
  request_id?: string;
  estimated_completion_time?: number; // en secondes
}

export interface XAIErrorResponse {
  error: string;
  detail?: string;
  request_id?: string;
}

// === TYPES UTILITAIRES ===

export interface FeatureImportance {
  feature_name: string;
  importance_value: number;
  rank: number;
}

export interface SHAPExplanationData {
  method: 'shap' | 'shap_global';
  shap_values?: number[];
  feature_names?: string[];
  base_value?: number;
  prediction?: number;
  prediction_proba?: number[];
  instance_values?: number[];
  feature_importance?: Record<string, number>;
  importance_ranking?: string[];
}

export interface LIMEExplanationData {
  method: 'lime';
  explanation_data: [string, number][]; // [feature_name, weight]
  feature_importance: Record<string, number>;
  prediction: number;
  prediction_proba?: number[];
  instance_values: number[];
  score?: number;
}

// === OPTIONS DE CONFIGURATION ===

export interface XAIRequestOptions {
  explanation_type: ExplanationType;
  audience_level: AudienceLevel;
  method_preference?: ExplanationMethod;
  language?: 'fr' | 'en';
  include_visualizations?: boolean;
  include_text_explanation?: boolean;
}

export interface ChatOptions {
  max_questions?: number;
  language?: 'fr' | 'en';
  context_level?: AudienceLevel;
}

// === ÉTATS DE CHARGEMENT ===

export interface XAILoadingState {
  isLoading: boolean;
  progress: number;
  message: string;
  error?: string;
}

// === INTERFACES POUR L'AFFICHAGE ===

export interface XAIVisualizationConfig {
  show_feature_importance: boolean;
  show_local_explanation: boolean;
  show_global_insights: boolean;
  max_features_display: number;
  color_scheme: 'default' | 'colorblind' | 'high_contrast';
}

export interface ExplanationDisplayOptions {
  audience_level: AudienceLevel;
  language: 'fr' | 'en';
  show_technical_details: boolean;
  compact_view: boolean;
}

// === HELPER TYPES ===

export type ExplanationDataUnion = SHAPExplanationData | LIMEExplanationData;

export interface ProcessedExplanation {
  method_used: ExplanationMethod;
  feature_importance: FeatureImportance[];
  top_features: FeatureImportance[];
  prediction_confidence: number;
  explanation_quality: number;
  visualizations: Record<string, string>;
  text_summary: string;
}
