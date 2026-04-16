import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { XAIService } from '../../../services/xai.service';
import {
  ChatSession,
  ChatMessage,
  MessageType,
  UserQuestionRequest,
  AIResponse,
  ChatSessionCreate
} from '../../../models/xai.models';

@Component({
  selector: 'app-xai-chat-interface',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatBadgeModule,
    MatTooltipModule,
    TranslateModule
  ],
  templateUrl: './xai-chat-interface.component.html',
  styleUrls: ['./xai-chat-interface.component.scss']
})
export class XAIChatInterfaceComponent implements OnInit, OnDestroy, AfterViewChecked {
  @Input() explanationId!: string;
  @Input() maxQuestions: number = 5;
  @Input() language: string = 'fr';
  @Input() compactMode: boolean = false;
  @Input() contextData?: any; // Contexte ML complet avec profil utilisateur

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('questionInput') questionInput!: ElementRef;

  // État du chat
  chatSession?: ChatSession;
  messages: ChatMessage[] = [];
  questionControl = new FormControl('', [Validators.required, Validators.minLength(10)]);
  
  // États de chargement
  isInitializingChat = false;
  isAskingQuestion = false;
  hasError = false;
  errorMessage = '';
  showSuggestedQuestions?: boolean;  // ✅ NOUVEAU : Contrôle affichage questions suggérées (undefined au début = afficher)
  
  // Utilitaires
  MessageType = MessageType;
  private subscriptions = new Subscription();
  private shouldScrollToBottom = false;

  // Questions suggérées
  suggestedQuestions: string[] = [
    'Quelles sont les variables les plus importantes dans ce modèle ?',
    'Comment interpréter ces résultats pour un business ?',
    'Quelles sont les limites de ce modèle ?',
    'Comment améliorer la performance de ce modèle ?',
    'Ces résultats sont-ils fiables ?'
  ];

  constructor(private xaiService: XAIService) {}

  ngOnInit(): void {
    // 🐛 DEBUG: Vérifier le contexte reçu par le chat
    console.log('🐛 CHAT INTERFACE - contextData received:', {
      type: typeof this.contextData,
      isNull: this.contextData === null,
      isUndefined: this.contextData === undefined,
      keys: this.contextData ? Object.keys(this.contextData) : 'NO_CONTEXT',
      dataset_name: this.contextData?.dataset_name,
      accuracy: this.contextData?.metrics?.overall_score,
      experiment_id: this.contextData?.experiment_id
    });
    
    this.initializeChat();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  // === INITIALISATION ===

  private initializeChat(): void {
    if (!this.explanationId) {
      console.error('XAI Chat: Explanation ID is required');
      return;
    }

    this.isInitializingChat = true;
    this.hasError = false;

    const chatData: ChatSessionCreate = {
      explanation_request_id: this.explanationId,
      language: this.language,
      max_questions: this.maxQuestions
    };

    const subscription = this.xaiService.createChatSession(this.explanationId, chatData).subscribe({
      next: (session) => {
        console.log('✅ Session de chat créée:', session.id);
        this.chatSession = session;
        this.isInitializingChat = false;
        this.loadExistingMessages();
        this.addWelcomeMessage();
      },
      error: (error) => {
        console.error('❌ Erreur lors de la création de la session de chat:', error);
        this.hasError = true;
        this.errorMessage = error.error?.detail || error.message || 'Erreur lors de l\'initialisation du chat';
        this.isInitializingChat = false;
      }
    });

    this.subscriptions.add(subscription);
  }

  private loadExistingMessages(): void {
    if (!this.chatSession) return;

    const subscription = this.xaiService.getChatMessages(this.chatSession.id).subscribe({
      next: (messages) => {
        this.messages = messages.sort((a, b) => a.message_order - b.message_order);
        this.shouldScrollToBottom = true;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des messages:', error);
      }
    });

    this.subscriptions.add(subscription);
  }

  private addWelcomeMessage(): void {
    const welcomeMessage: ChatMessage = {
      id: 'welcome-' + Date.now(),
      chat_session_id: this.chatSession!.id,
      message_type: MessageType.SYSTEM,
      content: this.getWelcomeMessage(),
      message_order: 0,
      created_at: new Date()
    };

    this.messages.unshift(welcomeMessage);
    this.shouldScrollToBottom = true;
  }

  private getWelcomeMessage(): string {
    if (this.language === 'en') {
      return `👋 **Welcome to the XAI Chat!**

I'm here to help you understand your model's explanations. You can ask me questions about:
• Feature importance and their meanings
• How to interpret the results
• Model limitations and improvements
• Business implications

You have **${this.getRemainingQuestions()}** questions remaining. Ask me anything!`;
    } else {
      return `👋 **Bienvenue dans le Chat XAI !**

Je suis là pour vous aider à comprendre les explications de votre modèle. Vous pouvez me poser des questions sur :
• L'importance des variables et leur signification
• Comment interpréter les résultats
• Les limites du modèle et les améliorations
• Les implications business

Il vous reste **${this.getRemainingQuestions()}** questions. Posez-moi n'importe quoi !`;
    }
  }

  // === GESTION DES QUESTIONS ===

  askQuestion(): void {
    if (!this.questionControl.valid || !this.chatSession || this.isAskingQuestion) return;
    
    const question = this.questionControl.value?.trim();
    if (!question) return;

    if (this.getRemainingQuestions() <= 0) {
      this.showMaxQuestionsReachedMessage();
      return;
    }

    this.isAskingQuestion = true;
    // ✅ FIX: Utiliser la méthode recommandée par Angular
    this.questionControl.disable({ emitEvent: false });

    // Ajouter la question de l'utilisateur
    const userMessage: ChatMessage = {
      id: 'user-' + Date.now(),
      chat_session_id: this.chatSession.id,
      message_type: MessageType.USER_QUESTION,
      content: question,
      message_order: this.messages.length,
      created_at: new Date()
    };

    this.messages.push(userMessage);
    this.shouldScrollToBottom = true;

    // 🎯 ENVOYER LA QUESTION AVEC LE CONTEXTE ML COMPLET
    const questionData: UserQuestionRequest = { 
      question,
      context_data: this.contextData  // 🎯 INCLURE LE CONTEXTE ML !
    };
    
    // 🐛 DEBUG COMPLET: Vérifier ce qui est envoyé
    console.log('🐛 CHAT QUESTION - Sending question with context:', {
      question: question,
      has_context: !!this.contextData,
      context_type: typeof this.contextData,
      context_is_null: this.contextData === null,
      context_is_undefined: this.contextData === undefined,
      context_keys: this.contextData ? Object.keys(this.contextData).length : 0,
      context_full_value: this.contextData,
      dataset_name: this.contextData?.dataset_name,
      accuracy: this.contextData?.metrics?.overall_score
    });
    
    // 🐛 DEBUG: Vérifier l'objet questionData final
    console.log('🐛 CHAT QUESTION - Final questionData object:', questionData);
    console.log('🐛 CHAT QUESTION - questionData.context_data:', questionData.context_data);

    const subscription = this.xaiService.askQuestion(this.chatSession.id, questionData).subscribe({
      next: (response: AIResponse) => {
        console.log('✅ Réponse de l\'IA reçue');
        this.handleAIResponse(response);
        
        // Mettre à jour les informations de session
        this.chatSession!.questions_count++;
        
        this.isAskingQuestion = false;
        // ✅ FIX: Réactiver proprement le contrôle
        this.questionControl.enable({ emitEvent: false });
        this.questionControl.reset();
        
        if (this.questionInput) {
          this.questionInput.nativeElement.focus();
        }
      },
      error: (error) => {
        console.error('❌ Erreur lors de l\'envoi de la question:', error);
        this.handleQuestionError(error);
        this.isAskingQuestion = false;
        // ✅ FIX: Réactiver proprement le contrôle
        this.questionControl.enable({ emitEvent: false });
      }
    });

    this.subscriptions.add(subscription);
  }

  private handleAIResponse(response: AIResponse): void {
    const aiMessage: ChatMessage = {
      id: 'ai-' + Date.now(),
      chat_session_id: this.chatSession!.id,
      message_type: MessageType.AI_RESPONSE,
      content: response.response,
      message_order: this.messages.length,
      tokens_used: response.tokens_used,
      response_time_seconds: response.response_time_seconds,
      model_used: response.model_used,
      created_at: new Date()
    };

    this.messages.push(aiMessage);
    this.shouldScrollToBottom = true;

    // Vérifier si l'utilisateur peut encore poser des questions
    if (!response.can_ask_more) {
      this.showMaxQuestionsReachedMessage();
    }
  }

  private handleQuestionError(error: any): void {
    const errorMessage: ChatMessage = {
      id: 'error-' + Date.now(),
      chat_session_id: this.chatSession!.id,
      message_type: MessageType.SYSTEM,
      content: `❌ **Erreur**: ${error.error?.detail || error.message || 'Une erreur s\'est produite lors de l\'envoi de votre question.'}`,
      message_order: this.messages.length,
      created_at: new Date()
    };

    this.messages.push(errorMessage);
    this.shouldScrollToBottom = true;
  }

  private showMaxQuestionsReachedMessage(): void {
    const message: ChatMessage = {
      id: 'limit-' + Date.now(),
      chat_session_id: this.chatSession!.id,
      message_type: MessageType.SYSTEM,
      content: this.language === 'en' 
        ? `⚠️ **Question Limit Reached**\n\nYou have reached the maximum number of questions (${this.maxQuestions}) for this explanation session. To continue exploring your model, please create a new explanation request.`
        : `⚠️ **Limite de Questions Atteinte**\n\nVous avez atteint le nombre maximum de questions (${this.maxQuestions}) pour cette session d'explication. Pour continuer à explorer votre modèle, veuillez créer une nouvelle demande d'explication.`,
      message_order: this.messages.length,
      created_at: new Date()
    };

    this.messages.push(message);
    this.shouldScrollToBottom = true;
  }

  // === QUESTIONS SUGGÉRÉES ===

  askSuggestedQuestion(question: string): void {
    // ✅ NOUVEAU : Masquer immédiatement les questions suggérées pour voir l'IA écrire
    this.showSuggestedQuestions = false;
    
    this.questionControl.setValue(question);
    this.askQuestion();
  }

  // === MÉTHODES UTILITAIRES ===

  getRemainingQuestions(): number {
    if (!this.chatSession) return this.maxQuestions;
    return this.maxQuestions - this.chatSession.questions_count;
  }

  canAskQuestions(): boolean {
    return this.getRemainingQuestions() > 0 && this.chatSession?.is_active === true;
  }

  getMessageTime(message: ChatMessage): string {
    return new Date(message.created_at).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatMessageContent(content: string): string {
    // Convertir le Markdown simple en HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/•/g, '•')
      .replace(/\n/g, '<br>');
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  retryInitialization(): void {
    this.hasError = false;
    this.errorMessage = '';
    this.initializeChat();
  }

  // === MÉTHODES D'INTERACTION ===

  onQuestionInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.askQuestion();
    }
  }

  clearChat(): void {
    this.messages = this.messages.filter(m => m.message_type === MessageType.SYSTEM);
    this.addWelcomeMessage();
  }

  getMessageIcon(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.USER_QUESTION:
        return 'person';
      case MessageType.AI_RESPONSE:
        return 'smart_toy';
      case MessageType.SYSTEM:
        return 'info';
      default:
        return 'message';
    }
  }

  getMessageClass(messageType: MessageType): string {
    switch (messageType) {
      case MessageType.USER_QUESTION:
        return 'user-message';
      case MessageType.AI_RESPONSE:
        return 'ai-message';
      case MessageType.SYSTEM:
        return 'system-message';
      default:
        return '';
    }
  }

  // ✅ NOUVEAU : Gestion des questions suggérées
  toggleSuggestedQuestions(): void {
    // Si undefined ou false -> true (afficher), Si true -> false (masquer)
    this.showSuggestedQuestions = this.showSuggestedQuestions === true ? false : true;
  }

  // === TRACKBY FUNCTIONS POUR OPTIMISER ANGULAR ===

  trackByMessage(index: number, message: ChatMessage): string {
    return message.id;
  }

  trackByQuestion(index: number, question: string): string {
    return question;
  }
}