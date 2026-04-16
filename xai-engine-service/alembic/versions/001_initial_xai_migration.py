"""Initial XAI migration - compatible with existing database

Revision ID: 001_initial_xai
Revises: 
Create Date: 2025-09-16 20:43:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial_xai'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Migration initiale pour XAI Engine.
    Cette migration est conçue pour être compatible avec une base de données
    qui peut déjà contenir des tables d'autres services.
    """
    # Vérifier l'état de la base de données
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Créer les tables XAI seulement si elles n'existent pas
    
    # Table explanation_requests
    if 'explanation_requests' not in existing_tables:
        op.create_table('explanation_requests',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('experiment_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('dataset_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('explanation_type', sa.String(length=20), nullable=False),
            sa.Column('method_requested', sa.String(length=20), nullable=True),
            sa.Column('method_used', sa.String(length=20), nullable=True),
            sa.Column('audience_level', sa.String(length=20), nullable=False),
            sa.Column('instance_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('instance_index', sa.Integer(), nullable=True),
            sa.Column('user_preferences', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('language', sa.String(length=5), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('progress', sa.Integer(), nullable=True),
            sa.Column('task_id', sa.String(length=100), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('shap_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('lime_explanation', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('visualizations', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('text_explanation', sa.Text(), nullable=True),
            sa.Column('model_algorithm', sa.String(length=50), nullable=True),
            sa.Column('processing_time_seconds', sa.Float(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        
        # Index pour explanation_requests
        op.create_index(op.f('ix_explanation_requests_id'), 'explanation_requests', ['id'], unique=False)
        op.create_index(op.f('ix_explanation_requests_user_id'), 'explanation_requests', ['user_id'], unique=False)
        op.create_index(op.f('ix_explanation_requests_experiment_id'), 'explanation_requests', ['experiment_id'], unique=False)
        op.create_index(op.f('ix_explanation_requests_status'), 'explanation_requests', ['status'], unique=False)
        op.create_index(op.f('ix_explanation_requests_created_at'), 'explanation_requests', ['created_at'], unique=False)

    # Table chat_sessions
    if 'chat_sessions' not in existing_tables:
        op.create_table('chat_sessions',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('explanation_request_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('language', sa.String(length=5), nullable=False),
            sa.Column('max_questions', sa.Integer(), nullable=False),
            sa.Column('questions_count', sa.Integer(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('last_activity', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['explanation_request_id'], ['explanation_requests.id'], ondelete='CASCADE'),
        )
        
        # Index pour chat_sessions
        op.create_index(op.f('ix_chat_sessions_id'), 'chat_sessions', ['id'], unique=False)
        op.create_index(op.f('ix_chat_sessions_user_id'), 'chat_sessions', ['user_id'], unique=False)
        op.create_index(op.f('ix_chat_sessions_explanation_request_id'), 'chat_sessions', ['explanation_request_id'], unique=False)
        op.create_index(op.f('ix_chat_sessions_created_at'), 'chat_sessions', ['created_at'], unique=False)

    # Table chat_messages
    if 'chat_messages' not in existing_tables:
        op.create_table('chat_messages',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('chat_session_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('message_type', sa.String(length=20), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('message_order', sa.Integer(), nullable=False),
            sa.Column('tokens_used', sa.Integer(), nullable=True),
            sa.Column('response_time_seconds', sa.Float(), nullable=True),
            sa.Column('model_used', sa.String(length=50), nullable=True),
            sa.Column('context_data', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['chat_session_id'], ['chat_sessions.id'], ondelete='CASCADE'),
        )
        
        # Index pour chat_messages
        op.create_index(op.f('ix_chat_messages_id'), 'chat_messages', ['id'], unique=False)
        op.create_index(op.f('ix_chat_messages_chat_session_id'), 'chat_messages', ['chat_session_id'], unique=False)
        op.create_index(op.f('ix_chat_messages_created_at'), 'chat_messages', ['created_at'], unique=False)

    # Table explanation_artifacts
    if 'explanation_artifacts' not in existing_tables:
        op.create_table('explanation_artifacts',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('explanation_request_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('artifact_type', sa.String(length=50), nullable=False),
            sa.Column('file_name', sa.String(length=200), nullable=False),
            sa.Column('file_path', sa.String(length=500), nullable=False),
            sa.Column('file_size_bytes', sa.Integer(), nullable=True),
            sa.Column('mime_type', sa.String(length=100), nullable=False),
            sa.Column('description', sa.String(length=500), nullable=True),
            sa.Column('is_primary', sa.Boolean(), nullable=False),
            sa.Column('display_order', sa.Integer(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['explanation_request_id'], ['explanation_requests.id'], ondelete='CASCADE'),
        )
        
        # Index pour explanation_artifacts
        op.create_index(op.f('ix_explanation_artifacts_id'), 'explanation_artifacts', ['id'], unique=False)
        op.create_index(op.f('ix_explanation_artifacts_explanation_request_id'), 'explanation_artifacts', ['explanation_request_id'], unique=False)
        op.create_index(op.f('ix_explanation_artifacts_created_at'), 'explanation_artifacts', ['created_at'], unique=False)


def downgrade() -> None:
    """
    Supprimer les tables XAI si elles existent.
    """
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Supprimer les tables dans l'ordre inverse à cause des clés étrangères
    if 'explanation_artifacts' in existing_tables:
        op.drop_index(op.f('ix_explanation_artifacts_created_at'), table_name='explanation_artifacts')
        op.drop_index(op.f('ix_explanation_artifacts_explanation_request_id'), table_name='explanation_artifacts')
        op.drop_index(op.f('ix_explanation_artifacts_id'), table_name='explanation_artifacts')
        op.drop_table('explanation_artifacts')
    
    if 'chat_messages' in existing_tables:
        op.drop_index(op.f('ix_chat_messages_created_at'), table_name='chat_messages')
        op.drop_index(op.f('ix_chat_messages_chat_session_id'), table_name='chat_messages')
        op.drop_index(op.f('ix_chat_messages_id'), table_name='chat_messages')
        op.drop_table('chat_messages')
    
    if 'chat_sessions' in existing_tables:
        op.drop_index(op.f('ix_chat_sessions_created_at'), table_name='chat_sessions')
        op.drop_index(op.f('ix_chat_sessions_explanation_request_id'), table_name='chat_sessions')
        op.create_index(op.f('ix_chat_sessions_user_id'), 'chat_sessions', ['user_id'], unique=False)
        op.drop_index(op.f('ix_chat_sessions_id'), table_name='chat_sessions')
        op.drop_table('chat_sessions')
    
    if 'explanation_requests' in existing_tables:
        op.drop_index(op.f('ix_explanation_requests_created_at'), table_name='explanation_requests')
        op.drop_index(op.f('ix_explanation_requests_status'), table_name='explanation_requests')
        op.drop_index(op.f('ix_explanation_requests_experiment_id'), table_name='explanation_requests')
        op.drop_index(op.f('ix_explanation_requests_user_id'), table_name='explanation_requests')
        op.drop_index(op.f('ix_explanation_requests_id'), table_name='explanation_requests')
        op.drop_table('explanation_requests')
