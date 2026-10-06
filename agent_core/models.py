from django.db import models
import uuid

class ResearchSession(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    topic = models.CharField(max_length=500)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    final_report = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.topic[:40]} [{self.status}]"


class AgentStep(models.Model):
    session = models.ForeignKey(ResearchSession, on_delete=models.CASCADE, related_name='steps')
    step_number = models.PositiveIntegerField()
    thought = models.TextField(help_text="Agent reasoning for taking this step")
    action = models.CharField(max_length=100, help_text="Tool name called by the agent")
    action_input = models.TextField(help_text="Arguments passed to the tool")
    observation = models.TextField(blank=True, null=True, help_text="Output received from the tool")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['step_number']

    def __str__(self):
        return f"Step {self.step_number} for {self.session.id}: {self.action}"