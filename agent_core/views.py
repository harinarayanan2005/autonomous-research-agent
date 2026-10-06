import os
import json
import time
import threading
from dotenv import load_dotenv
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from google import genai
from .models import ResearchSession, AgentStep
from .serializers import ResearchSessionSerializer, AgentStepSerializer
from .agent_engine import run_research_agent

load_dotenv()

class ResearchSessionListCreateView(APIView):
    def get(self, request):
        sessions = ResearchSession.objects.all().order_by('-created_at')
        serializer = ResearchSessionSerializer(sessions, many=True)
        return Response(serializer.data)

    def post(self, request):
        topic = request.data.get('topic')
        depth = int(request.data.get('depth', 2))
        persona = request.data.get('persona', 'Executive')

        if not topic:
            return Response({'error': 'topic is required'}, status=status.HTTP_400_BAD_REQUEST)

        session = ResearchSession.objects.create(topic=topic, status='PENDING')

        thread = threading.Thread(
            target=run_research_agent,
            args=(str(session.id),),
            kwargs={'max_iterations': depth, 'persona': persona}
        )
        thread.start()

        serializer = ResearchSessionSerializer(session)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ResearchSessionDetailView(APIView):
    def get(self, request, pk):
        try:
            session = ResearchSession.objects.get(pk=pk)
            serializer = ResearchSessionSerializer(session)
            return Response(serializer.data)
        except ResearchSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        try:
            session = ResearchSession.objects.get(pk=pk)
            session.delete()
            return Response({'message': 'Session deleted successfully'}, status=status.HTTP_204_NO_CONTENT)
        except ResearchSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)


class ResearchSessionStreamView(APIView):
    """
    Server-Sent Events (SSE) endpoint:
    Streams live agent cognitive steps and final completion directly to the frontend.
    """
    def get(self, request, pk):
        try:
            session = ResearchSession.objects.get(pk=pk)
        except ResearchSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

        def event_stream():
            sent_steps = set()
            max_wait_seconds = 180
            start_time = time.time()

            while time.time() - start_time < max_wait_seconds:
                session.refresh_from_db()

                # Stream new steps
                for step in session.steps.all():
                    if step.id not in sent_steps:
                        sent_steps.add(step.id)
                        data = json.dumps({
                            'type': 'step',
                            'step': AgentStepSerializer(step).data
                        })
                        yield f"data: {data}\n\n"

                # If session has concluded, stream completion and close connection
                if session.status in ['COMPLETED', 'FAILED']:
                    data = json.dumps({
                        'type': 'complete',
                        'session': ResearchSessionSerializer(session).data
                    })
                    yield f"data: {data}\n\n"
                    break

                time.sleep(0.8)

        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class ResearchSessionAskView(APIView):
    def post(self, request, pk):
        question = request.data.get('question')
        if not question:
            return Response({'error': 'question is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session = ResearchSession.objects.get(pk=pk)
        except ResearchSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            return Response({'error': 'GEMINI_API_KEY not configured'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        step_observations = "\n".join([
            f"- Tool {s.action}: {s.observation[:500]}"
            for s in session.steps.all() if s.observation
        ])

        client = genai.Client(api_key=api_key)
        prompt = (
            f"You are an expert intelligence analyst answering questions about a research dossier.\n\n"
            f"TOPIC: {session.topic}\n\n"
            f"FINAL REPORT:\n{session.final_report}\n\n"
            f"COLLECTED WEB OBSERVATIONS:\n{step_observations}\n\n"
            f"USER FOLLOW-UP QUESTION:\n{question}\n\n"
            f"Provide a direct, concise, and accurate answer based strictly on the research above. "
            f"Format with clean Markdown bullet points if helpful."
        )

        try:
            res = client.models.generate_content(
                model='gemini-3.5-flash-lite',
                contents=prompt
            )
            return Response({
                'question': question,
                'answer': res.text.strip()
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)