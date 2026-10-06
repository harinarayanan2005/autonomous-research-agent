from rest_framework import serializers
from .models import ResearchSession, AgentStep

class AgentStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentStep
        fields = ['id', 'step_number', 'thought', 'action', 'action_input', 'observation', 'created_at']

class ResearchSessionSerializer(serializers.ModelSerializer):
    steps = AgentStepSerializer(many=True, read_only=True)

    class Meta:
        model = ResearchSession
        fields = ['id', 'topic', 'status', 'final_report', 'created_at', 'updated_at', 'steps']